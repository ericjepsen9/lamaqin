import { LinearGradient } from 'expo-linear-gradient';
import { Link } from 'expo-router';
import { BookOpen, CalendarClock, ChevronDown, Sparkles, Video } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Image, Linking, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { LessonStatusBadge } from '@/components/lesson-status-badge';
import { ScrollTitleBar, useScrollTitleBar } from '@/components/scroll-title-bar';
import { SelfStudyPanel } from '@/components/selfstudy-panel';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/lib/auth';
import { notify } from '@/lib/dialog';
import { useSwitchPrimaryCohort } from '@/lib/mutations/classes';
import { useCohortDetail, useCohortLessonCompletion, useCohortTodayActive, useCohortWeekTotals, useCurrentWeekLessons, useMyCohorts, useUpcomingSessions } from '@/lib/queries/classes';
import { useLessonStatusMap } from '@/lib/queries/courses';
import { useMyVows } from '@/lib/queries/practice';
import { testIds } from '@/lib/testids';
import { bookTitle } from '@/lib/utils';

// 班级 Tab(采觉学结构·决策138/162)。顶部 = 班级集体(渐变全宽铺底:身份 + 切换 + 共修成就);
//   中部 = 本周课程(本周第N课·RPC) + 班级愿;下部 = 近期安排(共修排课·group_sessions)。
// ⛔ 红线:① 集体只【总和·不具名·不排名】(#193);② 出勤【后台录入·师兄不自报】(094);③ 本人可见自己进度(014)。
// 接数据:✅ 我的班级/详情/本周课时(RPC)/近期共修/全班念诵总和(weekTotals)/当日在修人数(todayActive·RA-1)/
//   班级愿(classVows)/本人本周已学进度(weekLessonStatus·D3·2026-07-11)/
//   本周课程逐节全班圆满人数(weekLessonCompletion·选项C·2026-07-12)。
//   待接:出勤率——待教务定阈值口径(延后-5,非技术缺口)。
const INK = '#2b2218';
const INK2 = '#55463a';
const INK3 = '#7e6d5b';
const SAFFRON = '#e07856';
const SAFFRON_DARK = '#b35535';
const SAGE = '#6f9a86';

// ISO(UTC) → 班级时区下的「M月/DD/HH:mm」三段(供时间轴日期列用,样式对齐共修/法会时间轴·PM 2026-07-01)。
function sessionDateParts(iso: string, tz: string | null): { month: string; day: string; time: string } {
  const d = new Date(iso);
  try {
    const month = new Intl.DateTimeFormat('zh-CN', { timeZone: tz ?? undefined, month: 'numeric' }).format(d);
    const day = new Intl.DateTimeFormat('zh-CN', { timeZone: tz ?? undefined, day: 'numeric' }).format(d);
    const time = new Intl.DateTimeFormat('zh-CN', { timeZone: tz ?? undefined, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
    return { month: `${month}月`, day: day.padStart(2, '0'), time };
  } catch {
    return { month: '', day: iso.slice(8, 10), time: iso.slice(11, 16) };
  }
}

export default function ClassTab() {
  const insets = useSafeAreaInsets();

  const { data: myCohorts = [], isLoading: cohortsLoading, isError: cohortsError } = useMyCohorts();
  const primary = myCohorts[0] ?? null;
  const { data: detail } = useCohortDetail(primary?.cohortId);
  const { data: weekLessons = [] } = useCurrentWeekLessons(primary?.programId, primary?.timezone);
  // 本人本周已学进度(D3 尾巴·2026-07-11):同 course/[id].tsx 的圆满判定(isLessonComplete),
  //   按节次列表批量取,不预设单一课程(书衔接周理论上可能横跨2门课)。
  const { data: weekLessonStatus } = useLessonStatusMap(weekLessons.map((l) => l.lessonId));
  // 本周课程逐节全班圆满人数(PM 2026-07-12·选项C):跟上面同一份 lessonIds,保证不出现两个"本周"打架
  const { data: weekLessonCompletion } = useCohortLessonCompletion(primary?.cohortId, weekLessons.map((l) => l.lessonId));
  const { data: sessions = [] } = useUpcomingSessions(primary?.cohortId, {
    regularZoom: detail?.regularZoom,
    practiceZoom: detail?.practiceZoom,
  });
  const { data: weekTotals } = useCohortWeekTotals(primary?.cohortId); // 全班本周共修(实时·3C)
  const { data: todayActive } = useCohortTodayActive(primary?.cohortId); // 当日在修人数(RA-1)
  const { data: allVows = [] } = useMyVows();
  const classVows = allVows.filter((v) => v.cohortId === primary?.cohortId); // 本班入班自动建的功课(决策012/160·愿挂专业/班,非单课)
  const bar = useScrollTitleBar(); // 头图滚出后顶部淡入细标题栏(PM 2026-07-02);须在下方 early return 之前调用(hooks 规则)
  // 多班切主班(决策131/134:本人可切,走 switch_primary_cohort RPC;原假 join-class 入口撤·审计 P0)
  const { session } = useAuth();
  const [switchOpen, setSwitchOpen] = useState(false);
  const switchPrimary = useSwitchPrimaryCohort();

  const now = new Date();

  if (cohortsLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF4E9', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={SAFFRON_DARK} />
      </SafeAreaView>
    );
  }

  // 区分"查询失败"与"真没有班级"——此前混为一谈,查询报错(如网络抖动)会误判成
  // "无班分支"、显示"班级共修·即将开放",对已入班师兄是误导性文案(全文件审计 2026-07-12)。
  if (cohortsError) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF4E9', alignItems: 'center', justifyContent: 'center' }} edges={['left', 'right']}>
        <Text style={{ fontSize: 13, color: INK3, textAlign: 'center', paddingHorizontal: 32, lineHeight: 20 }}>加载失败,请检查网络后重试</Text>
      </SafeAreaView>
    );
  }

  // 无班分支(D-10·2026-07-02 自学首发):tab 仍叫「班级」,页面主体 = 自学管理(/selfstudy 能力)
  //   + 班级预告条;不再指向 join-class(其加入按钮是假的,v1 不当入口)。班级功能开放后本分支自然萎缩。
  if (!primary) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF4E9' }} edges={['left', 'right']}>
        <ScrollView contentContainerStyle={{ paddingTop: insets.top + 18, paddingHorizontal: 16, paddingBottom: 90, gap: 14 }}>
          <Text className="font-serif" style={{ fontSize: 24, fontWeight: '700', color: INK, letterSpacing: 1 }}>我的自学</Text>
          <SelfStudyPanel />
          {/* 班级预告(D-10 文案·PM 拍板) */}
          <View style={styles.comingCard}>
            <Text className="font-serif" style={{ fontSize: 15, fontWeight: '700', color: SAFFRON_DARK }}>班级共修 · 即将开放</Text>
            <Text style={{ fontSize: 12.5, color: INK2, marginTop: 4, lineHeight: 19 }}>入班后可与同班师兄共修、同学同一进度、互相增上。</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const coachLine = [
    detail?.coaches?.length ? `辅导员 ${detail.coaches.join('、')}` : null,
    detail?.aixin?.length ? `爱心 ${detail.aixin.join('、')}` : null,
    detail ? `同学 ${detail.memberCount} 人` : null,
  ].filter(Boolean).join(' · ');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF4E9' }} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }} onScroll={bar.onScroll} scrollEventThrottle={16}>
        {/* 顶部:渐变+图案全宽铺背景(无卡)· 身份 + 切换(右上)+ 共修成就(决策162) */}
        <View onLayout={bar.onHeaderLayout}>
          {/* 渐变改为与修持页完全同款手法(PM 2026-07-01:「按修持页的渐变面积做」):
              单层竖直渐变(去掉第二层白色斜向高光——修持本来就没有,是分界线的来源之一)、
              4 色 + 明确 locations(不是均分 3 色)、同样 insets.top+300 高度,不随内容多高走。 */}
          <LinearGradient
            colors={['#E8C99A', '#F1DDB8', '#F8EEE1', '#FBF4E9']}
            locations={[0, 0.4, 0.72, 1]}
            pointerEvents="none"
            style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top + 300 }}
          />
          <View style={{ paddingHorizontal: 20, paddingTop: insets.top + 18, paddingBottom: 22 }}>
            {/* 莲花图标与左侧整块内容(身份+大数字)垂直居中对齐(PM 2026-07-01 讨论定案:选 B);间距收紧,不留空当 */}
            <View className="flex-row items-center" style={{ gap: 12 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                {/* 去掉「班级」标题(与 tab 名重复)→ 班级名即主标题;多班切换钮移到本行右侧(PM 2026-06-30) */}
                <View className="flex-row items-center justify-between" style={{ gap: 10 }}>
                  <View className="flex-row items-center" style={{ gap: 6, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
                    <Text className="font-serif" style={{ fontSize: 23, fontWeight: '700', color: INK }}>{primary.cohortName}</Text>
                    {primary.isPrimary ? <View style={styles.mainTag}><Text style={{ fontSize: 10, fontWeight: '700', color: SAFFRON_DARK }}>主班</Text></View> : null}
                  </View>
                  {myCohorts.length > 1 ? (
                    <Pressable style={styles.switchChip} onPress={() => setSwitchOpen(true)}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: SAFFRON_DARK }}>{primary.programName ?? '切换'}</Text>
                      <ChevronDown size={15} color={SAFFRON_DARK} />
                    </Pressable>
                  ) : null}
                </View>
                {coachLine ? <Text style={{ fontSize: 12, color: INK2, marginTop: 5 }}>{(primary.programName ? primary.programName + ' · ' : '') + coachLine}</Text> : null}
                {/* 全班本周共修(实时·3C·PM 2026-07-01 改版):去卡片,大数字撑分量;移入左侧内容块内,供图标整体居中对齐;只出总数不出个人(#193) */}
                {weekTotals && weekTotals.reciteTotal > 0 ? (
                  <View style={{ flexDirection: 'row', gap: 36, marginTop: 14 }}>
                    <View>
                      <Text className="font-serif" style={{ fontSize: 36, fontWeight: '800', color: SAFFRON_DARK, lineHeight: 40 }}>{weekTotals.reciteTotal.toLocaleString()}</Text>
                      <Text style={{ fontSize: 11.5, color: INK2, fontWeight: '600', marginTop: 4 }}>本周全班念诵(遍)</Text>
                    </View>
                    <View>
                      <Text className="font-serif" style={{ fontSize: 36, fontWeight: '800', color: SAFFRON_DARK, lineHeight: 40 }}>{weekTotals.activeMembers}</Text>
                      <Text style={{ fontSize: 11.5, color: INK2, fontWeight: '600', marginTop: 4 }}>位同学共修</Text>
                    </View>
                    {/* 当日在修人数(RA-1·2026-07-11 接线):跟本周 2 个数字并排;当天 0 人在修不显示(同本周口径,不挂空「0」) */}
                    {todayActive != null && todayActive > 0 ? (
                      <View>
                        <Text className="font-serif" style={{ fontSize: 36, fontWeight: '800', color: SAFFRON_DARK, lineHeight: 40 }}>{todayActive}</Text>
                        <Text style={{ fontSize: 11.5, color: INK2, fontWeight: '600', marginTop: 4 }}>今日在修</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
              <Image source={require('../../assets/images/lotus-gold.png')} resizeMode="contain" style={styles.headerLotus} />
            </View>
          </View>
        </View>

        {/* 本周课程(我在本班) */}
        <Section icon={<BookOpen size={18} color={SAFFRON} />} title="本周课程" sub={weekLessons.length > 0 ? `本周 ${weekLessons.length} 节` : undefined}>
          {weekLessons.length === 0 ? (
            <View style={styles.card}>
              <Text style={{ fontSize: 13, color: INK3 }}>本周暂无安排课程（或正值休息周）</Text>
            </View>
          ) : (
            <View style={styles.card}>
              {weekLessons.map((l, i) => {
                const comp = weekLessonCompletion?.get(l.lessonId);
                return (
                  <Link key={l.lessonId} href={`/lesson/${l.lessonId}?step=wensi&cohortId=${primary?.cohortId ?? ''}` as never} asChild>
                    <Pressable testID={testIds.class.weekLessonRow(l.lessonId)} style={StyleSheet.flatten([styles.weekLessonRow, i > 0 && styles.weekLessonRowBordered])}>
                      <View style={{ flex: 1 }}>
                        <Text className="font-serif" style={{ fontSize: 15, fontWeight: '700', color: INK }}>{bookTitle(l.courseName)}第 {l.lessonNumber} 课</Text>
                        <Text style={{ fontSize: 13, color: INK2, marginTop: 2 }}>{l.lessonTitle}</Text>
                        {comp && comp.totalMembers > 0 ? (
                          <Text style={{ fontSize: 11.5, color: INK3, marginTop: 3 }}>全班 {comp.completeCount}/{comp.totalMembers} 人已圆满</Text>
                        ) : null}
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 2 }}>
                        <LessonStatusBadge st={weekLessonStatus?.get(l.lessonId)} />
                        <Text style={{ fontSize: 12, fontWeight: '700', color: SAFFRON_DARK }}>去学习 ›</Text>
                      </View>
                    </Pressable>
                  </Link>
                );
              })}
            </View>
          )}
        </Section>

        {/* 班级功课 = 入班自动建的愿(user_practice_vows.cohort_id=本班·决策012/160 愿挂专业/班非单课);显本人累计进度 */}
        <Section icon={<Sparkles size={18} color={SAFFRON} />} title="班级功课" sub="入班自动建 · 项目/周期锁定、节奏可调">
          <View style={styles.card}>
            {classVows.length === 0 ? (
              <Text style={{ fontSize: 13, color: INK3 }}>本班暂无自动指派的功课</Text>
            ) : (
              classVows.map((v, i) => (
                <Link key={v.vowId} href={`/vow/${v.vowId}` as never} asChild>
                  <Pressable style={StyleSheet.flatten([styles.weekLessonRow, i > 0 && styles.weekLessonRowBordered])}>
                    <View style={{ flex: 1 }}>
                      <Text className="font-serif" style={{ fontSize: 15, fontWeight: '700', color: INK }}>{v.name}</Text>
                      <Text style={{ fontSize: 12, color: INK2, marginTop: 2 }}>
                        {v.measurement === 'duration'
                          ? `累计 ${v.currentSessions} 座${v.targetCount ? ` / ${v.targetCount}` : ''}`
                          : `累计 ${v.currentCount.toLocaleString()}${v.targetCount ? ` / ${v.targetCount.toLocaleString()}` : ''} ${v.unit}`}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: SAFFRON_DARK }}>详情 ›</Text>
                  </Pressable>
                </Link>
              ))
            )}
          </View>
        </Section>

        {/* 近期安排 = 日期时间轴(决策171)· 样式与共修/法会时间轴同款(PM 2026-07-01:日期列+竖线+圆点+卡片)。
            仍保留本页专属交互(进入会议直达 Zoom、不跳转详情页;决策140:不记出勤,仅展示)。 */}
        <Section icon={<CalendarClock size={18} color={SAFFRON} />} title="近期安排" sub="本班共修 / 讲考 · 出勤后台录入">
          <View>
            {/* 今天锚点(参照行,用「过去」态灰点表达"仅作时间参照、非可点项") */}
            <View style={styles.tlRow}>
              <View style={styles.dateCol}>
                <Text style={styles.dMonth}>今天</Text>
                <Text className="font-serif" style={styles.dDay}>{now.getDate()}</Text>
              </View>
              <View style={styles.railCol}>
                {sessions.length > 0 ? <View style={[styles.railLine, { top: 22, bottom: 0 }]} /> : null}
                <View style={[styles.dot, styles.dotPast]} />
              </View>
              <View style={[styles.sessionCard, styles.sessionCardMute]}>
                <Text style={{ fontSize: 12, color: INK3 }}>{sessions.length === 0 ? '近期暂无安排 · 安心闻思' : '安心闻思'}</Text>
              </View>
            </View>
            {sessions.map((s, i) => {
              const parts = sessionDateParts(s.scheduledAt, primary.timezone);
              return (
                <View key={s.id} style={styles.tlRow}>
                  <View style={styles.dateCol}>
                    <Text style={styles.dMonth}>{parts.month}</Text>
                    <Text className="font-serif" style={styles.dDay}>{parts.day}</Text>
                    <Text style={styles.dTime}>{parts.time}</Text>
                  </View>
                  <View style={styles.railCol}>
                    <View style={[styles.railLine, i === sessions.length - 1 ? { top: 0, height: 24 } : { top: 0, bottom: 0 }]} />
                    <View style={[styles.dot, i === 0 ? styles.dotLive : styles.dotPast]} />
                  </View>
                  <View style={styles.sessionCard}>
                    <View style={styles.badges}>
                      <View style={[styles.tag, { backgroundColor: 'rgba(111,154,134,0.16)' }]}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: SAGE }}>共修 · {s.kind === 'practice' ? '实修' : '常规'}</Text>
                      </View>
                    </View>
                    <Text className="font-serif" style={styles.title}>{s.kind === 'practice' ? '实修共修' : '常规共修'}</Text>
                    <Text style={styles.sub}>
                      {s.courseName ? bookTitle(s.courseName) : ''}{s.lessonTitle ?? ''}{s.location ? ` · ${s.location}` : (s.zoomUrl ? ' · 线上 Zoom' : '')}
                    </Text>
                    {s.zoomUrl ? (
                      <Pressable style={styles.joinMeetBtn} onPress={() => Linking.openURL(s.zoomUrl!)}>
                        <Video size={13} color="#fff" /><Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>进入会议</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
          <Text style={{ fontSize: 11, color: INK3, paddingHorizontal: 2, marginTop: 4 }}>我的出勤后台录入、仅展示;讲考为升学人工参考、不计分。</Text>
        </Section>
      </ScrollView>
      <ScrollTitleBar title={primary.cohortName} shown={bar.shown} topInset={insets.top} />

      {/* 切主班(多班者):列出我的班,点非主班 → RPC 切换(本人权限·决策131/134) */}
      <Modal visible={switchOpen} transparent animationType="fade" onRequestClose={() => setSwitchOpen(false)}>
        <Pressable style={styles.switchBackdrop} onPress={() => setSwitchOpen(false)}>
          <Pressable style={styles.switchCard} onPress={() => {}}>
            <Text className="font-serif" style={{ fontSize: 17, fontWeight: '700', color: INK }}>切换主班</Text>
            <Text style={{ fontSize: 12, color: INK3, marginTop: 4, marginBottom: 12 }}>主班决定「班级」页显示哪个班;学修记录不受影响。</Text>
            <View style={{ gap: 8 }}>
              {myCohorts.map((c) => (
                <Pressable
                  key={c.cohortId}
                  style={[styles.switchOpt, c.isPrimary && styles.switchOptOn]}
                  disabled={c.isPrimary || switchPrimary.isPending}
                  onPress={() => {
                    const uid = session?.user.id;
                    if (!uid) return;
                    switchPrimary.mutate(
                      { userId: uid, newPrimaryCohortId: c.cohortId },
                      {
                        onSuccess: () => setSwitchOpen(false),
                        onError: (e) => notify('切换失败', e instanceof Error ? e.message : '请稍后重试'),
                      },
                    );
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: INK }}>{c.cohortName}</Text>
                    {c.programName ? <Text style={{ fontSize: 12, color: INK3, marginTop: 1 }}>{c.programName}</Text> : null}
                  </View>
                  {c.isPrimary ? <Text style={{ fontSize: 11, fontWeight: '700', color: SAFFRON_DARK }}>当前主班</Text> : null}
                </Pressable>
              ))}
            </View>
            {switchPrimary.isPending ? <Text style={{ fontSize: 12, color: INK3, textAlign: 'center', marginTop: 10 }}>切换中…</Text> : null}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function Section({ icon, title, sub, action, children }: { icon: React.ReactNode; title: string; sub?: string; action?: string; children: React.ReactNode }) {
  return (
    // 板块间距 18→30(PM 2026-07-17:「课程页面」实指本页,下方几个板块太紧凑)——对齐修持页
    // 板块间的 marginTop:30,全 app 统一这档"仪表盘式板块"间距,不止本页单独改一个数字。
    <View style={{ paddingHorizontal: 16, marginTop: 30 }}>
      <View className="flex-row items-center justify-between" style={{ marginBottom: 10 }}>
        <View className="flex-row items-center" style={{ gap: 8, flex: 1 }}>
          {icon}
          <View style={{ flex: 1 }}>
            <Text className="font-serif" style={{ fontSize: 16, fontWeight: '700', color: INK }}>{title}</Text>
            {sub ? <Text style={{ fontSize: 11, color: INK3, marginTop: 1 }}>{sub}</Text> : null}
          </View>
        </View>
        {action ? <Text style={{ fontSize: 12, fontWeight: '700', color: SAFFRON_DARK }}>{action} ›</Text> : null}
      </View>
      <View style={{ gap: 8 }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  switchBackdrop: { flex: 1, backgroundColor: 'rgba(20,14,8,0.4)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  switchCard: { width: '100%', backgroundColor: '#FBF4E9', borderRadius: 18, padding: 18 },
  switchOpt: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(43,34,24,0.1)' },
  switchOptOn: { borderColor: 'rgba(224,120,86,0.5)', backgroundColor: '#FBE5DA' },
  headerLotus: { width: 104, height: 91, flexShrink: 0, marginRight: 8 },
  switchChip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9999, backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)' },
  mainTag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(224,120,86,0.14)' },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(43,34,24,0.06)' },
  weekLessonRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  weekLessonRowBordered: { borderTopWidth: 1, borderTopColor: 'rgba(43,34,24,0.06)' },
  joinBtn: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 9999, backgroundColor: SAFFRON },
  comingCard: { backgroundColor: '#FBE5DA', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(224,120,86,0.3)' },
  joinMeetBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 9999, backgroundColor: SAFFRON },
  tag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(43,34,24,0.06)' },
  // 近期安排 日期时间轴(决策171)· 与 components/coreview-timeline.tsx 的 NodeRow 同款尺寸/配色(PM 2026-07-01)
  tlRow: { flexDirection: 'row', gap: 6 },
  dateCol: { width: 36, flexShrink: 0, paddingTop: 14, alignItems: 'center' },
  dMonth: { fontSize: 11, color: INK3, fontWeight: '600' },
  dDay: { fontSize: 17, fontWeight: '700', color: INK, lineHeight: 20 },
  dTime: { fontSize: 10, color: INK3, marginTop: 1 },
  railCol: { width: 16, flexShrink: 0, position: 'relative' },
  railLine: { position: 'absolute', left: 7, width: 2, backgroundColor: 'rgba(43,34,24,0.12)' },
  dot: { position: 'absolute', left: 1, top: 18, width: 14, height: 14, borderRadius: 7, borderWidth: 3 },
  dotLive: { backgroundColor: SAFFRON, borderColor: SAFFRON },
  dotPast: { backgroundColor: '#fff', borderColor: '#c9bda8' },
  sessionCard: { flex: 1, minWidth: 0, backgroundColor: '#fff', borderRadius: 16, padding: 14, marginVertical: 6, borderWidth: 1, borderColor: 'rgba(43,34,24,0.07)' },
  sessionCardMute: { backgroundColor: 'rgba(255,255,255,0.55)' },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' },
  title: { fontSize: 15.5, fontWeight: '700', color: INK },
  sub: { fontSize: 12, color: INK3, marginTop: 4, lineHeight: 18 },
});
