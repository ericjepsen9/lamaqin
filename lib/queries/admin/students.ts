import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { createNotification } from '@/lib/mutations/notifications';
import { fetchAllPages } from '@/lib/queries/paginate';
import { supabase } from '@/lib/supabase';
import { useAdminMutation } from './mutations';

// 管理端学员列表。
// RLS 自动过滤: system_admin → 全部学员; zhumai/aixin → 仅本班学员(via class_admins)。
// snap(5维快照)首版全返回 null,后续可扩展为 Postgres function 计算。
export type AdminStudent = {
  id: string;
  fullName: string | null;
  dharmaName: string | null;
  status: 'pending' | 'active' | 'rejected' | 'suspended' | 'inactive' | 'graduated';
  memberRole: 'auditor' | 'formal' | null;
  cohortName: string | null;
  cohortId: string | null;
};

type RawProfile = {
  id: string;
  full_name: string | null;
  dharma_name: string | null;
  status: AdminStudent['status'];
};

type RawClassMember = {
  user_id: string;
  cohort_id: string;
  member_role: string;
  is_primary: boolean | null;
  cohorts: { name: string } | null;
};

export function useAdminStudents(filter?: 'pending' | 'active' | 'all') {
  return useQuery({
    queryKey: ['admin-students', filter ?? 'all'],
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<AdminStudent[]> => {
      // Step 1: 取 profiles (RLS 已按角色过滤可见范围)
      // 分页取全(2026-07-11 一致性调研发现:PostgREST 单次封顶会静默截断,会众规模涨了会漏人)。
      const profiles = await fetchAllPages<RawProfile>(async (from, to) => {
        let pq = supabase.from('profiles').select('id, full_name, dharma_name, status').order('full_name');
        if (filter === 'pending') pq = pq.eq('status', 'pending');
        else if (filter === 'active') pq = pq.eq('status', 'active');
        return pq.range(from, to);
      });
      if (profiles.length === 0) return [];

      // Step 2: 取这批学员的 class_members + cohort name
      const ids = profiles.map((p) => p.id);
      const { data: members } = await supabase
        .from('class_members')
        .select('user_id, cohort_id, member_role, is_primary, cohorts(name)')
        .in('user_id', ids);

      // 按 user_id 索引，优先取主班
      const memberMap = new Map<string, RawClassMember>();
      for (const m of (members ?? []) as unknown as RawClassMember[]) {
        const existing = memberMap.get(m.user_id);
        if (!existing || m.is_primary) memberMap.set(m.user_id, m);
      }

      return (profiles as RawProfile[]).map((p) => {
        const m = memberMap.get(p.id) ?? null;
        return {
          id: p.id,
          fullName: p.full_name,
          dharmaName: p.dharma_name ?? null,
          status: p.status,
          memberRole: (m?.member_role ?? null) as 'auditor' | 'formal' | null,
          cohortName: m?.cohorts?.name ?? null,
          cohortId: m?.cohort_id ?? null,
        };
      });
    },
  });
}

// 单个学员详情(学员管理详情页用)
export function useAdminStudentDetail(userId: string | undefined) {
  return useQuery({
    queryKey: ['admin-student', userId],
    enabled: !!userId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      if (!userId) return null;
      const [{ data: profile, error: profileErr }, { data: members, error: membersErr }] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, dharma_name, status, student_id, preferred_region, accessibility_needs, data_source, learning_mode, intended_program_id, intended_program:programs(name), deletion_requested_at')
          .eq('id', userId)
          .single(),
        supabase
          .from('class_members')
          .select('cohort_id, member_role, is_primary, status, cohorts(name)')
          .eq('user_id', userId),
      ]);
      // 两条查询失败都不能悄悄当"查无此人/无班"处理(同类静默失败,审计2026-07-10已修
      // 过students.ts其它几处同款问题,这条随本次账号注销改动顺手一起修)。
      if (profileErr) throw profileErr;
      if (membersErr) throw membersErr;
      if (!profile) return null;
      return { ...profile, classMemberships: members ?? [] };
    },
  });
}

// ─── 写操作（范例：审批入学）────────────────────────────────────────────
// 这是「读 + 写」闭环的样板：UI 按钮调 .mutate(userId)，成功后列表/详情自动刷新。
// 改 profiles.status（对齐 PRD「批准=status→active」）+ 写 audit_logs（2026-07-08 补·此前
// 是"最小版"漏项)；批准时若注册意愿=自学(learning_mode='self_study')，按其意愿自动授予
// self_study_grants(幂等·同 useGrantSelfStudy 的 duplicate 捕获)。审批仅 admin 可执行(RLS)。
export function useApproveStudent() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useAdminMutation<string>({
    mutationFn: async (userId) => {
      const { data: prof } = await supabase.from('profiles').select('learning_mode').eq('id', userId).single();
      const { error } = await supabase.from('profiles').update({ status: 'active' }).eq('id', userId);
      if (error) throw error;
      if (uid) {
        await supabase.from('audit_logs').insert({
          user_id: uid, action: 'approve_student', target_type: 'profiles', target_id: userId,
          metadata: { subject_user_id: userId },
        });
      }
      if (prof?.learning_mode === 'self_study') {
        const { error: gErr } = await supabase.from('self_study_grants')
          .insert({ user_id: userId, granted_by: uid ?? null, reason: '注册意愿:自学·入学审批自动授予' });
        if (gErr && !/duplicate|unique/i.test(gErr.message)) throw gErr;
      }
      // 通知(C2·决策170 系统类:入学审批):次要副作用,不影响审批本身是否成功
      await createNotification({ userId, category: 'system', title: '入学审批已通过', body: '欢迎加入闻思修学修!接下来去选班,开始您的学修之旅。' });
    },
    invalidateKeys: [['admin-students'], ['admin-student'], ['self-study-grant']],
  });
}

export function useRejectStudent() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useAdminMutation<string>({
    mutationFn: async (userId) => {
      const { error } = await supabase.from('profiles').update({ status: 'rejected' }).eq('id', userId);
      if (error) throw error;
      if (uid) {
        await supabase.from('audit_logs').insert({
          user_id: uid, action: 'reject_student', target_type: 'profiles', target_id: userId,
          metadata: { subject_user_id: userId },
        });
      }
      // 通知(C2·决策170 系统类:入学审批未通过)
      await createNotification({ userId, category: 'system', title: '入学申请未通过', body: '如有疑问,请联系辅导员了解详情。' });
    },
    invalidateKeys: [['admin-students'], ['admin-student']],
  });
}

// 后台直接创建学员账号(PM 2026-07-15 决定:不需要师兄手机端自助注册)。
// 走 Edge Function(supabase/functions/admin-create-student)——真正建 auth.users 用户
// 需要 service_role/GoTrue Admin API,App 端(anon key)做不到,只能转发给服务端。
// 建号后直接 status='active'(admin 建号=已核实,同老学员植入先例);初始密码由本人(admin)
// 在表单里指定,must_change_password 强制新学员首次登录先改成自己的密码(同批
// 20260715000000 的强制改密码闸门,复用同一套 UI/RLS,不是另起一套)。
// 分班不在这里做——建完账号后走既有「班级管理→添加学员」流程(该流程已支持同一人
// 加入多个班,不必在这个建号表单里重复实现一遍选班 UI)。
export function useAdminCreateStudent() {
  return useAdminMutation<
    { email: string; password: string; fullName: string; dharmaName?: string; phone?: string },
    { userId: string }
  >({
    mutationFn: async (input) => {
      const { data, error } = await supabase.functions.invoke('admin-create-student', { body: input });
      if (error) {
        const ctx = (error as { context?: Response }).context;
        const body = ctx ? await ctx.json().catch(() => null) as { error?: string } | null : null;
        throw new Error(body?.error ?? error.message);
      }
      return data as { userId: string };
    },
    invalidateKeys: [['admin-students']],
  });
}

// ── 宽限(#186·改师兄 auto 愿 due_date;审计 P1「设宽限死按钮」接线 2026-07-02)──────
// 只列 auto 愿(custom 愿私密,谁也不代改·requirements C.3);写=改 current_end_date,
//   RLS 放行 admin/本班主麦爱心,vow_due_date_audit 触发器自动留痕。
export type StudentAutoVow = {
  id: string;
  practiceName: string;
  currentEndDate: string | null;
  originalEndDate: string | null;
  status: string | null;
  minSessionMinutes: number | null;
  dailyTarget: number | null;
  allowedDailyTargets: number[] | null; // 非空=该修法目标白名单(PD-9/PD-19);纠错只能改成其中之一
  dailyTargetLocked: boolean; // true=师兄不可自改(PD-6三选一锁定),仅admin能纠错(vows_check_daily_target 后门)
};

export function useStudentAutoVows(userId: string | undefined) {
  return useQuery({
    queryKey: ['admin-student-vows', userId],
    enabled: !!userId,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<StudentAutoVow[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('user_practice_vows')
        .select('id, current_end_date, original_end_date, status, min_session_minutes, daily_target, source, practices(name, allowed_daily_targets, daily_target_locked)')
        .eq('user_id', userId)
        .eq('source', 'auto')
        .in('status', ['active', 'paused']);
      if (error) throw error;
      return ((data ?? []) as unknown as {
        id: string; current_end_date: string | null; original_end_date: string | null; status: string | null; min_session_minutes: number | null;
        daily_target: number | null;
        practices: { name?: string; allowed_daily_targets?: number[] | null; daily_target_locked?: boolean | null } | null;
      }[]).map((v) => ({
        id: v.id,
        practiceName: v.practices?.name ?? '功课',
        currentEndDate: v.current_end_date,
        originalEndDate: v.original_end_date,
        status: v.status,
        minSessionMinutes: v.min_session_minutes,
        dailyTarget: v.daily_target,
        allowedDailyTargets: v.practices?.allowed_daily_targets ?? null,
        dailyTargetLocked: v.practices?.daily_target_locked ?? false,
      }));
    },
  });
}

export function useExtendVowDueDate() {
  return useAdminMutation<{ vowId: string; newEndDate: string }>({
    mutationFn: async ({ vowId, newEndDate }) => {
      const { error } = await supabase.from('user_practice_vows').update({ current_end_date: newEndDate }).eq('id', vowId);
      if (error) throw error;
    },
    invalidateKeys: [['admin-student-vows'], ['my-vows']],
  });
}

// 每日目标纠错(R1·PD-6 后门):锁定修法(如净土三选一)师兄不可自改,仅admin能改、且只能改成
//   allowed_daily_targets 白名单内的值(vows_check_daily_target 触发器兜底、自动留 audit_logs)。
export function useUpdateVowDailyTarget() {
  return useAdminMutation<{ vowId: string; dailyTarget: number }>({
    mutationFn: async ({ vowId, dailyTarget }) => {
      const { error } = await supabase.from('user_practice_vows').update({ daily_target: dailyTarget }).eq('id', vowId);
      if (error) throw error;
    },
    invalidateKeys: [['admin-student-vows'], ['my-vows']],
  });
}

// 座次门槛个别覆写(波C双层方案·2026-07-08 PM 裁决:比宽限更紧,仅admin)。
// RLS 行级本已允许本班zhumai/aixin改auto愿其它列,但 min_session_minutes 这一列被
// vows_protect_status 触发器列级锁定为仅admin(20260709000100)——非admin写入会被静默还原,
// 不会报错;因此调用方必须自行判断是否 isAdmin 再展示入口,不能只等 RLS/mutation 报错兜底。
export function useUpdateVowMinSessionMinutes() {
  return useAdminMutation<{ vowId: string; minSessionMinutes: number }>({
    mutationFn: async ({ vowId, minSessionMinutes }) => {
      const { error } = await supabase.from('user_practice_vows').update({ min_session_minutes: minSessionMinutes }).eq('id', vowId);
      if (error) throw error;
    },
    invalidateKeys: [['admin-student-vows']],
  });
}
