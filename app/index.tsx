import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/lib/auth';
import { useCurrentUser } from '@/lib/queries/profile';

// 预览模式(EXPO_PUBLIC_PREVIEW=1):跳过登录闸门直接进师兄端首页,供 UI 逐页评审(无需接认证/数据)。
// 接真认证后移除。
const PREVIEW = process.env.EXPO_PUBLIC_PREVIEW === '1';

// 入口闸门:会话 + 审批门(profiles.status)+ 角色分流。
//   未登录 → 登录;pending → 待审核页;rejected → 未通过页;
//   active + 管理角色 → 管理端;active + 师兄 → 师兄端(5-Tab)。
//   suspended/inactive/graduated 的专属界面延后(决策延后-25),暂收口到待审核态提示。
//   must_change_password=true → 强制先改密码(不可跳过,2026-07-15·老学员默认密码场景)。
//   active 且 data_source='imported' 且未看过欢迎页 → 先转欢迎回来页(决策076·2026-07-12)。
export default function Index() {
  const { session, loading } = useAuth();
  const { data: me, isLoading, isError, refetch } = useCurrentUser();

  if (PREVIEW) return <Redirect href="/home" />;

  if (loading || (session && isLoading)) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  // 查询失败 ≠ 未登录(session 仍有效)——此前混为一谈,useCurrentUser 内部把
  // profiles 拉取失败悄悄当 null 处理,网络抖动会把真实已登录用户弹回登录页,
  // 状态误导(2026-07-12 审计发现,同批已修 useCurrentUser 本身不再吞错误)。
  if (session && isError) {
    return (
      <View className="flex-1 items-center justify-center bg-background" style={{ padding: 24, gap: 12 }}>
        <Text className="text-center text-sm">加载失败,请检查网络后重试(你仍处于登录状态,不是被登出)</Text>
        <Button onPress={() => refetch()}><Text>重试</Text></Button>
      </View>
    );
  }

  if (!session || !me) return <Redirect href="/login" />;
  // 已申请注销(决策078+B1):不管原来什么身份/状态,一律拦到专属页——找回仅限后台管理操作,
  // 本人重新登录不会自动恢复(否则"申请注销"就没意义了)。
  if (me.deletionRequestedAt) return <Redirect href="/account-deletion-pending" />;
  // pending 且资料未填(注册后首登)→ 先完善资料;填过 → 待审核页(D-2/D-3 注册链路)
  if (me.status === 'pending') return <Redirect href={me.fullName ? '/pending' : '/onboarding'} />;
  if (me.status === 'rejected') return <Redirect href="/rejected" />;
  if (me.status !== 'active') return <Redirect href="/pending" />;
  if (me.mustChangePassword) return <Redirect href={'/set-password?forced=1' as never} />;
  if (me.role !== 'student') return <Redirect href="/dashboard" />;
  if (me.dataSource === 'imported' && !me.welcomeSeenAt) return <Redirect href={'/welcome-back' as never} />;
  return <Redirect href="/home" />;
}
