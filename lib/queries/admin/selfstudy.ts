import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { fetchAllPages } from '@/lib/queries/paginate';
import { supabase } from '@/lib/supabase';

// 后台·自学管理(M10 屏·PRD §4.4;审计 P0「自学生后台 0 可见」·2026-07-02 补)。
// RLS:user_self_study_programs / user_self_study_rest_weeks 的 select 均放行 is_system_admin();
// programs 写仅 admin(programs_write)。#193 只看个体明细无排名对比。
export type AdminSelfStudyRow = {
  userId: string;
  fullName: string | null;
  dharmaName: string | null;
  programId: string;
  programName: string;
  startDate: string | null;
  weeklyTarget: number | null; // null=跟大纲默认
  isPrimary: boolean;
  status: string;
  restWeeks: number;
};

export function useAdminSelfStudyStudents() {
  return useQuery({
    queryKey: ['admin-selfstudy-students'],
    staleTime: 30 * 1000,
    queryFn: async (): Promise<AdminSelfStudyRow[]> => {
      // 分页取全(2026-07-11 一致性调研发现:原查询无 limit,自学生规模涨过 PostgREST 单次
      // 封顶会静默截断)。
      const [rows, { data: rests }] = await Promise.all([
        fetchAllPages(async (from, to) =>
          supabase
            .from('user_self_study_programs')
            .select('user_id, program_id, start_date, weekly_target, is_primary, status, profiles(full_name, dharma_name), programs(name)')
            .order('created_at', { ascending: false })
            .range(from, to),
        ),
        supabase.from('user_self_study_rest_weeks').select('user_id, program_id'),
      ]);
      const restCount = new Map<string, number>();
      for (const r of (rests ?? []) as { user_id: string; program_id: string }[]) {
        const k = `${r.user_id}:${r.program_id}`;
        restCount.set(k, (restCount.get(k) ?? 0) + 1);
      }
      return ((rows ?? []) as unknown as {
        user_id: string; program_id: string; start_date: string | null; weekly_target: number | null;
        is_primary: boolean | null; status: string;
        profiles: { full_name: string | null; dharma_name: string | null } | null;
        programs: { name: string } | null;
      }[]).map((r) => ({
        userId: r.user_id,
        fullName: r.profiles?.full_name ?? null,
        dharmaName: r.profiles?.dharma_name ?? null,
        programId: r.program_id,
        programName: r.programs?.name ?? '—',
        startDate: r.start_date,
        weeklyTarget: r.weekly_target,
        isPrimary: !!r.is_primary,
        status: r.status,
        restWeeks: restCount.get(`${r.user_id}:${r.program_id}`) ?? 0,
      }));
    },
  });
}

// 专业默认节奏(决策157「大纲默认节奏·管理端配」;审计 P1「default_weekly_lessons 无配置 UI」)
export type ProgramPaceRow = { id: string; name: string; defaultWeeklyLessons: number | null };

export function useProgramPaces() {
  return useQuery({
    queryKey: ['admin-program-paces'],
    staleTime: 30 * 1000,
    queryFn: async (): Promise<ProgramPaceRow[]> => {
      const { data, error } = await supabase.from('programs').select('id, name, default_weekly_lessons, display_order').order('display_order');
      if (error) throw error;
      return (data ?? []).map((p) => ({ id: p.id, name: p.name, defaultWeeklyLessons: (p as { default_weekly_lessons?: number | null }).default_weekly_lessons ?? null }));
    },
  });
}

export function useSetProgramDefaultPace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { programId: string; weeklyLessons: number }) => {
      const { error } = await supabase.from('programs').update({ default_weekly_lessons: input.weeklyLessons }).eq('id', input.programId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-program-paces'] });
      qc.invalidateQueries({ queryKey: ['self-study-plan'] }); // 师兄端本周计划依赖默认节奏
    },
  });
}
