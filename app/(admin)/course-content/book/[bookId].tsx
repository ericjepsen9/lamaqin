import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AdminButton, Badge, DetailHeader, EmptyState, SCREEN_BG } from '@/components/ui/admin-kit';
import { Text } from '@/components/ui/text';
import { useSelfStudyBookDetail } from '@/lib/queries/self_study';
import { GOLD_DARK as GOLD, GOLD_PALE, INK, INK2, INK3, SAFFRON, SAFFRON_DARK, SAGE_DARK } from '@/lib/theme';
import { useAdminLayout } from '../../_layout';
import { bookTitle } from '@/lib/utils';

export default function BookDetail() {
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const router = useRouter();
  const { setTitle } = useAdminLayout();

  const { data: book, isLoading, isError } = useSelfStudyBookDetail(bookId);

  const title = book?.title ?? '读物';
  useEffect(() => { setTitle(title); }, [setTitle, title]);

  const articles = book?.articles ?? [];
  const readyCount = articles.filter(a => a.blockCount > 0).length;
  const missingCount = articles.length - readyCount;

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <DetailHeader title={title} onBack={() => router.back()} backLabel="自学读物" />

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={SAFFRON} /></View>
      ) : isError ? (
        <View style={styles.center}><Text style={{ color: INK3 }}>加载失败,请检查网络后重试(不代表读物不存在)</Text></View>
      ) : !book ? (
        <View style={styles.center}><Text style={{ color: INK3 }}>读物不存在</Text></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* 书籍信息卡 */}
          <View style={styles.infoCard}>
            <View style={styles.bookHeader}>
              <View style={styles.bookNumCircle}>
                <Text className="font-serif" style={styles.bookNumText}>{book.bookNumber ?? '—'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text className="font-serif" style={styles.bookTitle}>{bookTitle(book.title)}</Text>
                {book.author ? <Text style={styles.bookAuthor}>{book.author}</Text> : null}
              </View>
            </View>
            {book.description ? <Text style={styles.bookDesc}>{book.description}</Text> : null}
            <View style={styles.bookStats}>
              <View style={styles.statItem}>
                <Text className="font-serif" style={styles.statNum}>{articles.length}</Text>
                <Text style={styles.statLabel}>篇文章</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text className="font-serif" style={[styles.statNum, { color: SAGE_DARK }]}>{readyCount}</Text>
                <Text style={styles.statLabel}>有内容</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text className="font-serif" style={[styles.statNum, { color: missingCount > 0 ? SAFFRON_DARK : SAGE_DARK }]}>
                  {missingCount}
                </Text>
                <Text style={styles.statLabel}>待补充</Text>
              </View>
            </View>
            <Badge tone={book.isActive ? 'sage' : 'neutral'}>{book.isActive ? '● 已启用' : '○ 已停用'}</Badge>
          </View>

          {/* 文章列表 */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text className="font-serif" style={styles.sectionTitle}>文章列表</Text>
            </View>
            {articles.length === 0 ? (
              <EmptyState>暂无文章</EmptyState>
            ) : (
              articles.map((a, i) => (
                <View
                  key={a.id}
                  style={[styles.articleRow, i === articles.length - 1 && { borderBottomWidth: 0 }]}
                >
                  <View style={styles.articleNumBox}>
                    <Text className="font-serif" style={styles.articleNum}>{a.articleNumber}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.articleTitle}>{a.title}</Text>
                    {a.blockCount > 0 ? (
                      <Text style={styles.articleMeta}>{a.blockCount} 个内容块</Text>
                    ) : (
                      <Text style={[styles.articleMeta, { color: SAFFRON_DARK }]}>待补充内容</Text>
                    )}
                  </View>
                  {/* "查看"直接借用师兄端文章详情页(/speech/[id]),纯读文章正文,管理端和师兄端读的是
                      同一份 self_study_blocks,不需要另建一套只读页(2026-07-10 审计后修复死按钮)。 */}
                  <AdminButton variant="secondary" size="sm" onPress={() => router.push(`/speech/${a.id}` as never)}>查看</AdminButton>
                </View>
              ))
            )}
          </View>

        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SCREEN_BG },
  scroll: { padding: 20, gap: 14, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },

  infoCard: { backgroundColor: '#fff', borderRadius: 18, padding: 20, gap: 10, borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)', shadowColor: '#2b2218', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 2 },
  bookHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  bookNumCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: GOLD_PALE, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: GOLD + '44', flexShrink: 0 },
  bookNumText: { fontSize: 16, fontWeight: '700', color: GOLD },
  bookTitle: { fontSize: 20, fontWeight: '700', color: INK },
  bookAuthor: { fontSize: 12, color: INK3, marginTop: 2 },
  bookDesc: { fontSize: 13, color: INK2, lineHeight: 20 },
  bookStats: { flexDirection: 'row', alignItems: 'center' },
  statItem: { flex: 1, alignItems: 'center', gap: 3 },
  statNum: { fontSize: 22, fontWeight: '700', color: INK },
  statLabel: { fontSize: 10, color: INK3 },
  statDivider: { width: 1, height: 28, backgroundColor: 'rgba(43,34,24,0.08)' },

  section: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: INK },

  articleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderColor: 'rgba(43,34,24,0.06)' },
  articleNumBox: { width: 30, height: 30, borderRadius: 8, backgroundColor: GOLD_PALE, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: GOLD + '33' },
  articleNum: { fontSize: 12, fontWeight: '700', color: GOLD },
  articleTitle: { fontSize: 13, fontWeight: '600', color: INK },
  articleMeta: { fontSize: 11, color: INK3, marginTop: 2 },
});
