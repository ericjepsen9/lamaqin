import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// app 端角色(用于师兄端/管理端分流)。系统管理员/辅导员(zhumai)/爱心(aixin)走管理端;其余=师兄。
export type AppRole = 'admin' | 'zhumai' | 'aixin' | 'student';

export type CurrentUser = {
  id: string;
  status: 'pending' | 'active' | 'rejected' | 'suspended' | 'inactive' | 'graduated';
  role: AppRole;
  fullName: string | null;
  dharmaName: string | null;
  phone: string | null;
  studentId: string | null;
  accessibilityNeeds: string[]; // 'blind' / 'deaf'(盲聋豁免·学修流用)
  deletionRequestedAt: string | null; // 非null=已申请注销、处于保留期(决策078+B1·2026-07-10)
  dataSource: string | null; // 'imported'=老学员植入(决策076),用于欢迎回来页判断
  welcomeSeenAt: string | null; // 非null=已看过"欢迎回来"页(决策076·2026-07-12)
  mustChangePassword: boolean; // true=入口闸门强制导向 /set-password?forced=1(2026-07-15,老学员默认密码场景)
};

// 取当前用户档案 + 派生角色。读一律走 RLS(只看得到自己的 profile / 自己的 admin 行)。
// 角色派生(scaffold 版):system_admins → admin;class_admins → zhumai/aixin;否则 student。
export function useCurrentUser() {
  const { session } = useAuth();
  const uid = session?.user.id;

  return useQuery({
    queryKey: ['current-user', uid],
    enabled: !!uid,
    queryFn: async (): Promise<CurrentUser | null> => {
      if (!uid) return null;

      // select('*') 不点名列(2026-07-10 真机实测事故修复,非某条通用惯例——这是本 hook 专属
      // 的例外理由,勿套到别处):这个 hook 全站每页都要用来判角色/路由,一旦点名的列里有任何一个
      // 还没应用到库(如本次 deletion_requested_at),整条查询会 42703 报错、拖垮 profile 也拿不到——
      // 当时全站所有人的 useCurrentUser() 都失败、被 index.tsx 的角色门当"未登录"弹回登录页。
      // 换 select('*') 后,新列缺失只是拿不到那一个字段(下面 ?? null 兜底),不连坐整条查询。
      // ⚠️ 给以后改这个 hook 或写类似"全站路由判角色"查询的人:凡是承担"决定用户能不能进这个 App"
      // 这一职能的查询,新迁移加列后务必先确认已上 sss-dev 再点名选列,或索性沿用本 hook 的 select('*') 兜底写法。
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', uid)
        .single();
      if (error) throw error;
      if (!profile) return null;

      // 两条查询决定角色,查询失败绝不能悄悄当"不是管理员"处理——否则一次网络抖动
      // 就会把真管理员误判成 student、被 _layout 角色门整体踢出后台(审计 2026-07-10 发现)。
      // 失败就 throw,让 React Query 停在 error 态重试,而不是给出一个自信的错误角色。
      let role: AppRole = 'student';
      const { data: sysAdmin, error: sysAdminErr } = await supabase
        .from('system_admins')
        .select('user_id')
        .eq('user_id', uid)
        .maybeSingle();
      if (sysAdminErr) throw sysAdminErr;
      if (sysAdmin) {
        role = 'admin';
      } else {
        const { data: classAdmin, error: classAdminErr } = await supabase
          .from('class_admins')
          .select('role')
          .eq('user_id', uid)
          .limit(1)
          .maybeSingle();
        if (classAdminErr) throw classAdminErr;
        if (classAdmin?.role === 'zhumai' || classAdmin?.role === 'aixin') {
          role = classAdmin.role;
        }
      }

      return {
        id: profile.id,
        status: profile.status,
        role,
        fullName: profile.full_name,
        dharmaName: (profile as { dharma_name?: string | null }).dharma_name ?? null,
        phone: (profile as { phone?: string | null }).phone ?? null,
        studentId: profile.student_id,
        accessibilityNeeds: ((profile as { accessibility_needs?: string[] | null }).accessibility_needs) ?? [],
        deletionRequestedAt: (profile as { deletion_requested_at?: string | null }).deletion_requested_at ?? null,
        dataSource: (profile as { data_source?: string | null }).data_source ?? null,
        welcomeSeenAt: (profile as { welcome_seen_at?: string | null }).welcome_seen_at ?? null,
        mustChangePassword: (profile as { must_change_password?: boolean | null }).must_change_password ?? false,
      };
    },
  });
}
