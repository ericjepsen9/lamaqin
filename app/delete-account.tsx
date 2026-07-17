import { useRouter } from 'expo-router';
import { ChevronLeft, TriangleAlert } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { ACCOUNT_DELETION_RETENTION_DAYS } from '@/lib/admin-thresholds';
import { useRequestAccountDeletion } from '@/lib/mutations/account';
import { supabase } from '@/lib/supabase';

// 注销账号(设置 → 账号与隐私)。决策078沿用 + PM 2026-07-10 裁 B1:软删+保留期,
// 到期后连同学修记录一并真删(不做"学修档案永久保留供学籍查考"那个更复杂的口径——
// 2026-07-10 审计发现旧文案与 auth.users 级联删除的实际行为矛盾,已订正文案)。
// 找回仅限后台管理操作,本页/重新登录都不提供自助撤回。
const INK = '#2b2218';
const INK2 = '#55463a';
const SAFFRON_DARK = '#b35535';
const CRIM = '#a13c2e';

const POINTS = [
  `确认后立即退出登录,进入 ${ACCOUNT_DELETION_RETENTION_DAYS} 天保留期;期满将永久删除登录信息与全部学修记录(进度/累计/出勤等),无法恢复;`,
  '保留期内如需取回账号,只能联系管理员由后台操作恢复,你本人重新登录无法自行撤回;',
  '如日后想继续学修,需重新注册并经辅导员审批;',
  '注销不影响你已积累的功德——修行在心,不在账号。',
];

export default function DeleteAccount() {
  const router = useRouter();
  const [agree, setAgree] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const requestDeletion = useRequestAccountDeletion();

  const handleDelete = async () => {
    setErr(null);
    try {
      await requestDeletion.mutateAsync();
      await supabase.auth.signOut();
      router.replace('/login');
    } catch (e) {
      setErr(e instanceof Error ? e.message : '注销申请失败,请重试');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF4E9' }} edges={['top']}>
      <View style={styles.top}>
        <Pressable hitSlop={8} onPress={() => router.back()}><ChevronLeft size={24} color={INK} /></Pressable>
        <Text className="font-serif" style={{ fontSize: 17, fontWeight: '700', color: INK }}>注销账号</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
        <View style={styles.warnCard}>
          <View className="flex-row items-center" style={{ gap: 8, marginBottom: 10 }}>
            <TriangleAlert size={20} color={CRIM} />
            <Text className="font-serif" style={{ fontSize: 16, fontWeight: '700', color: INK }}>注销前请了解</Text>
          </View>
          {POINTS.map((p, i) => (
            <View key={i} className="flex-row" style={{ gap: 8, marginTop: i === 0 ? 0 : 8 }}>
              <Text style={{ color: SAFFRON_DARK, fontWeight: '700' }}>·</Text>
              <Text style={{ flex: 1, fontSize: 14, color: INK2, lineHeight: 22 }}>{p}</Text>
            </View>
          ))}
        </View>

        <View style={styles.softCard}>
          <Text style={{ fontSize: 14, color: INK2, lineHeight: 22 }}>有疑虑或遇到困难?不必急着离开,先和辅导员聊聊。</Text>
          <Pressable style={styles.contactBtn} onPress={() => router.push('/help')}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: SAFFRON_DARK }}>联系辅导员 ›</Text>
          </Pressable>
        </View>

        <Pressable style={styles.agreeRow} onPress={() => setAgree((v) => !v)}>
          <View style={[styles.check, agree && { backgroundColor: CRIM, borderColor: CRIM }]}>{agree ? <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✓</Text> : null}</View>
          <Text style={{ flex: 1, fontSize: 14, color: INK, fontWeight: '600' }}>我已了解上述说明,确认注销账号</Text>
        </Pressable>

        {err ? <Text style={{ fontSize: 13, color: CRIM, textAlign: 'center' }}>{err}</Text> : null}
        <Pressable
          style={[styles.deleteBtn, (!agree || requestDeletion.isPending) && { opacity: 0.4 }]}
          disabled={!agree || requestDeletion.isPending}
          onPress={() => void handleDelete()}
        >
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>{requestDeletion.isPending ? '处理中…' : '永久注销账号'}</Text>
        </Pressable>
        <Pressable style={styles.cancel} onPress={() => router.back()}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: INK2 }}>再想想,返回</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  warnCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(161,60,46,0.18)' },
  softCard: { backgroundColor: 'rgba(224,120,86,0.06)', borderRadius: 16, padding: 16, gap: 10 },
  contactBtn: { alignSelf: 'flex-start' },
  agreeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: 'rgba(43,34,24,0.06)' },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: 'rgba(43,34,24,0.2)', alignItems: 'center', justifyContent: 'center' },
  deleteBtn: { alignItems: 'center', paddingVertical: 15, borderRadius: 14, backgroundColor: CRIM, marginTop: 2 },
  cancel: { alignItems: 'center', paddingVertical: 13 },
});
