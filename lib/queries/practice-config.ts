import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

// 功课配置数据层 · 管理端「功课配置」页用。
// 链条(schema §8):practices(修法主表·已种子13个)→ practice_templates(任务模板:目标/日目标/起修偏移/完成天数/限专业)
//   → cohort_recommended_templates(binding='auto' 把模板绑到班级=班级愿来源)。
// 读:practices / practice_templates select = 任意登录;cohort_recommended_templates = 本班成员/管理员。写一律 is_system_admin。

// ── 修法主表(建模板时从中选)────────────────────────────────────────
export type PracticeMaster = {
  id: string;
  name: string;
  measurement: 'count' | 'duration'; // 计数(遍/声)/计时(座)
  unit: string;
  category: string | null;
};

export function usePracticesMaster() {
  return useQuery({
    queryKey: ['practices-master'],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<PracticeMaster[]> => {
      const { data, error } = await supabase
        .from('practices')
        .select('id, name, measurement, unit, category, is_active, display_order')
        .eq('is_active', true)
        .order('display_order');
      if (error) throw error;
      return (data ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        measurement: (p.measurement as 'count' | 'duration') ?? 'count',
        unit: p.unit,
        category: p.category,
      }));
    },
  });
}

// ── 任务模板库 ────────────────────────────────────────────────────────
export type TargetPeriod = 'lifetime' | 'until_complete' | 'daily' | 'weekly' | 'event';

export type PracticeTemplate = {
  id: string;
  practiceId: string;
  practiceName: string;
  unit: string;
  templateName: string;
  description: string | null;
  targetCount: number | null;
  targetPeriod: TargetPeriod;
  dailyTarget: number | null;
  weeklyTarget: number | null;
  startsOffsetDays: number | null;
  durationDays: number | null;
  appliesToPrograms: string[] | null;
  isTimeLimited: boolean;       // 限时愿(内加行):梯次起修 + 建班年限窗口 + 仅 admin 延期(决策086)
  isActive: boolean;
  displayOrder: number;
  defaultMinSessionMinutes: number | null; // 座次门槛默认值(波C双层方案·2026-07-08):NULL=沿用愿表DEFAULT 30
};

type TemplateRow = {
  id: string; practice_id: string; template_name: string; description: string | null;
  target_count: number | null; target_period: TargetPeriod;
  default_daily_target: number | null; default_weekly_target: number | null;
  starts_offset_days: number | null; duration_days: number | null;
  applies_to_programs: string[] | null; is_time_limited: boolean | null; is_active: boolean | null; display_order: number | null;
  default_min_session_minutes: number | null;
  practices: { name?: string; unit?: string } | null;
};

export function usePracticeTemplates() {
  return useQuery({
    queryKey: ['practice-templates'],
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<PracticeTemplate[]> => {
      const { data, error } = await supabase
        .from('practice_templates')
        .select('id, practice_id, template_name, description, target_count, target_period, default_daily_target, default_weekly_target, starts_offset_days, duration_days, applies_to_programs, is_time_limited, is_active, display_order, default_min_session_minutes, practices!practice_templates_practice_id_fkey(name, unit)')
        .order('display_order');
      if (error) throw error;
      return ((data ?? []) as unknown as TemplateRow[]).map((t) => ({
        id: t.id,
        practiceId: t.practice_id,
        practiceName: t.practices?.name ?? '未知修法',
        unit: t.practices?.unit ?? '遍',
        templateName: t.template_name,
        description: t.description,
        targetCount: t.target_count,
        targetPeriod: t.target_period,
        dailyTarget: t.default_daily_target,
        weeklyTarget: t.default_weekly_target,
        startsOffsetDays: t.starts_offset_days,
        durationDays: t.duration_days,
        appliesToPrograms: t.applies_to_programs,
        isTimeLimited: t.is_time_limited ?? false,
        isActive: t.is_active ?? true,
        displayOrder: t.display_order ?? 0,
        defaultMinSessionMinutes: t.default_min_session_minutes,
      }));
    },
  });
}

// ── 班级 ↔ 模板绑定(某班绑了哪些模板)───────────────────────────────
export type CohortBinding = { templateId: string; binding: 'auto' | 'recommended'; displayOrder: number };

export function useCohortBindings(cohortId: string | undefined) {
  return useQuery({
    queryKey: ['cohort-bindings', cohortId ?? 'none'],
    enabled: !!cohortId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<CohortBinding[]> => {
      if (!cohortId) return [];
      const { data, error } = await supabase
        .from('cohort_recommended_templates')
        .select('template_id, binding, display_order')
        .eq('cohort_id', cohortId)
        .order('display_order');
      if (error) throw error;
      return (data ?? [])
        .filter((r): r is typeof r & { template_id: string } => !!r.template_id)
        .map((r) => ({
          templateId: r.template_id,
          binding: (r.binding as 'auto' | 'recommended') ?? 'auto',
          displayOrder: r.display_order ?? 0,
        }));
    },
  });
}

// ── 每个模板绑了几个班(模板库列表里显示「已绑 N 班」)─────────────────
export function useTemplateBindCounts() {
  return useQuery({
    queryKey: ['template-bind-counts'],
    staleTime: 60 * 1000,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from('cohort_recommended_templates')
        .select('template_id');
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const r of data ?? []) {
        if (!r.template_id) continue;
        counts[r.template_id] = (counts[r.template_id] ?? 0) + 1;
      }
      return counts;
    },
  });
}
