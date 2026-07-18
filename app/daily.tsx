import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View, type TextStyle, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { QuickCountSheet } from '@/components/quick-count-sheet';
import { Text } from '@/components/ui/text';
import { useMarkRitual } from '@/lib/mutations/daily';
import { useRecordPracticeLog } from '@/lib/mutations/practice';
import { useMyDailyLessons, useDailyLessonComponents, useProgramPrimaryCourseId, useTodayRitual, type LessonComponents } from '@/lib/queries/daily';
import { useMyVows } from '@/lib/queries/practice';
import { usePrimaryContext, useSelfStudyPlan } from '@/lib/queries/self-study-progress';
import { bookTitle } from '@/lib/utils';

// 每日功课(决策012/144/157/160·PM 2026-06-29;顺序 2026-07-01 改自上而下):一页聚合今日所有功课。
//   自上而下:发心(前行·顶) → 闻思(本周课·多班/自学按节奏) → 修持(念诵/观修·跨班) → 复习 → 回向(结行·底)。
//   ⚠️ 复习步 PM 2026-07-11 决定【延后】,现未渲染(非遗漏);待建时插回 修持与回向之间,编号顺延。
//   各项按渲染序编号 1、2、3…(取代原图标),兼修折叠为附属信息不计入编号。
//   主班展开 + 兼修折叠;未完成柔色+可补、不锁回向;念诵累积不算"日"。发心/回向为仪式书签,落库 daily_rituals(C9·2026-07-10)。
const INK = '#2b2218';
const INK2 = '#55463a';
const INK3 = '#7e6d5b';
const SAFFRON = '#e07856';
const SAFFRON_DARK = '#b35535';
const SAGE = '#6f9a86';
const GOLD = '#b8862f';
const VERSE = '#6b4a3f';     // 顶部教言深字(淡玫瑰渐变上·配修持页轻盈度)
const HEADSUB = '#9a7868';
const DAILY_VERSE = '愿今日所修,\n回向法界一切有情。';   // 教言(写死·PM 2026-06-30)

type NodeState = 'done' | 'current' | 'todo' | 'gold';

function Node({ num, state, tag, title, sub, chip, chipState, onPress, actionLabel }: {
  num: number; state: NodeState; tag: string; title: string; sub?: string;
  chip?: string; chipState?: 'done' | 'doing' | 'todo'; onPress?: () => void; actionLabel?: string;
}) {
  return (
    <View style={styles.step}>
      <View style={[styles.node, NODE[state]]}>
        <Text style={[styles.glyph, state === 'current' && { color: '#fff' }, state === 'done' && { color: SAGE }, state === 'gold' && { color: GOLD }, state === 'todo' && { color: SAFFRON_DARK }]}>{num}</Text>
      </View>
      <View style={[styles.card, state === 'current' && styles.cardCurrent, state === 'todo' && styles.cardTodo]}>
        <Text style={styles.tag}>{tag}</Text>
        <Text className="font-serif" style={styles.cardTitle}>{title}</Text>
        {sub ? <Text style={styles.cardSub}>{sub}</Text> : null}
        {(chip || actionLabel) ? (
          <View style={styles.row}>
            {chip ? <Text style={[styles.chip, CHIP[chipState ?? 'todo']]}>{chip}</Text> : null}
            {actionLabel && onPress ? <Pressable style={styles.go} onPress={onPress}><Text style={styles.goTxt}>{actionLabel}</Text></Pressable> : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

type LessonStep = 'wensi' | 'quiz' | 'guan';
// 闻思节卡:把本节当天要学的内容件逐项列出(听讲记/读法本/答思考题/观修),按学修顺序,标已完成态。
//   内容件存在性 + 完成态全据真实数据(LessonComponents);comp 未到 → 先给 圆满口径副标题,数据到后展开清单。
function LessonNode({ num, tag, title, sub, comp, onStep }: {
  num: number; tag: string; title: string; sub?: string; comp?: LessonComponents; onStep: (step: LessonStep) => void;
}) {
  const rows: { key: string; label: string; done?: boolean; go: string; step: LessonStep }[] = comp
    ? [
        { key: 'listen', label: '听讲记', done: comp.listenDone, go: '去听', step: 'wensi' },
        { key: 'read', label: '读法本', done: comp.readDone, go: '去读', step: 'wensi' },
        ...(comp.hasQuiz ? [{ key: 'quiz', label: '答思考题', done: comp.answerDone, go: '去答', step: 'quiz' as LessonStep }] : []),
        ...(comp.hasGuan ? [{ key: 'guan', label: '观修', done: undefined, go: '去观修', step: 'guan' as LessonStep }] : []),
      ]
    : [];
  return (
    <View style={styles.step}>
      <View style={[styles.node, NODE.current]}><Text style={[styles.glyph, { color: '#fff' }]}>{num}</Text></View>
      <View style={[styles.card, styles.cardCurrent]}>
        <Text style={styles.tag}>{tag}</Text>
        <Text className="font-serif" style={styles.cardTitle}>{title}</Text>
        {sub ? <Text style={styles.cardSub}>{sub}</Text> : null}
        {comp ? (
          <View style={styles.subwrap}>
            {rows.map((r, i) => (
              <Pressable key={r.key} style={[styles.subrow, i === rows.length - 1 && styles.subrowLast]} onPress={() => onStep(r.step)}>
                <View style={styles.subLeft}>
                  <Text style={styles.subNum}>{i + 1}</Text>
                  <Text style={styles.subLabel}>{r.label}</Text>
                </View>
                {r.done === true
                  ? <Text style={styles.subDone}>已完成 ✓</Text>
                  : <Text style={styles.subGo}>{r.go} ›</Text>}
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={styles.cardSub}>听 + 读法本 + 答 = 圆满</Text>
        )}
      </View>
    </View>
  );
}

export default function Daily() {
  const router = useRouter();
  const { data: ctx } = usePrimaryContext();
  const selfStudy = ctx?.mode === 'self_study';
  const { data: vows = [] } = useMyVows();
  const { data: classWeeks = [], isLoading: weeksLoading, isError: weeksError } = useMyDailyLessons();
  const { data: ssPlan, isLoading: ssRawLoading, isError: ssError } = useSelfStudyPlan(selfStudy ? ctx?.programId : undefined);
  const recordLog = useRecordPracticeLog();
  const [qcOpen, setQcOpen] = useState(false);
  const [qcVow, setQcVow] = useState(0);
  const { data: ritual } = useTodayRitual();   // 今日发心/回向(落库·C9 2026-07-10)
  const markRitual = useMarkRitual();
  const faxin = !!ritual?.faxinAt;
  const huixiang = !!ritual?.huixiangAt;

  const countVows = vows.filter((v) => v.measurement === 'count');
  const durationVows = vows.filter((v) => v.measurement === 'duration');
  const qcItems = countVows.map((v) => ({ id: v.vowId, name: v.name }));
  const openQc = (vowId: string) => { const i = countVows.findIndex((v) => v.vowId === vowId); setQcVow(Math.max(i, 0)); setQcOpen(true); };

  // 闻思:班级=各班本周课(主班优先,兼修折叠);自学=按节奏本周计划
  const primaryWeek = !selfStudy ? classWeeks[0] : null;
  const otherWeeks = !selfStudy ? classWeeks.slice(1) : [];
  const [othersOpen, setOthersOpen] = useState(false);
  // 本周暂无排课(休息周/未排)兜底目标(PM 2026-07-17:原兜底跳全部课程目录让人看不懂,
  // 改跳"当前学习课程"的详情页——只在真的用得到时才查,避免多一次无谓请求)。
  const needFallbackCourse = !selfStudy && !!primaryWeek && primaryWeek.lessons.length === 0;
  const { data: fallbackCourseId } = useProgramPrimaryCourseId(needFallbackCourse ? primaryWeek?.programId : undefined);

  // 本周要展开「内容清单」的节(主班 or 自学本周)→ 批量取各节真实内容件 + 完成态
  const lessonIds = (selfStudy ? (ssPlan?.lessons ?? []) : (primaryWeek?.lessons ?? [])).map((l) => l.lessonId);
  const { data: lessonComps = {} } = useDailyLessonComponents(lessonIds);

  // 渐进渲染(PM 2026-06-30·治「进页面慢」):不再整页 spinner 等所有查询;头 + 前行/结行/复习立即显,
  //   念诵/观修随 vows 到达即现,闻思(本周课)慢查询只在自己那一格转圈,不拖累整页。
  const wensiLoading = ctx === undefined || (selfStudy ? ssRawLoading : weeksLoading);
  // 查询失败别落进"本周暂无排课"/"本周自学"——那对确有排课的师兄是假空态(全文件审计 2026-07-12)
  const wensiError = !wensiLoading && (selfStudy ? ssError : weeksError);
  const doneToday = (faxin ? 1 : 0) + (huixiang ? 1 : 0) + countVows.filter((v) => v.todayCount > 0).length;

  // 顺序自上而下(PM 2026-07-01):发心(前行·顶)→…→ 回向(结行·底),对齐三殊胜顺序、自然滚动,
  //   不再需要开页强制吸底(原「自下而上」写法与说明已去)。列表项按渲染序编号(1,2,3…),兼修折叠不计入编号。
  let stepNum = 0;
  const nextStep = () => ++stepNum;

  return (
    <View style={{ flex: 1, backgroundColor: '#FBF4E9' }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* 固定头(不随列表滚动·PM 2026-06-30):淡玫瑰渐变(③·配修持轻盈)+ 教言 + 铃杵 */}
        <View>
          <LinearGradient colors={['#EFD3C5', '#F4E0D5', '#F9EDE5', '#FBF4E9']} style={StyleSheet.absoluteFill} />
          <View style={styles.headTop}>
            <Pressable hitSlop={8} onPress={() => router.back()}><ChevronLeft size={26} color={VERSE} /></Pressable>
          </View>
          <View style={styles.headRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text className="font-serif" style={styles.verse}>{DAILY_VERSE}</Text>
              <Text style={styles.headData}>今日已完成 {doneToday} 项</Text>
            </View>
            <Image source={require('../assets/images/bell-vajra.png')} resizeMode="contain" style={styles.bell} />
          </View>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <View style={styles.climb}>
              {/* 前行 · 发心(顶) */}
              <Node num={nextStep()} state={faxin ? 'done' : 'gold'} tag="前行 · 发心" title="发菩提心"
                sub={faxin ? '今日已发心 · 为利众生而闻思修。' : '修行前,先发菩提心。'}
                chip={faxin ? '已发心 ✓' : undefined} chipState="done"
                actionLabel={faxin ? undefined : '发心'} onPress={() => markRitual.mutate('faxin')} />

              {/* 正行 · 闻思(本周课慢查询:只在此格转圈,不拖整页) */}
              {wensiLoading ? (
                <View style={styles.step}>
                  <View style={[styles.node, NODE.current]}><Text style={[styles.glyph, { color: '#fff' }]}>{nextStep()}</Text></View>
                  <View style={[styles.card, styles.cardCurrent, { paddingVertical: 22, alignItems: 'center' }]}><ActivityIndicator color={SAFFRON_DARK} /></View>
                </View>
              ) : wensiError ? (
                <Node num={nextStep()} state="todo" tag="正行 · 闻思" title="加载失败" sub="请检查网络后重试(不代表本周没有排课)" />
              ) : selfStudy ? (
                (ssPlan?.lessons ?? []).length > 0 ? (
                  ssPlan!.lessons.map((l) => (
                    <LessonNode key={l.lessonId} num={nextStep()} tag={`正行 · 闻思${ssPlan!.weekNumber ? ` · 第${ssPlan!.weekNumber}周` : ''}`}
                      title={`${bookTitle(l.courseName)}${l.lessonTitle}`} sub={`自学 · 第 ${l.seq} 节`}
                      comp={lessonComps[l.lessonId]} onStep={(step) => router.push(`/lesson/${l.lessonId}?step=${step}` as never)} />
                  ))
                ) : (
                  <Node num={nextStep()} state="todo" tag="正行 · 闻思" title="本周自学" sub="去自学页看本周计划"
                    actionLabel="去自学" onPress={() => router.push('/selfstudy' as never)} />
                )
              ) : primaryWeek && primaryWeek.lessons.length > 0 ? (
                primaryWeek.lessons.map((l) => (
                  <LessonNode key={l.lessonId} num={nextStep()}
                    tag={`正行 · 闻思 · ${primaryWeek.programName}${primaryWeek.week ? ` 第${primaryWeek.week}周` : ''}`}
                    title={`${bookTitle(l.courseName)}${l.lessonTitle}`}
                    comp={lessonComps[l.lessonId]} onStep={(step) => router.push(`/lesson/${l.lessonId}?step=${step}` as never)} />
                ))
              ) : fallbackCourseId ? (
                <Node num={nextStep()} state="todo" tag="正行 · 闻思" title="本周课" sub="本周暂无排课(休息周或未排),去看当前课程学到哪了"
                  actionLabel="去当前课程" onPress={() => router.push(`/course/${fallbackCourseId}` as never)} />
              ) : (
                <Node num={nextStep()} state="todo" tag="正行 · 闻思" title="本周课" sub="本周暂无排课,去课程目录自选"
                  actionLabel="去课程" onPress={() => router.push('/catalog' as never)} />
              )}

              {/* 兼修班折叠(附属信息,不计入编号) */}
              {otherWeeks.length > 0 ? (
                <View style={styles.branch}>
                  <Pressable style={styles.branchBtn} onPress={() => setOthersOpen((o) => !o)}>
                    <Text style={{ flex: 1, fontSize: 13, color: INK2, fontWeight: '600' }}>＋ 其他班(兼修)· {otherWeeks.length} 个专业</Text>
                    <Text style={{ fontSize: 13, color: INK3 }}>{othersOpen ? '收起 ▴' : '展开 ▾'}</Text>
                  </Pressable>
                  {othersOpen ? otherWeeks.map((w) => (
                    <Pressable key={w.programId} style={styles.branchItem}
                      onPress={() => { const l = w.lessons[0]; if (l) router.push(`/lesson/${l.lessonId}?step=wensi` as never); }}>
                      <Text style={{ flex: 1, fontSize: 13, color: INK }}>{w.programName}{w.week ? ` · 第${w.week}周` : ''} · {w.lessons.length} 节</Text>
                      <Text style={{ fontSize: 14, color: INK3 }}>›</Text>
                    </Pressable>
                  )) : null}
                </View>
              ) : null}

              {/* 修持 · 念诵(累积·今日计数) */}
              {countVows.map((v) => {
                const done = v.todayCount > 0;
                return (
                  <Node key={v.vowId} num={nextStep()} state={done ? 'done' : 'current'}
                    tag={`正行 · 修持${v.cohortName ? ` · ${v.cohortName}` : ''}`} title={v.name}
                    sub={`累计 ${v.currentCount.toLocaleString()}${v.targetCount ? ` / ${v.targetCount.toLocaleString()}` : ''} ${v.unit}`}
                    chip={done ? `今日 ${v.todayCount.toLocaleString()} ${v.unit}` : undefined} chipState="done"
                    actionLabel={done ? '再计数' : '计数'} onPress={() => openQc(v.vowId)} />
                );
              })}

              {/* 修持 · 观修(2026-07-17 修:此前"去观修"跳的是修持整个 tab,还要自己找到这条
                  功课;时长型愿没有像计数型那样的就地弹层,直接进该愿详情页——"记一笔"入口就在那,
                  同 app/(student)/practice.tsx 观修卡片点按的落点) */}
              {durationVows.map((v) => (
                <Node key={v.vowId} num={nextStep()} state="todo" tag="正行 · 观修" title={v.name}
                  sub={`累计 ${v.currentSessions} 座${v.targetCount ? ` / ${v.targetCount}` : ''}`}
                  actionLabel="去观修" onPress={() => router.push(`/vow/${v.vowId}` as never)} />
              ))}

              {/* 结行 · 回向(底) */}
              <Node num={nextStep()} state={huixiang ? 'done' : 'gold'} tag="结行 · 回向" title="回向今日功德"
                sub={huixiang ? '今日已回向 🙏' : '把今天所修,回向一切众生。'}
                chip={huixiang ? '已回向 ✓' : undefined} chipState="done"
                actionLabel={huixiang ? undefined : '去回向'} onPress={() => markRitual.mutate('huixiang')} />

              <View style={styles.legend}>
                <Text style={styles.legendTxt}>未完成为柔色「待补」,可随时补、不催;念诵为累积,显进度不计日;回向不受未完成阻拦。</Text>
              </View>
            </View>
          </ScrollView>
      </SafeAreaView>
      <QuickCountSheet visible={qcOpen} items={qcItems} initialVow={qcVow} onRecord={(vowId, n, clientToken) => recordLog.mutate({ vowId, count: n, clientToken })} onClose={() => setQcOpen(false)} />
    </View>
  );
}

const NODE: Record<NodeState, ViewStyle> = {
  done: { backgroundColor: '#e6efea', borderColor: SAGE },
  current: { backgroundColor: SAFFRON, borderColor: SAFFRON },
  todo: { backgroundColor: '#FBE5DA', borderColor: SAFFRON, borderStyle: 'dashed' },
  gold: { backgroundColor: '#f1e6cf', borderColor: 'rgba(184,134,47,0.55)' },
};
const CHIP: Record<'done' | 'doing' | 'todo', TextStyle> = {
  done: { backgroundColor: '#e6efea', color: SAGE },
  doing: { backgroundColor: '#FBE5DA', color: SAFFRON_DARK },
  todo: { backgroundColor: '#f7e9df', color: SAFFRON_DARK },
};

const styles = StyleSheet.create({
  headTop: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 6, paddingBottom: 4 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 22, paddingBottom: 18 },
  verse: { fontSize: 22, fontWeight: '700', color: VERSE, lineHeight: 33 },
  headData: { fontSize: 12.5, color: HEADSUB, fontWeight: '600', marginTop: 10 },
  bell: { width: 85, height: 105, flexShrink: 0 },
  climb: { position: 'relative', paddingHorizontal: 18, paddingTop: 16 },
  step: { position: 'relative', flexDirection: 'row', gap: 12, marginBottom: 14, alignItems: 'flex-start' },
  node: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  glyph: { fontSize: 16, fontWeight: '700' },
  card: { flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: 'rgba(43,34,24,0.07)' },
  cardCurrent: { borderColor: 'rgba(224,120,86,0.45)', backgroundColor: '#fffaf7' },
  cardTodo: { borderColor: 'rgba(224,120,86,0.3)', backgroundColor: '#fffaf6' },
  tag: { fontSize: 10, letterSpacing: 1, color: INK3, fontWeight: '700' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: INK, marginTop: 2 },
  cardSub: { fontSize: 12, color: INK3, marginTop: 2, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  subwrap: { marginTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(43,34,24,0.07)' },
  subrow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: 'rgba(43,34,24,0.06)' },
  subrowLast: { borderBottomWidth: 0, paddingBottom: 2 },
  subLeft: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  subNum: { fontSize: 11, fontWeight: '700', color: INK3, width: 19, height: 19, borderRadius: 10, textAlign: 'center', lineHeight: 19, backgroundColor: 'rgba(43,34,24,0.06)', overflow: 'hidden' },
  subLabel: { fontSize: 14, color: INK2, fontWeight: '600' },
  subDone: { fontSize: 12.5, color: SAGE, fontWeight: '700' },
  subGo: { fontSize: 12.5, color: SAFFRON_DARK, fontWeight: '700' },
  chip: { fontSize: 11, fontWeight: '700', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 9999, overflow: 'hidden' },
  go: { backgroundColor: SAFFRON, borderRadius: 9999, paddingHorizontal: 16, paddingVertical: 7 },
  goTxt: { color: '#fff', fontWeight: '700', fontSize: 12 },
  branch: { marginLeft: 56, marginBottom: 14 },
  branchBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(43,34,24,0.035)', borderWidth: 1, borderColor: 'rgba(43,34,24,0.18)', borderStyle: 'dashed', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11 },
  branchItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, marginTop: 8, borderWidth: 1, borderColor: 'rgba(43,34,24,0.06)' },
  legend: { marginTop: 4, paddingHorizontal: 4 },
  legendTxt: { fontSize: 11, color: INK3, lineHeight: 17 },
});
