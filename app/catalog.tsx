import { LinearGradient } from 'expo-linear-gradient';
import { Link, useRouter } from 'expo-router';
import { ChevronLeft, GraduationCap, Search } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text as RNText, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { useCourses } from '@/lib/queries/courses';

// 全部课程 = 觉学 闻思 CoursesPage UI(PM 2026-06-19:按觉学 UI·主要大小比例/间距):
//   头部(闻思/诸经汇集·选本入学)+ 搜索 + 筛选chips(全部/已加入/未加入)+ 类别 + 3 列书封网格(2:3·已加入角标·居中书名)。
// 功能口径守 2.0:课程随专业分配(决策126),「已加入」= 我的专业已选课;「未加入」= 其他可浏览(浏览也存进度·决策149);
//   非觉学的自助 enroll。点书 → 课程详情(/course/[id])。
// 封面(决策160):有 cover_image_url 用图;无图 → 觉学 CourseCover 兜底 = 按书名 hash 选 6 套配色(同书永远同色·列表色相分散)
//   + 左书脊线 + 顶部衬线书名(配色前景色)+ 底部装饰 emoji。
// TODO:user_lesson_progress(续播)。
const INK = '#2b2218';
const INK3 = '#7e6d5b';
const SAFFRON = '#e07856';
const SAFFRON_DARK = '#b35535';
// PM 2026-06-28:与闻思 tab 一致,「已加入/未加入」→「正在学习/未加入学习」。
const FILTERS = ['全部', '正在学习', '未加入学习'] as const;

// 觉学 CourseCover 6 套配色:按 title 字符 hash 选 → 同一本闻思永远同色,列表里色相分散
const COVER_PALETTES = [
  { g: ['#F4D6B8', '#E8B98A'] as const, fg: '#5A3A1F', spine: '#C99563' },
  { g: ['#D9E5C8', '#B6C9A0'] as const, fg: '#3F4F2D', spine: '#8AA170' },
  { g: ['#E8D4D0', '#C99B92'] as const, fg: '#5A2D24', spine: '#A56F65' },
  { g: ['#D9DAE6', '#A8AAC4'] as const, fg: '#2E2F4A', spine: '#7A7C9C' },
  { g: ['#F1E0BD', '#DBBF85'] as const, fg: '#5A4220', spine: '#B5945C' },
  { g: ['#C9DDD9', '#8FB4AC'] as const, fg: '#1F3F3A', spine: '#5F8B82' },
];
function pickPalette(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return COVER_PALETTES[Math.abs(h) % COVER_PALETTES.length];
}

// 默认封面(无 cover_image_url):觉学 CourseCover 兜底版式
function BookCover({ title, emoji }: { title: string; emoji?: string }) {
  const p = pickPalette(title);
  return (
    <>
      <LinearGradient colors={p.g} style={StyleSheet.absoluteFill} start={{ x: 0.2, y: 0 }} end={{ x: 0, y: 1 }} />
      <View style={[styles.spine, { backgroundColor: p.spine }]} />
      <Text className="font-serif" numberOfLines={3} style={[styles.coverTitle, { color: p.fg }]}>{title}</Text>
      <RNText style={styles.coverEmoji}>{emoji || '📖'}</RNText>
    </>
  );
}

export default function Catalog() {
  const router = useRouter();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('全部');
  const [q, setQ] = useState('');
  const { data: courses = [], isLoading, isError } = useCourses();
  const list = courses
    .filter((c) => (filter === '正在学习' ? c.joined : filter === '未加入学习' ? !c.joined : true))
    .filter((c) => !q || c.name.includes(q));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF4E9' }} edges={['top']}>
      <View style={styles.topbar}>
        <Pressable hitSlop={8} onPress={() => router.back()}>
          <ChevronLeft size={24} color={INK} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* 头部 */}
        <View style={{ paddingHorizontal: 20, paddingTop: 2, paddingBottom: 14 }}>
          <Text className="font-serif" style={{ fontSize: 26, fontWeight: '700', color: INK, letterSpacing: 2 }}>全部课程</Text>
          <RNText style={{ fontSize: 12, color: INK3, letterSpacing: 1, marginTop: 4 }}>诸经汇集 · 选本入学</RNText>
        </View>

        {/* 搜索 */}
        <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
          <View style={styles.search}>
            <Search size={16} color={INK3} />
            <TextInput value={q} onChangeText={setQ} placeholder="搜索闻思" placeholderTextColor={INK3} style={{ flex: 1, fontSize: 14, color: INK, padding: 0 }} />
          </View>
        </View>

        {/* 筛选 chips + 类别 */}
        <View style={styles.filterRow}>
          {FILTERS.map((f) => (
            <Pressable key={f} onPress={() => setFilter(f)} style={{ alignItems: 'center' }}>
              <RNText style={{ fontSize: 14, fontWeight: f === filter ? '700' : '500', color: f === filter ? SAFFRON_DARK : INK3 }}>{f}</RNText>
              <View style={{ marginTop: 4, height: 2, width: 18, borderRadius: 1, backgroundColor: f === filter ? SAFFRON : 'transparent' }} />
            </Pressable>
          ))}
          <View style={{ flex: 1 }} />
          {/* 「类别 ⌄」死药丸撤(审计 P2:无 onPress 的假交互);类别筛选待有真分类数据再做 */}
        </View>

        {/* 自学读物 */}
        <View style={{ paddingHorizontal: 20, paddingBottom: 16 }}>
          <RNText style={{ fontSize: 12, color: INK3, letterSpacing: 1, marginBottom: 10 }}>自学读物</RNText>
          <Pressable style={styles.selfStudyCard} onPress={() => router.push('/speech' as never)}>
            <View style={styles.selfStudyIcon}>
              <GraduationCap size={22} color={SAFFRON_DARK} />
            </View>
            <View style={{ flex: 1 }}>
              <Text className="font-serif" style={{ fontSize: 15, fontWeight: '700', color: INK }}>大学演讲</Text>
              <RNText style={{ fontSize: 12, color: INK3, marginTop: 2 }}>听闻 + 阅读即圆满 · 免答题</RNText>
            </View>
            <RNText style={{ fontSize: 20, color: INK3 }}>›</RNText>
          </Pressable>
        </View>

        {/* 闻思课程 */}
        <View style={{ paddingHorizontal: 20, paddingBottom: 10 }}>
          <RNText style={{ fontSize: 12, color: INK3, letterSpacing: 1 }}>闻思课程</RNText>
        </View>

        {/* 3 列书封网格 */}
        {isLoading ? (
          <View style={{ paddingVertical: 48, alignItems: 'center' }}><ActivityIndicator color={SAFFRON_DARK} /></View>
        ) : isError ? (
          // 查询失败别落进"暂无课程"——那对课程库确有内容是假空态(全文件审计 2026-07-12)
          <View style={{ paddingVertical: 48, alignItems: 'center' }}>
            <RNText style={{ fontSize: 13, color: INK3 }}>加载失败,请检查网络后重试</RNText>
          </View>
        ) : list.length === 0 ? (
          <View style={{ paddingVertical: 48, alignItems: 'center' }}>
            <RNText style={{ fontSize: 13, color: INK3 }}>{q ? '没有匹配的课程' : '暂无课程'}</RNText>
          </View>
        ) : (
          <View style={styles.grid}>
            {list.map((c) => (
              <Link key={c.id} href={`/course/${c.id}`} asChild>
                <Pressable style={styles.cell}>
                  <View style={styles.coverWrap}>
                    {c.coverImageUrl ? (
                      <Image source={{ uri: c.coverImageUrl }} resizeMode="cover" style={StyleSheet.absoluteFill} />
                    ) : (
                      <BookCover title={c.name} />
                    )}
                    {c.joined ? (
                      <View style={styles.joinedBadge}><RNText style={{ fontSize: 10, fontWeight: '700', color: SAFFRON_DARK, letterSpacing: 1 }}>在学</RNText></View>
                    ) : null}
                  </View>
                  <Text className="font-serif" numberOfLines={2} style={styles.bookTitle}>{c.name}</Text>
                </Pressable>
              </Link>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 11, borderRadius: 9999, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(43,34,24,0.10)' },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 18, paddingHorizontal: 20, paddingBottom: 16 },
  sortPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9999, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(43,34,24,0.10)' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 20 },
  cell: { width: '31%', marginBottom: 22 },
  coverWrap: { width: '100%', aspectRatio: 2 / 3, borderRadius: 8, overflow: 'hidden', alignItems: 'center', justifyContent: 'space-between', paddingTop: 26, paddingHorizontal: 12, paddingBottom: 12, shadowColor: '#2b2218', shadowOpacity: 0.22, shadowRadius: 10, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  spine: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 4 },
  coverTitle: { fontSize: 14, fontWeight: '700', textAlign: 'center', letterSpacing: 1, lineHeight: 19 },
  coverEmoji: { fontSize: 22, lineHeight: 24, opacity: 0.85 },
  joinedBadge: { position: 'absolute', top: 6, right: 6, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.92)' },
  bookTitle: { marginTop: 10, fontSize: 13, fontWeight: '600', color: INK, letterSpacing: 1, textAlign: 'center', lineHeight: 18 },
  selfStudyCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 16, padding: 15, borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)' },
  selfStudyIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#fbe5da', alignItems: 'center', justifyContent: 'center' },
});
