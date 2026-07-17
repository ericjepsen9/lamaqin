import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AdminButton, Badge, EmptyState, FilterChips, SCREEN_BG, SearchBar, Table, TableRow, type BadgeTone, type TableColumn, ErrorState } from '@/components/ui/admin-kit';
import { Text } from '@/components/ui/text';
import { useAuditLogs, type AuditEntry } from '@/lib/queries/audit';
import { GOLD_DARK as GOLD, GOLD_PALE, INK, INK2, INK3, INK4, SAFFRON } from '@/lib/theme';
import { useAdminLayout } from '../_layout';

const WIDE = 900;
const VIOLET = '#7b6ea0';

// 已知 action → 标签/色调;未知 action 回退显示原始字符串 + neutral。
const ACTION_META: Record<string, { label: string; tone: BadgeTone }> = {
  confirm_attendance: { label: '确认出勤', tone: 'sage' },
  unconfirm_attendance: { label: '取消出勤确认', tone: 'saffron' },
  confirm_practice: { label: '确认修持', tone: 'sage' },
  unconfirm_practice: { label: '取消修持确认', tone: 'saffron' },
  switch_primary_cohort: { label: '切换主班', tone: 'gold' },
  promote_member_role: { label: '转正成员', tone: 'sage' },
  graduation: { label: '标记毕业', tone: 'sage' },
  graduated: { label: '标记毕业', tone: 'sage' },
  held_back: { label: '标记留级', tone: 'saffron' },
  member_left: { label: '标记离班', tone: 'neutral' },
  tantric_grant: { label: '授予密法权限', tone: 'violet' },
  tantric_revoke: { label: '撤销密法权限', tone: 'saffron' },
  vow_due_date_changed: { label: '修改宽限日期', tone: 'gold' },
  due_date_change: { label: '修改宽限日期', tone: 'gold' },
  rest_week_change: { label: '调整休息周', tone: 'gold' },
};
const labelOf = (a: string) => ACTION_META[a]?.label ?? a;
const toneOf = (a: string): BadgeTone => ACTION_META[a]?.tone ?? 'neutral';

type FilterAction = 'all' | 'attendance' | 'practice' | 'members' | 'tantric' | 'admin';
const FILTER_GROUPS: Record<FilterAction, string[] | null> = {
  all: null,
  attendance: ['confirm_attendance', 'unconfirm_attendance'],
  practice: ['confirm_practice', 'unconfirm_practice'],
  members: ['switch_primary_cohort', 'promote_member_role', 'graduation', 'graduated', 'held_back', 'member_left'],
  tantric: ['tantric_grant', 'tantric_revoke'],
  admin: ['due_date_change', 'vow_due_date_changed', 'rest_week_change'],
};
const FILTERS: { key: FilterAction; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'attendance', label: '出勤审核' },
  { key: 'practice', label: '修持审核' },
  { key: 'members', label: '成员状态' },
  { key: 'tantric', label: '密法权限' },
  { key: 'admin', label: '管理操作' },
];

const TABLE_COLUMNS: TableColumn[] = [
  { label: '操作类型', flex: 1.5 }, { label: '操作人', flex: 1 }, { label: '对象', flex: 2 }, { label: '详情', flex: 1.5 }, { label: '时间', flex: 1 },
];

const fmtTime = (iso: string) => (iso ? iso.replace('T', ' ').slice(0, 16) : '—');
const metaStr = (m: Record<string, unknown> | null) =>
  m ? Object.entries(m).filter(([k]) => k !== 'seed').map(([k, v]) => `${k}:${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(' · ') : '';
const targetOf = (e: AuditEntry) => [e.targetType, e.targetId ? e.targetId.slice(0, 8) : null].filter(Boolean).join(' · ') || '—';

export default function AuditPage() {
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE;
  const { setTitle } = useAdminLayout();
  const [filter, setFilter] = useState<FilterAction>('all');
  const [q, setQ] = useState('');
  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useAuditLogs(100);
  const logs = useMemo(() => (data?.pages ?? []).flatMap((p) => p.rows), [data]);

  useEffect(() => { setTitle('系统审计'); }, [setTitle]);

  const filtered = useMemo(() => {
    const g = FILTER_GROUPS[filter];
    let rows = g ? logs.filter((l) => g.includes(l.action)) : logs;
    // 搜索(2026-07-11 一致性调研发现的缺口:此前只有大类 chip、无法按人名/对象搜):
    // 仅对"已加载进来的"这些页做检索,想搜更早的记录需先「加载更多」。
    const query = q.trim().toLowerCase();
    if (query) {
      rows = rows.filter((l) =>
        (l.actorName ?? '').toLowerCase().includes(query)
        || labelOf(l.action).toLowerCase().includes(query)
        || (l.targetId ?? '').toLowerCase().includes(query)
        || metaStr(l.metadata).toLowerCase().includes(query),
      );
    }
    return rows;
  }, [logs, filter, q]);

  const today = new Date().toISOString().slice(0, 10);
  const todayCount = logs.filter((l) => l.createdAt.startsWith(today)).length;
  const tantricCount = logs.filter((l) => l.action === 'tantric_grant' || l.action === 'tantric_revoke').length;

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        <View style={styles.noticeBanner}>
          <Text style={styles.noticeText}>系统审计日志仅 admin 可见。随敏感操作(审核、密法权限、成员状态、宽限日期等)自动累积,不可篡改。</Text>
        </View>

        <View style={styles.statsRow}>
          {([['今日', todayCount.toString(), INK], ['累计', logs.length.toString(), INK2], ['密法操作', tantricCount.toString(), VIOLET]] as [string, string, string][]).map(([label, val, color]) => (
            <View key={label} style={styles.statCard}>
              <Text className="font-serif" style={[styles.statNum, { color }]}>{val}</Text>
              <Text style={styles.statLabel}>{label}</Text>
            </View>
          ))}
        </View>

        <FilterChips items={FILTERS} value={filter} onChange={setFilter} />
        <SearchBar value={q} onChangeText={setQ} placeholder="搜索操作人 / 对象 / 详情…" />

        {error ? <ErrorState /> : isLoading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}><ActivityIndicator color={SAFFRON} /></View>
        ) : isWide ? (
          filtered.length === 0 ? <EmptyState>暂无操作记录</EmptyState> : (
            <Table columns={TABLE_COLUMNS}>
              {filtered.map((log, i) => (
                <TableRow key={log.id} last={i === filtered.length - 1}>
                  <View style={{ flex: 1.5 }}><Badge tone={toneOf(log.action)}>{labelOf(log.action)}</Badge></View>
                  <Text style={[styles.cellText, { flex: 1 }]}>{log.actorName ?? '—'}</Text>
                  <Text style={[styles.cellText, { flex: 2 }]}>{targetOf(log)}</Text>
                  <Text style={[styles.cellMeta, { flex: 1.5 }]} numberOfLines={2}>{metaStr(log.metadata)}</Text>
                  <Text style={[styles.cellTime, { flex: 1 }]}>{fmtTime(log.createdAt)}</Text>
                </TableRow>
              ))}
            </Table>
          )
        ) : (
          <View style={styles.logBlock}>
            {filtered.map((log, i) => (
              <View key={log.id} style={[styles.logCard, i === filtered.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={styles.logCardTop}>
                  <Badge tone={toneOf(log.action)}>{labelOf(log.action)}</Badge>
                  <Text style={styles.logTime}>{fmtTime(log.createdAt)}</Text>
                </View>
                <Text style={styles.logTarget}>{targetOf(log)}</Text>
                <View style={styles.logBottom}>
                  <Text style={styles.logUser}>{log.actorName ?? '—'}</Text>
                  {metaStr(log.metadata) ? <Text style={styles.logMeta}>{metaStr(log.metadata)}</Text> : null}
                </View>
              </View>
            ))}
            {filtered.length === 0 && <EmptyState>暂无操作记录</EmptyState>}
          </View>
        )}

        {/* 加载更多(2026-07-11 一致性调研发现的缺口:此前硬顶200条、查不到更早记录) */}
        {!isLoading && !error && hasNextPage ? (
          <AdminButton variant="secondary" size="sm" disabled={isFetchingNextPage} onPress={() => fetchNextPage()} style={{ alignSelf: 'center', marginTop: 4 }}>
            {isFetchingNextPage ? '加载中…' : '加载更多历史记录'}
          </AdminButton>
        ) : null}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SCREEN_BG },
  scroll: { padding: 20, gap: 12, paddingBottom: 40 },
  noticeBanner: { backgroundColor: GOLD_PALE, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: GOLD + '33' },
  noticeText: { fontSize: 12, color: GOLD, lineHeight: 18 },
  statsRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 14, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)' },
  statNum: { fontSize: 22, fontWeight: '700' },
  statLabel: { fontSize: 10, color: INK3 },
  cellText: { fontSize: 12, color: INK2 },
  cellMeta: { fontSize: 11, color: INK3 },
  cellTime: { fontSize: 11, color: INK4 },
  logBlock: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)' },
  logCard: { padding: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: 'rgba(43,34,24,0.06)', gap: 6 },
  logCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  logTime: { fontSize: 11, color: INK4 },
  logTarget: { fontSize: 13, color: INK, fontWeight: '500' },
  logBottom: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logUser: { fontSize: 11, color: INK3 },
  logMeta: { fontSize: 11, color: INK4 },
});
