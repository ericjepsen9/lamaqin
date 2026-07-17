import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  FilterChips,
  SCREEN_BG,
  SearchBar,
  StatCard,
  type BadgeTone,
  ErrorState,
} from '@/components/ui/admin-kit';
import { Text } from '@/components/ui/text';
import { useCareRoster, type CareDims, type CareStudent, type FollowStatus, type LagLevel } from '@/lib/queries/care';
import { GOLD_DARK as GOLD, GOLD_PALE, INK, INK3, INK4, SAFFRON, SAFFRON_DARK, SAFFRON_LIGHT, SAGE_DARK, SAGE_PALE } from '@/lib/theme';
import { useAdminLayout } from '../_layout';

const WIDE = 900;

const LAG_COLOR: Record<LagLevel, string> = { low: SAGE_DARK, medium: GOLD, high: SAFFRON_DARK, na: INK4 };
const LAG_BG: Record<LagLevel, string> = { low: SAGE_PALE, medium: GOLD_PALE, high: SAFFRON_LIGHT, na: 'rgba(43,34,24,0.05)' };

const DIMS: { key: keyof CareDims; label: string }[] = [
  { key: 'attendance', label: '出勤' },
  { key: 'task', label: '功课' },
  { key: 'content', label: '听课' },
  { key: 'quiz', label: '答题' },
  { key: 'meditation', label: '观修' },
];

const STATUS_TONE: Record<FollowStatus, BadgeTone> = { active: 'sage', resolved: 'neutral', pending: 'gold' };
const STATUS_LABEL: Record<FollowStatus, string> = { active: '跟进中', resolved: '已结案', pending: '待跟进' };

function LagDot({ level }: { level: LagLevel }) {
  return <View style={[styles.lagDot, { backgroundColor: LAG_COLOR[level] }]} />;
}

function LagBar({ dims }: { dims: CareDims }) {
  return (
    <View style={styles.lagBar}>
      {DIMS.map((d) => {
        const lvl = dims[d.key];
        return (
          <View key={d.key} style={[styles.lagSegment, { backgroundColor: LAG_BG[lvl] }]}>
            <LagDot level={lvl} />
            <Text style={[styles.lagSegText, { color: LAG_COLOR[lvl] }]}>{lvl === 'na' ? `${d.label}—` : d.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

function StudentCard({ s, onPress }: { s: CareStudent; onPress: () => void }) {
  return (
    <Card onPress={onPress} style={[styles.card, s.flagged && styles.cardFlagged]}>
      <View style={styles.cardTop}>
        <Avatar name={s.name} size={40} />
        <View style={{ flex: 1 }}>
          <View style={styles.cardNameRow}>
            <Text style={styles.cardName}>{s.name}</Text>
            {s.flagged && <Text style={styles.flagIcon}>🚩</Text>}
          </View>
          <Text style={styles.cardCohort}>{s.cohortName}</Text>
        </View>
        {s.followStatus && <Badge tone={STATUS_TONE[s.followStatus]}>{STATUS_LABEL[s.followStatus]}</Badge>}
        <Text style={styles.arrow}>›</Text>
      </View>
      <LagBar dims={s.dims} />
      {s.lastFollowup && <Text style={styles.lastFollowup}>最近跟进:{s.lastFollowup}</Text>}
    </Card>
  );
}

type FilterType = 'all' | 'flagged' | 'high';

export default function CareList() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE;
  const { setTitle } = useAdminLayout();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const { data: students = [], isLoading, error } = useCareRoster();

  useEffect(() => { setTitle('关怀清单'); }, [setTitle]);

  const isHigh = (s: CareStudent) => Object.values(s.dims).some((l) => l === 'high');
  const filtered = students.filter((s) => {
    if (filter === 'flagged' && !s.flagged) return false;
    if (filter === 'high' && !isHigh(s)) return false;
    if (search) return s.name.includes(search) || s.cohortName.includes(search);
    return true;
  });
  const flaggedCount = students.filter((s) => s.flagged).length;
  const highCount = students.filter(isHigh).length;
  const activeFollow = students.filter((s) => s.followStatus === 'active').length;
  const resolvedFollow = students.filter((s) => s.followStatus === 'resolved').length;

  const FILTERS: { key: FilterType; label: string }[] = [
    { key: 'all', label: `全部 ${students.length}` },
    { key: 'flagged', label: `需关怀 ${flaggedCount}` },
    { key: 'high', label: `高滞后 ${highCount}` },
  ];

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        <View style={styles.statsRow}>
          <StatCard variant="tint" label="在读名单" value={students.length} accent={INK3} />
          <StatCard variant="tint" label="需关怀" value={flaggedCount} accent={SAFFRON_DARK} />
          <StatCard variant="tint" label="跟进中" value={activeFollow} accent={GOLD} />
          <StatCard variant="tint" label="已结案" value={resolvedFollow} accent={SAGE_DARK} />
        </View>

        <View style={styles.noticeBanner}>
          <Text style={styles.noticeText}>关怀记录仅辅导员/爱心/管理员可见,师兄不可见。出勤/功课/观修为实时计算;听课/答题(标—)待接入。</Text>
        </View>

        <FilterChips items={FILTERS} value={filter} onChange={setFilter} />
        <SearchBar value={search} onChangeText={setSearch} placeholder="搜索姓名或班级…" style={styles.searchBar} />

        {error ? <ErrorState /> : isLoading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}><ActivityIndicator color={SAFFRON} /></View>
        ) : (
          <>
            <View style={isWide ? styles.gridWide : styles.gridNarrow}>
              {filtered.map((s) => (
                <StudentCard key={`${s.userId}|${s.cohortId}`} s={s} onPress={() => router.push(`/(admin)/care/${s.userId}` as never)} />
              ))}
            </View>
            {filtered.length === 0 && <EmptyState>没有符合条件的学员</EmptyState>}
          </>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SCREEN_BG },
  scroll: { padding: 20, gap: 12, paddingBottom: 40 },
  statsRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  noticeBanner: { backgroundColor: GOLD_PALE, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: GOLD + '33' },
  noticeText: { fontSize: 12, color: GOLD, lineHeight: 18 },
  searchBar: { padding: 0 },
  gridWide: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  gridNarrow: { gap: 12 },
  card: { padding: 16, gap: 12 },
  cardFlagged: { borderColor: SAFFRON + '44', borderWidth: 1.5 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardName: { fontSize: 15, fontWeight: '600', color: INK },
  flagIcon: { fontSize: 12 },
  cardCohort: { fontSize: 11, color: INK3, marginTop: 2 },
  arrow: { fontSize: 20, color: INK4 },
  lagBar: { flexDirection: 'row', gap: 6 },
  lagSegment: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 6, paddingVertical: 5, paddingHorizontal: 6 },
  lagDot: { width: 6, height: 6, borderRadius: 3 },
  lagSegText: { fontSize: 9, fontWeight: '600' },
  lastFollowup: { fontSize: 11, color: INK4 },
});
