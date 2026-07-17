import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Avatar,
  DetailHeader,
  EmptyState,
  SCREEN_BG,
  SectionCard,
} from '@/components/ui/admin-kit';
import { StudentCareDims, StudentCareFollowups } from '@/components/admin/student-care-panel';
import { Text } from '@/components/ui/text';
import { useStudentCare } from '@/lib/queries/care';
import { useCurrentUser } from '@/lib/queries/profile';
import { INK, INK3, SAFFRON } from '@/lib/theme';
import { useAdminLayout } from '../_layout';

export default function StudentCareDetail() {
  const { studentId } = useLocalSearchParams<{ studentId: string }>();
  const router = useRouter();
  const { setTitle } = useAdminLayout();
  const { data: me } = useCurrentUser();
  const { data: s, isLoading, isError } = useStudentCare(studentId);

  useEffect(() => { setTitle((s?.name ?? '学员') + ' · 关怀'); }, [setTitle, s?.name]);

  if (isLoading) return <View style={styles.center}><ActivityIndicator color={SAFFRON} /></View>;
  // 区分"查询本身失败"与"这个学员真不存在"——此前混为一谈,查询报错(如网络抖动)会被
  // 误判成"找不到该学员",且会拖累下方本该独立可用的"添加跟进记录"表单(审计2026-07-10)。
  if (isError) {
    return (
      <SafeAreaView style={styles.root} edges={['bottom']}>
        <DetailHeader title="关怀" onBack={() => router.back()} backLabel="关怀清单" />
        <View style={{ padding: 24 }}><EmptyState>加载失败,请检查网络后重试(不代表该学员不存在)</EmptyState></View>
      </SafeAreaView>
    );
  }
  if (!s) {
    return (
      <SafeAreaView style={styles.root} edges={['bottom']}>
        <DetailHeader title="关怀" onBack={() => router.back()} backLabel="关怀清单" />
        <View style={{ padding: 24 }}><EmptyState>找不到该学员</EmptyState></View>
      </SafeAreaView>
    );
  }

  // 记跟进权限对齐 RLS:care_followups 写 = 本班 zhumai/aixin(决策035/044-046;admin 只读不录)。
  const canWrite = me?.role === 'zhumai' || me?.role === 'aixin';

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <DetailHeader title={s.name} onBack={() => router.back()} backLabel="关怀清单" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        <SectionCard>
          <View style={styles.profileHeader}>
            <Avatar name={s.name} size={52} />
            <View style={{ flex: 1 }}>
              <View style={styles.nameRow}>
                <Text className="font-serif" style={styles.studentName}>{s.name}</Text>
                {s.flagged && <Text style={styles.flagIcon}>🚩</Text>}
              </View>
              <Text style={styles.cohortText}>{s.cohortName}</Text>
            </View>
          </View>
        </SectionCard>

        <SectionCard title="学修滞后指标">
          <StudentCareDims userId={studentId} />
        </SectionCard>

        <SectionCard>
          <StudentCareFollowups userId={studentId} canWrite={canWrite} />
        </SectionCard>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SCREEN_BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: SCREEN_BG },
  scroll: { padding: 20, gap: 14, paddingBottom: 40 },
  profileHeader: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  studentName: { fontSize: 20, fontWeight: '700', color: INK },
  flagIcon: { fontSize: 14 },
  cohortText: { fontSize: 12, color: INK3, marginTop: 2 },
});
