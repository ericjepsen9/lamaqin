import { useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AdminButton,
  Avatar,
  Card,
  EmptyState,
  SCREEN_BG,
  SectionHeader,
  StatCard,
  ErrorState,
} from '@/components/ui/admin-kit';
import { Text } from '@/components/ui/text';
import { confirmAsync } from '@/lib/dialog';
import { useAdminSelfStudyStudents } from '@/lib/queries/admin/selfstudy';
import { useAdminStudents, useApproveStudent, useRejectStudent } from '@/lib/queries/admin/students';
import { useAdvancementRoster } from '@/lib/queries/advancement';
import { useCareRoster, type CareStudent } from '@/lib/queries/care';
import { useCurrentUser } from '@/lib/queries/profile';
import { CRIMSON, GOLD_DARK as GOLD, INK, INK2, INK3, INK4, SAFFRON, SAFFRON_DARK, SAGE_DARK } from '@/lib/theme';
import { useAdminLayout } from './_layout';

const WIDE = 900;
const ROLE_HELLO: Record<string, string> = { admin: '管理员', zhumai: '辅导员', aixin: '爱心义工', student: '师兄' };

// 关怀原因摘要(由高滞后维拼一句话)
function careReason(s: CareStudent): string {
  const parts: string[] = [];
  if (s.dims.attendance === 'high') parts.push('共修出勤偏低');
  else if (s.dims.attendance === 'medium') parts.push('出勤偏滞');
  if (s.dims.task === 'high') parts.push('功课进度滞后');
  return parts.length ? parts.join(' · ') : '需留意';
}

export default function AdminDashboard() {
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE;
  const router = useRouter();
  const { setTitle } = useAdminLayout();
  const { data: me } = useCurrentUser();
  const { data: pending = [], isLoading: pLoading, error: pError } = useAdminStudents('pending');
  const { data: activeProfiles = [], error: activeError } = useAdminStudents('active');
  const { data: ssRows = [], error: ssError } = useAdminSelfStudyStudents();
  const { data: roster = [], error: rosterError } = useAdvancementRoster();
  const { data: care = [], isLoading: cLoading, error: cError } = useCareRoster();
  const approve = useApproveStudent();
  const reject = useRejectStudent();

  useEffect(() => { setTitle('总览'); }, [setTitle]);

  // 在读=平台口径 profiles.status='active'(含自学/未入班;审计 P1:原班级花名册口径在自学首发下恒 0、误导)
  const stats = useMemo(() => {
    const classActive = roster.filter((r) => r.status === 'active');
    const ssUsers = new Set(ssRows.filter((r) => r.status === 'active').map((r) => r.userId)).size;
    const withSessions = classActive.filter((r) => r.sessionCount > 0);
    const attRate = withSessions.length
      ? Math.round(withSessions.reduce((s, r) => s + r.attendanceRate, 0) / withSessions.length)
      : null;
    return { activeCount: activeProfiles.length, ssUsers, classActive: classActive.length, attRate };
  }, [roster, activeProfiles, ssRows]);

  const flaggedCare = useMemo(() => care.filter((c) => c.flagged), [care]);
  // KPI 行的次级 hook 出错时不吞成"0"(审计:活跃/自学/升学名单查询失败会被 stats 静默算成 0,
  // 误导管理员以为"在读=0"/"出勤=0%")。
  const statsError = !!(activeError || ssError || rosterError);

  const now = new Date();
  const wd = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];
  const dateLabel = `${now.getMonth() + 1}月${now.getDate()}日 周${wd}`;
  const hello = ROLE_HELLO[me?.role ?? 'student'] ?? '';

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* 问候行 */}
        <View style={styles.greeting}>
          <Text className="font-serif" style={styles.greetingTitle}>善哉,{me?.fullName ?? hello}</Text>
          <Text style={styles.greetingDate}>{dateLabel}{statsError ? ' · 在读人数加载失败' : ` · 在读 ${stats.activeCount} 位师兄`}</Text>
        </View>

        {/* KPI */}
        <View style={[styles.kpiGrid, isWide && styles.kpiGridWide]}>
          <StatCard variant="tint" label="待审批" value={pending.length} accent={SAFFRON_DARK} tint="#fdf4ee" sub={pending.length ? '需要处理' : '暂无'} onPress={() => router.push('/(admin)/students' as never)} />
          <StatCard variant="tint" label="在读" value={statsError ? '—' : stats.activeCount} accent={SAGE_DARK} sub={statsError ? '加载失败' : `自学 ${stats.ssUsers} · 入班 ${stats.classActive}`} onPress={() => router.push('/(admin)/students' as never)} />
          <StatCard variant="tint" label="共修出勤" value={statsError ? '—' : (stats.attRate != null ? `${stats.attRate}%` : '—')} accent={GOLD} tint="#fbf3e8" sub={statsError ? '加载失败' : (stats.attRate != null ? '在读均值' : '暂无记录')} onPress={() => router.push('/(admin)/attendance' as never)} />
          <StatCard variant="tint" label="需关怀" value={flaggedCare.length} accent={CRIMSON} tint="#fbedea" sub={flaggedCare.length ? '出勤/功课滞后' : '暂无'} onPress={() => router.push('/(admin)/care' as never)} />
        </View>

        {/* 审批队列 */}
        <Card style={styles.section}>
          <SectionHeader title="审批队列" moreLabel="查看全部 →" onMore={() => router.push('/(admin)/students' as never)} />
          {pError ? <ErrorState /> : pLoading ? (
            <View style={{ paddingVertical: 16, alignItems: 'center' }}><ActivityIndicator color={SAFFRON} /></View>
          ) : pending.length === 0 ? (
            <EmptyState>暂无待审批申请</EmptyState>
          ) : (
            pending.slice(0, 6).map((item) => (
              <View key={item.id} style={styles.pendingRow}>
                <Avatar name={item.fullName ?? '?'} size={34} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.pendingName}>{item.fullName ?? '未命名'}</Text>
                  <Text style={styles.pendingTime}>{item.cohortName ?? '未分班'} · 待审批</Text>
                </View>
                <View style={styles.pendingActions}>
                  <AdminButton variant="primary" size="sm" disabled={approve.isPending} onPress={() => approve.mutate(item.id)}>批准</AdminButton>
                  {/* 拒绝=终态(rejected 不可逆·决策132)必须二次确认;批准可逆(可暂停/移出)保持一键 */}
                  <AdminButton variant="negative" size="sm" disabled={reject.isPending} onPress={async () => {
                    if (await confirmAsync(`拒绝 ${item.fullName ?? '该申请'} 的入学申请?`, '拒绝为终态,该账号将无法进入学修端。', '拒绝申请')) reject.mutate(item.id);
                  }}>拒绝</AdminButton>
                </View>
              </View>
            ))
          )}
        </Card>

        {/* 关怀提醒(仅管理端可见·决策035/107)*/}
        <Card style={styles.section}>
          <SectionHeader title="关怀提醒" moreLabel="查看全部 →" onMore={() => router.push('/(admin)/care' as never)} />
          {cError ? <ErrorState /> : cLoading ? (
            <View style={{ paddingVertical: 16, alignItems: 'center' }}><ActivityIndicator color={SAFFRON} /></View>
          ) : flaggedCare.length === 0 ? (
            <EmptyState>暂无需关怀师兄</EmptyState>
          ) : (
            flaggedCare.slice(0, 6).map((item) => (
              <View key={`${item.userId}|${item.cohortId}`} style={styles.careRow}>
                <Avatar name={item.name} size={30} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.careName}>{item.name}</Text>
                  <Text style={styles.careReason}>{careReason(item)}</Text>
                  <Text style={styles.careTime}>{item.cohortName}{item.lastFollowup ? ` · 最近跟进 ${item.lastFollowup}` : ' · 待跟进'}</Text>
                </View>
                <AdminButton variant="secondary" size="sm" onPress={() => router.push(`/(admin)/care/${item.userId}` as never)}>查看</AdminButton>
              </View>
            ))
          )}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SCREEN_BG },
  scroll: { padding: 20, gap: 18, paddingBottom: 40 },
  greeting: { gap: 4 },
  greetingTitle: { fontSize: 24, fontWeight: '700', color: INK, letterSpacing: 1 },
  greetingDate: { fontSize: 12, color: INK3 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  kpiGridWide: { flexWrap: 'nowrap' },
  section: { padding: 20, gap: 12 },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 4 },
  pendingName: { fontSize: 14, fontWeight: '600', color: INK },
  pendingTime: { fontSize: 10, color: INK4, marginTop: 1 },
  pendingActions: { flexDirection: 'row', gap: 7 },
  careRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, paddingVertical: 4 },
  careName: { fontSize: 13, fontWeight: '600', color: INK },
  careReason: { fontSize: 11, color: INK2, lineHeight: 16 },
  careTime: { fontSize: 10, color: INK4, marginTop: 1 },
});
