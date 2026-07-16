import { Stack } from 'expo-router';

// 认证 + 审批门流程(登录 / 待审核 / 未通过)。无自助选班(决策126);邀请码不做(决策138③)。
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
