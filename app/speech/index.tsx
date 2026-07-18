import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScrollTitleBar, useScrollTitleBar } from '@/components/scroll-title-bar';
import { Text } from '@/components/ui/text';
import { useSpeechLibrary, type SpeechArticleRow, type SpeechLibraryBook } from '@/lib/queries/self_study';

// 大学演讲列表(D-15 改版·2026-07-02:与课程详情同构——书=章节、文章=行)。
// 两组(PM 拍板):「预科大纲内·第1-18册」(大纲:限制性课=大学演讲系列1-18,第2-7学期每学期3册)
//   在前;「更多演讲·第19-50册」在后。两组对自学师兄均为参考、不强制(场景15 v4.0)。
// 圆满口径=B(大纲要求层):看演讲+读文字稿;纯文字篇=读即圆满。免答题、不计考试(大纲【注】)。
// 学科分类 tab 撤(self_study_三表分析:App 不做按学科浏览;列表回归书册结构)。
const INK = '#2b2218';
const INK2 = '#55463a';
const INK3 = '#7e6d5b';
const SAFFRON = '#e07856';
const SAFFRON_DARK = '#b35535';
const SAGE = '#4d6e3d';
const SAGE_BG = '#eef3e9';

export default function SpeechList() {
  const router = useRouter();
  const bar = useScrollTitleBar();
  const insets = useSafeAreaInsets();
  const { data: lib, isLoading, error } = useSpeechLibrary();

  const cont = lib?.continueTarget ?? null;
  const hasStarted = (lib?.completedCount ?? 0) > 0 || (lib?.readingCount ?? 0) > 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF4E9' }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} onScroll={bar.onScroll} scrollEventThrottle={16}>
        {/* 金色生成封面 hero(演讲集无真实封面,用生成式书封) */}
        <View onLayout={bar.onHeaderLayout}>
          <LinearGradient colors={['#F0E3BC', '#F7EDD2', '#FBF4E9']} style={StyleSheet.absoluteFill} />
          <View style={styles.headTop}>
            <Pressable hitSlop={8} onPress={() => router.back()}><ChevronLeft size={24} color={INK} /></Pressable>
            <View style={{ flex: 1 }} />
          </View>

          {isLoading ? (
            <View style={{ paddingVertical: 80, alignItems: 'center' }}><ActivityIndicator color={SAFFRON_DARK} /></View>
          ) : error || !lib ? (
            <View style={{ paddingVertical: 80, alignItems: 'center', paddingHorizontal: 24 }}>
              <Text style={{ fontSize: 14, color: INK2, textAlign: 'center' }}>加载失败,请检查网络或权限。</Text>
            </View>
          ) : (
            <>
              <View style={styles.heroRow}>
                <View style={styles.cover}>
                  <LinearGradient colors={['#C9A45C', '#E2CB8F']} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
                  <Text className="font-serif" numberOfLines={3} style={styles.coverTitle}>大学演讲系列</Text>
                </View>
                <View style={{ flex: 1, paddingTop: 6 }}>
                  <Text className="font-serif" style={{ fontSize: 21, fontWeight: '700', color: INK, letterSpacing: 1 }}>《大学演讲系列》</Text>
                  <Text style={{ fontSize: 12, color: INK2, marginTop: 4 }}>索达吉堪布 · 世界高校演讲实录</Text>
                  <View style={styles.actionRow}>
                    {cont ? (
                      <Pressable style={styles.cta} onPress={() => router.push(`/speech/${cont.id}` as never)}>
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{hasStarted ? '继续阅读' : '开始阅读'}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {cont ? (
                    <Text style={{ fontSize: 11, color: INK3, marginTop: 8 }} numberOfLines={1}>
                      {cont.bookNumber != null ? `第${cont.bookNumber}册 · ` : ''}{cont.title}
                    </Text>
                  ) : null}
                </View>
              </View>
              <View style={styles.stats}>
                <Stat label="圆满" value={String(lib.completedCount)} />
                <View style={styles.statDivider} />
                <Stat label="篇" value={String(lib.totalArticles)} />
                <View style={styles.statDivider} />
                <Stat label="册" value={String(lib.books.length)} />
              </View>
            </>
          )}
        </View>

        {lib ? (
          <View style={styles.panel}>
            <Group
              title="预科大纲内 · 第 1-18 册"
              note="教学大纲:第 2-7 学期每学期 3 册;自学师兄作参考,不强制。"
              books={lib.core}
              currentId={cont?.id ?? null}
            />
            <View style={{ height: 10 }} />
            <Group
              title="更多演讲 · 第 19-50 册"
              note="大纲范围外的更多高校演讲,随喜选读。"
              books={lib.extra}
              currentId={cont?.id ?? null}
            />
            <Text style={{ fontSize: 11, color: INK3, marginTop: 12, paddingHorizontal: 4 }}>
              圆满 = 看演讲 + 读文字稿(纯文字篇读完即可);免答题、不计考试。
            </Text>
          </View>
        ) : null}
      </ScrollView>
      {/* topInset(同 course/[id].tsx 2026-07-17 修复):漏传会让 ScrollTitleBar 默认 topInset=0,
          贴着状态栏画。 */}
      <ScrollTitleBar title="《大学演讲系列》" shown={bar.shown && !!lib} onBack={() => router.back()} topInset={insets.top} />
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCol}>
      <Text style={{ fontSize: 11, color: INK3, letterSpacing: 1 }}>{label}</Text>
      <Text className="font-serif" style={{ fontSize: 20, fontWeight: '700', color: INK, marginTop: 3 }}>{value}</Text>
    </View>
  );
}

// 组(大纲内 / 更多):组头 + 书=章节、文章=行
function Group({ title, note, books, currentId }: { title: string; note: string; books: SpeechLibraryBook[]; currentId: string | null }) {
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.groupHead}>
        <Text className="font-serif" style={{ fontSize: 15, fontWeight: '700', color: SAFFRON_DARK, letterSpacing: 0.5 }}>{title}</Text>
        <Text style={{ fontSize: 11, color: INK3, marginTop: 2 }}>{note}</Text>
      </View>
      {books.map((b) => (
        <View key={b.id} style={{ gap: 6 }}>
          <View style={styles.sectionHeader}>
            <View style={styles.chapNo}><Text style={{ fontSize: 11, fontWeight: '700', color: SAGE }}>{b.bookNumber ?? '·'}</Text></View>
            <Text className="font-serif" style={{ flex: 1, fontSize: 14, fontWeight: '700', color: INK }} numberOfLines={1}>《{b.title}》</Text>
            <Text style={{ fontSize: 11, color: b.doneCount === b.articles.length && b.articles.length > 0 ? SAGE : INK3 }}>
              {b.doneCount}/{b.articles.length} 篇
            </Text>
          </View>
          {b.articles.map((a) => (
            <ArticleRow key={a.id} a={a} isCurrent={a.id === currentId} />
          ))}
        </View>
      ))}
    </View>
  );
}

function ArticleRow({ a, isCurrent }: { a: SpeechArticleRow; isCurrent: boolean }) {
  const router = useRouter();
  return (
    <Pressable style={[styles.artRow, isCurrent && styles.artRowCurrent]} onPress={() => router.push(`/speech/${a.id}` as never)}>
      <View style={[styles.artNoBox, isCurrent && { backgroundColor: SAFFRON }]}>
        <Text style={{ fontSize: 11, fontWeight: '700', color: isCurrent ? '#fff' : INK3 }}>{a.articleNumber ?? '·'}</Text>
      </View>
      <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, fontWeight: isCurrent ? '700' : '500', color: isCurrent ? INK : INK2 }}>{a.title}</Text>
      {isCurrent ? <Text style={{ fontSize: 10, fontWeight: '700', color: SAFFRON_DARK }}>当前</Text> : null}
      {a.status === 'completed' ? (
        <View style={styles.badgeDone}><Text style={{ fontSize: 10, fontWeight: '700', color: SAGE }}>圆满 ✓</Text></View>
      ) : a.status === 'reading' ? (
        <Text style={{ fontSize: 10, color: SAFFRON_DARK }}>{a.watched && !a.read ? '已看' : a.read && !a.watched ? '已读' : '进行中'}</Text>
      ) : null}
      <Text style={{ fontSize: 14, color: INK3 }}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headTop: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 6, paddingBottom: 4 },
  heroRow: { flexDirection: 'row', gap: 16, paddingHorizontal: 20, paddingTop: 8 },
  cover: { width: 92, height: 124, borderRadius: 8, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', padding: 8, shadowColor: '#2b2218', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
  coverTitle: { fontSize: 15, fontWeight: '700', color: '#fff', textAlign: 'center', letterSpacing: 2, lineHeight: 22, textShadowColor: 'rgba(0,0,0,0.22)', textShadowRadius: 3 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  cta: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 9999, backgroundColor: SAFFRON },
  stats: { flexDirection: 'row', paddingHorizontal: 24, paddingTop: 18 },
  statCol: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  statDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', marginVertical: 6, backgroundColor: 'rgba(43,34,24,0.12)' },
  panel: { backgroundColor: '#fff', borderRadius: 16, marginHorizontal: 16, marginTop: 14, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 14, borderWidth: 1, borderColor: 'rgba(43,34,24,0.06)' },
  groupHead: { paddingHorizontal: 4, paddingBottom: 4 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4, paddingTop: 10, paddingBottom: 2 },
  chapNo: { width: 26, height: 26, borderRadius: 13, backgroundColor: SAGE_BG, alignItems: 'center', justifyContent: 'center' },
  artRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 11, borderRadius: 10, backgroundColor: 'rgba(43,34,24,0.035)' },
  artRowCurrent: { backgroundColor: '#FBE5DA', borderWidth: 1, borderColor: 'rgba(224,120,86,0.4)' },
  artNoBox: { width: 24, height: 24, borderRadius: 7, backgroundColor: 'rgba(43,34,24,0.06)', alignItems: 'center', justifyContent: 'center' },
  badgeDone: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, backgroundColor: SAGE_BG },
});
