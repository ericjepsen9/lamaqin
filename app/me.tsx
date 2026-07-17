import { useRouter } from 'expo-router';
import { BarChart3, CalendarDays, ChevronLeft, ChevronRight, LogOut, Settings } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text as RNText, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { useMyCohorts } from '@/lib/queries/classes';
import { useCurrentUser } from '@/lib/queries/profile';
import { useMySelfStudyPrograms } from '@/lib/queries/self-study-progress';
import { supabase } from '@/lib/supabase';

// 我的 = 个人中心 hub(决策158:首页左上头像进·drill-in)。采觉学 ProfilePage 骨架:身份 + 功能列表 + 退出。
// 学习数据全部走「学修档案」入口(/dossier·本人可见自己进度累计·决策014/145);本页不堆数据、不放他人对比(#193)。
// 学号转正才发(决策134/078);role 决定可见入口(师兄看不到管理端·RLS 双拦)。守:无排名、无状态色。
const INK = '#2b2218';
const INK2 = '#55463a';
const INK3 = '#7e6d5b';
const SAFFRON_DARK = '#b35535';
const CRIM = '#a13c2e';

export default function Me() {
  const router = useRouter();
  const { data: me, isError: meError } = useCurrentUser();
  const name = me?.fullName ?? '师兄';
  const initial = name.slice(0, 1);
  // 身份行修真(D-9·2026-07-02):有班=专业·班名;无班有自学=自学·主修专业;都无=未开始
  const { data: cohorts = [], isError: cohortsError } = useMyCohorts();
  const { data: ssPrograms = [], isError: ssError } = useMySelfStudyPrograms();
  // 查询失败别落进"还未开始学修"——那对已入班/已自学师兄是假消息(全文件审计 2026-07-12)
  const identity = (cohortsError || ssError)
    ? '加载失败,请检查网络后重试'
    : cohorts[0]
      ? `${cohorts[0].programName ? cohorts[0].programName + ' · ' : ''}${cohorts[0].cohortName}${cohorts[0].isPrimary ? '(主班)' : ''}`
      : ssPrograms[0]
        ? `自学 · ${ssPrograms[0].programName}(主修)`
        : '还未开始学修';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF4E9' }} edges={['top']}>
      <View style={styles.top}>
        <Pressable hitSlop={8} onPress={() => router.back()}><ChevronLeft size={24} color={INK} /></Pressable>
        <Text className="font-serif" style={{ fontSize: 17, fontWeight: '700', color: INK }}>我的</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
        {/* 身份 */}
        <View style={styles.idCard}>
          <View style={styles.avatar}><Text className="font-serif" style={{ fontSize: 26, fontWeight: '700', color: '#fff' }}>{initial}</Text></View>
          <View style={{ flex: 1 }}>
            <View className="flex-row items-center" style={{ gap: 8 }}>
              <Text className="font-serif" style={{ fontSize: 19, fontWeight: '700', color: INK }}>{name}</Text>
              <View style={styles.roleTag}><RNText style={{ fontSize: 11, fontWeight: '700', color: SAFFRON_DARK }}>师兄</RNText></View>
            </View>
            <RNText style={{ fontSize: 12, color: INK3, marginTop: 3 }}>学号 · {meError ? '加载失败' : (me?.studentId ?? '转正后发放')}</RNText>
            <RNText style={{ fontSize: 12, color: INK2, marginTop: 2 }}>{identity}</RNText>
          </View>
        </View>

        {/* 学修 */}
        <Group title="学修">
          <Row icon={<BarChart3 size={19} color={INK2} />} title="学修档案" sub="进度 · 累计 · 里程碑" onPress={() => router.push('/dossier')} />
          <Row icon={<CalendarDays size={19} color={INK2} />} title="活动报名" sub="共修 · 法会 · 讲考" onPress={() => router.push('/activities')} />
        </Group>

        {/* 账号 */}
        <Group title="账号">
          <Row icon={<Settings size={19} color={INK2} />} title="设置" sub="通知 · 偏好 · 隐私 · 帮助 · 关于" onPress={() => router.push('/settings')} />
          <Row icon={<LogOut size={19} color={CRIM} />} title="退出登录" titleColor={CRIM} onPress={async () => { await supabase.auth.signOut(); router.replace('/login'); }} last />
        </Group>
      </ScrollView>
    </SafeAreaView>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text className="font-serif" style={{ fontSize: 14, fontWeight: '700', color: INK3, marginLeft: 4 }}>{title}</Text>
      <View style={styles.group}>{children}</View>
    </View>
  );
}

function Row({ icon, title, sub, onPress, titleColor, last }: { icon: React.ReactNode; title: string; sub?: string; onPress: () => void; titleColor?: string; last?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[styles.row, !last && styles.rowBorder]}>
      {icon}
      <View style={{ flex: 1 }}>
        <RNText style={{ fontSize: 15, fontWeight: '600', color: titleColor ?? INK }}>{title}</RNText>
        {sub ? <RNText style={{ fontSize: 12, color: INK3, marginTop: 1 }}>{sub}</RNText> : null}
      </View>
      {titleColor ? null : <ChevronRight size={18} color={INK3} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  idCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#fff', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: 'rgba(43,34,24,0.06)' },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#C99563', alignItems: 'center', justifyContent: 'center' },
  roleTag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(224,120,86,0.12)' },
  group: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(43,34,24,0.06)', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 15 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(43,34,24,0.06)' },
});
