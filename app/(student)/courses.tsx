import { LinearGradient } from 'expo-linear-gradient';
import { Link } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScrollTitleBar, useScrollTitleBar } from '@/components/scroll-title-bar';
import { Text } from '@/components/ui/text';
import { useCourses, type CourseListItem } from '@/lib/queries/courses';
import { CRIMSON } from '@/lib/theme';

// 闻思 Tab = 课程列表主体(采觉学 能力3/37/39 骨架 · 守 2.0)。
// 布局: 本周课时 + 全部闻思课程(按专业分组的书封网格,含自学读物=大学演讲格;useCourses inline,无须跳 /catalog)。
// 课程三层(CLAUDE.md §4):course → course_lessons → lesson_resources;点封面 → /course/[id] 详情 → /lesson/[id] 学修。
// 已加入判定:同 catalog.tsx(我的专业 program_courses ∩ 本课·决策126);封面色 hash·同书永远同色(觉学 CourseCover)。
const SAFFRON = '#e07856';
const SAFFRON_DARK = '#b35535';
const INK = '#2b2218';
const INK3 = '#7e6d5b';
// 闻思页头(PM 2026-06-30):蓝色渐变(加大)+ 海螺(法螺=闻法之声)。蓝渐变淡入奶白底,配深蓝字(画报头·同 当日/修持)。
const WENSI_GRAD = ['#BED3E9', '#CFE0EE', '#E7EFF4', '#FBF4E9'] as const;
const WENSI_TITLE = '#2f4c67';
const WENSI_SUB = '#5d7d97';
// PM 2026-06-28:「已加入/未加入」师兄看不懂 → 改「正在学习 / 未加入学习」(语义=我班级在学的课 / 其他可浏览的课)。
const FILTERS = ['全部', '正在学习', '未加入学习'] as const;
// 分类分组顺序(PM 2026-06-26):大学演讲 → 基础 → 入行论 → 净土 → 前行 → 学经 → 中观班。
// key = DB 专业名;label = 师兄端显示名(加行→前行、入行→入行论)。大学演讲(自学读物)单列排第一,不在此表。
const CATS = [
  { key: '基础', label: '基础' },
  { key: '入行', label: '入行论' },
  { key: '净土', label: '净土' },
  { key: '加行', label: '前行' },
  { key: '学经', label: '学经' },
  { key: '中观班', label: '中观班' },
] as const;
// 一课多专业 → 取优先级最高(CATS 最靠前)的那组;未匹配 → 末尾「其他」。
function courseCatIndex(programs: { name: string }[]): number {
  let best: number = CATS.length;
  for (const p of programs) {
    const i = CATS.findIndex((cat) => cat.key === p.name);
    if (i >= 0 && i < best) best = i;
  }
  return best;
}

// 觉学 CourseCover 6 套配色(同 catalog.tsx,同书永远同色)
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
function BookCover({ title }: { title: string }) {
  const p = pickPalette(title);
  return (
    <>
      <LinearGradient colors={p.g} style={StyleSheet.absoluteFill} start={{ x: 0.2, y: 0 }} end={{ x: 0, y: 1 }} />
      <View style={[styles.spine, { backgroundColor: p.spine }]} />
      <Text className="font-serif" numberOfLines={3} style={[styles.coverTitle, { color: p.fg }]}>{title}</Text>
      <Text style={styles.coverEmoji}>📖</Text>
    </>
  );
}

export default function Courses() {
  const { data: courses = [], isLoading: coursesLoading, error: coursesError } = useCourses();
  // 浏览:全部 / 正在学习 / 未加入学习(PM 2026-06-26)。搜索框已去(PM 2026-06-30);「类别」筛选暂不做(课程在 DB 无分类维度)。
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('全部');
  const list = courses.filter((c) => (filter === '正在学习' ? c.joined : filter === '未加入学习' ? !c.joined : true));
  // 分类分组:大学演讲排第一(仅「全部」类),其后各专业按 CATS 序,不挂这6个已知专业之一的课程
  // 排在最后一组「其他」——PM 拍板(2026-07-17):不是隐藏,是都要显示,只是有专业的优先。
  // (此前一度以为这些是"宝性论/经庄严论两族6门"孤儿课、等教务归类前先隐藏;现场核实实际有
  // 341条、course_type跟已分类的课一样都是'formal',DB没有另一字段能区分——但PM明确这批
  // 就该正常展示,不是等待态,只需排序上靠后。)
  const showSelfStudy = filter === '全部';
  // 组内按该专业课表的真实顺序排(program_courses.sort_order),不是此前的course.name字母序
  // (2026-07-17 PM反馈"不是按顺序排布"——名字排序跟教学顺序完全没关系,同一课在不同专业下
  // 顺序可能不同,所以要按"这一组对应的那个专业"各自取sortOrder,不能挂全局一个顺序值)。
  const groups = CATS.map((cat, i) => ({
    key: cat.key,
    label: cat.label,
    courses: list
      .filter((c) => courseCatIndex(c.programs) === i)
      .sort((a, b) => (a.programs.find((p) => p.name === cat.key)?.sortOrder ?? 0) - (b.programs.find((p) => p.name === cat.key)?.sortOrder ?? 0)),
  }));
  const others = list.filter((c) => courseCatIndex(c.programs) === CATS.length);
  const nothing = !showSelfStudy && list.length === 0;
  const bar = useScrollTitleBar(); // 头图滚出后顶部淡入细标题栏(PM 2026-07-02)
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['left', 'right']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} onScroll={bar.onScroll} scrollEventThrottle={16}>

        {/* 蓝色渐变头 + 海螺(法螺·闻法之声遍十方)·PM 2026-06-30。
            edges 去掉 'top'、渐变改绝对定位铺到状态栏高度(同 practice.tsx/class.tsx 手法·2026-07-17
            修"顶部与状态栏断开"):此前 SafeAreaView 自己吃掉顶部安全区、渐变只铺在安全区下方的
            内容里,状态栏那一段留白是 SafeAreaView 自己的背景色,和渐变蓝在安全区边界处有明显接缝。
            渐变高度 insets.top+300(2026-07-17 PM 拍板统一):跟 practice.tsx/class.tsx 同一个数,
            此前这里是 +150、只有修持/班级两页是 +300,三页顶部渐变面积不一致。 */}
        <View onLayout={bar.onHeaderLayout}>
          <LinearGradient colors={WENSI_GRAD} pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top + 300 }} />
          <View style={[styles.headRow, { paddingTop: insets.top + 30 }]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text className="font-serif" style={styles.headTitle}>闻思</Text>
              <Text style={styles.headSub}>听闻正法 · 如理思维</Text>
            </View>
            <Image source={require('../../assets/images/conch.png')} resizeMode="contain" style={styles.conch} />
          </View>
        </View>

        {/* 本周课时已移除(PM 2026-06-30):闻思页专做课程浏览;本周要学的内容看「当日功课」页 */}

        {/* 课程浏览:全部 / 正在学习 / 未加入学习;自学读物(大学演讲)并入下方网格(搜索框已去·PM 2026-06-30) */}
        <View style={styles.filterRow}>
          {FILTERS.map((f) => (
            <Pressable key={f} onPress={() => setFilter(f)} style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: f === filter ? '700' : '500', color: f === filter ? SAFFRON_DARK : INK3 }}>{f}</Text>
              <View style={{ marginTop: 4, height: 2, width: 18, borderRadius: 1, backgroundColor: f === filter ? SAFFRON : 'transparent' }} />
            </Pressable>
          ))}
        </View>
        {/* error 分支(2026-07-11 一致性调研发现:此前查询失败会静默走"全部"tab 的固定大学演讲
            兜底、或非"全部"tab 的"暂无课程",都看不出是加载失败——加真实错误态,优先级高于
            上述两种"正常但没内容"的情形)。 */}
        {coursesLoading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator color={SAFFRON_DARK} />
          </View>
        ) : coursesError ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: CRIMSON }}>加载失败,请检查网络后重试。</Text>
          </View>
        ) : nothing ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: INK3 }}>暂无课程</Text>
          </View>
        ) : (
          <>
            {/* 大学演讲(自学读物)—— 排第一 */}
            {showSelfStudy ? (
              <View>
                <Text style={styles.catLabel}>大学演讲</Text>
                <View style={styles.grid}><SelfStudyCell /></View>
              </View>
            ) : null}
            {/* 各专业分组(空组不显) */}
            {groups.filter((g) => g.courses.length > 0).map((g) => (
              <View key={g.key}>
                <Text style={styles.catLabel}>{g.label}</Text>
                <View style={styles.grid}>
                  {g.courses.map((c) => <CourseCell key={c.id} c={c} />)}
                </View>
              </View>
            ))}
            {/* 「其他」(未挂已知专业的课程)排最后一组,不隐藏(PM 2026-07-17拍板:都要显示,
                有专业的优先在前面)。 */}
            {others.length > 0 ? (
              <View>
                <Text style={styles.catLabel}>其他</Text>
                <View style={styles.grid}>
                  {others.map((c) => <CourseCell key={c.id} c={c} />)}
                </View>
              </View>
            ) : null}
          </>
        )}

      </ScrollView>
      <ScrollTitleBar title="闻思" shown={bar.shown} topInset={insets.top} />
    </SafeAreaView>
  );
}

function CourseCell({ c }: { c: CourseListItem }) {
  return (
    <Link href={`/course/${c.id}`} asChild>
      <Pressable style={styles.cell}>
        <View style={styles.coverWrap}>
          {c.coverImageUrl ? (
            <Image source={{ uri: c.coverImageUrl }} resizeMode="cover" style={StyleSheet.absoluteFill} />
          ) : (
            <BookCover title={c.name} />
          )}
          {c.joined ? (
            <View style={styles.joinedBadge}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: SAFFRON_DARK, letterSpacing: 1 }}>在学</Text>
            </View>
          ) : null}
        </View>
        <Text className="font-serif" numberOfLines={2} style={styles.bookTitle}>{c.name}</Text>
      </Pressable>
    </Link>
  );
}
function SelfStudyCell() {
  return (
    <Link href="/speech" asChild>
      <Pressable style={styles.cell}>
        <View style={styles.coverWrap}>
          <LinearGradient colors={['#F1E0BD', '#DBBF85']} style={StyleSheet.absoluteFill} start={{ x: 0.2, y: 0 }} end={{ x: 0, y: 1 }} />
          <View style={[styles.spine, { backgroundColor: '#B5945C' }]} />
          <Text className="font-serif" numberOfLines={3} style={[styles.coverTitle, { color: '#5A4220' }]}>大学演讲</Text>
          <Text style={styles.coverEmoji}>🎓</Text>
        </View>
        <Text className="font-serif" numberOfLines={2} style={styles.bookTitle}>大学演讲</Text>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 22, paddingBottom: 40 },
  headTitle: { fontSize: 28, fontWeight: '700', color: WENSI_TITLE, lineHeight: 32 },
  headSub: { fontSize: 14.5, color: WENSI_SUB, fontWeight: '600', marginTop: 12 },
  conch: { width: 84, height: 84, flexShrink: 0 },
  catLabel: { fontSize: 12, color: INK3, letterSpacing: 1, paddingHorizontal: 20, paddingTop: 6, paddingBottom: 10 },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 18, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 16 },
  spine: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 4 },
  coverTitle: { fontSize: 14, fontWeight: '700', textAlign: 'center', letterSpacing: 1, lineHeight: 19 },
  coverEmoji: { fontSize: 22, lineHeight: 24, opacity: 0.85 },
  // 2026-07-17 PM反馈"列表出现空位":justifyContent:'space-between'在满3个一行时没问题,
  // 但组内课程数不是3的倍数时,最后一行剩1~2个也会被"两端拉开"——尤其剩2个时,两张卡会被推到
  // 最左最右,中间空出一大块像缺了一张。改用gap固定卡片间距+flex-start顺排,不整行铺满时
  // 剩余空白只会留在行尾(不影响阅读顺序),不会在行中间开洞。
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', gap: 12, paddingHorizontal: 16 },
  cell: { width: '31%', marginBottom: 22 },
  coverWrap: { width: '100%', aspectRatio: 2 / 3, borderRadius: 8, overflow: 'hidden', alignItems: 'center', justifyContent: 'space-between', paddingTop: 26, paddingHorizontal: 12, paddingBottom: 12, shadowColor: '#2b2218', shadowOpacity: 0.22, shadowRadius: 10, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  joinedBadge: { position: 'absolute', top: 6, right: 6, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.92)' },
  bookTitle: { marginTop: 10, fontSize: 13, fontWeight: '600', color: INK, letterSpacing: 1, textAlign: 'center', lineHeight: 18 },
});
