// 学习提醒·客户端权限请求 + token注册(决策188方案A,PM 2026-07-12三点拍板,详见
// docs/待回写中枢_2026-07-08.md D10)。
//
// PM原话"每个人都可以接收到消息才对":登录后主动弹系统权限请求,不藏在设置页深处等用户
// 自己找——调用方是lib/auth.tsx的SIGNED_IN分支(每次真正登入触发一次,不是每次渲染/
// token刷新都问)。只请求权限+注册token,不做任何"是否提醒"这层个人开关(决策188原范围,
// 不扩大——提醒是否发送由cohort.reminder_enabled这个班级级别配置决定)。
//
// Web端不做(expo-notifications的web推送是完全不同的Web Push+VAPID key机制,不是Expo Push
// token这套,决策188方案A只针对移动端;这个session全套e2e测试跑在web上,gate掉避免测试环境
// 报错/崩溃)。
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

export async function requestPushPermissionAndRegisterToken(userId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const existing = await Notifications.getPermissionsAsync();
    const granted = existing.granted
      ? true
      : (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const { data } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    if (!data) return;

    // upsert按expo_push_token去重(同一台设备重装/换号登录会复用同一个token,直接覆盖
    // user_id/is_active,不产生重复行——该列本身有UNIQUE约束)。
    await supabase.from('user_push_tokens').upsert(
      { user_id: userId, expo_push_token: data, device_info: `${Platform.OS} ${Platform.Version ?? ''}`.trim(), is_active: true },
      { onConflict: 'expo_push_token' },
    );
  } catch {
    // 静默失败:网络问题/用户拒绝权限都不应该打断登录流程本身,这只是"锦上添花"的注册动作,
    // 不是登录成功的必要条件。
  }
}
