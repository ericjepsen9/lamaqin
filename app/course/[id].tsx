import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, Share2 } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Image, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { LessonStatusBadge } from '@/components/lesson-status-badge';
import { ScrollTitleBar, useScrollTitleBar } from '@/components/scroll-title-bar';
import { Text } from '@/components/ui/text';
import { notify } from '@/lib/dialog';
import { useStartSelfStudy } from '@/lib/mutations/self-study';
import { useCourseDetail, useCourseSchedule, useCourseProgramContext, useMyCourseCompletion, useMyCourseLessonStatus, type CourseLessonItem, type LessonStatus } from '@/lib/queries/courses';
import { useCurrentWeekLessons } from '@/lib/queries/classes';
import { useCoursePrograms } from '@/lib/queries/self-study-progress';
import { testIds } from '@/lib/testids';
import { bookTitle } from '@/lib/utils';

// 课程详情 = 觉学 法本详情 UI(法本背景头图 + 书封 + 统计卡)+【目录 | 本课】tab(决策149/150)。
//   目录:章节(course_chapters)→ 课时(course_lessons),点课时进入学修流 /lesson/[lessonId]。
//   本课:学修【步骤卡概览】(决策150)—— 闻思/法师辅导/答题/观修 进入向导式学修流。
// 进度(听/看/答/圆满)依赖 study_records 聚合,属复杂业务逻辑,待 PM 定圆满口径后单独接;本页先接【结构】(真实章节/课时)。
// 守:进度本人可见无状态色(014/145)、密法0痕迹。
const INK = '#2b2218';
const INK2 = '#55463a';
const INK3 = '#7e6d5b';
const SAFFRON = '#e07856';
const SAFFRON_DARK = '#b35535';
const SAGE = '#6f9a86';
const DEFAULT_HERO = ['#BACEDD', '#DCE6EE', '#FBF4E9'] as const; // 无封面/未提取强调色时维持这个(PM 2026-07-02:没封面就不臆造颜色)

// 把强调色调淡 amount(0~1,1=纯白)——头图渐变要的是柔和色块,不是原色色块。
function lighten(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `#${[mix(r), mix(g), mix(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
// 头图渐变:有强调色(scripts/backfill_cover_accent_color.py 离线提取)→ 淡色调 + 同款三段淡出到底色;
//   没有(无封面 / 未提取)→ 维持原来那套蓝色渐变,不瞎配色(决策 PM 2026-07-02)。
function heroColors(accent: string | null): readonly [string, string, string] {
  if (!accent) return DEFAULT_HERO;
  return [lighten(accent, 0.35), lighten(accent, 0.68), '#FBF4E9'];
}

// 每节圆满态小标(毕业达标·决策:已学≠达标):圆满(sage)/ 进行中(saffron)/ 未学(灰)。
// 抽为共享组件 components/lesson-status-badge.tsx(D3 尾巴·2026-07-11:class.tsx 班级页复用同一视觉)。
const SAGE_BG = '#e6efea';

export default function CourseDetail() {
  const router = useRouter();
  const { id, tab: initTab } = useLocalSearchParams<{ id: string; tab?: string }>();
  // 默认显示「本课」(scene);仅当显式 ?tab=toc 时才进目录(PM 2026-06-26)。
  const [tab, setTab] = useState<'toc' | 'scene'>(initTab === 'toc' ? 'toc' : 'scene');
  const [enrollOpen, setEnrollOpen] = useState(false); // 「加入自学」本课属多专业时选一个
  const [shareText, setShareText] = useState<string | null>(null); // web 端两条能力都没有时,弹自定义卡片兜底显示分享文案(非 null=打开)
  const bar = useScrollTitleBar(); // 头图滚出后顶部淡入细标题栏(带返回·PM 2026-07-02:解决滚下去返回键没了)
  const insets = useSafeAreaInsets();

  const { data: course, isLoading, isError } = useCourseDetail(id);
  const { data: schedule } = useCourseSchedule(id);
  const { data: lessonStatus } = useMyCourseLessonStatus(id);
  const { data: courseCompletion } = useMyCourseCompletion(id);
  // 「加入自学」(自助报名·决策119):本课所属专业 → 报名 user_self_study_programs + 自动发愿
  const { data: coursePrograms = [] } = useCoursePrograms(id);
  const startSS = useStartSelfStudy();
  const statusMap = lessonStatus?.status ?? new Map<string, LessonStatus>();
  const completeCount = lessonStatus?.completeCount ?? 0;
  // 本周课:本课所属在读班的当前周课时(RPC 内部按班/时区算);无班/无排课 → 空 → 本周视图降级。
  const { data: ctx } = useCourseProgramContext(id);
  const { data: weekAll = [] } = useCurrentWeekLessons(ctx?.programId, ctx?.timezone);
  const thisWeekLessons = weekAll.filter((l) => l.courseId === id);

  // 章节分组:有 chapter 的归到对应章节,无 chapter 的归「未分章」。
  const grouped = useMemo(() => {
    if (!course) return [];
    const byChapter = new Map<string, CourseLessonItem[]>();
    const noChapter: CourseLessonItem[] = [];
    for (const l of course.lessons) {
      if (l.chapterId) {
        if (!byChapter.has(l.chapterId)) byChapter.set(l.chapterId, []);
        byChapter.get(l.chapterId)!.push(l);
      } else {
        noChapter.push(l);
      }
    }
    const sections = course.chapters
      .map((ch) => ({ id: ch.id, title: ch.title, lessons: byChapter.get(ch.id) ?? [] }))
      .filter((s) => s.lessons.length > 0);
    if (noChapter.length > 0) sections.push({ id: '__none__', title: course.chapters.length > 0 ? '其他' : '全部课时', lessons: noChapter });
    return sections;
  }, [course]);

  const firstLesson = course?.lessons[0] ?? null;
  // 「当前课/继续学习」(A+A1·PM 2026-06-27):本周第一节未圆满 → 无本周则整门课按节号第一节未圆满 → 全圆满则最后一节。
  //   未圆满 = statusMap 非 'complete'(未学/进行中)。随打卡自动前移。
  const currentLessonId = (() => {
    const wk = thisWeekLessons.find((l) => statusMap.get(l.lessonId) !== 'complete');
    if (wk) return wk.lessonId;
    const sorted = course ? [...course.lessons].sort((a, b) => a.lessonNumber - b.lessonNumber) : [];
    const nx = sorted.find((l) => statusMap.get(l.id) !== 'complete');
    return (nx ?? sorted[sorted.length - 1])?.id ?? null;
  })();
  // 「开始学习 / 继续学习」(PM 2026-06-29):有任意 听/看/答/圆满 记录 → 继续学习(跳当前未圆满节);否则开始学习(跳第一节)。
  const hasStarted = [...statusMap.values()].some((s) => s === 'complete' || s === 'partial');
  const ctaLabel = hasStarted ? '继续学习' : '开始学习';
  const ctaTarget = currentLessonId ?? firstLesson?.id ?? null;

  const doEnroll = (programId: string, programName: string) => {
    startSS.mutate({ programId }, {
      onSuccess: (r) => notify(
        r.already ? '已在自学' : '已开始自学',
        r.already
          ? `你已在自学《${programName}》。`
          : `已开始自学《${programName}》,相关功课已自动发愿${r.vowError ? '(功课发放有误,请联系管理员)' : ''}。可在「自学」页看本周进度。`,
      ),
      onError: (e) => notify('无法开始自学', (e as Error)?.message ?? '请重试'),
    });
  };
  const onStartSelfStudy = () => {
    if (coursePrograms.length === 0) { notify('暂不能自学', '本课程未归入任何专业,暂无法按专业自学。'); return; }
    if (coursePrograms.length === 1) { doEnroll(coursePrograms[0].programId, coursePrograms[0].programName); return; }
    setEnrollOpen(true);
  };

  // 右上角分享(PM 2026-07-02:原「…」简介按钮换成分享)。纯文字,不带链接(App 内部路由/预览地址都不适合公开分享)。
  //   navigator.share / navigator.clipboard 都要 HTTPS(或 localhost)安全上下文才有,纯 http 预览地址(如
  //   157.x.x.x:8088)上两者都是 undefined,不是抛错——查过 MDN/Chromium bug 记录确认(2026-07-02)。
  //   桌面 Firefox 目前完全不支持 navigator.share(非本环境限定,长期如此),Linux Chrome 也不支持——即使正式上线
  //   换 HTTPS,这两类桌面用户仍会落到兜底;所以兜底不是"极少数人才碰到",要做成正经的、贴合本 App 风格的卡片,
  //   不能甩一个浏览器原生 alert(直接把预览地址当标题显示出来,难看也不专业)。
  //   两个能力要在点击这一刻就"分岔判断"、不能链式 try→catch 顺延——navigator.share 在 web 上取消分享会
  //   reject(AbortError),之前的写法会把"用户主动取消"也当失败去接着复制剪贴板,复制了用户没料到的内容。
  const onShare = async () => {
    if (!course) return;
    const message = `我正在闻思修学习${bookTitle(course.name)}${course.author ? ` · ${course.author}` : ''},一起来修学吧!`;
    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        try { await Share.share({ message }); }
        catch (e) { if ((e as Error)?.name !== 'AbortError') setShareText(message); } // 真失败才兜底;用户主动取消就什么都不做
        return;
      }
      if (typeof navigator !== 'undefined' && window.isSecureContext && navigator.clipboard?.writeText) {
        try { await navigator.clipboard.writeText(message); notify('已复制', '分享文案已复制,可以粘贴发给师兄了。'); }
        catch { setShareText(message); }
        return;
      }
      setShareText(message); // 两个能力都没有(非安全上下文,如纯 http 预览地址)→ 直接展示自定义卡片
      return;
    }
    Share.share({ message }).catch(() => {});
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF4E9' }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} onScroll={bar.onScroll} scrollEventThrottle={16}>
        {/* 法本背景头图(书封图当背景·色底兜底) */}
        <View onLayout={bar.onHeaderLayout}>
          <LinearGradient colors={heroColors(course?.coverAccentColor ?? null)} style={StyleSheet.absoluteFill} />
          <View style={styles.headTop}>
            <Pressable hitSlop={8} onPress={() => router.back()}><ChevronLeft size={24} color={INK} /></Pressable>
            <View style={{ flex: 1 }} />
            <Pressable hitSlop={8} onPress={onShare}><Share2 size={21} color={INK} /></Pressable>
          </View>

          {isLoading ? (
            <View style={{ paddingVertical: 80, alignItems: 'center' }}><ActivityIndicator color={SAFFRON_DARK} /></View>
          ) : isError ? (
            <View style={{ paddingVertical: 80, alignItems: 'center', paddingHorizontal: 24 }}>
              <Text style={{ fontSize: 14, color: INK2, textAlign: 'center' }}>加载失败,请检查网络后重试(不代表课程不存在)</Text>
              <Text style={{ fontSize: 12, color: INK3, textAlign: 'center', marginTop: 6 }}>请从「全部课程」进入</Text>
            </View>
          ) : !course ? (
            <View style={{ paddingVertical: 80, alignItems: 'center', paddingHorizontal: 24 }}>
              <Text style={{ fontSize: 14, color: INK2, textAlign: 'center' }}>课程不存在</Text>
              <Text style={{ fontSize: 12, color: INK3, textAlign: 'center', marginTop: 6 }}>请从「全部课程」进入</Text>
            </View>
          ) : (
            <>
              <View style={styles.heroRow}>
                <View style={styles.cover}>
                  {course.coverImageUrl ? (
                    <Image source={{ uri: course.coverImageUrl }} resizeMode="cover" style={StyleSheet.absoluteFill} />
                  ) : (
                    <>
                      <LinearGradient colors={['#7FA8C9', '#A9C2D6']} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
                      <Text className="font-serif" numberOfLines={3} style={styles.coverTitle}>{course.name}</Text>
                    </>
                  )}
                </View>
                <View style={{ flex: 1, paddingTop: 6 }}>
                  <Text className="font-serif" style={{ fontSize: 21, fontWeight: '700', color: INK, letterSpacing: 1 }}>{bookTitle(course.name)}</Text>
                  {courseCompletion?.isComplete ? (
                    <View style={styles.completeBadge}><Text style={styles.completeBadgeText}>本书圆满 ✓</Text></View>
                  ) : null}
                  {course.author ? <Text style={{ fontSize: 12, color: INK2, marginTop: 4 }}>{course.author}</Text> : null}
                  <View style={styles.actionRow}>
                    {ctaTarget ? (
                      <Pressable style={styles.cta} onPress={() => router.push(`/lesson/${ctaTarget}?step=wensi` as never)}>
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{ctaLabel}</Text>
                      </Pressable>
                    ) : null}
                    <Pressable testID={testIds.courseDetail.startSelfStudyButton} style={styles.selfStudyBtn} disabled={startSS.isPending} onPress={onStartSelfStudy}>
                      <Text style={{ color: SAFFRON_DARK, fontWeight: '700', fontSize: 13 }}>＋ 加入自学</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
              <View style={styles.stats}>
                <Stat label="圆满" value={String(completeCount)} />
                <View style={styles.statDivider} />
                <Stat label="课时" value={String(course.totalLessons ?? course.lessons.length)} />
                <View style={styles.statDivider} />
                <Stat label="周数" value={schedule && schedule.totalWeeks > 0 ? String(schedule.totalWeeks) : '—'} />
              </View>

            </>
          )}
        </View>

        {course ? (
          <View style={styles.panel}>
            {/* 卡内顶部:目录 | 本周 切换(PM 2026-06-29:切换并入内容卡,过渡带不再脏) */}
            <View style={styles.panelTabs}>
              <TabBtn label="目录" active={tab === 'toc'} onPress={() => setTab('toc')} />
              <TabBtn label="本周" active={tab === 'scene'} onPress={() => setTab('scene')} />
            </View>
            <View style={styles.panelDivider} />

            {tab === 'toc' ? (
              grouped.length === 0 ? (
                <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: INK3 }}>暂无课时</Text>
                </View>
              ) : (
                <View style={{ gap: 6 }}>
                  {grouped.map((ch, idx) => (
                    <View key={ch.id} style={{ gap: 6 }}>
                      <View style={styles.sectionHeader}>
                        <View style={styles.chapNo}><Text style={{ fontSize: 12, fontWeight: '700', color: SAGE }}>{idx + 1}</Text></View>
                        <Text className="font-serif" style={{ flex: 1, fontSize: 14, fontWeight: '700', color: INK }}>{ch.title}</Text>
                        <Text style={{ fontSize: 11, color: INK3 }}>{ch.lessons.length} 课</Text>
                      </View>
                      {ch.lessons.map((l) => (
                        <LessonRow
                          key={l.id}
                          num={l.lessonNumber}
                          title={l.title}
                          status={statusMap.get(l.id)}
                          isCurrent={l.id === currentLessonId}
                          resourceCount={l.resourceCount}
                          onPress={() => router.push(`/lesson/${l.id}?step=wensi` as never)}
                        />
                      ))}
                    </View>
                  ))}
                </View>
              )
            ) : (
              <ThisWeek
                weekLessons={thisWeekLessons}
                weekNumber={thisWeekLessons[0] ? schedule?.lessonWeek[thisWeekLessons[0].lessonId] : undefined}
                statusMap={statusMap}
                currentLessonId={currentLessonId}
                fallbackLesson={firstLesson}
              />
            )}
          </View>
        ) : null}
      </ScrollView>
      {/* topInset(2026-07-17 PM 真机反馈:课程概览页顶部标题栏叠在系统状态栏位置)——
          ScrollTitleBar 内部是 position:absolute,不吃 SafeAreaView 的顶部安全区 padding,
          必须显式传 topInset 才会在自己身上补,漏传就默认 0、贴着物理屏幕顶端画。 */}
      <ScrollTitleBar title={course ? bookTitle(course.name) : ''} shown={bar.shown && !!course} onBack={() => router.back()} topInset={insets.top} />

      {/* 加入自学:本课归属多专业时选一个(单专业直接报名,不弹) */}
      <Modal visible={enrollOpen} transparent animationType="fade" onRequestClose={() => setEnrollOpen(false)}>
        <Pressable style={styles.infoBackdrop} onPress={() => setEnrollOpen(false)}>
          <Pressable style={styles.infoCard} onPress={() => {}}>
            <Text className="font-serif" style={{ fontSize: 17, fontWeight: '700', color: INK }}>选择自学专业</Text>
            <Text style={{ fontSize: 12, color: INK3, marginTop: 4, marginBottom: 12 }}>本课程归属多个专业,选一个开始自学:</Text>
            <View style={{ gap: 8 }}>
              {coursePrograms.map((p) => (
                <Pressable key={p.programId} testID={testIds.courseDetail.enrollProgramOption(p.programId)} style={styles.enrollOpt} onPress={() => { setEnrollOpen(false); doEnroll(p.programId, p.programName); }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: INK }}>{p.programName}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable style={styles.infoClose} onPress={() => setEnrollOpen(false)}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>取消</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 分享兜底卡(web 端 navigator.share/clipboard 都不可用时,如非 HTTPS 预览地址);自己的样式,不用浏览器原生 alert */}
      <Modal visible={!!shareText} transparent animationType="fade" onRequestClose={() => setShareText(null)}>
        <Pressable style={styles.infoBackdrop} onPress={() => setShareText(null)}>
          <Pressable style={styles.infoCard} onPress={() => {}}>
            <Text className="font-serif" style={{ fontSize: 17, fontWeight: '700', color: INK }}>分享给师兄</Text>
            <Text style={{ fontSize: 12, color: INK3, marginTop: 4 }}>当前环境无法直接调起分享,文案已备好,选中复制发出去就行:</Text>
            <View style={styles.shareTextBox}>
              <Text selectable style={{ fontSize: 14, lineHeight: 22, color: INK2 }}>{shareText}</Text>
            </View>
            <View className="flex-row" style={{ gap: 10, marginTop: 14 }}>
              <Pressable
                style={[styles.infoClose, { flex: 1, marginTop: 0, alignItems: 'center' }]}
                onPress={async () => {
                  if (shareText && typeof navigator !== 'undefined' && window.isSecureContext && navigator.clipboard?.writeText) {
                    try { await navigator.clipboard.writeText(shareText); notify('已复制', '分享文案已复制,可以粘贴发给师兄了。'); setShareText(null); return; } catch { /* 仍不行,留卡片让用户手动选取 */ }
                  }
                  notify('复制不了', '这个环境暂不支持一键复制,长按上面的文字手动选取复制。');
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>一键复制</Text>
              </Pressable>
              <Pressable style={styles.sharePillGhost} onPress={() => setShareText(null)}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: INK2 }}>关闭</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// 统计三连(决策·PM 2026-06-29):去掉圆角框、只留文字、颜色统一为墨色,细竖线分隔。
//   原"圆满"用 sage 高亮(唯一进度信号),按 PM 要求统一墨色;每节"圆满 ✓"在下方列表仍保留 sage。
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCol}>
      <Text style={{ fontSize: 11, color: INK3, letterSpacing: 1 }}>{label}</Text>
      <Text className="font-serif" style={{ fontSize: 20, fontWeight: '700', color: INK, marginTop: 3 }}>{value}</Text>
    </View>
  );
}

// 课时行(目录 / 本周 共用·PM 2026-06-29):编号 + 标题 + 当前/圆满态 + 讲数 + ›。
function LessonRow({ num, title, status, isCurrent, resourceCount, onPress }: {
  num: number; title: string; status: LessonStatus | undefined; isCurrent?: boolean; resourceCount?: number; onPress: () => void;
}) {
  return (
    <Pressable style={[styles.lessonRow, isCurrent && styles.lessonRowCurrent]} onPress={onPress}>
      <View style={[styles.lessonNoBox, isCurrent && { backgroundColor: SAFFRON }]}>
        <Text style={{ fontSize: 11, fontWeight: '700', color: isCurrent ? '#fff' : INK3 }}>{num}</Text>
      </View>
      <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, fontWeight: isCurrent ? '700' : '500', color: isCurrent ? INK : INK2 }}>{title}</Text>
      {isCurrent ? <Text style={{ fontSize: 10, fontWeight: '700', color: SAFFRON_DARK }}>当前</Text> : null}
      <LessonStatusBadge st={status} />
      {resourceCount && resourceCount > 0 ? <Text style={{ fontSize: 11, color: INK3 }}>{resourceCount} 讲</Text> : null}
      <Text style={{ fontSize: 14, color: INK3 }}>›</Text>
    </Pressable>
  );
}

// 本周(决策150 / PM 2026-06-26/29):并入内容卡;顶部周摘要 + 本周课时(与目录同款行)。
//   有排课 → 当前周课时列表;无排课/无班 → 降级:第一节作「从第1课开始」单条。
function ThisWeek({ weekLessons, weekNumber, statusMap, currentLessonId, fallbackLesson }: {
  weekLessons: { lessonId: string; lessonNumber: number; lessonTitle: string }[];
  weekNumber?: number;
  statusMap: Map<string, LessonStatus>;
  currentLessonId: string | null;
  fallbackLesson: CourseLessonItem | null;
}) {
  const router = useRouter();
  const hasWeek = weekLessons.length > 0;
  const list = hasWeek
    ? weekLessons.map((l) => ({ id: l.lessonId, num: l.lessonNumber, title: l.lessonTitle }))
    : fallbackLesson
      ? [{ id: fallbackLesson.id, num: fallbackLesson.lessonNumber, title: fallbackLesson.title }]
      : [];

  if (list.length === 0) {
    return (
      <View style={{ paddingVertical: 32, alignItems: 'center' }}>
        <Text style={{ fontSize: 13, color: INK3 }}>请从「目录」选择课时开始学修</Text>
      </View>
    );
  }
  const doneCount = list.filter((l) => statusMap.get(l.id) === 'complete').length;

  return (
    <View style={{ gap: 6 }}>
      {hasWeek ? (
        <View style={styles.weekSummary}>
          <Text className="font-serif" style={{ fontSize: 16, fontWeight: '700', color: SAFFRON_DARK, letterSpacing: 1 }}>{weekNumber ? `第 ${weekNumber} 周` : '本周'}</Text>
          <Text style={{ fontSize: 12, color: INK2 }}>需学 {list.length} · 已学 {doneCount}</Text>
        </View>
      ) : (
        <Text style={{ fontSize: 12, color: INK3, paddingHorizontal: 4, paddingVertical: 6 }}>本课暂未排课,从第 {list[0].num} 课开始</Text>
      )}

      {list.map((l) => (
        <LessonRow
          key={l.id}
          num={l.num}
          title={l.title}
          status={statusMap.get(l.id)}
          isCurrent={l.id === currentLessonId}
          onPress={() => router.push(`/lesson/${l.id}?step=wensi` as never)}
        />
      ))}

      <Text style={{ fontSize: 11, color: INK3, marginTop: 6, paddingHorizontal: 2 }}>圆满 = 闻思(听+看)+ 答题;法师辅导可选不计;观修单独计入升学统计。</Text>
    </View>
  );
}

function TabBtn({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flex: 1, alignItems: 'center', paddingVertical: 10 }}>
      <Text className="font-serif" style={{ fontSize: 15, fontWeight: active ? '700' : '500', color: active ? SAFFRON_DARK : INK3 }}>{label}</Text>
      <View style={{ marginTop: 5, height: 2.5, width: 20, borderRadius: 2, backgroundColor: active ? SAFFRON : 'transparent' }} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headTop: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 6, paddingBottom: 4 },
  heroRow: { flexDirection: 'row', gap: 16, paddingHorizontal: 20, paddingTop: 8 },
  cover: { width: 92, height: 124, borderRadius: 8, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', padding: 8, shadowColor: '#2b2218', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
  coverTitle: { fontSize: 15, fontWeight: '700', color: '#fff', textAlign: 'center', letterSpacing: 1, lineHeight: 21, textShadowColor: 'rgba(0,0,0,0.25)', textShadowRadius: 3 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  completeBadge: { alignSelf: 'flex-start', backgroundColor: SAGE_BG, borderRadius: 9999, paddingHorizontal: 10, paddingVertical: 3, marginTop: 5 },
  completeBadgeText: { fontSize: 11, fontWeight: '700', color: SAGE },
  cta: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 9999, backgroundColor: SAFFRON },
  selfStudyBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 9999, borderWidth: 1, borderColor: 'rgba(224,120,86,0.5)' },
  enrollOpt: { padding: 14, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(43,34,24,0.1)' },
  stats: { flexDirection: 'row', paddingHorizontal: 24, paddingTop: 18 },
  statCol: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  statDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', marginVertical: 6, backgroundColor: 'rgba(43,34,24,0.12)' },
  panel: { backgroundColor: '#fff', borderRadius: 16, marginHorizontal: 16, marginTop: 14, paddingHorizontal: 12, paddingTop: 4, paddingBottom: 14, borderWidth: 1, borderColor: 'rgba(43,34,24,0.06)' },
  panelTabs: { flexDirection: 'row' },
  panelDivider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(43,34,24,0.08)', marginHorizontal: 4, marginBottom: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4, paddingTop: 6, paddingBottom: 2 },
  chapNo: { width: 26, height: 26, borderRadius: 13, backgroundColor: SAGE_BG, alignItems: 'center', justifyContent: 'center' },
  lessonRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 11, borderRadius: 10, backgroundColor: 'rgba(43,34,24,0.035)' },
  lessonRowCurrent: { backgroundColor: '#FBE5DA', borderWidth: 1, borderColor: 'rgba(224,120,86,0.4)' },
  lessonNoBox: { width: 24, height: 24, borderRadius: 7, backgroundColor: 'rgba(43,34,24,0.06)', alignItems: 'center', justifyContent: 'center' },
  weekSummary: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 4, paddingVertical: 6 },
  infoBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  infoCard: { width: '100%', backgroundColor: '#FBF4E9', borderRadius: 18, padding: 18 },
  infoClose: { marginTop: 14, alignSelf: 'flex-end', paddingHorizontal: 20, paddingVertical: 9, borderRadius: 9999, backgroundColor: SAFFRON },
  shareTextBox: { marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: 'rgba(43,34,24,0.04)', borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)' },
  sharePillGhost: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: 9999, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(43,34,24,0.12)' },
});
