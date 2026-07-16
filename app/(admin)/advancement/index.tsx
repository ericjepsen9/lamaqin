import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Avatar,
  Badge,
  EmptyState,
  FilterChips,
  SCREEN_BG,
  SearchBar,
  Table,
  TableRow,
  type BadgeTone,
  type TableColumn,
  ErrorState,
} from '@/components/ui/admin-kit';
import { Text } from '@/components/ui/text';
import { useAdvancementRoster, type AdvStudent, type MemberStatus } from '@/lib/queries/advancement';
import { GOLD_DARK as GOLD, GOLD_PALE, INK, INK3, INK4, SAFFRON, SAFFRON_DARK, SAGE_DARK } from '@/lib/theme';
import { useAdminLayout } from '../_layout';

const WIDE = 900;

const STATUS_LABEL: Record<MemberStatus, string> = {
  active: '学修中', paused: '已暂停', held_back: '留级', graduated: '已毕业', left: '已离班',
};
// 状态→徽章色调(active 在读→sage / paused 偏滞→gold / held_back 落后→saffron / graduated 已结→neutral / left 已离→neutral)
const STATUS_TONE: Record<MemberStatus, BadgeTone> = {
  active: 'sage', paused: 'gold', held_back: 'saffron', graduated: 'neutral', left: 'neutral',
};

// 达标=报数≥目标(大纲给的是绝对数,不是"接近达标"这种比例概念,2026-07-12 去掉中间档)
function practiceColor(count: number, target: number) {
  return count >= target ? SAGE_DARK : SAFFRON_DARK;
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(value / max, 1);
  return (
    <View style={styles.miniTrack}>
      <View style={[styles.miniFill, { width: `${pct * 100}%` as any, backgroundColor: color }]} />
    </View>
  );
}

// 宽屏表列定义(kit Table 用)
const TABLE_COLUMNS: TableColumn[] = [
  { label: '学员 / 班级', flex: 2 },
  { label: '状态', flex: 1.2 },
  { label: '出勤率', flex: 1 },
  { label: '报数 / 目标', flex: 1 },
  { label: '考试', flex: 1 },
];

function StudentRow({ s, onPress, isWide, last }: { s: AdvStudent; onPress: () => void; isWide: boolean; last?: boolean }) {
  const pracColor = practiceColor(s.practiceCount, s.practiceTarget);
  const dimOpacity = s.status === 'left' || s.status === 'graduated' ? 0.5 : 1;

  if (isWide) {
    return (
      <TableRow onPress={onPress} last={last}>
        <View style={[styles.colName, { opacity: dimOpacity }]}>
          <Text style={styles.studentName}>{s.name}</Text>
          <Text style={styles.cohortText}>{s.cohortName} · 第{s.semester}学期</Text>
        </View>
        <View style={[styles.colStatus, { opacity: dimOpacity }]}>
          <Badge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Badge>
          {s.heldBackCount > 0 && (
            <Text style={styles.heldBackNote}>留级{s.heldBackCount}次</Text>
          )}
        </View>
        <View style={[styles.colStat, { opacity: dimOpacity }]}>
          <Text style={[styles.statVal, { color: INK }]}>{s.attendanceRate}%</Text>
          <MiniBar value={s.attendanceRate} max={100} color={INK3} />
        </View>
        <View style={[styles.colStat, { opacity: dimOpacity }]}>
          <Text style={[styles.statVal, { color: pracColor }]}>{s.practiceCount.toLocaleString()}</Text>
          <Text style={styles.statSub}>/ {s.practiceTarget.toLocaleString()}</Text>
        </View>
        <View style={[styles.colStat, { opacity: dimOpacity }]}>
          {s.examExempt
            ? <Text style={[styles.statVal, { color: SAGE_DARK }]}>已豁免</Text>
            : s.examScore !== null
              ? <Text style={[styles.statVal, { color: s.examIsPass ? SAGE_DARK : SAFFRON_DARK }]}>{s.examScore}分</Text>
              : <Text style={[styles.statVal, { color: INK4 }]}>待录入</Text>
          }
        </View>
        <Text style={[styles.tableArrow, { opacity: dimOpacity }]}>›</Text>
      </TableRow>
    );
  }

  return (
    <Pressable style={[styles.card, { opacity: dimOpacity }]} onPress={onPress}>
      <View style={styles.cardTop}>
        <Avatar name={s.name} size={38} />
        <View style={{ flex: 1 }}>
          <Text style={styles.studentName}>{s.name}</Text>
          <Text style={styles.cohortText}>{s.cohortName} · 第{s.semester}学期</Text>
        </View>
        <Badge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Badge>
        <Text style={styles.tableArrow}>›</Text>
      </View>
      <View style={styles.cardStats}>
        <View style={styles.cardStatItem}>
          <Text style={[styles.cardStatVal, { color: INK }]}>{s.attendanceRate}%</Text>
          <Text style={styles.cardStatLabel}>出勤</Text>
        </View>
        <View style={styles.cardStatDivider} />
        <View style={styles.cardStatItem}>
          <Text style={[styles.cardStatVal, { color: pracColor }]}>{s.practiceCount.toLocaleString()}</Text>
          <Text style={styles.cardStatLabel}>报数 / {s.practiceTarget.toLocaleString()}</Text>
        </View>
        <View style={styles.cardStatDivider} />
        <View style={styles.cardStatItem}>
          <Text style={[styles.cardStatVal, { color: s.examExempt ? SAGE_DARK : s.examScore !== null ? (s.examIsPass ? SAGE_DARK : SAFFRON_DARK) : INK4 }]}>
            {s.examExempt ? '已豁免' : s.examScore !== null ? `${s.examScore}分` : '待录'}
          </Text>
          <Text style={styles.cardStatLabel}>考试</Text>
        </View>
      </View>
    </Pressable>
  );
}

type FilterStatus = 'all' | MemberStatus;

export default function AdvancementList() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE;
  const { setTitle } = useAdminLayout();
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [search, setSearch] = useState('');
  const { data: students = [], isLoading, error } = useAdvancementRoster();

  useEffect(() => { setTitle('报数升学'); }, [setTitle]);

  const filtered = students.filter(s => {
    if (filter !== 'all' && s.status !== filter) return false;
    if (search) return s.name.includes(search) || s.cohortName.includes(search);
    return true;
  });

  const counts: Record<FilterStatus, number> = {
    all: students.length,
    active: students.filter(s => s.status === 'active').length,
    paused: students.filter(s => s.status === 'paused').length,
    held_back: students.filter(s => s.status === 'held_back').length,
    graduated: students.filter(s => s.status === 'graduated').length,
    left: students.filter(s => s.status === 'left').length,
  };

  const FILTERS: { key: FilterStatus; label: string }[] = [
    { key: 'all', label: `全部 ${counts.all}` },
    { key: 'active', label: `学修中 ${counts.active}` },
    { key: 'paused', label: `暂停 ${counts.paused}` },
    { key: 'held_back', label: `留级 ${counts.held_back}` },
    { key: 'graduated', label: `毕业 ${counts.graduated}` },
  ];

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* 统计卡 */}
        <View style={styles.statsRow}>
          {([['active', '学修中', SAGE_DARK], ['paused', '暂停', GOLD], ['held_back', '留级', SAFFRON_DARK], ['graduated', '毕业', INK3]] as const).map(([key, label, color]) => (
            <View key={key} style={styles.statCard}>
              <Text className="font-serif" style={[styles.statNum, { color }]}>{counts[key]}</Text>
              <Text style={styles.statLabel}>{label}</Text>
            </View>
          ))}
        </View>

        {/* 说明 */}
        <View style={styles.noticeBanner}>
          <Text style={styles.noticeText}>升学/留级/毕业由教学部人工评定，admin 在学员详情页确认。报数（修量）为升学硬依据。</Text>
        </View>

        {/* 筛选 */}
        <FilterChips items={FILTERS} value={filter} onChange={setFilter} />

        {/* 搜索 */}
        <SearchBar value={search} onChangeText={setSearch} placeholder="搜索姓名或班级…" style={styles.searchBar} />

        {/* 列表 */}
        {error ? <ErrorState /> : isLoading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}><ActivityIndicator color={SAFFRON} /></View>
        ) : isWide ? (
          filtered.length === 0 ? (
            <EmptyState>没有符合条件的学员</EmptyState>
          ) : (
            <Table columns={TABLE_COLUMNS}>
              {filtered.map((s, i) => (
                <StudentRow
                  key={`${s.userId}|${s.cohortId}`}
                  s={s}
                  isWide
                  last={i === filtered.length - 1}
                  onPress={() => router.push(`/(admin)/advancement/${s.userId}` as never)}
                />
              ))}
            </Table>
          )
        ) : (
          <View style={styles.listBlock}>
            {filtered.map(s => (
              <StudentRow
                key={`${s.userId}|${s.cohortId}`}
                s={s}
                isWide={false}
                onPress={() => router.push(`/(admin)/advancement/${s.userId}` as never)}
              />
            ))}
            {filtered.length === 0 && (
              <EmptyState>没有符合条件的学员</EmptyState>
            )}
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SCREEN_BG },
  scroll: { padding: 20, gap: 12, paddingBottom: 40 },

  statsRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 12, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)' },
  statNum: { fontSize: 22, fontWeight: '700' },
  statLabel: { fontSize: 10, color: INK3 },

  noticeBanner: { backgroundColor: GOLD_PALE, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: GOLD + '33' },
  noticeText: { fontSize: 12, color: GOLD, lineHeight: 18 },

  // SearchBar 在本页处于 gap 列内,清掉 kit 默认外边距
  searchBar: { padding: 0 },

  // 移动端列表外壳(整卡裹住卡片行)
  listBlock: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)', overflow: 'hidden' },

  // 宽屏表格单元格 flex
  colName: { flex: 2 },
  colStatus: { flex: 1.2, gap: 4 },
  colStat: { flex: 1 },

  studentName: { fontSize: 14, fontWeight: '600', color: INK },
  cohortText: { fontSize: 11, color: INK3, marginTop: 2 },
  heldBackNote: { fontSize: 10, color: SAFFRON_DARK },
  statVal: { fontSize: 13, fontWeight: '700' },
  statSub: { fontSize: 10, color: INK4 },
  miniTrack: { height: 4, backgroundColor: 'rgba(43,34,24,0.08)', borderRadius: 2, marginTop: 4, overflow: 'hidden' },
  miniFill: { height: '100%', borderRadius: 2 },
  tableArrow: { fontSize: 20, color: INK4, width: 24, textAlign: 'right' },

  card: { padding: 16, borderBottomWidth: 1, borderColor: 'rgba(43,34,24,0.06)', gap: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardStats: { flexDirection: 'row', alignItems: 'center' },
  cardStatItem: { flex: 1, alignItems: 'center', gap: 2 },
  cardStatVal: { fontSize: 14, fontWeight: '700' },
  cardStatLabel: { fontSize: 10, color: INK3 },
  cardStatDivider: { width: 1, height: 24, backgroundColor: 'rgba(43,34,24,0.08)' },
});
