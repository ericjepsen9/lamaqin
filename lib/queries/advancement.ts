import { useQuery } from '@tanstack/react-query';

import { fetchNonTrackingSessionIds } from '@/lib/queries/attendance';
import { fetchAllPages } from '@/lib/queries/paginate';
import { supabase } from '@/lib/supabase';

// 报数升学评定数据层 · 管理端「报数升学」列表 + 学员详情(决策017/123/124)。
// 5 维(决策123):① 传承圆满 ② 共修出勤率 ③ 修量(报数·硬依据) ④ 考试成绩 ⑤ 是否发心(人工·不入系统·124)。
// 量化 4 维聚合走 v_advancement_5dim(security_invoker·随查询者 RLS);判定仍【人工·不 auto-gate】。
// 锚定决策123:升学/毕业按最初正式班级;v1.0 列表按 class_members 各行(兼修=多行),详情按该行 cohort。

export type MemberStatus = 'active' | 'paused' | 'held_back' | 'graduated' | 'left';

// ── 列表行 ────────────────────────────────────────────────────────────
export type AdvStudent = {
  userId: string;
  cohortId: string;
  name: string;
  cohortName: string;
  semester: number;
  status: MemberStatus;
  memberRole: 'auditor' | 'formal';
  heldBackCount: number;
  attendanceRate: number;   // 0-100;无场次→0
  attendCount: number;
  sessionCount: number;     // attend + absent
  practiceCount: number;    // 升学硬依据愿的 current_count 之和
  practiceTarget: number;   // 同上愿的 target_count 之和(0=无限时目标)
  examScore: number | null; // 最近一次考试分
  examIsPass: boolean | null; // 该次是否合格(按大纲规则算,见 lib/exam-pass-line.ts);已豁免时恒 true
  examExempt: boolean; // 考试豁免(代行记录 action_type=exempt/target_kind=exam·决策121·PM 2026-07-12:豁免视为通过)
  examExemptReason: string | null; // 豁免原因(如"满60岁免考"),标注具体豁免的是哪一项
};

const key = (u: string, c: string) => u + '|' + c;

export function useAdvancementRoster() {
  return useQuery({
    queryKey: ['adv-roster'],
    staleTime: 60 * 1000,
    queryFn: async (): Promise<AdvStudent[]> => {
      // profiles!inner 剔除注销保留期账号(决策078+B1待办收口;见 classes.ts 同款注释)——不影响
      // 本查询有意不筛 class_members.status 的既有设计(留级/暂停学员仍要看到升学进度)。
      // 分页取全(2026-07-11 一致性调研发现:会众规模涨过 PostgREST 单次封顶会静默漏人)。
      const members = await fetchAllPages(async (from, to) =>
        supabase
          .from('class_members')
          .select('user_id, cohort_id, status, member_role, current_semester, held_back_count, profiles!inner!class_members_user_id_fkey(full_name), cohorts(name)')
          .is('profiles.deletion_requested_at', null)
          .order('cohort_id')
          .range(from, to),
      );
      const rows = (members ?? []) as unknown as {
        user_id: string; cohort_id: string; status: MemberStatus; member_role: 'auditor' | 'formal';
        current_semester: number | null; held_back_count: number | null;
        profiles: { full_name?: string | null } | null; cohorts: { name?: string | null } | null;
      }[];
      if (rows.length === 0) return [];
      const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
      const cohortIds = Array.from(new Set(rows.map((r) => r.cohort_id)));

      // 出勤(按 user|cohort 计 attend/absent;排除"不计出勤"场次)
      const noTrack = await fetchNonTrackingSessionIds();
      const att = new Map<string, { a: number; t: number }>();
      const { data: srs } = await supabase
        .from('study_records')
        .select('user_id, cohort_id, study_type, group_session_id')
        .in('user_id', userIds).in('cohort_id', cohortIds)
        .in('study_type', ['group_attend', 'group_absent']);
      for (const s of (srs ?? []) as { user_id: string; cohort_id: string; study_type: string; group_session_id: string | null }[]) {
        if (s.group_session_id && noTrack.has(s.group_session_id)) continue;
        const k = key(s.user_id, s.cohort_id);
        const cur = att.get(k) ?? { a: 0, t: 0 };
        if (s.study_type === 'group_attend') cur.a++;
        cur.t++;
        att.set(k, cur);
      }

      // 修量(升学硬依据愿:is_required_for_promotion)
      const prac = new Map<string, { c: number; tgt: number }>();
      const { data: vows } = await supabase
        .from('user_practice_vows')
        .select('user_id, cohort_id, current_count, target_count, is_required_for_promotion')
        .in('user_id', userIds);
      for (const v of (vows ?? []) as { user_id: string; cohort_id: string | null; current_count: number | null; target_count: number | null; is_required_for_promotion: boolean | null }[]) {
        if (!v.cohort_id || !v.is_required_for_promotion) continue;
        const k = key(v.user_id, v.cohort_id);
        const cur = prac.get(k) ?? { c: 0, tgt: 0 };
        cur.c += v.current_count ?? 0;
        cur.tgt += v.target_count ?? 0;
        prac.set(k, cur);
      }

      // 考试(最近一次分 + 是否合格——合格线按大纲规则自动算,见 lib/exam-pass-line.ts)
      const exam = new Map<string, { score: number | null; isPass: boolean | null; at: string }>();
      const { data: exams } = await supabase
        .from('exam_grades')
        .select('user_id, score, is_pass, recorded_at')
        .in('user_id', userIds);
      for (const e of (exams ?? []) as { user_id: string; score: number | null; is_pass: boolean | null; recorded_at: string | null }[]) {
        const prev = exam.get(e.user_id);
        if (!prev || (e.recorded_at ?? '') > prev.at) exam.set(e.user_id, { score: e.score, isPass: e.is_pass, at: e.recorded_at ?? '' });
      }

      // 考试豁免(代行记录 action_type=exempt/target_kind=exam·决策121·PM 2026-07-12:豁免视为通过,覆盖上面的分数判定)
      const examExempt = new Map<string, string>();
      const { data: exemptRows } = await supabase
        .from('proxy_action_records')
        .select('user_id, reason')
        .in('user_id', userIds).eq('action_type', 'exempt').eq('target_kind', 'exam');
      for (const e of (exemptRows ?? []) as { user_id: string; reason: string }[]) {
        if (!examExempt.has(e.user_id)) examExempt.set(e.user_id, e.reason);
      }

      return rows.map((r) => {
        const k = key(r.user_id, r.cohort_id);
        const a = att.get(k);
        const p = prac.get(k);
        const exemptReason = examExempt.get(r.user_id) ?? null;
        return {
          userId: r.user_id,
          cohortId: r.cohort_id,
          name: r.profiles?.full_name ?? '未命名',
          cohortName: r.cohorts?.name ?? '—',
          semester: r.current_semester ?? 1,
          status: r.status,
          memberRole: r.member_role,
          heldBackCount: r.held_back_count ?? 0,
          attendanceRate: a && a.t > 0 ? Math.round((a.a / a.t) * 100) : 0,
          attendCount: a?.a ?? 0,
          sessionCount: a?.t ?? 0,
          practiceCount: p?.c ?? 0,
          practiceTarget: p?.tgt ?? 0,
          examScore: exam.get(r.user_id)?.score ?? null,
          examIsPass: exemptReason ? true : (exam.get(r.user_id)?.isPass ?? null),
          examExempt: !!exemptReason,
          examExemptReason: exemptReason,
        };
      });
    },
  });
}

// ── 学员详情(5 维) ──────────────────────────────────────────────────
export type AdvVow = { practiceName: string; unit: string; current: number; target: number | null; timeLimited: boolean; endDate: string | null };
export type AdvDetail = {
  userId: string;
  name: string;
  dharmaName: string | null;
  studentId: string | null;
  cohortId: string | null;
  cohortName: string;
  programId: string | null;
  programName: string | null;
  semester: number;
  status: MemberStatus;
  memberRole: 'auditor' | 'formal';
  heldBackCount: number;
  joinedAt: string | null;
  // 5 维
  transmissionsObtained: number;
  transmissionsRequired: number;
  attendCount: number;
  absentCount: number;
  practiceTotal: number;
  practiceTarget: number;
  vows: AdvVow[];
  examScore: number | null;
  examIsPass: boolean | null; // 已豁免时恒 true
  examExempt: boolean; // 考试豁免(代行记录 action_type=exempt/target_kind=exam·决策121·PM 2026-07-12:豁免视为通过)
  examExemptReason: string | null;
  examsPassed: number;
};

export function useStudentAdvancement(userId: string | undefined) {
  return useQuery({
    queryKey: ['adv-detail', userId ?? 'none'],
    enabled: !!userId,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<AdvDetail | null> => {
      if (!userId) return null;
      const { data: prof, error: profErr } = await supabase
        .from('profiles').select('id, full_name, dharma_name, student_id, status').eq('id', userId).maybeSingle();
      if (profErr) throw profErr;
      if (!prof) return null;

      // 锚定班级:取该学员第一条 class_members(兼修取首条;v1.0 简化)
      const { data: mem } = await supabase
        .from('class_members')
        .select('cohort_id, status, member_role, current_semester, held_back_count, joined_at, cohorts(name, program_id, programs(name))')
        .eq('user_id', userId)
        .order('joined_at')
        .limit(1)
        .maybeSingle();
      const m = mem as unknown as {
        cohort_id: string; status: MemberStatus; member_role: 'auditor' | 'formal'; current_semester: number | null;
        held_back_count: number | null; joined_at: string | null;
        cohorts: { name?: string | null; program_id?: string | null; programs: { name?: string | null } | null } | null;
      } | null;
      const cohortId = m?.cohort_id ?? null;

      // 量化 4 维(视图)
      const { data: dim } = await supabase
        .from('v_advancement_5dim')
        .select('transmissions_obtained, transmissions_required, attendance_count, practice_total, exams_passed')
        .eq('user_id', userId).maybeSingle();
      const d = dim as { transmissions_obtained: number; transmissions_required: number; attendance_count: number; practice_total: number; exams_passed: number } | null;

      // 出勤:应用层算 attend+absent,排除"不计出勤"场次(不用视图 attendance_count,口径与关怀/列表一致)
      let attendCount = 0;
      let absentCount = 0;
      if (cohortId) {
        const noTrack = await fetchNonTrackingSessionIds();
        const { data: srs } = await supabase
          .from('study_records').select('study_type, group_session_id')
          .eq('user_id', userId).eq('cohort_id', cohortId).in('study_type', ['group_attend', 'group_absent']);
        for (const s of (srs ?? []) as { study_type: string; group_session_id: string | null }[]) {
          if (s.group_session_id && noTrack.has(s.group_session_id)) continue;
          if (s.study_type === 'group_attend') attendCount++; else absentCount++;
        }
      }
      const { data: vrows } = await supabase
        .from('user_practice_vows')
        .select('current_count, target_count, is_required_for_promotion, current_end_date, practices(name, unit)')
        .eq('user_id', userId)
        .eq('is_required_for_promotion', true);
      const vows: AdvVow[] = ((vrows ?? []) as unknown as {
        current_count: number | null; target_count: number | null; current_end_date: string | null;
        practices: { name?: string; unit?: string } | null;
      }[]).map((v) => ({
        practiceName: v.practices?.name ?? '修法',
        unit: v.practices?.unit ?? '遍',
        current: v.current_count ?? 0,
        target: v.target_count,
        timeLimited: !!v.current_end_date,
        endDate: v.current_end_date,
      }));
      const practiceTarget = vows.reduce((s, v) => s + (v.target ?? 0), 0);
      const practiceTotal = vows.reduce((s, v) => s + v.current, 0);

      // 最近考试分 + 是否合格(按大纲规则自动算,见 lib/exam-pass-line.ts)
      const { data: exams } = await supabase
        .from('exam_grades').select('score, is_pass, recorded_at').eq('user_id', userId).order('recorded_at', { ascending: false }).limit(1);
      const examScore = (exams && exams.length > 0 ? exams[0].score : null) ?? null;
      const examIsPass = (exams && exams.length > 0 ? exams[0].is_pass : null) ?? null;

      // 考试豁免(代行记录 action_type=exempt/target_kind=exam·决策121·PM 2026-07-12:豁免视为通过,覆盖上面的分数判定)
      const { data: exemptRows } = await supabase
        .from('proxy_action_records')
        .select('reason')
        .eq('user_id', userId).eq('action_type', 'exempt').eq('target_kind', 'exam')
        .order('created_at', { ascending: false }).limit(1);
      const examExemptReason = (exemptRows && exemptRows.length > 0 ? exemptRows[0].reason : null) ?? null;

      return {
        userId,
        name: prof.full_name ?? '未命名',
        dharmaName: prof.dharma_name ?? null,
        studentId: prof.student_id ?? null,
        cohortId,
        cohortName: m?.cohorts?.name ?? '—',
        programId: m?.cohorts?.program_id ?? null,
        programName: m?.cohorts?.programs?.name ?? null,
        semester: m?.current_semester ?? 1,
        status: (m?.status ?? prof.status) as MemberStatus,
        memberRole: m?.member_role ?? 'auditor',
        heldBackCount: m?.held_back_count ?? 0,
        joinedAt: m?.joined_at ?? null,
        transmissionsObtained: d?.transmissions_obtained ?? 0,
        transmissionsRequired: d?.transmissions_required ?? 0,
        attendCount,
        absentCount,
        practiceTotal,
        practiceTarget,
        vows,
        examScore,
        examIsPass: examExemptReason ? true : examIsPass,
        examExempt: !!examExemptReason,
        examExemptReason,
        examsPassed: d?.exams_passed ?? 0,
      };
    },
  });
}

// ── 功课圆满明细(专业配置的全部功课模板·决策·PM 2026-07-12"课程圆满配置")──────
// 区别于上面 vows(只显示"已发放"且 is_required_for_promotion 的愿):这里按
// v_program_practice_completion 显示该专业配置的全部有限终点功课模板,含尚未发放/
// provision 的(按0进度展示,不悄悄漏判——同 20260712000200_completion_views.sql 头注)。
export type ProgramPracticeItem = {
  templateId: string; templateName: string; practiceName: string; unit: string;
  targetCount: number; currentCount: number; isComplete: boolean;
};

export function useProgramPracticeCompletion(userId: string | undefined, programId: string | null | undefined) {
  return useQuery({
    queryKey: ['program-practice-completion', userId ?? 'none', programId ?? 'none'],
    enabled: !!userId && !!programId,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<ProgramPracticeItem[]> => {
      if (!userId || !programId) return [];
      const { data, error } = await supabase
        .from('v_program_practice_completion')
        .select('template_id, template_name, practice_name, unit, target_count, current_count, is_complete')
        .eq('user_id', userId).eq('program_id', programId);
      if (error) throw error;
      return ((data ?? []) as unknown as {
        template_id: string; template_name: string; practice_name: string; unit: string;
        target_count: number; current_count: number; is_complete: boolean;
      }[]).map((r) => ({
        templateId: r.template_id,
        templateName: r.template_name,
        practiceName: r.practice_name,
        unit: r.unit,
        targetCount: r.target_count,
        currentCount: r.current_count,
        isComplete: r.is_complete,
      }));
    },
  });
}
