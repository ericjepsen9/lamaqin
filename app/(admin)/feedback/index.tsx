import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge, EmptyState, FilterChips, SCREEN_BG, type BadgeTone } from '@/components/ui/admin-kit';
import { Text } from '@/components/ui/text';
import { notify } from '@/lib/dialog';
import { useAdminFeedback, useSetFeedbackStatus, type AdminFeedbackRow } from '@/lib/queries/admin/feedback';
import { INK, INK2, INK3, INK4, SAFFRON, SAFFRON_DARK } from '@/lib/theme';
import { useAdminLayout } from '../_layout';

// 反馈清单(审计 P0「纠错走库」管理侧·决策117·2026-07-02)。
// 数据:feedback 表(学员 help 页/法本纠错入口写入);RLS=admin 全读 + admin 改 status。
// 最简清单:类型/状态筛选 + 卡片 + 状态流转(打开→处理中→已解决/关闭);纠错(text_correction)是教务修法本的输入源。
const TYPE_META: Record<AdminFeedbackRow['type'], { label: string; tone: BadgeTone }> = {
  text_correction: { label: '内容纠错', tone: 'saffron' },
  bug: { label: '问题', tone: 'violet' },
  suggestion: { label: '建议', tone: 'sage' },
  other: { label: '其他', tone: 'neutral' },
};
const STATUS_META: Record<AdminFeedbackRow['status'], { label: string; tone: BadgeTone }> = {
  open: { label: '待处理', tone: 'saffron' },
  reviewing: { label: '处理中', tone: 'gold' },
  resolved: { label: '已解决', tone: 'sage' },
  closed: { label: '已关闭', tone: 'neutral' },
};
const NEXT_STATUS: Record<AdminFeedbackRow['status'], { to: AdminFeedbackRow['status']; label: string }[]> = {
  open: [{ to: 'reviewing', label: '标记处理中' }, { to: 'resolved', label: '标记已解决' }],
  reviewing: [{ to: 'resolved', label: '标记已解决' }, { to: 'closed', label: '关闭' }],
  resolved: [{ to: 'closed', label: '关闭' }],
  closed: [{ to: 'open', label: '重新打开' }],
};

type Filter = 'all' | 'open' | AdminFeedbackRow['type'];
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'open', label: '待处理' },
  { key: 'text_correction', label: '内容纠错' },
  { key: 'bug', label: '问题' },
  { key: 'suggestion', label: '建议' },
  { key: 'other', label: '其他' },
];

const fmtTime = (iso: string | null) => (iso ? iso.replace('T', ' ').slice(0, 16) : '—');

export default function FeedbackAdmin() {
  const { setTitle } = useAdminLayout();
  const [filter, setFilter] = useState<Filter>('all');
  const { data: rows = [], isLoading, error } = useAdminFeedback();
  const setStatus = useSetFeedbackStatus();

  useEffect(() => { setTitle('反馈清单'); }, [setTitle]);

  const filtered = useMemo(() => {
    if (filter === 'all') return rows;
    if (filter === 'open') return rows.filter((r) => r.status === 'open' || r.status === 'reviewing');
    return rows.filter((r) => r.type === filter);
  }, [rows, filter]);

  const openCount = rows.filter((r) => r.status === 'open').length;
  const correctionCount = rows.filter((r) => r.type === 'text_correction' && r.status !== 'resolved' && r.status !== 'closed').length;

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.statsRow}>
          {([['待处理', String(openCount), SAFFRON_DARK], ['待改纠错', String(correctionCount), INK], ['累计', String(rows.length), INK2]] as [string, string, string][]).map(([label, val, color]) => (
            <View key={label} style={styles.statCard}>
              <Text className="font-serif" style={[styles.statNum, { color }]}>{val}</Text>
              <Text style={styles.statLabel}>{label}</Text>
            </View>
          ))}
        </View>

        <FilterChips items={FILTERS} value={filter} onChange={setFilter} />

        {isLoading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}><ActivityIndicator color={SAFFRON} /></View>
        ) : error ? (
          <EmptyState>加载失败,请检查网络或权限后重试</EmptyState>
        ) : filtered.length === 0 ? (
          <EmptyState>暂无反馈</EmptyState>
        ) : (
          <View style={styles.listBlock}>
            {filtered.map((r, i) => (
              <View key={r.id} style={[styles.card, i === filtered.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={styles.cardTop}>
                  <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                    <Badge tone={TYPE_META[r.type].tone}>{TYPE_META[r.type].label}</Badge>
                    <Badge tone={STATUS_META[r.status].tone}>{STATUS_META[r.status].label}</Badge>
                  </View>
                  <Text style={styles.time}>{fmtTime(r.createdAt)}</Text>
                </View>
                <Text style={styles.content}>{r.content}</Text>
                <View style={styles.cardBottom}>
                  <Text style={styles.user}>{r.dharmaName || r.userName || '师兄'}</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {NEXT_STATUS[r.status].map((n) => (
                      <Pressable
                        key={n.to}
                        style={styles.actBtn}
                        disabled={setStatus.isPending}
                        onPress={() => setStatus.mutate({ id: r.id, status: n.to }, { onError: (e) => notify('操作失败', e instanceof Error ? e.message : '请重试') })}
                      >
                        <Text style={styles.actText}>{n.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
        <Text style={styles.footnote}>内容纠错由教务核对后在源头(讲记 ETL / 题库)修正;此处只做认领与销账。</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SCREEN_BG },
  scroll: { padding: 20, gap: 12, paddingBottom: 40 },
  statsRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 14, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)' },
  statNum: { fontSize: 22, fontWeight: '700' },
  statLabel: { fontSize: 10, color: INK3 },
  listBlock: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)' },
  card: { padding: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: 'rgba(43,34,24,0.06)', gap: 8 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  time: { fontSize: 11, color: INK4 },
  content: { fontSize: 13, color: INK, lineHeight: 20 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  user: { fontSize: 11, color: INK3 },
  actBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(197,95,61,0.4)' },
  actText: { fontSize: 11, fontWeight: '700', color: SAFFRON_DARK },
  footnote: { fontSize: 11, color: INK3, lineHeight: 17 },
});
