import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { createNotification } from '@/lib/mutations/notifications';
import { supabase } from '@/lib/supabase';

// 班级管理写库 · 管理端班级详情「管理操作」用。全部走 RLS:
//   cohorts / class_members / cohort_rest_weeks 写 = is_system_admin()(辅导员/爱心只读)。
// 失败时调用方按 code 42501 / row-level security 给「无权限」友好提示。

// 改动后让班级相关查询失效(详情/名单/当前周/休息周/可加学员/后台班级列表)。
// queryKey 前缀匹配:['cohort-current-week', id] 会命中含 startDate 的完整键。
function useInvalidateCohort() {
  const qc = useQueryClient();
  return (cohortId: string) => {
    for (const key of [
      ['cohort-detail', cohortId],
      ['cohort-roster', cohortId],
      ['cohort-current-week', cohortId],
      ['cohort-rest-weeks', cohortId],
      ['addable-profiles', cohortId],
      ['admin-cohorts'],
      ['my-cohorts'],
    ]) {
      qc.invalidateQueries({ queryKey: key });
    }
  };
}

// ── 新建班级(insert cohorts)────────────────────────────────────────
// 必填(schema §3.3 无默认):program_id / name / code(全局唯一)/ start_date / timezone(IANA)。
// 共修日程/Zoom 等选填,建班后用「调整日程」补。写=is_system_admin();重复键给友好提示。
export function useCreateCohort() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      programId: string; name: string; code: string; startDate: string; timezone: string;
    }): Promise<string> => {
      const { data, error } = await supabase
        .from('cohorts')
        .insert({
          program_id: p.programId,
          name: p.name.trim(),
          code: p.code.trim(),
          start_date: p.startDate,
          timezone: p.timezone,
        })
        .select('id')
        .single();
      if (error) {
        // 23505 唯一冲突:cohorts_code_key=编号重复 / cohorts_program_id_name_key=同专业重名。
        if (error.code === '23505') {
          if (error.message.includes('code')) throw new Error('班级编号已被占用,请换一个');
          throw new Error('该专业下已有同名班级,请换个班级名');
        }
        throw error;
      }
      return data!.id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-cohorts'] }),
  });
}

// ── 添加学员(批量) ─────────────────────────────────────────────────
// class_members PK(cohort_id,user_id);status 默认 active,member_role 由调用方(旁听/正式)。
// 入班后【应用层显式】按本班功课自动发愿(provision_cohort_vows;非 DB 触发器,失败可见)。
//   发愿失败不影响"已入班"(insert 已提交),但会抛出提示,管理员可到「功课配置→同步发放」重试。
export function useAddClassMembers() {
  const inval = useInvalidateCohort();
  return useMutation({
    mutationFn: async (p: { cohortId: string; userIds: string[]; memberRole: 'auditor' | 'formal' }): Promise<{ provisioned: number }> => {
      if (p.userIds.length === 0) return { provisioned: 0 };
      const rows = p.userIds.map((uid) => ({ cohort_id: p.cohortId, user_id: uid, member_role: p.memberRole, status: 'active' }));
      const { error } = await supabase.from('class_members').insert(rows);
      if (error) throw error;
      // 按本班功课(专业默认 / 本班覆盖)给全班幂等补发,覆盖刚加入的人。
      const { data, error: pErr } = await supabase.rpc('provision_cohort_vows', { p_cohort_id: p.cohortId });
      if (pErr) throw new Error('学员已加入,但自动发愿失败:' + pErr.message + '。可到「功课配置 → 同步发放」重试。');
      return { provisioned: data ?? 0 };
    },
    // 用 onSettled:即便发愿报错(成员已入库),也刷新班级数据。
    onSettled: (_r, _e, p) => inval(p.cohortId),
  });
}

// ── 调整共修日程(常规 + 实修 的星期/时间/Zoom)──────────────────────
// 走 RPC(update_cosession_settings)不再直接 UPDATE cohorts(三易审计 2026-07-15 跟进,PM
// 裁定补上本班辅导员也能改):cohorts_write 这条 RLS 只放行 admin,辅导员改不了也看不到列级
// 限制(cohorts 表上还有 program/班名/年限等辅导员不该碰的字段,RLS 是行级不是列级)——RPC
// 内部 SECURITY DEFINER 只碰这6个共修相关列,天然做到列级限制,辅导员的权限判断在 RPC 里
// (has_class_role 'zhumai' OR is_system_admin),不靠放宽 cohorts_write。
export function useUpdateCohortSchedule() {
  const inval = useInvalidateCohort();
  return useMutation({
    mutationFn: async (p: {
      cohortId: string;
      weeklyDow: number | null; weeklyTime: string | null; regularZoom: string | null;
      practiceDow: number | null; practiceTime: string | null; practiceZoom: string | null;
    }) => {
      const { error } = await supabase.rpc('update_cosession_settings', {
        p_cohort_id: p.cohortId,
        p_weekly_dow: p.weeklyDow,
        p_weekly_time: p.weeklyTime,
        p_zoom_url: p.regularZoom,
        p_practice_dow: p.practiceDow,
        p_practice_time: p.practiceTime,
        p_practice_zoom_url: p.practiceZoom,
      });
      if (error) throw error;
    },
    onSuccess: (_r, p) => inval(p.cohortId),
  });
}

// ── 学习提醒(决策188方案A)─────────────────────────────────────────
// 同useUpdateCohortSchedule先例:权限判断在update_reminder_settings这个RPC内部
// (has_class_role 'zhumai' OR is_system_admin),不靠放宽cohorts_write这条admin-only的RLS。
export function useUpdateReminderSettings() {
  const inval = useInvalidateCohort();
  return useMutation({
    mutationFn: async (p: {
      cohortId: string;
      enabled: boolean; weekday: number | null; time: string | null; message: string | null;
    }) => {
      const { error } = await supabase.rpc('update_reminder_settings', {
        p_cohort_id: p.cohortId,
        p_enabled: p.enabled,
        p_weekday: p.weekday,
        p_time: p.time,
        p_message: p.message,
      });
      if (error) throw error;
    },
    onSuccess: (_r, p) => inval(p.cohortId),
  });
}

// ── 标记结班 / 恢复在读 ─────────────────────────────────────────────
export function useSetCohortActive() {
  const inval = useInvalidateCohort();
  return useMutation({
    mutationFn: async (p: { cohortId: string; isActive: boolean }) => {
      const { error } = await supabase.from('cohorts').update({ is_active: p.isActive }).eq('id', p.cohortId);
      if (error) throw error;
    },
    onSuccess: (_r, p) => inval(p.cohortId),
  });
}

// ── 休息周(计划外·扣进度周)增删 ────────────────────────────────────
export function useAddRestWeek() {
  const { session } = useAuth();
  const inval = useInvalidateCohort();
  return useMutation({
    mutationFn: async (p: { cohortId: string; restStartDate: string; reason: string | null }) => {
      const { error } = await supabase.from('cohort_rest_weeks').insert({
        cohort_id: p.cohortId,
        rest_start_date: p.restStartDate,
        reason: p.reason,
        created_by: session?.user.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_r, p) => inval(p.cohortId),
  });
}

export function useRemoveRestWeek() {
  const inval = useInvalidateCohort();
  return useMutation({
    mutationFn: async (p: { id: string; cohortId: string }) => {
      const { error } = await supabase.from('cohort_rest_weeks').delete().eq('id', p.id);
      if (error) throw error;
    },
    onSuccess: (_r, p) => inval(p.cohortId),
  });
}

// ── 成员转正(旁听 → 正式;不可降级·决策040/134)────────────────────────
// 走 promote_member_role RPC:转正 + 首次发学号 + 写审计,原直改 member_role 会【漏发学号】
// (审计 2026-07-02 发现的 bug,本次修正)。RPC 权限=本班主麦或 admin,失败信息原样抛给 UI。
export function useUpdateMemberRole() {
  const inval = useInvalidateCohort();
  return useMutation({
    mutationFn: async (p: { cohortId: string; userId: string; role: 'formal' }) => {
      const { error } = await supabase.rpc('promote_member_role', {
        p_cohort_id: p.cohortId,
        p_user_id: p.userId,
      });
      if (error) throw error;
      // 通知(C2·决策170 系统类:转正)
      await createNotification({ userId: p.userId, category: 'system', title: '您已成为正式成员', body: '恭喜转正,祝修行顺利!' });
    },
    onSuccess: (_r, p) => inval(p.cohortId),
  });
}

// ── 切主班(决策131/134:用户本人[限已入班] + admin;走 RPC 两步切避唯一索引撞车)──
export function useSwitchPrimaryCohort() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { userId: string; newPrimaryCohortId: string }) => {
      const { error } = await supabase.rpc('switch_primary_cohort', {
        p_user_id: p.userId,
        p_new_primary_cohort_id: p.newPrimaryCohortId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-cohorts'] });
      qc.invalidateQueries({ queryKey: ['admin-student'] });
      qc.invalidateQueries({ queryKey: ['primary-context'] });
    },
  });
}

// ── 成员状态变更(在读/暂停/留级/移出=已离)+ 审计字段 ─────────────────
// 留级(held_back)同时 held_back_count +1(次数上限=admin人工掌握·PD-18裁决,2026-07-08:
// 以requirements_master/schema为准,v1.0不系统硬卡——不要再建can_hold_back()之类的校验函数,
// feature_inventory §2.10"系统校验"是决策090的过时表述,待回中枢订正,不是本仓待办)。
export function useUpdateMemberStatus() {
  const { session } = useAuth();
  const inval = useInvalidateCohort();
  return useMutation({
    mutationFn: async (p: {
      cohortId: string;
      userId: string;
      status: 'active' | 'paused' | 'held_back' | 'left';
      reason?: string | null;
    }) => {
      // held_back_count 不在这里算:class_members_bump_held_back_trigger(2026-07-13)在DB侧
      // 原子+1,客户端"先读现值再+1"的两次往返有竞态(近乎同时的两次提交会都读到同一个旧值)。
      const patch: {
        status: 'active' | 'paused' | 'held_back' | 'left';
        status_changed_at: string;
        status_changed_by: string | null;
        status_change_reason: string | null;
      } = {
        status: p.status,
        status_changed_at: new Date().toISOString(),
        status_changed_by: session?.user.id ?? null,
        status_change_reason: p.reason ?? null,
      };
      const { error } = await supabase
        .from('class_members')
        .update(patch)
        .eq('cohort_id', p.cohortId)
        .eq('user_id', p.userId);
      if (error) throw error;
    },
    onSuccess: (_r, p) => inval(p.cohortId),
  });
}

// ── 班级干事任命/撤销(2026-07-02;RLS 仅 admin 可写 class_admins;PK=(cohort,user,role))──
export function useAppointClassAdmin() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (input: { cohortId: string; userId: string; role: 'zhumai' | 'aixin' }) => {
      const { error } = await supabase.from('class_admins').insert({
        cohort_id: input.cohortId, user_id: input.userId, role: input.role, assigned_by: session?.user.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['cohort-admins', v.cohortId] });
      qc.invalidateQueries({ queryKey: ['cohort-detail', v.cohortId] });
    },
  });
}

export function useRemoveClassAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { cohortId: string; userId: string; role: 'zhumai' | 'aixin' }) => {
      const { error } = await supabase.from('class_admins').delete()
        .eq('cohort_id', input.cohortId).eq('user_id', input.userId).eq('role', input.role);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['cohort-admins', v.cohortId] });
      qc.invalidateQueries({ queryKey: ['cohort-detail', v.cohortId] });
    },
  });
}
