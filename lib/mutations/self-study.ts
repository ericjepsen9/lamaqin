import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// 自学报名/主修/休息周 写库(PM 2026-06-29:师兄【自助】报名,进度【按大纲】)。
// 报名 = insert user_self_study_programs(起修日=今天本地)+ 首个设主修 + provision_selfstudy_vows 自动发愿。
// RLS(决策119):无自学资格的纯师兄 INSERT 会被拒 → 友好提示找辅导员/管理员(不臆造成功)。
// 进度算法不受这里影响:本周节次/周号一律由 DB get_current_week_*(大纲周)算,故无「节奏」写库。

const localToday = () => new Date().toLocaleDateString('en-CA');

// ── 开始自学一个专业(自助)──────────────────────────────────────────────
export type StartSelfStudyResult = { already: boolean; vowError: string | null };
export function useStartSelfStudy() {
  const qc = useQueryClient();
  const { session } = useAuth();
  const uid = session?.user.id;
  return useMutation({
    mutationFn: async ({ programId }: { programId: string }): Promise<StartSelfStudyResult> => {
      if (!uid) throw new Error('未登录');
      // 已注册?(UNIQUE(user_id, program_id))
      const { data: existing } = await supabase
        .from('user_self_study_programs')
        .select('program_id')
        .eq('user_id', uid);
      const rows = (existing ?? []) as { program_id: string }[];
      if (rows.some((r) => r.program_id === programId)) return { already: true, vowError: null };

      const isFirst = rows.length === 0;
      const { error } = await supabase.from('user_self_study_programs').insert({
        user_id: uid,
        program_id: programId,
        start_date: localToday(),
        status: 'active',
        is_primary: isFirst, // 首个自学专业自动设为主修(唯一约束:仅此一条 true)
      });
      if (error) {
        // 决策119:无自学资格 → RLS 拒(42501 / policy)
        if (error.code === '42501' || /row-level security|policy|permission/i.test(error.message)) {
          throw new Error('你当前没有自学资格,请联系辅导员或管理员开通后再开始自学。');
        }
        throw error;
      }

      // 自动发愿(按专业默认·无 cohort);失败不回滚报名,但要把错误带回给 UI 显示
      // p_today 传上面已经算好的同一个 localToday()(个人打卡跟手机本地·CLAUDE.md §1)——
      // 不传时函数会退到 CURRENT_DATE(服务器UTC)兜底,这里正常路径本就该传,零额外计算成本。
      const { error: vowErr } = await supabase.rpc('provision_selfstudy_vows', { p_user_id: uid, p_program_id: programId, p_today: localToday() });
      return { already: false, vowError: vowErr?.message ?? null };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-self-study-programs'] });
      qc.invalidateQueries({ queryKey: ['primary-context'] });
      qc.invalidateQueries({ queryKey: ['my-vows'] });
    },
  });
}

// ── 设主修自学专业(走 RPC,事务内切换避免撞 uniq)────────────────────────
export function useSetPrimarySelfStudyProgram() {
  const qc = useQueryClient();
  const { session } = useAuth();
  const uid = session?.user.id;
  return useMutation({
    mutationFn: async ({ programId }: { programId: string }) => {
      if (!uid) throw new Error('未登录');
      const { error } = await supabase.rpc('set_primary_self_study_program', { p_user_id: uid, p_new_primary_program_id: programId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-self-study-programs'] });
      qc.invalidateQueries({ queryKey: ['primary-context'] });
    },
  });
}

// ── 授予 / 撤销 自学资格(后台·仅系统管理员·决策119)──────────────────────
//   self_study_grants:授予 = insert(留痕 granted_by);撤销 = 置 revoked_at/revoked_by(软删,留痕)。
//   RLS 写=仅 is_system_admin();每人最多一条生效中授权(唯一索引)。
export function useGrantSelfStudy() {
  const qc = useQueryClient();
  const { session } = useAuth();
  const uid = session?.user.id;
  return useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason?: string | null }) => {
      if (!uid) throw new Error('未登录');
      const { error } = await supabase.from('self_study_grants').insert({ user_id: userId, granted_by: uid, reason: reason ?? null });
      if (error) {
        if (/duplicate|unique/i.test(error.message)) return; // 已有生效授权,幂等
        if (error.code === '42501' || /policy|permission/i.test(error.message)) throw new Error('仅系统管理员可授予自学资格');
        throw error;
      }
    },
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['self-study-grant', v.userId] }); },
  });
}

export function useRevokeSelfStudy() {
  const qc = useQueryClient();
  const { session } = useAuth();
  const uid = session?.user.id;
  return useMutation({
    mutationFn: async ({ grantId }: { grantId: string; userId: string }) => {
      const { error } = await supabase
        .from('self_study_grants')
        .update({ revoked_at: new Date().toISOString(), revoked_by: uid })
        .eq('id', grantId)
        .is('revoked_at', null);
      if (error) throw error;
    },
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['self-study-grant', v.userId] }); },
  });
}

// ── 调整节奏(决策157:大纲默认 + 用户可自定)────────────────────────────
//   weeklyTarget = null → 跟随大纲默认(default_weekly_lessons);数字 → 自定每周节数。
export function useSetSelfStudyPace() {
  const qc = useQueryClient();
  const { session } = useAuth();
  const uid = session?.user.id;
  return useMutation({
    mutationFn: async ({ programId, weeklyTarget }: { programId: string; weeklyTarget: number | null }) => {
      if (!uid) throw new Error('未登录');
      const { error } = await supabase
        .from('user_self_study_programs')
        .update({ weekly_target: weeklyTarget })
        .eq('user_id', uid)
        .eq('program_id', programId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['self-study-plan'] });
    },
  });
}

// ── 休息周(请假·进度顺延):增 / 删 ────────────────────────────────────
export function useAddSelfStudyRestWeek() {
  const qc = useQueryClient();
  const { session } = useAuth();
  const uid = session?.user.id;
  return useMutation({
    mutationFn: async ({ programId, restStartDate }: { programId: string; restStartDate: string }) => {
      if (!uid) throw new Error('未登录');
      const { error } = await supabase.from('user_self_study_rest_weeks').insert({
        user_id: uid, program_id: programId, rest_start_date: restStartDate,
      });
      if (error && !/duplicate|unique/i.test(error.message)) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['self-study-rest-weeks'] });
      qc.invalidateQueries({ queryKey: ['self-study-week-no', undefined, v.programId] });
      qc.invalidateQueries({ queryKey: ['current-week-lessons'] });
    },
  });
}

export function useRemoveSelfStudyRestWeek() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; programId: string }) => {
      const { error } = await supabase.from('user_self_study_rest_weeks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['self-study-rest-weeks'] });
      qc.invalidateQueries({ queryKey: ['self-study-week-no'] });
      qc.invalidateQueries({ queryKey: ['current-week-lessons'] });
    },
  });
}
