import { Hourglass } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { ACCOUNT_DELETION_RETENTION_DAYS } from '@/lib/admin-thresholds';
import { useCurrentUser } from '@/lib/queries/profile';
import { supabase } from '@/lib/supabase';

// 已申请注销、处于保留期(决策078+B1·2026-07-10)。找回仅限后台管理操作,本页不提供
// 用户自助撤回入口——PM 明确"找回需要后台管理操作",重新登录看到这页本身就是设计行为。
const INK = '#2b2218';
const INK3 = '#7e6d5b';

export default function AccountDeletionPending() {
  const { data: me } = useCurrentUser();
  // Date.now()不能直接在渲染期间调用(react-hooks/purity·2026-07-17 lint债清理):同一次渲染
  // 反复调用可能拿到不同值,不纯。用useState惰性初始化拿一个"这个页面第一次挂载时"的稳定快照,
  // 倒计时本来就是"约N天"的展示,不需要逐秒刷新,行为不变。
  const [nowMs] = useState(() => Date.now());

  const daysLeft = (() => {
    if (!me?.deletionRequestedAt) return null;
    const elapsed = (nowMs - new Date(me.deletionRequestedAt).getTime()) / (24 * 60 * 60 * 1000);
    return Math.max(0, Math.ceil(ACCOUNT_DELETION_RETENTION_DAYS - elapsed));
  })();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF4E9' }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 16 }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(43,34,24,0.05)', alignItems: 'center', justifyContent: 'center' }}>
          <Hourglass size={34} color={INK3} />
        </View>
        <Text className="font-serif" style={{ fontSize: 20, fontWeight: '700', color: INK }}>账号正在注销流程中</Text>
        <Text style={{ fontSize: 14, color: INK3, textAlign: 'center', lineHeight: 24 }}>
          {daysLeft != null
            ? `将于约 ${daysLeft} 天后永久删除(含全部学修记录),之后无法恢复。`
            : '将在保留期结束后永久删除,之后无法恢复。'}
          {'\n'}如需取回账号,请直接联系管理员——注销的找回只能由后台操作,重新登录无法自行撤回。
        </Text>
        <Pressable
          hitSlop={8}
          style={{ marginTop: 8, paddingVertical: 10, paddingHorizontal: 20 }}
          onPress={() => void supabase.auth.signOut()}
        >
          <Text style={{ fontSize: 14, fontWeight: '700', color: INK3 }}>退出登录</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
