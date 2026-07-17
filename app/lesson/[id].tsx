import { useLocalSearchParams, useRouter } from 'expo-router';
import { Calendar, ChevronLeft, Headphones, ListChecks, Presentation, Video } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text as RNText, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { GuanStep, type GuanMedia } from '@/components/guan-step';
import { QuestionCard, type Question } from '@/components/question-card';
import { AudioPlayer } from '@/components/audio-player';
import { YouTubeFacade } from '@/components/youtube-facade';
import {
  useLessonDetail,
  useCourseDetail,
  useLessonQuestions,
  useLessonProgress,
  type LessonBlock,
  type CourseChapter,
  type CourseLessonItem,
} from '@/lib/queries/courses';
import { useSubmitFeedback } from '@/lib/mutations/feedback';
import { useStudyCohortIds, useRecordStudy, useUpsertQuestionResponse, serializeAnswer, saveLessonProgress } from '@/lib/mutations/study';
import { useCurrentUser } from '@/lib/queries/profile';
import { testIds } from '@/lib/testids';
import { bookTitle, genClientToken } from '@/lib/utils';

// 课时学修流 · 向导式(决策150/151/154/155)。覆盖大纲场景:
//   · 正式课程:听闻(音视频任一)+ 阅读法本 + 答(法本思考题=问答题) + 观修;圆满=听闻+阅读+答。
//   · 限制性课程(course_type='restricted'):自动【免答题步】,圆满=听闻+阅读。
//   · 盲人(a11y=blind):听两遍即圆满,【免看免答】;聋人(deaf):看两遍即圆满,【免听免答】(DR-92)。
//   · 已学过:「直接报圆满」补打 listen+read_notes 各 1 条。
// 数据读:useLessonDetail+useLessonQuestions(7 题型 question_type/payload)。
// 数据写:useRecordStudy RPC(DB 端归班解析+扇出)+useUpsertQuestionResponse(可改不记次数)。
// 打卡归班(DB 端):record_study() 内部解析所有在读班+urlCohortId 并入;听/读每班各一条;无班→个人表。
// useStudyCohortIds 仍保留:问答扇出(useUpsertQuestionResponse)仍需 App 端持有 cohortIds。
// 圆满自动判定 v1.0 不做(v1.0 只记原始数据供人工判·延后-4/决策017;原引用"决策46/103"经
//   2026-07-12 核查系误引,该二决策实际内容与此无关,已订正);本页只是 UX 引导+写原始打卡记录。
// 2026-07-11 核实纠正:此前这条 TODO 列的 3 件事,a11y(见下方 a11yNeeds)和补录日期选择器
//   (见下方 backdate)其实都已经接好了;真正还没做、且明确 v1.5 排期的只剩 study_records
//   圆满标记自动算(C10)。
const INK = '#2b2218';
const INK2 = '#55463a';
const INK3 = '#7e6d5b';
const SAFFRON = '#e07856';
const SAFFRON_DARK = '#b35535';
const SAFFRON_LIGHT = '#FBE5DA';
const SAGE = '#6f9a86';
const CRIMSON = '#9f3a2e'; // 颂词专用色(与科判 saffron 区分)

type Step = 'wensi' | 'fudao' | 'quiz' | 'guan';
const LABEL: Record<Step, string> = { wensi: '闻思', fudao: '法师辅导', quiz: '答题', guan: '观修' };

type TocGroup = { ch: string; lessons: { id: string; title: string; lessonNumber: number }[] };

function buildTocGroups(chapters: CourseChapter[], lessons: CourseLessonItem[]): TocGroup[] {
  if (chapters.length === 0) {
    return lessons.length > 0
      ? [{ ch: '全部课时', lessons: lessons.map((l) => ({ id: l.id, title: l.title, lessonNumber: l.lessonNumber })) }]
      : [];
  }
  const grouped = new Map<string | null, CourseLessonItem[]>();
  for (const l of lessons) {
    const k = l.chapterId;
    if (!grouped.has(k)) grouped.set(k, []);
    grouped.get(k)!.push(l);
  }
  const result: TocGroup[] = [];
  for (const ch of chapters) {
    const ls = grouped.get(ch.id) ?? [];
    if (ls.length > 0) result.push({ ch: ch.title, lessons: ls.map((l) => ({ id: l.id, title: l.title, lessonNumber: l.lessonNumber })) });
  }
  const ungrouped = grouped.get(null) ?? [];
  if (ungrouped.length > 0) result.push({ ch: '其他', lessons: ungrouped.map((l) => ({ id: l.id, title: l.title, lessonNumber: l.lessonNumber })) });
  return result;
}

export default function LessonFlow() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const sp = useLocalSearchParams<{ id: string; step?: string; a11y?: string; cohortId?: string }>();
  const lessonId = sp.id;

  const { data: lessonDetail, isLoading: lessonLoading, isError: lessonError } = useLessonDetail(lessonId);
  const { data: courseDetail } = useCourseDetail(lessonDetail?.courseId);
  const { data: rawQuestions = [], isLoading: questionsLoading, isError: questionsError } = useLessonQuestions(lessonId);
  const { data: savedProgress } = useLessonProgress(lessonId); // 续播位置(决策149·C7)，仅闻思步文字滚动
  // 打卡归班解析（多班扇出·PM 2026-06-26）：返回所有"在读且学本课"的班；URL param（本周课时入口）并入。
  // undefined=解析中；非空数组=班级模式（每班各记一条）；空数组=无班级归属（自学/课外浏览）→ 个人表。
  const { data: resolvedCohortIds } = useStudyCohortIds(lessonDetail?.courseId, sp.cohortId || undefined);
  const noCohort = resolvedCohortIds?.length === 0; // 已解析但无班级归属

  // 写库 hooks（乐观更新：先改本地状态，后台写 DB）
  const recordStudyRpc = useRecordStudy();
  const upsertResponse = useUpsertQuestionResponse();
  // 弱网幂等(2026-07-13):recordStudy是fire-and-forget、按钮也没有isPending防抖,双击/弱网重试
  // 会直接扇出2遍。⚠️ 这里不能简单按(studyType,resourceId,studyDate)算一个"全程共用"的凭证——
  // 盲生"听2遍"这个业务规则本来就要求同一天内对同一lesson合法提交2次listen,若凭证只按这三个
  // 维度算、不随"这是第几次确认"变化,第2次真实confirm会被误判成第1次的重复而被悄悄丢弹(比
  // "没做幂等"更糟,是把正当的第2遍吞掉了)。改成:reportComplete(一次性"直接报圆满",按
  // 这个key持久化才对)继续用这份按key换的Map;弹层里"标记完成"走的每一次confirm,凭证跟
  // 这次"打开弹层→确认"这个动作绑定(下方markListenToken/markReadToken,开弹层时换新),
  // 保护双击/重试但不误伤"过会儿再开一次弹层、真实第2遍"这个合法场景。
  const studyTokensRef = useRef<Map<string, string>>(new Map());
  const getStudyToken = (key: string): string => {
    let t = studyTokensRef.current.get(key);
    if (!t) { t = genClientToken(); studyTokensRef.current.set(key, t); }
    return t;
  };
  const [markListenToken, setMarkListenToken] = useState(() => genClientToken());
  const [markReadToken, setMarkReadToken] = useState(() => genClientToken());

  // a11y:profiles.accessibility_needs(真实来源);URL param 仅作测试覆盖。盲=免看免答 / 聋=免听免答。
  const me = useCurrentUser();
  const a11yNeeds = me.data?.accessibilityNeeds ?? [];
  const a11yProfile: 'blind' | 'deaf' | null = a11yNeeds.includes('blind') ? 'blind' : a11yNeeds.includes('deaf') ? 'deaf' : null;
  const a11y: 'blind' | 'deaf' | null = sp.a11y === 'blind' ? 'blind' : sp.a11y === 'deaf' ? 'deaf' : a11yProfile;
  const restricted = lessonDetail?.courseType === 'restricted';

  // 映射 DB question_type + payload → Question interface（7 题型全支持）
  const questions: Question[] = rawQuestions.map((q) => {
    const p = q.payload;
    return {
      id: q.id,
      type: q.questionType,
      gomman: q.questionType === 'open',
      prompt: q.prompt,
      options: p?.options as string[] | undefined,
      answer: p?.answer as string | undefined,
      front: p?.front as string | undefined,
      back: p?.back as string | undefined,
      tokens: p?.tokens as string[] | undefined,
      distractors: p?.distractors as string[] | undefined,
      hint: p?.hint as string | undefined,
      previousLine: p?.previousLine as string | undefined,
    };
  });
  const openQs = questions.filter((q) => q.gomman);

  const needListen = a11y !== 'deaf';
  const needRead = a11y !== 'blind';
  // 判例 tests/casebook/counting.md HQ-8:盲=听2遍/聋=看2遍即圆满。DB 权威判定见
  // supabase/migrations/20260712000200_completion_views.sql 的 v_lesson_completion 视图
  // (>=2 那两行);这里是同规则的 UX 本地镜像(向导式步骤门禁/即时反馈,不查库),数字须与该
  // 视图保持一致,改一处务必同改另一处(2026-07-16 三易审计补交叉引用,此前两处互相不知情)。
  const listenTarget = a11y === 'blind' ? 2 : 1;
  const readTarget = a11y === 'deaf' ? 2 : 1;
  // 用 lessonDetail.questionCount 决定步骤顺序（比 rawQuestions 早到）
  const hasQuiz = (lessonDetail?.questionCount ?? 0) > 0 && !a11y && !restricted;
  const order: Step[] = ['wensi', 'fudao', ...(hasQuiz ? (['quiz'] as Step[]) : []), 'guan'];

  const [cur, setCur] = useState<Step>(order.includes(sp.step as Step) ? (sp.step as Step) : 'wensi');
  const [media, setMedia] = useState<'video' | 'audio'>(a11y === 'blind' ? 'audio' : 'video');
  const [coachMedia, setCoachMedia] = useState<'video' | 'audio'>('video');
  const [guanMedia, setGuanMedia] = useState<GuanMedia>('video');
  const [coach, setCoach] = useState(0);
  const [heardN, setHeardN] = useState(0);
  const [seenN, setSeenN] = useState(0);
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [qIdx, setQIdx] = useState(0);
  const [tocOpen, setTocOpen] = useState(false);
  const [qgridOpen, setQgridOpen] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const [markOpen, setMarkOpen] = useState(false);
  // 法本纠错(审计 P0「纠错走库」·决策117/能力47):预填课程/节次上下文,写 feedback(type=text_correction)
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionText, setCorrectionText] = useState('');
  const submitCorrection = useSubmitFeedback();
  const [correctionToken, setCorrectionToken] = useState(() => genClientToken());
  const [markL, setMarkL] = useState(true);
  const [markR, setMarkR] = useState(false);
  const [backdate, setBackdate] = useState(false);
  const todayStr = new Date().toLocaleDateString('en-CA'); // 设备本地今天 YYYY-MM-DD(时区跟手机·CLAUDE.md 个人打卡口径)
  const [backDate, setBackDate] = useState(todayStr);
  const [leaveTo, setLeaveTo] = useState<Step | null>(null);
  const [leaveMiss, setLeaveMiss] = useState<string[]>([]);
  // 补录日期校验:格式合法(且非 2/31 这类被 JS 规整的假日期)且不晚于今天(信任师兄,只挡未来与乱填)
  const backDateValid = (() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(backDate)) return false;
    const [y, m, d] = backDate.split('-').map(Number);
    const dt = new Date(backDate + 'T00:00:00');
    if (Number.isNaN(dt.getTime()) || dt.getFullYear() !== y || dt.getMonth() + 1 !== m || dt.getDate() !== d) return false;
    return backDate <= todayStr;
  })();
  // 实际写库用的日期:补录开 → backDate;否则不传(mutation 默认今天)
  const effectiveStudyDate = backdate ? backDate : undefined;

  const answered = !hasQuiz || openQs.every((q) => submitted[q.id]);
  const wensiDone = (!needListen || heardN >= listenTarget) && (!needRead || seenN >= readTarget);
  const complete = wensiDone && answered;
  const prevOf = (s: Step): Step | null => { const i = order.indexOf(s); return i > 0 ? order[i - 1] : null; };
  const wensiMiss = () => [
    ...(needListen && heardN < listenTarget ? [`听闻${listenTarget > 1 ? `(共${listenTarget}遍)` : ''}`] : []),
    ...(needRead && seenN < readTarget ? [`阅读法本${readTarget > 1 ? `(共${readTarget}遍)` : ''}`] : []),
  ];
  // 进度轴跳转(补齐与「下一项」一致的软提示·PM 2026-06-26):向前跳过未完成的必修步 → 同款软提示;
  //   往回看 / 同级 / 跳到可选步(辅导)自由切,不拦(守信任师兄,只提示不硬挡)。
  const goStep = (target: Step) => {
    const forward = order.indexOf(target) > order.indexOf(cur);
    if (forward && cur === 'wensi' && !wensiDone) { setLeaveMiss(wensiMiss()); setLeaveTo(target); return; }
    if (forward && cur === 'quiz' && !answered) { setLeaveMiss([`${openQs.filter((x) => !submitted[x.id]).length} 道问答题`]); setLeaveTo(target); return; }
    setCur(target);
  };
  // 写打卡记录（乐观：不 await，后台写）。归班路由由 DB 端 record_study() 完成。
  //   resourceId：listen 带"听的是哪位讲者版本"(闻思步=resources[0] 上师版)，支撑按讲者统计；read_notes 不带。
  const recordStudy = (studyType: 'listen' | 'read_notes', resourceId?: string | null, studyDate?: string, explicitToken?: string) => {
    const clientToken = explicitToken ?? getStudyToken(`${studyType}:${resourceId ?? ''}:${studyDate ?? ''}`);
    recordStudyRpc.mutate({ lessonId, studyType, lessonResourceId: resourceId ?? null, studyDate, urlCohortId: sp.cohortId || null, clientToken });
  };

  const reportComplete = () => {
    setHeardN(listenTarget);
    setSeenN(readTarget);
    setSubmitted(Object.fromEntries(openQs.map((q) => [q.id, true])));
    // 补打卡（直接报圆满 = 各写 1 条，不代填答题）
    if (needListen) recordStudy('listen', resources[0]?.id);
    if (needRead) recordStudy('read_notes');
  };

  // 上一课 / 下一课（来自 courseDetail.lessons 有序列表）
  const allLessons = courseDetail?.lessons ?? [];
  const curLessonIdx = allLessons.findIndex((l) => l.id === lessonId);
  const prevLesson = curLessonIdx > 0 ? allLessons[curLessonIdx - 1] : null;
  const nextLesson = curLessonIdx >= 0 && curLessonIdx < allLessons.length - 1 ? allLessons[curLessonIdx + 1] : null;

  const tocGroups = buildTocGroups(courseDetail?.chapters ?? [], allLessons);
  const resources = lessonDetail?.resources ?? [];
  // 法师辅导 = 除【主讲】外的讲者。约定:resources[0](sort_order 最小)= 上师/主讲(闻思步用它);其余=辅导法师。
  //   ⚠️ DB lesson_resources 无显式「主讲/辅导」role 字段 → 全靠 sort_order 位置判,数据若没把上师排第一会判错(见下:稳健做法需加显式标记)。
  const guanRes = resources.find((r) => (r.speakerName ?? '').includes('观修')); // 观修资源(speaker_name='观修')→ 观修步
  const coachResources = resources.slice(1).filter((r) => !(r.speakerName ?? '').includes('观修')); // 法师辅导=除主讲、除观修
  const coaches = coachResources.map((r) => r.speakerName);
  // 讲记文字版归属(讲记内容模型 · 官网/ETL 线文档「讲者与版本约定」§2-3):
  //   lesson_resource_id IS NULL = 默认正文 = 上师(主讲)讲记 → 闻思步;非空 = 挂某讲者 resource 的版本(法师辅导版正文)→ 法师辅导步。
  //   「媒体看 speaker_name 行;文字看 lesson_resource_id 空非空。」修复原来不分版本、把全部块都堆给闻思(=闻思混入辅导)。
  //   ⚠️ block_order 各版本各自排、跨版本重叠 → 先按版本过滤再依序(查询已 order by block_order,过滤后版本内有序)。
  const allBlocks = lessonDetail?.blocks ?? [];
  const nullBlocks = allBlocks.filter((b) => b.lessonResourceId == null); // 上师默认讲记(原文课里=造者原典)
  // 闻思=NULL 块(上师默认讲记)。兜底:个别课若把上师文字误挂到主讲 resource(NULL 为空)→ 回退主讲 resource 的块,避免空屏。
  const primaryBlocks = nullBlocks.length > 0 ? nullBlocks : allBlocks.filter((b) => resources[0]?.id != null && b.lessonResourceId === resources[0]?.id);
  // 法师辅导=挂在该讲者 resource 上的块(纯媒体版无文字块→只给播放器)。
  const blocksForCoach = (rid: string | undefined): LessonBlock[] => (rid == null ? [] : allBlocks.filter((b) => b.lessonResourceId === rid));
  const lessonTitle = lessonDetail ? `第 ${lessonDetail.lessonNumber} 课 · ${lessonDetail.title}` : '加载中…';
  const lessonNumLabel = lessonDetail ? `第 ${lessonDetail.lessonNumber} 课` : '';
  const courseLabel = lessonDetail?.courseName ?? '课程'; // 音频主标题用课程名,法师名进副标题

  // ── 顶/底栏滚动隐藏(PM 2026-06-29):下滑沉浸阅读时收起顶部(标题+进度轴)与底部导航,上滑/回顶恢复 ──
  const scrollY = useRef(0);
  // useState 惰性初始化取代 useRef(...).current(react-hooks/refs·2026-07-17 lint债清理)。
  const [barAnim] = useState(() => new Animated.Value(0)); // 0=显示 1=隐藏
  const barShown = useRef(true);
  const [topH, setTopH] = useState(96);
  const [navH, setNavH] = useState(76);
  const showBars = (show: boolean) => {
    if (barShown.current === show) return;
    barShown.current = show;
    Animated.timing(barAnim, { toValue: show ? 0 : 1, duration: 200, useNativeDriver: true }).start();
  };
  const onScroll = (e: { nativeEvent: { contentOffset: { y: number } } }) => {
    const y = e.nativeEvent.contentOffset.y;
    const dy = y - scrollY.current;
    scrollY.current = y;
    if (cur === 'wensi' && contentH > viewportH) { // 只记闻思步(决策149·C7:表建了3周没接线,这次补上)
      wensiScrollPct.current = Math.max(0, Math.min(1, y / (contentH - viewportH)));
    }
    if (y < topH + 8) { showBars(true); return; } // 顶部区始终显示
    if (dy > 6) showBars(false);
    else if (dy < -6) showBars(true);
  };
  // 切步骤 → 恢复显示顶/底栏
  useEffect(() => { barShown.current = true; barAnim.setValue(0); }, [cur, barAnim]);
  const topTranslate = barAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -topH] });
  const navTranslate = barAnim.interpolate({ inputRange: [0, 1], outputRange: [0, navH] });

  // 续播位置(决策149·C7):进闻思步且已有记录 → 回滚到上次滚动位置(仅一次);离开页面 → 存当前位置。
  // contentH/viewportH 变化不频繁(布局/图片加载),用 state 触发 effect 重跑无性能顾虑;
  // wensiScrollPct 由高频 onScroll 驱动,维持 ref、不触发重渲染(同 scrollY 先例)。
  const [contentH, setContentH] = useState(0);
  const [viewportH, setViewportH] = useState(0);
  const wensiScrollPct = useRef(0);
  const restoredProgressRef = useRef(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const meIdRef = useRef<string | undefined>(undefined);
  // 写ref放进effect,不在渲染期间同步写(react-hooks/refs·2026-07-17 lint债清理)。
  useEffect(() => { meIdRef.current = me.data?.id; }, [me.data?.id]);
  useEffect(() => {
    if (restoredProgressRef.current || cur !== 'wensi') return;
    if (!savedProgress || savedProgress.lastMedia !== 'text') return;
    if (viewportH === 0 || contentH <= viewportH) return;
    restoredProgressRef.current = true;
    scrollViewRef.current?.scrollTo({ y: savedProgress.lastPosition * (contentH - viewportH), animated: false });
  }, [savedProgress, cur, contentH, viewportH]);
  useEffect(() => {
    return () => {
      const uid = meIdRef.current;
      if (uid && lessonId && wensiScrollPct.current > 0) saveLessonProgress(uid, lessonId, wensiScrollPct.current);
    };
  }, [lessonId]);

  if (lessonLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF4E9', alignItems: 'center', justifyContent: 'center' }} edges={['top']}>
        <ActivityIndicator color={SAFFRON} size="large" />
      </SafeAreaView>
    );
  }

  if (lessonError) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF4E9', alignItems: 'center', justifyContent: 'center', padding: 24 }} edges={['top']}>
        <RNText style={{ fontSize: 14, color: CRIMSON, textAlign: 'center' }}>加载失败，请检查网络后重试</RNText>
      </SafeAreaView>
    );
  }

  if (!lessonDetail) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF4E9', alignItems: 'center', justifyContent: 'center', padding: 24 }} edges={['top']}>
        <RNText style={{ fontSize: 14, color: INK3, textAlign: 'center' }}>找不到该课时</RNText>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView role="main" style={{ flex: 1, backgroundColor: '#FBF4E9' }} edges={['top']}>
      {/* 顶栏浮层(下滑隐藏 · 上滑/回顶显示·PM 2026-06-29):标题 + 提示条 + 进度轴 */}
      <Animated.View
        onLayout={(e) => setTopH(e.nativeEvent.layout.height)}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, backgroundColor: '#FBF4E9', transform: [{ translateY: topTranslate }] }}>
      <View style={styles.top}>
        <Pressable hitSlop={8} onPress={() => router.back()}><ChevronLeft size={24} color={INK} /></Pressable>
        <Text className="font-serif" style={{ flex: 1, fontSize: 16, fontWeight: '700', color: INK, textAlign: 'center' }} numberOfLines={1}>{lessonTitle}</Text>
        <Pressable hitSlop={8} onPress={() => setTocOpen(true)} style={styles.tocBtn}><ListChecks size={15} color={INK2} /><RNText style={{ fontSize: 12, color: INK2, fontWeight: '600' }}>目录</RNText></Pressable>
      </View>

      {/* 课程类型/身份提示条 */}
      {(restricted || a11y) ? (
        <View style={styles.banner}>
          <RNText style={{ fontSize: 12, color: SAFFRON_DARK, fontWeight: '600' }}>
            {restricted ? '限制性课程:只需 听闻 + 阅读(免答题、不计考试)' : a11y === 'blind' ? '无障碍:听两遍即圆满(免看、免答)' : '无障碍:看两遍即圆满(免听、免答)'}
          </RNText>
        </View>
      ) : null}
      {/* 个人学修提示(本课无班级归属:自学无班 / 课外浏览·决策183:听读完成计入个人足迹、不计班级) */}
      {noCohort ? (
        <View style={[styles.banner, { backgroundColor: 'rgba(43,34,24,0.06)' }]}>
          <RNText style={{ fontSize: 12, color: INK3, fontWeight: '600' }}>个人学修 · 本课不在您的在读班级 · 完成计入个人足迹(不计班级)</RNText>
        </View>
      ) : null}

      {/* 步骤进度条(动态:限制性/盲聋无答题步) */}
      <View style={styles.steps}>
        {order.map((s, i) => (
          <View key={s} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Pressable onPress={() => goStep(s)} style={[styles.sdot, cur === s && { backgroundColor: SAFFRON_DARK }]}>
              <RNText style={{ fontSize: 13, fontWeight: '700', color: cur === s ? '#fff' : INK3 }}>{LABEL[s][0]}</RNText>
            </Pressable>
            {i < order.length - 1 ? <View style={styles.sline} /> : null}
          </View>
        ))}
        <View style={{ flex: 1 }} />
        {cur === 'wensi' && needListen && a11y !== 'blind' ? (
          <MediaToggle value={media} onChange={setMedia} options={[
            { value: 'video', icon: <Video size={15} color={media === 'video' ? '#fff' : INK2} />, label: '视频' },
            { value: 'audio', icon: <Headphones size={15} color={media === 'audio' ? '#fff' : INK2} />, label: '音频' },
          ]} />
        ) : cur === 'fudao' && coaches.length > 0 ? (
          <MediaToggle value={coachMedia} onChange={setCoachMedia} options={[
            { value: 'video', icon: <Video size={15} color={coachMedia === 'video' ? '#fff' : INK2} />, label: '视频' },
            { value: 'audio', icon: <Headphones size={15} color={coachMedia === 'audio' ? '#fff' : INK2} />, label: '音频' },
          ]} />
        ) : cur === 'guan' ? (
          // 观修切换挪进度轴同行、最右对齐,与闻思/法师辅导排布一致(PM 2026-07-01);只留视频/课件(音频/引导文已去掉)。
          <MediaToggle value={guanMedia} onChange={setGuanMedia} options={[
            { value: 'video', icon: <Video size={15} color={guanMedia === 'video' ? '#fff' : INK2} />, label: '视频' },
            { value: 'ppt', icon: <Presentation size={15} color={guanMedia === 'ppt' ? '#fff' : INK2} />, label: '课件' },
          ]} />
        ) : (
          <RNText style={{ fontSize: 13, color: INK3 }}>{LABEL[cur]}{cur === 'fudao' ? '(可选)' : ''}</RNText>
        )}
      </View>
      </Animated.View>

      <ScrollView
        ref={scrollViewRef}
        style={{ flex: 1 }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onLayout={(e) => setViewportH(e.nativeEvent.layout.height)}
        onContentSizeChange={(_w, h) => setContentH(h)}
        contentContainerStyle={{ paddingTop: topH + 12, paddingHorizontal: 16, paddingBottom: navH + 24, gap: 14 }}>
        {cur === 'wensi' ? (
          <>
            {needListen ? <MediaArea media={media} who={resources[0]?.speakerName ?? '上师讲记'} courseName={courseLabel} videoId={resources[0]?.videoId} audioUrl={resources[0]?.audioUrl} audioOnly={a11y === 'blind'} lessonLabel={lessonNumLabel} /> : null}
            {needRead ? <FaBen blocks={primaryBlocks} /> : null}
            {needRead ? (
              <Pressable onPress={() => { setCorrectionToken(genClientToken()); setCorrectionOpen(true); }} style={{ alignSelf: 'flex-end', paddingVertical: 2 }}>
                <RNText style={{ fontSize: 12, color: INK3, textDecorationLine: 'underline' }}>发现法本有误?纠错</RNText>
              </Pressable>
            ) : null}
            <RNText style={{ fontSize: 12, color: INK3 }}>
              {needListen ? `听闻 ${heardN}/${listenTarget}` : ''}{needListen && needRead ? ' · ' : ''}{needRead ? `阅读 ${seenN}/${readTarget}` : ''}
              {hasQuiz ? '(圆满需 听闻 + 阅读 + 答)' : '(圆满需 听闻 + 阅读)'}
            </RNText>
            <Pressable testID={testIds.lesson.markCompleteButton} style={styles.mark} onPress={() => { setMarkL(needListen); setMarkR(a11y === 'deaf'); setBackdate(false); setMarkOpen(true); setMarkListenToken(genClientToken()); setMarkReadToken(genClientToken()); }}>
              <RNText style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>标记完成</RNText>
            </Pressable>
            <Pressable onPress={reportComplete} style={{ paddingVertical: 8 }}>
              <RNText style={{ fontSize: 13, color: SAFFRON_DARK, fontWeight: '700', textAlign: 'center' }}>已学过本课? 直接报圆满 ›</RNText>
            </Pressable>
          </>
        ) : cur === 'fudao' ? (
          <>
            <RNText style={{ fontSize: 12, color: INK3 }}>法师辅导为可选,不计入圆满。</RNText>
            {coaches.length > 0 ? (
              <View style={styles.speakerRow}>
                {coaches.map((c, i) => (
                  <Pressable key={`${c}-${i}`} onPress={() => setCoach(i)} style={[styles.chip, coach === i && styles.chipOn]}>
                    <RNText style={{ fontSize: 12, fontWeight: '600', color: coach === i ? '#fff' : INK2 }}>{c}</RNText>
                  </Pressable>
                ))}
              </View>
            ) : (
              <RNText style={{ fontSize: 13, color: INK3 }}>本课暂无辅导视频/音频</RNText>
            )}
            {coaches.length > 0 ? (() => {
              const ci = Math.min(coach, coachResources.length - 1);
              const cr = coachResources[ci];
              const coachBlocks = blocksForCoach(cr?.id); // 该辅导法师版正文(挂其 resource 的块);纯媒体版无文字块→只给播放器
              return (
                <>
                  <MediaArea media={coachMedia} who={coaches[ci]} courseName={courseLabel} videoId={cr?.videoId} audioUrl={cr?.audioUrl} audioOnly={false} lessonLabel={lessonNumLabel} />
                  {coachBlocks.length > 0 ? (
                    <FaBen blocks={coachBlocks} />
                  ) : (
                    <RNText style={{ fontSize: 12, color: INK3 }}>本课辅导法师暂无文字讲记(请观看上方视频/音频);法本原文在「上师学习」一步阅读。</RNText>
                  )}
                </>
              );
            })() : null}
          </>
        ) : cur === 'quiz' ? (
          (() => {
            if (questions.length === 0) {
              if (questionsLoading) {
                return <View style={{ alignItems: 'center', paddingVertical: 40 }}><ActivityIndicator color={SAFFRON} /></View>;
              }
              // hasQuiz 已保证 questionCount>0 才会进这一步；走到这仍空 = 加载失败或数据不一致，不是"本课确实无题"。
              return (
                <View style={{ alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24 }}>
                  <RNText style={{ fontSize: 13, color: questionsError ? CRIMSON : INK3, textAlign: 'center' }}>
                    {questionsError ? '题目加载失败，请检查网络后重试' : '题目暂未加载到，请返回重试或联系辅导员'}
                  </RNText>
                </View>
              );
            }
            const boundIdx = Math.min(qIdx, questions.length - 1);
            const q = questions[boundIdx];
            return (
              <View style={{ gap: 12 }}>
                <View className="flex-row items-center justify-between">
                  <RNText style={{ fontSize: 13, color: INK2, fontWeight: '600' }}>第 {boundIdx + 1} / {questions.length} 题</RNText>
                  <Pressable style={styles.tocBtn} onPress={() => setQgridOpen(true)}><ListChecks size={15} color={INK2} /><RNText style={{ fontSize: 12, color: INK2, fontWeight: '600' }}>题号</RNText></Pressable>
                </View>
                <QuestionCard
                  q={q}
                  submitted={!!submitted[q.id]}
                  value={draft[q.id]}
                  onChange={(v) => setDraft((d) => ({ ...d, [q.id]: v }))}
                  onSubmit={() => {
                    setSubmitted((s) => ({ ...s, [q.id]: true }));
                    // 答题持久化(决策002/135/183 rule5 + 184 多班扇出):解析中(undefined)不写;
                    // 否则扇出到所有在读且学本课的班(空=NULL 自学)——RLS 按班放行主麦,只记主班会让次要班主麦看不到答案。
                    if (resolvedCohortIds !== undefined) {
                      const { answerText, answerPayload } = serializeAnswer(q.type, draft[q.id]);
                      upsertResponse.mutate({ questionId: q.id, cohortIds: resolvedCohortIds, answerText, answerPayload });
                    }
                  }}
                />
                <View className="flex-row items-center justify-between" style={{ marginTop: 2 }}>
                  <Pressable disabled={boundIdx === 0} onPress={() => setQIdx((i) => Math.max(0, i - 1))} style={[styles.qNav, boundIdx === 0 && { opacity: 0.4 }]}><RNText style={styles.qNavTxt}>‹ 上一题</RNText></Pressable>
                  <Pressable disabled={boundIdx === questions.length - 1} onPress={() => setQIdx((i) => Math.min(questions.length - 1, i + 1))} style={[styles.qNav, boundIdx === questions.length - 1 && { opacity: 0.4 }]}><RNText style={styles.qNavTxt}>下一题 ›</RNText></Pressable>
                </View>
                <RNText style={{ fontSize: 11, color: INK3 }}>圆满只看&ldquo;问答题(法本思考题)&rdquo;全部提交;其余题型为练习、不计圆满。</RNText>
              </View>
            );
          })()
        ) : (
          <GuanStep lessonId={lessonId} media={guanMedia} videoId={guanRes?.videoId ?? undefined} downloadUrl={guanRes?.downloadUrl} slideImageUrls={guanRes?.slideImageUrls} />
        )}
      </ScrollView>

      {/* 底部导航(动态 order · 可随滚动隐藏) */}
      <Animated.View
        onLayout={(e) => setNavH(e.nativeEvent.layout.height)}
        style={[styles.nav, { position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: insets.bottom + 12, transform: [{ translateY: navTranslate }] }]}>
        {cur === 'wensi' ? (
          <Pressable style={styles.navGhost} onPress={() => {
            if (prevLesson) router.replace(`/lesson/${prevLesson.id}?step=wensi` as never);
            else router.back();
          }}>
            <RNText style={{ fontWeight: '700', fontSize: 14, color: SAFFRON_DARK }}>‹ {prevLesson ? '上一课' : '返回'}</RNText>
          </Pressable>
        ) : (
          <Pressable style={styles.navGhost} onPress={() => { const p = prevOf(cur); if (p) setCur(p); }}>
            <RNText style={{ fontWeight: '700', fontSize: 14, color: SAFFRON_DARK }}>‹ 上一步</RNText>
          </Pressable>
        )}
        {cur === 'wensi' ? (
          <Pressable style={styles.navPrimary} onPress={() => { if (!wensiDone) { setLeaveMiss(wensiMiss()); setLeaveTo('fudao'); } else setCur('fudao'); }}><RNText style={styles.navPrimaryTxt}>去法师辅导</RNText></Pressable>
        ) : cur === 'fudao' ? (
          <Pressable style={styles.navPrimary} onPress={() => setCur(hasQuiz ? 'quiz' : 'guan')}><RNText style={styles.navPrimaryTxt}>{hasQuiz ? '去答题' : '去观修'}</RNText></Pressable>
        ) : cur === 'quiz' ? (
          <Pressable style={styles.navPrimary} onPress={() => { if (!answered) { setLeaveMiss([`${openQs.filter((x) => !submitted[x.id]).length} 道问答题`]); setLeaveTo('guan'); } else setCur('guan'); }}><RNText style={styles.navPrimaryTxt}>去观修</RNText></Pressable>
        ) : (
          <Pressable style={styles.navPrimary} onPress={() => setGateOpen(true)}><RNText style={styles.navPrimaryTxt}>完成 · 下一课</RNText></Pressable>
        )}
      </Animated.View>

      {/* 目录(章节 + 课时，点课时跳转 /lesson/[id]) */}
      <Modal visible={tocOpen} transparent animationType="slide" onRequestClose={() => setTocOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setTocOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} onPress={() => {}}>
            <View style={styles.handle} />
            <Text className="font-serif" style={{ fontSize: 17, fontWeight: '700', color: INK, marginBottom: 10 }}>目录</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {tocGroups.length === 0 ? (
                <RNText style={{ fontSize: 13, color: INK3 }}>暂无课时目录</RNText>
              ) : (
                tocGroups.map((g) => (
                  <View key={g.ch} style={{ marginBottom: 10 }}>
                    <RNText style={{ fontSize: 13, fontWeight: '700', color: INK2, marginBottom: 4 }}>{g.ch}</RNText>
                    {g.lessons.map((l) => (
                      <Pressable
                        key={l.id}
                        style={[styles.tocRow, l.id === lessonId && { borderColor: SAFFRON, backgroundColor: '#FBE5DA' }]}
                        onPress={() => { setTocOpen(false); if (l.id !== lessonId) router.replace(`/lesson/${l.id}?step=wensi` as never); }}
                      >
                        <RNText style={{ fontSize: 14, color: l.id === lessonId ? SAFFRON_DARK : INK }}>{l.lessonNumber}. {l.title}</RNText>
                      </Pressable>
                    ))}
                  </View>
                ))
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 题号网格 */}
      <Modal visible={qgridOpen} transparent animationType="fade" onRequestClose={() => setQgridOpen(false)}>
        <Pressable style={styles.dimmer} onPress={() => setQgridOpen(false)}>
          <Pressable style={styles.dialog} onPress={() => {}}>
            <Text className="font-serif" style={{ fontSize: 16, fontWeight: '700', color: INK, marginBottom: 12 }}>题号</Text>
            <View className="flex-row" style={{ flexWrap: 'wrap', gap: 10 }}>
              {questions.map((q, i) => (
                <Pressable key={q.id} onPress={() => { setQIdx(i); setQgridOpen(false); }} style={[styles.qcell, submitted[q.id] ? { backgroundColor: SAGE, borderColor: SAGE } : q.gomman ? { borderColor: SAFFRON } : null]}>
                  <RNText style={{ fontSize: 14, fontWeight: '700', color: submitted[q.id] ? '#fff' : INK }}>{i + 1}</RNText>
                </Pressable>
              ))}
            </View>
            <RNText style={{ fontSize: 11, color: INK3, marginTop: 12 }}>绿=已提交;橙框=问答题(计圆满)未答;无框=练习题。</RNText>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 完成确认(听闻/阅读 + 补录日期) */}
      {/* animationType 分平台(2026-07-17 PM"没有展开动画"折中方案,同quick-count-sheet.tsx):
          问题只在web——react-native-web的Modal动画期间aria-modal先于role="dialog"~250ms挂上,
          axe-core判定critical(A7无障碍扫描2026-07-14发现);原生端不走这套web ARIA机制,恢复动画。 */}
      <Modal aria-label="标记完成确认" visible={markOpen} transparent animationType={Platform.OS === 'web' ? 'none' : 'slide'} onRequestClose={() => setMarkOpen(false)}>
        {/* KeyboardAvoidingView(2026-07-17·PM真机反馈键盘挡住弹层输入框,全app排查后补齐) */}
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <Pressable style={styles.backdrop} onPress={() => setMarkOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} onPress={() => {}}>
            <View style={styles.handle} />
            <Text className="font-serif" style={{ fontSize: 17, fontWeight: '700', color: INK }}>确认本遍完成</Text>
            <RNText style={{ fontSize: 12, color: INK3, marginTop: 2, marginBottom: 12 }}>勾选这一遍完成的项目</RNText>
            {needListen ? <CheckRow checked={markL} onPress={() => setMarkL((v) => !v)} label="视频 / 音频(听闻)" /> : null}
            {needRead ? <CheckRow checked={markR} onPress={() => setMarkR((v) => !v)} label="法本阅读" /> : null}
            <Pressable style={styles.backRow} onPress={() => setBackdate((v) => !v)}>
              <Calendar size={14} color={backdate ? SAFFRON_DARK : INK3} /><RNText style={{ fontSize: 12, color: backdate ? SAFFRON_DARK : INK3 }}>完成日期:{backdate ? '补录(填真实过去日期)' : '今天'}</RNText>
            </Pressable>
            {backdate ? (
              <View style={{ marginTop: 8 }}>
                <TextInput
                  value={backDate}
                  onChangeText={setBackDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={INK3}
                  autoCapitalize="none"
                  keyboardType="numbers-and-punctuation"
                  maxLength={10}
                  style={[styles.dateInput, !backDateValid && { borderColor: CRIMSON }]}
                />
                <RNText style={{ fontSize: 11, color: backDateValid ? INK3 : CRIMSON, marginTop: 4 }}>
                  {backDateValid ? '填实际完成那天(不晚于今天),即时计入对应日。' : '日期需为 YYYY-MM-DD 且不晚于今天。'}
                </RNText>
              </View>
            ) : null}
            <Pressable testID={testIds.lesson.markConfirmButton} style={[styles.mark, { marginTop: 12 }, ((!markL && !markR) || (backdate && !backDateValid)) && { opacity: 0.4 }]} disabled={(!markL && !markR) || (backdate && !backDateValid)} onPress={() => {
              if (markL) { setHeardN((n) => n + 1); recordStudy('listen', resources[0]?.id, effectiveStudyDate, markListenToken); }
              if (markR) { setSeenN((n) => n + 1); recordStudy('read_notes', undefined, effectiveStudyDate, markReadToken); }
              setMarkOpen(false);
            }}>
              <RNText style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>确认</RNText>
            </Pressable>
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* 法本纠错(写 feedback 表·预填课程节次上下文) */}
      <Modal visible={correctionOpen} transparent animationType="slide" onRequestClose={() => setCorrectionOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <Pressable style={styles.backdrop} onPress={() => setCorrectionOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} onPress={() => {}}>
            <View style={styles.handle} />
            <Text className="font-serif" style={{ fontSize: 17, fontWeight: '700', color: INK }}>法本纠错</Text>
            <RNText style={{ fontSize: 12, color: INK3, marginTop: 2, marginBottom: 12 }}>
              {courseLabel} · {lessonNumLabel || '本节'}——写明哪一段、错在哪,管理员核对后修正。
            </RNText>
            <TextInput
              value={correctionText}
              onChangeText={setCorrectionText}
              placeholder="例:「皈依境」一段第 3 行,『金刚萨埵』误作『金刚萨垛』…"
              placeholderTextColor={INK3}
              multiline
              style={styles.correctionInput}
            />
            <Pressable
              style={[styles.mark, { marginTop: 12 }, (!correctionText.trim() || submitCorrection.isPending) && { opacity: 0.4 }]}
              disabled={!correctionText.trim() || submitCorrection.isPending}
              onPress={() => {
                submitCorrection.mutate(
                  { type: 'text_correction', content: `【${courseLabel} · ${lessonNumLabel || '本节'} · 法本纠错】\n${correctionText.trim()}`, clientToken: correctionToken },
                  { onSuccess: () => { setCorrectionOpen(false); setCorrectionText(''); } },
                );
              }}
            >
              <RNText style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{submitCorrection.isPending ? '提交中…' : '提交纠错'}</RNText>
            </Pressable>
            {submitCorrection.isError ? <RNText style={{ fontSize: 11, color: SAFFRON_DARK, marginTop: 8, textAlign: 'center' }}>提交失败,请重试。</RNText> : null}
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* 前进未完成软提示 */}
      <Modal visible={!!leaveTo} transparent animationType="fade" onRequestClose={() => setLeaveTo(null)}>
        <Pressable style={styles.dimmer} onPress={() => setLeaveTo(null)}>
          <Pressable style={styles.dialog} onPress={() => {}}>
            <RNText style={{ fontSize: 17, fontWeight: '700', color: SAFFRON_DARK, textAlign: 'center' }}>本步还没圆满</RNText>
            <RNText style={{ fontSize: 13, color: INK2, textAlign: 'center', marginTop: 8 }}>还差:{leaveMiss.join('、')}。</RNText>
            <RNText style={{ fontSize: 11, color: INK3, textAlign: 'center', marginTop: 4 }}>可现在补,也可稍后(课末仍会提醒)。</RNText>
            <Pressable style={[styles.mark, { marginTop: 16 }]} onPress={() => setLeaveTo(null)}><RNText style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>去完成</RNText></Pressable>
            <Pressable onPress={() => { const t = leaveTo; setLeaveTo(null); if (t) setCur(t); }} style={{ paddingVertical: 12 }}><RNText style={{ color: INK3, textAlign: 'center', fontSize: 13 }}>仍然离开</RNText></Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 圆满检查 */}
      <Modal visible={gateOpen} transparent animationType="fade" onRequestClose={() => setGateOpen(false)}>
        <Pressable style={styles.dimmer} onPress={() => setGateOpen(false)}>
          <Pressable style={styles.dialog} onPress={() => {}}>
            {complete ? (
              <>
                <RNText style={{ fontSize: 18, fontWeight: '700', color: SAGE, textAlign: 'center' }}>本课已圆满 ✓</RNText>
                <RNText style={{ fontSize: 12, color: INK3, textAlign: 'center', marginTop: 4 }}>
                  {a11y === 'blind' ? '听两遍 ✓(免看免答)' : a11y === 'deaf' ? '看两遍 ✓(免听免答)' : hasQuiz ? '听闻 ✓ · 阅读 ✓ · 答 ✓' : '听闻 ✓ · 阅读 ✓(限制性课程·免答)'}
                </RNText>
                {nextLesson ? (
                  <View style={styles.nextCard}>
                    <RNText style={{ fontSize: 11, color: INK3 }}>下一课</RNText>
                    <Text className="font-serif" style={{ fontSize: 16, fontWeight: '700', color: INK, marginTop: 2 }}>第 {nextLesson.lessonNumber} 课 · {nextLesson.title}</Text>
                  </View>
                ) : (
                  <View style={styles.nextCard}>
                    <RNText style={{ fontSize: 11, color: INK3 }}>这是本课程最后一课</RNText>
                    <Text className="font-serif" style={{ fontSize: 14, color: INK, marginTop: 4 }}>恭喜完成全部课时 🙏</Text>
                  </View>
                )}
                <Pressable style={styles.mark} onPress={() => {
                  setGateOpen(false);
                  if (nextLesson) router.replace(`/lesson/${nextLesson.id}?step=wensi` as never);
                  else if (lessonDetail?.courseId) router.replace(`/course/${lessonDetail.courseId}` as never);
                  else router.back();
                }}>
                  <RNText style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{nextLesson ? '进入下一课' : '返回课程'}</RNText>
                </Pressable>
                <Pressable onPress={() => setGateOpen(false)} style={{ paddingVertical: 10 }}><RNText style={{ color: INK3, textAlign: 'center', fontSize: 13 }}>留在本课</RNText></Pressable>
              </>
            ) : (
              <>
                <RNText style={{ fontSize: 18, fontWeight: '700', color: SAFFRON_DARK, textAlign: 'center' }}>本课尚未圆满</RNText>
                <RNText style={{ fontSize: 12, color: INK3, textAlign: 'center', marginTop: 4 }}>还差:</RNText>
                <View style={{ gap: 8, marginTop: 12 }}>
                  {wensiMiss().map((m) => <GateMiss key={m} label={`${m}(未完成)`} onPress={() => { setGateOpen(false); setCur('wensi'); }} />)}
                  {hasQuiz && !answered ? (
                    <GateMiss
                      label={`答思考题(还有 ${openQs.filter((x) => !submitted[x.id]).length} 道问答题)`}
                      onPress={() => {
                        setGateOpen(false);
                        setCur('quiz');
                        const fi = questions.findIndex((x) => x.gomman && !submitted[x.id]);
                        if (fi >= 0) setQIdx(fi);
                      }}
                    />
                  ) : null}
                </View>
                <Pressable onPress={() => {
                  setGateOpen(false);
                  if (nextLesson) router.replace(`/lesson/${nextLesson.id}?step=wensi` as never);
                  else if (lessonDetail?.courseId) router.replace(`/course/${lessonDetail.courseId}` as never);
                  else router.back();
                }} style={{ paddingVertical: 12, marginTop: 4 }}><RNText style={{ color: INK3, textAlign: 'center', fontSize: 13 }}>稍后再说 · 先去下一课</RNText></Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function GateMiss({ label, onPress }: { label: string; onPress: () => void }) {
  return (<Pressable style={styles.gateMiss} onPress={onPress}><RNText style={{ flex: 1, fontSize: 14, color: INK }}>{label}</RNText><RNText style={{ fontSize: 13, fontWeight: '700', color: SAFFRON_DARK }}>去完成 ›</RNText></Pressable>);
}
function CheckRow({ checked, onPress, label }: { checked: boolean; onPress: () => void; label: string }) {
  return (<Pressable style={styles.checkRow} onPress={onPress}><View style={[styles.checkBox, checked && { backgroundColor: SAFFRON, borderColor: SAFFRON }]}>{checked ? <RNText style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>✓</RNText> : null}</View><RNText style={{ fontSize: 15, color: INK }}>{label}</RNText></Pressable>);
}
// 媒体段切换:放进度轴行最右侧(闻思=视频/音频、法师辅导=视频/音频、观修=视频/课件,三处共用同一套样式)。
function MediaToggle<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; icon: React.ReactNode; label: string }[] }) {
  return (
    <View style={styles.segToggle}>
      {options.map((opt) => (
        <Pressable key={opt.value} onPress={() => onChange(opt.value)} style={[styles.segToggleBtn, value === opt.value && styles.segToggleOn]}>
          {opt.icon}<RNText style={{ fontSize: 13, fontWeight: '700', color: value === opt.value ? '#fff' : INK2 }}>{opt.label}</RNText>
        </Pressable>
      ))}
    </View>
  );
}
function MediaArea({ media, who, courseName, videoId, audioUrl, audioOnly, lessonLabel }: { media: 'video' | 'audio'; who: string; courseName: string; videoId?: string | null; audioUrl?: string | null; audioOnly: boolean; lessonLabel: string }) {
  const m = audioOnly ? 'audio' : media;
  return (
    <View style={{ gap: 10 }}>
      {m === 'video' ? (
        <YouTubeFacade videoId={videoId ?? undefined} title={videoId ? `${who} · 点击播放` : `${who} · 暂无视频`} />
      ) : audioUrl ? (
        <AudioPlayer url={audioUrl} title={`${bookTitle(courseName)} · ${lessonLabel}`} subtitle={who} />
      ) : (
        <View style={styles.player}><View style={styles.pcover}><Headphones size={20} color={SAFFRON_DARK} /></View><View style={{ flex: 1 }}><RNText style={{ fontSize: 13, fontWeight: '700', color: INK }} numberOfLines={1}>{who} · {lessonLabel}</RNText><RNText style={{ fontSize: 11, color: INK3 }}>暂无音频</RNText></View></View>
      )}
    </View>
  );
}
// ETL 少数讲记段落夹带了源文档(Word/WPS)富文本另存为网页时残留的 HTML 标签(如 <p style='...'><SPAN ...>正文</span></p>),
//   直接显示等于把标签当正文渲染出来(PM 2026-07-02 反馈"法本正文显示了代码")。查库确认仅个别课(76/187607 块,
//   集中在单一讲者版本)受影响,非普遍问题;这里做渲染层兜底清洗,不改 lesson_blocks 源数据/schema(官网/ETL 线所有)。
const stripHtml = (s: string | null): string => (s ?? '').replace(/<\/?[a-zA-Z][^>]*>/g, '').trim();

function FaBen({ blocks }: { blocks: LessonBlock[] }) {
  if (blocks.length === 0) {
    return (
      <View style={{ gap: 6 }}>
        <RNText style={{ fontSize: 12, color: SAFFRON_DARK, fontWeight: '700' }}>法本讲记</RNText>
        <RNText className="font-serif" style={{ fontSize: 16, lineHeight: 28, color: INK }}>法本讲记正文(由 ETL 线导入,待内容导入后显示)</RNText>
      </View>
    );
  }
  // 对齐官网结构:只把思考题(question)置顶;其余块(顶礼/祈祷/科判/正文)保持自然块序。
  //   ⚠️ 之前把 homage 也一律前置=做过头:正文里的顶礼/译礼会被拽到最顶,官网并不在那个位置(决策189 修正)。
  //   ⚠️ ETL block_order 在版本内仍有重复 → 非思考题块的内部顺序仍可能不稳,根治需 ETL 修块序号唯一。
  const questions = blocks.filter((b) => b.blockType === 'question');
  const nonQuestions = blocks.filter((b) => b.blockType !== 'question');
  const ordered = [...questions, ...nonQuestions];
  return (
    <View style={{ gap: 4 }}>
      {ordered.map((b) => {
        const cleanText = stripHtml(b.text);
        // 科判:序号+标题加粗醒目(saffron 橙)+ 分支(分二:一、…)小字;按层级轻缩进(对齐官网重点显示)
        if (b.blockType === 'kepan') {
          const indent = Math.min(Math.max((b.kepanLevel ?? 1) - 1, 0), 4) * 10;
          return (
            <View key={b.id} style={{ marginLeft: indent, marginTop: 10, marginBottom: 2 }}>
              <Text className="font-serif" style={{ fontSize: 19, fontWeight: '700', color: SAFFRON_DARK }}>{[b.kepanMark, b.kepanTitle].filter(Boolean).join('  ') || cleanText}</Text>
              {b.kepanSplit ? <RNText style={{ fontSize: 14, color: INK3, marginTop: 2 }}>{b.kepanSplit}</RNText> : null}
            </View>
          );
        }
        // 颂词/发愿/回向/顶礼:韵文,crimson 红(与科判橙区分)+ 左竖线 + 缩进,独立段落
        if (b.blockType === 'verse' || b.blockType === 'aspiration' || b.blockType === 'dedication' || b.blockType === 'homage') {
          return (
            <View key={b.id} style={styles.verseBlock}>
              <Text className="font-serif" style={{ fontSize: 19, lineHeight: 34, color: CRIMSON, fontWeight: '600' }}>{cleanText}</Text>
            </View>
          );
        }
        // 思考题:醒目框(与正文区分;答题在「答题」步,这里是法本里的预览)。
        //   编号改按本课顺序 1、2、3…(原文自带全书连续编号如"365、",PM 2026-07-02 要求按课重排)。
        if (b.blockType === 'question') {
          const qIndex = questions.findIndex((q) => q.id === b.id) + 1;
          const qText = cleanText.replace(/^\d+[、.。，,]\s*/, '');
          return (
            <View key={b.id} style={styles.questionBlock}>
              <RNText style={{ fontSize: 12, fontWeight: '700', color: SAGE, marginBottom: 3, letterSpacing: 1 }}>思考题</RNText>
              <Text className="font-serif" style={{ fontSize: 17, lineHeight: 29, color: INK }}>{qIndex}、{qText}</Text>
            </View>
          );
        }
        // 小标题(「思考题」标题已由 question 框承担,这里跳过避免重复)
        if (b.blockType === 'inline_heading' || b.blockType === 'title') {
          if (cleanText === '思考题') return null;
          return (
            <Text key={b.id} className="font-serif" style={{ fontSize: 18, fontWeight: '700', color: INK2, marginTop: 6 }}>{[b.headingMark, cleanText].filter(Boolean).join(' ')}</Text>
          );
        }
        // 正文讲解(body/footnote 等)
        return (
          <Text key={b.id} className="font-serif" style={{ fontSize: 18, lineHeight: 31, color: INK }}>{cleanText}</Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  correctionInput: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(43,34,24,0.12)', padding: 12, fontSize: 14, color: INK, minHeight: 100, textAlignVertical: 'top' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  tocBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 9999, backgroundColor: 'rgba(43,34,24,0.06)' },
  banner: { marginHorizontal: 16, marginBottom: 8, padding: 10, borderRadius: 10, backgroundColor: '#FBE5DA' },
  steps: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12 },
  sdot: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(43,34,24,0.06)', alignItems: 'center', justifyContent: 'center' },
  sline: { width: 22, height: 2.5, backgroundColor: 'rgba(43,34,24,0.12)' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)' },
  dateInput: { borderWidth: 1, borderColor: 'rgba(43,34,24,0.18)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 15, color: INK, backgroundColor: '#fff' },
  segToggle: { flexDirection: 'row', gap: 4, backgroundColor: 'rgba(43,34,24,0.05)', borderRadius: 9999, padding: 4 },
  segToggleBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 13, paddingVertical: 7, borderRadius: 9999 },
  segToggleOn: { backgroundColor: SAFFRON },
  video: { height: 200, borderRadius: 12, backgroundColor: '#3a3024', alignItems: 'center', justifyContent: 'center' },
  playBubble: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(224,120,86,0.92)', alignItems: 'center', justifyContent: 'center' },
  player: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, backgroundColor: '#FBE5DA', borderWidth: 1, borderColor: 'rgba(224,120,86,0.3)' },
  pcover: { width: 46, height: 46, borderRadius: 10, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  verseBlock: { marginVertical: 4, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: 'rgba(224,120,86,0.45)' },
  questionBlock: { marginVertical: 6, padding: 12, borderRadius: 10, backgroundColor: 'rgba(111,154,134,0.08)', borderWidth: 1, borderColor: 'rgba(111,154,134,0.3)' },
  mark: { paddingVertical: 12, borderRadius: 12, backgroundColor: SAFFRON, alignItems: 'center' },
  qNav: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 9999, backgroundColor: SAFFRON_LIGHT },
  qNavTxt: { fontSize: 14, color: SAFFRON_DARK, fontWeight: '700' },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, alignSelf: 'flex-start' },
  box: { height: 168, borderRadius: 12, backgroundColor: '#3a3024', alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  boxTxt: { color: '#fff', marginTop: 6, fontSize: 12 },
  sit: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, paddingVertical: 12, borderRadius: 12, backgroundColor: SAFFRON },
  speakerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9999, backgroundColor: 'rgba(43,34,24,0.06)' },
  chipOn: { backgroundColor: SAFFRON_DARK },
  nav: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(43,34,24,0.08)', backgroundColor: '#FBF4E9' },
  navGhost: { paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(224,120,86,0.4)' },
  navPrimary: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 12, backgroundColor: SAFFRON },
  navPrimaryTxt: { fontWeight: '700', fontSize: 14, color: '#fff' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FBF4E9', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 14 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(43,34,24,0.18)', alignSelf: 'center', marginBottom: 12 },
  tocRow: { paddingVertical: 11, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#fff', marginBottom: 6, borderWidth: 1, borderColor: 'rgba(43,34,24,0.06)' },
  dimmer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  dialog: { width: '100%', backgroundColor: '#FBF4E9', borderRadius: 18, padding: 18 },
  nextCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginVertical: 14, borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)' },
  gateMiss: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: 'rgba(224,120,86,0.3)' },
  qTag: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  answerBox: { minHeight: 80, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(43,34,24,0.12)', backgroundColor: 'rgba(255,255,255,0.6)', padding: 12, marginTop: 10 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(43,34,24,0.12)' },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: 'rgba(43,34,24,0.25)' },
  qcell: { width: 44, height: 44, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(43,34,24,0.12)', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)', marginBottom: 8 },
  checkBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: 'rgba(43,34,24,0.25)', alignItems: 'center', justifyContent: 'center' },
});
