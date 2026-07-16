import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { TargetPeriod } from '@/lib/queries/practice-config';

// 功课配置写库 · 管理端「功课配置」页。全部走 RLS:
//   practice_templates 写 = is_system_admin();cohort_recommended_templates 写 = is_system_admin()。
// 注:这里只配「模板 + 班级绑定」;把模板实例化成学员的愿(自动发愿)走 SECURITY DEFINER 函数 provision_cohort_vows(单独迁移)。

export type TemplateInput = {
  practiceId: string;
  templateName: string;
  description: string | null;
  targetCount: number | null;
  targetPeriod: TargetPeriod;
  dailyTarget: number | null;
  weeklyTarget: number | null;
  startsOffsetDays: number | null;
  durationDays: number | null;
  appliesToPrograms: string[] | null;
  isTimeLimited: boolean;
  defaultMinSessionMinutes: number | null; // 波C双层方案:留空=沿用愿表DEFAULT 30;填则须≥30(UI硬限+DB CHECK)
  clientToken?: string; // 弱网幂等(2026-07-13),仅建模板用,改模板是绝对值UPDATE本就幂等不需要
};

function rowFromInput(p: TemplateInput) {
  return {
    practice_id: p.practiceId,
    template_name: p.templateName.trim(),
    description: p.description?.trim() || null,
    target_count: p.targetCount,
    target_period: p.targetPeriod,
    default_daily_target: p.dailyTarget,
    default_weekly_target: p.weeklyTarget,
    starts_offset_days: p.startsOffsetDays,
    duration_days: p.durationDays,
    applies_to_programs: p.appliesToPrograms && p.appliesToPrograms.length > 0 ? p.appliesToPrograms : null,
    is_time_limited: p.isTimeLimited,
    default_min_session_minutes: p.defaultMinSessionMinutes,
  };
}

function useInvalidateConfig() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['practice-templates'] });
    qc.invalidateQueries({ queryKey: ['cohort-bindings'] });
    qc.invalidateQueries({ queryKey: ['template-bind-counts'] });
  };
}

// ── 建模板 ─────────────────────────────────────────────────────────────
export function useCreateTemplate() {
  const { session } = useAuth();
  const inval = useInvalidateConfig();
  return useMutation({
    mutationFn: async (p: TemplateInput): Promise<string> => {
      const { data, error } = await supabase
        .from('practice_templates')
        .insert({ ...rowFromInput(p), created_by: session?.user.id ?? null, client_token: p.clientToken ?? null })
        .select('id')
        .single();
      if (error) {
        // 弱网幂等(2026-07-13):同一凭证重复提交(网络重试/双击)当已成功处理——查回既有那条的id。
        if (error.code === '23505' && p.clientToken) {
          const { data: existing, error: selErr } = await supabase.from('practice_templates').select('id').eq('client_token', p.clientToken).maybeSingle();
          if (!selErr && existing) return existing.id;
        }
        throw error;
      }
      return data!.id;
    },
    onSuccess: () => inval(),
  });
}

// ── 改模板 ─────────────────────────────────────────────────────────────
export function useUpdateTemplate() {
  const inval = useInvalidateConfig();
  return useMutation({
    mutationFn: async (p: TemplateInput & { id: string }) => {
      const { error } = await supabase.from('practice_templates').update(rowFromInput(p)).eq('id', p.id);
      if (error) throw error;
    },
    onSuccess: () => inval(),
  });
}

// ── 停用 / 启用模板(软删:已发出的愿不动)────────────────────────────
export function useToggleTemplateActive() {
  const inval = useInvalidateConfig();
  return useMutation({
    mutationFn: async (p: { id: string; isActive: boolean }) => {
      const { error } = await supabase.from('practice_templates').update({ is_active: p.isActive }).eq('id', p.id);
      if (error) throw error;
    },
    onSuccess: () => inval(),
  });
}

// ── 绑定模板到班级(binding='auto')────────────────────────────────────
// PK(cohort_id, template_id);重复绑 = upsert 幂等。
export function useBindTemplate() {
  const inval = useInvalidateConfig();
  return useMutation({
    mutationFn: async (p: { cohortId: string; templateId: string }) => {
      const { error } = await supabase
        .from('cohort_recommended_templates')
        .upsert({ cohort_id: p.cohortId, template_id: p.templateId, binding: 'auto' }, { onConflict: 'cohort_id,template_id' });
      if (error) throw error;
    },
    onSuccess: () => inval(),
  });
}

// ── 解绑 ───────────────────────────────────────────────────────────────
export function useUnbindTemplate() {
  const inval = useInvalidateConfig();
  return useMutation({
    mutationFn: async (p: { cohortId: string; templateId: string }) => {
      const { error } = await supabase
        .from('cohort_recommended_templates')
        .delete()
        .eq('cohort_id', p.cohortId)
        .eq('template_id', p.templateId);
      if (error) throw error;
    },
    onSuccess: () => inval(),
  });
}

// ── 发放班级愿(把绑定的 auto 模板实例化成全班 active 学员的愿)──────────
// 走 SECURITY DEFINER 函数 provision_cohort_vows(迁移 20260628000020);返回新建愿条数。
// 幂等:已有的不重建,可随时重跑补差额。RPC 未进生成类型 → 缝里收窄。
export function useProvisionCohortVows() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { cohortId: string }): Promise<number> => {
      const { data, error } = await supabase.rpc('provision_cohort_vows', { p_cohort_id: p.cohortId });
      if (error) throw new Error(error.message);
      return data ?? 0;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-vows'] });
      qc.invalidateQueries({ queryKey: ['cohort-bindings'] });
    },
  });
}
