import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { isExamPass, type ExamFormat } from '@/lib/exam-pass-line';
import { fetchNonTrackingSessionIds } from '@/lib/queries/attendance';
import { supabase } from '@/lib/supabase';

// 报数升学写库 · 管理端学员详情判定(决策017/123:人工判定 + advancement_records 留痕)。
// 写 RLS:advancement_records / exam_grades / class_members 写 = is_system_admin()(教学部/admin)。

type AdvAction = 'graduate' | 'held_back' | 'left';
const DECISION: Record<AdvAction, 'graduated' | 'held_back' | 'other'> = {
  graduate: 'graduated', held_back: 'held_back', left: 'other',
};
const NEW_STATUS: Record<AdvAction, 'graduated' | 'held_back' | 'left'> = {
  graduate: 'graduated', held_back: 'held_back', left: 'left',
};

function useInval() {
  const qc = useQueryClient();
  return (userId: string, cohortId: string | null) => {
    qc.invalidateQueries({ queryKey: ['adv-roster'] });
    qc.invalidateQueries({ queryKey: ['adv-detail', userId] });
    if (cohortId) {
      qc.invalidateQueries({ queryKey: ['cohort-roster', cohortId] });
      qc.invalidateQueries({ queryKey: ['cohort-detail', cohortId] });
    }
    qc.invalidateQueries({ queryKey: ['admin-cohorts'] });
  };
}

// ── 判定:毕业 / 留级 / 离班 ──────────────────────────────────────────
// 先写 advancement_records 留痕,再改 class_members.status(+ 审计字段;留级 held_back_count+1;毕业 graduated_at)。
// 弱网幂等(2026-07-12,PM 追问"后台管理也做了吗"引出·同 practice_logs.client_token 方案):
//   held_back 分支的 held_back_count 是"读现值+1"再写回,若整个 mutation 被重试(网络卡顿导致
//   admin 误判失败、手动/自动重试),会把同一次留级重复+1、advancement_records 也会多一条。
//   这里采用"前置查重"而非 practice_logs 那种"插入后捕获23505"——因为本 mutation 有两步写入
//   (留痕 + 改状态),留痕成功后才改状态的话,插入后才发现重复就晚了(状态已经被错误地改了
//   第二遍);前置查重可以在动手前就整体短路,两步要么都不做、要么都做,不会出现只做一半。
export function useRecordAdvancement() {
  const { session } = useAuth();
  const inval = useInval();
  return useMutation({
    retry: 2, // 已用 clientToken 做到重试不重复写,可安全自动重试(同 useRecordPracticeLog 先例)
    mutationFn: async (p: { userId: string; cohortId: string; action: AdvAction; basis?: string | null; clientToken?: string }) => {
      const uid = session?.user.id ?? null;
      // 0) 前置查重:同一 clientToken 已经留过痕,说明这次提交(含状态变更)已经成功过一遍,直接当成功返回
      if (p.clientToken) {
        const { data: existing } = await supabase.from('advancement_records').select('id').eq('client_token', p.clientToken).maybeSingle();
        if (existing) return;
      }
      // 1) 留痕
      const { error: aerr } = await supabase.from('advancement_records').insert({
        user_id: p.userId, from_cohort_id: p.cohortId, to_cohort_id: null,
        decision: DECISION[p.action], decided_by: uid, basis: p.basis ?? null, client_token: p.clientToken ?? null,
      });
      if (aerr) throw aerr;
      // 2) 改状态
      // held_back_count 不在这里算,DB侧 class_members_bump_held_back_trigger(2026-07-13)原子+1
      // (原"先读现值再+1"两次往返有竞态,见 useUpdateMemberStatus 同款修复的注释)。
      const patch: {
        status: 'graduated' | 'held_back' | 'left';
        status_changed_at: string;
        status_changed_by: string | null;
        status_change_reason: string | null;
        graduated_at?: string;
      } = {
        status: NEW_STATUS[p.action],
        status_changed_at: new Date().toISOString(),
        status_changed_by: uid,
        status_change_reason: p.basis ?? null,
      };
      if (p.action === 'graduate') patch.graduated_at = new Date().toISOString();
      const { error: merr } = await supabase
        .from('class_members').update(patch)
        .eq('cohort_id', p.cohortId).eq('user_id', p.userId);
      if (merr) throw merr;
    },
    onSuccess: (_r, p) => inval(p.userId, p.cohortId),
  });
}

// ── 留级"转下一届"(决策018 两种形态之一:另一形态"留原班重修"= 上面 useRecordAdvancement
//   的 held_back,原地不动)。旧班标 held_back + 留痕 to_cohort_id;新班建成员行(承接学期/
//   角色/留级次数、joined_at=今天→内加行等限时愿从新班起算,决策018补充"转下一届按新班
//   模板重建")+ 切主班 + 重新 provision(provision_member_vows 已 REVOKE 直连,走同一权限闸
//   的 provision_cohort_vows——对已发过愿的老成员是空操作,只补这个新插入的成员)。
// 弱网幂等(2026-07-12,同上 useRecordAdvancement 理由,本函数四步写入更长、更需要前置查重):
//   前置查重命中时直接短路返回(不重跑1-3步,避免二次留级计数/主班撞唯一索引/重复留痕),
//   但不重复调用第4步 provision——provision_cohort_vows 本身是幂等 RPC(内部 WHERE NOT EXISTS),
//   即便查重判断有误差、被跳过了也不影响正确性(下次任何人对该班 provision 都会自动补齐)。
export function useRecordHeldBackTransfer() {
  const { session } = useAuth();
  const inval = useInval();
  return useMutation({
    retry: 2, // 已用 clientToken 做到重试不重复写,可安全自动重试(同 useRecordPracticeLog 先例)
    mutationFn: async (p: { userId: string; fromCohortId: string; toCohortId: string; basis?: string | null; clientToken?: string }) => {
      const uid = session?.user.id ?? null;
      // 0) 前置查重
      if (p.clientToken) {
        const { data: existing } = await supabase.from('advancement_records').select('id').eq('client_token', p.clientToken).maybeSingle();
        if (existing) return;
      }
      const { data: cur, error: curErr } = await supabase
        .from('class_members')
        .select('member_role, current_semester')
        .eq('cohort_id', p.fromCohortId).eq('user_id', p.userId).maybeSingle();
      if (curErr) throw curErr;
      // 1) 旧班:标 held_back + 撤主班(为新主班让路,避免撞 uniq_class_members_primary 唯一索引)。
      //    held_back_count 不在客户端算,class_members_bump_held_back_trigger(2026-07-13)在这条
      //    UPDATE 的行锁内原子+1(消除"先读旧班现值再+1"的竞态);.select()拿回触发器算完的真值,
      //    下面新班那行"继承"的次数以这个为准,不是自己另算一遍。
      const { data: updated, error: e1 } = await supabase
        .from('class_members')
        .update({
          status: 'held_back', is_primary: false,
          status_changed_at: new Date().toISOString(), status_changed_by: uid, status_change_reason: p.basis ?? null,
        })
        .eq('cohort_id', p.fromCohortId).eq('user_id', p.userId)
        .select('held_back_count').single();
      if (e1) throw e1;
      // 2) 新班:建成员行(承接角色/学期/留级次数,主班切到这里)
      const { error: e2 } = await supabase.from('class_members').insert({
        cohort_id: p.toCohortId, user_id: p.userId, status: 'active',
        member_role: cur?.member_role ?? 'formal', current_semester: cur?.current_semester ?? 1,
        held_back_count: updated.held_back_count, is_primary: true,
      });
      if (e2) throw e2;
      // 3) 留痕(to_cohort_id 记转入哪个班)
      const { error: e3 } = await supabase.from('advancement_records').insert({
        user_id: p.userId, from_cohort_id: p.fromCohortId, to_cohort_id: p.toCohortId,
        decision: 'held_back', decided_by: uid, basis: p.basis ?? null, client_token: p.clientToken ?? null,
      });
      if (e3) throw e3;
      // 4) 新班功课重建
      const { error: e4 } = await supabase.rpc('provision_cohort_vows', { p_cohort_id: p.toCohortId });
      if (e4) throw e4;
    },
    onSuccess: (_r, p) => { inval(p.userId, p.fromCohortId); inval(p.userId, p.toCohortId); },
  });
}

// ── 旁听"继续旁听"(决策018 三选一之一,即决策018表格"旁听者跨学期(问题017)"这行——
//   ⚠️ 2026-07-12 订正:此前误引"决策017"(那是升学/留级/毕业人工判定的另一条决策,
//   "(017)"实指决策018原文自己列的"问题017"编号,不是决策017本体);另两种——"转正式"
//   复用既有 useUpdateMemberRole,"离班"复用既有 useRecordAdvancement 的 left)。
//   不改任何状态,只留痕(每学期"过一次管理员之手"的审阅记录,decision='other')。
// 弱网幂等(2026-07-12·同 useRecordPracticeLog 方案):单条 insert,重复键直接当成功处理即可。
export function useRecordAuditorContinue() {
  const { session } = useAuth();
  const inval = useInval();
  return useMutation({
    retry: 2,
    mutationFn: async (p: { userId: string; cohortId: string; basis?: string | null; clientToken?: string }) => {
      const { error } = await supabase.from('advancement_records').insert({
        user_id: p.userId, from_cohort_id: p.cohortId, to_cohort_id: p.cohortId,
        decision: 'other', decided_by: session?.user.id ?? null, basis: p.basis ?? '学期末审阅:继续旁听',
        client_token: p.clientToken ?? null,
      });
      if (error) {
        if (error.code === '23505' && p.clientToken) return; // 同一凭证已成功过,当成功处理
        throw error;
      }
    },
    onSuccess: (_r, p) => inval(p.userId, p.cohortId),
  });
}

// ── 录入考试成绩(④维;线下考、后台录·决策125)──────────────────────
// 合格线按大纲真实规则自动算(PM 2026-07-12,见 lib/exam-pass-line.ts 头注 + 该文件注释里
// 明确不做的两条例外:60岁免考、"达不到93次可改考2次每次30分"替代路径)。
// 弱网幂等(2026-07-12·同 useRecordPracticeLog 方案):单条 insert,重复键直接当成功处理即可。
export function useRecordExamGrade() {
  const { session } = useAuth();
  const inval = useInval();
  return useMutation({
    retry: 2,
    mutationFn: async (p: { userId: string; programId: string | null; examName: string; score: number; examFormat: ExamFormat; cohortId: string | null; clientToken?: string }) => {
      // 共修出勤总次数(大纲93次门槛):同 useStudentAdvancement 口径——按当前班级算、排除
      // tracks_attendance=false 的"不计出勤"临时场次(2026-07-12 审计发现,此前漏排除、会
      // 把临时集会也算进93次,可能错误把合格线从60/72降到30)。
      let attendanceCount = 0;
      if (p.cohortId) {
        const noTrack = await fetchNonTrackingSessionIds();
        const { data: srs, error: attErr } = await supabase
          .from('study_records')
          .select('group_session_id')
          .eq('user_id', p.userId).eq('cohort_id', p.cohortId).eq('study_type', 'group_attend');
        if (attErr) throw attErr;
        attendanceCount = (srs ?? []).filter((s) => !(s.group_session_id && noTrack.has(s.group_session_id))).length;
      }
      const isPass = isExamPass(p.score, attendanceCount, p.examFormat);
      const { error } = await supabase.from('exam_grades').insert({
        user_id: p.userId, program_id: p.programId, exam_name: p.examName,
        score: p.score, is_pass: isPass, exam_format: p.examFormat, recorded_by: session?.user.id ?? null,
        client_token: p.clientToken ?? null,
      });
      if (error) {
        if (error.code === '23505' && p.clientToken) return; // 同一凭证已成功过,当成功处理
        throw error;
      }
    },
    onSuccess: (_r, p) => inval(p.userId, p.cohortId),
  });
}
