import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Link } from 'expo-router';
import { Bell, BookOpen, ClipboardCheck, Flower2, Plus, User } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { ImageBackground, Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { QuickCountSheet } from '@/components/quick-count-sheet';
import { Text } from '@/components/ui/text';
import { useRecordPracticeLog, useUndoPracticeLog } from '@/lib/mutations/practice';
import { notify } from '@/lib/dialog';
import { useMyDailyLessons } from '@/lib/queries/daily';
import { useCurrentPoster } from '@/lib/queries/home';
import { useUnreadNotificationCount } from '@/lib/queries/notifications';
import { useMyVows } from '@/lib/queries/practice';
import { usePrimaryContext, useSelfStudyPlan } from '@/lib/queries/self-study-progress';
import { testIds } from '@/lib/testids';
import { todayUTC8 } from '@/lib/tibetan';
import { useTibetanLookup } from '@/lib/queries/tibetan-db';

// 首页(按觉学真实首页·画报日历风):满屏月度画报照片(无则金色藏地天空渐变兜底)。
// 覆盖层规范(参考觉学,2026-06-18 定):顶部覆盖图标=圆形磨砂玻璃+白图标;覆盖文字(日期/藏历)=白+轻阴影;
//   左上=我的头像(圆形磨砂玻璃·白·→/me·决策158)、去右上日历;右上只留通知。中部无诗句/streak/签到。底部 4 磨砂卡。
// 4 卡(决策142/144/152):继续学习(→课程详情本课概览·按学习进度) / 活动 / 复习(→/review 复习中心) / 快速计数。班级转纯 tab。
// ⚠️ 复习(决策142/152/163:4 mode 今日/错题本/收藏题/随课 + SM-2 + 3档自评)PM 2026-07-11 决定【延后】,
//   未建(app/review.tsx 不存在);3 号卡位现由「大学演讲」占(决策163 原定版式与现状有此已知漂移,PM 已知情、暂不处理)。
// 文案口径(决策144·"让用户容易明白功能"):标题保留三殊胜语汇(师兄熟悉),副文案用【动词领头】说清"点了会做什么"。
// ⭐ 卡片随【当前主修上下文】(决策144)自适应:班级模式 vs 自学模式副文案不同——
//   闻思:班级="继续学习·本周第N课" / 自学="继续学习·自学进度";活动:班级有本班共修+法会、自学仅平台法会。
//   "每日功课"卡副文案已接真实本周课数(2026-07-11,同 daily.tsx 那套 usePrimaryContext/
//   useMyDailyLessons/useSelfStudyPlan);"共修法会"卡文案分流(2026-07-11 补做)同一套 ctx.mode。
// TODO 接数据:修法选择(默认主修上下文的愿)。
//   复习入口不在此列——已按 PM 决定延后(见上⚠️),非遗漏。通知红点已接真(C2·2026-07-11)。
//   （藏历已接:useTibetanLookup·DB优先JSON兜底·设计⑥;快速计数写库已接:onRecord→recordLog.mutate·home.tsx:104)
const MONTH = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];
// 我的 active 念诵愿(count 类·占位·真:user_practice_vows)。快速计数 chips 排序优先级(决策167):
//   ① 今日功课需计数项(频率最高·含进行中法会愿)→ ② 其余班级愿 → ③ 个人愿(自设)。
//   默认展示 ①(今日功课),②③ 折叠进「更多」。⚠️ 上师瑜伽 / 92 修法 = 座次(duration)走观修页,不在此。
// 快速计数 chips 现取本人 active 计数型愿(useMyVows),不再写死。
const INK = '#2b2218';
const INK2 = '#55463a';
const INK3 = '#7e6d5b';
const SAFFRON_DARK = '#b35535';
const CRIMSON = '#a13c2e';

export default function StudentHome() {
  const { data: poster } = useCurrentPoster();
  const { data: myVows = [], isError: vowsError } = useMyVows();
  const { data: unreadCount = 0 } = useUnreadNotificationCount(); // C2·2026-07-11:真实未读驱动红点
  const recordLog = useRecordPracticeLog();
  const undoLog = useUndoPracticeLog();
  const qcItems = myVows.filter((v) => v.measurement === 'count').map((v) => ({ id: v.vowId, name: v.name }));
  const insets = useSafeAreaInsets();
  const onImage = !!poster?.imageUrl;

  // "每日功课"卡副文案接真实本周课数(2026-07-11 补做·数据同 daily.tsx 这套):
  //   班级=各在读班本周课(主班优先)/自学=按节奏本周计划;都没有或还没算出来时,退回原通用文案。
  const { data: ctx } = usePrimaryContext();
  const selfStudy = ctx?.mode === 'self_study';
  const { data: classWeeks = [] } = useMyDailyLessons();
  const { data: ssPlan } = useSelfStudyPlan(selfStudy ? ctx?.programId : undefined);
  const primaryWeek = !selfStudy ? classWeeks[0] : null;
  const weekLessonCount = selfStudy ? (ssPlan?.lessons.length ?? 0) : (primaryWeek?.lessons.length ?? 0);
  const weekNumber = selfStudy ? ssPlan?.weekNumber : primaryWeek?.week;
  const dailySub = weekLessonCount > 0
    ? `本周${weekNumber ? `第${weekNumber}周 · ` : ''}${weekLessonCount} 节`
    : '今日闻思修 · 三殊胜';

  // "共修法会"卡文案分流(决策144·2026-07-11 补做):班级=本班共修+平台法会都有;自学=仅平台法会,
  //   不提"共修"(自学没有班级共修),避免暗示不存在的班级活动。
  const activitiesSub = selfStudy ? '平台法会 · 发愿回向' : '共修法会 · 发愿回向';

  const now = new Date();
  const dateLabel = `${MONTH[now.getMonth()]}${now.getDate()}日 · 周${WEEKDAY[now.getDay()]}`;
  const tibLookup = useTibetanLookup(todayUTC8());   // 设计⑥:共享库优先·本地JSON兜底
  const tday = tibLookup(todayUTC8());
  const tibetanLabel = tday ? `藏历 · ${tday.tibetanMonth}${tday.tibetan}${tday.auspicious ? ' · 🌺功德日' : ''}` : '藏历';

  // 快速计数(决策165/166/167):弹层组件 QuickCountSheet 承载。
  const [qcOpen, setQcOpen] = useState(false);

  return (
    <View className="flex-1">
      <LinearGradient colors={['#CFA978', '#E8CDA0', '#F4E5C8', '#FBF4E9']} style={StyleSheet.absoluteFill} />
      {onImage ? <ImageBackground source={{ uri: poster!.imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}

      <SafeAreaView role="main" className="flex-1" edges={['top']}>
        {/* 顶部浮层(决策158):左 我的头像(圆形磨砂玻璃·白)+ 日期/藏历(白) | 右 通知(圆形磨砂玻璃·白铃) */}
        <View className="flex-row items-start justify-between px-4 pt-1">
          <View className="flex-row items-center" style={{ gap: 10 }}>
            <Link href="/me" asChild>
              <Pressable accessibilityLabel="我的" hitSlop={8}>
                <BlurView intensity={26} tint="light" style={styles.iconCircle}>
                  <User size={20} color="#ffffff" />
                </BlurView>
              </Pressable>
            </Link>
            <Link href="/calendar" asChild>
              <Pressable className="pt-0.5" hitSlop={6}>
                <RNText className="font-serif" style={[styles.overlayWhite, { fontWeight: '700', fontSize: 20, letterSpacing: 1 }]}>{dateLabel}</RNText>
                <RNText style={[styles.overlayWhite, { marginTop: 2, fontSize: 12 }]}>{tibetanLabel}</RNText>
              </Pressable>
            </Link>
          </View>
          <Link href="/notifications" asChild>
            <Pressable accessibilityLabel="通知" hitSlop={8}>
              <BlurView intensity={26} tint="light" style={styles.iconCircle}>
                <Bell size={20} color="#ffffff" />
              </BlurView>
              {/* 红点恢复(C2·2026-07-11):真实未读驱动,非恒亮(此前 D-7·2026-07-02 因无真数据撤掉) */}
              {unreadCount > 0 ? <View style={styles.badge} /> : null}
            </Pressable>
          </Link>
        </View>

        <View className="flex-1" />

        {/* 底部 4 卡定稿(决策142):闻思(继续学习)/ 活动(法会·共修)/ 练习(含复习)/ 快速计数。班级转纯 tab,不占卡。
            复习延后(PM 2026-07-11)——3 号卡位现暂由「大学演讲」占,非决策142 原版式,PM 已知情。 */}
        <View style={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 88, gap: 10 }}>
          <View className="flex-row gap-2.5">
            {/* 续学定位(C6·2026-07-10 核实):/daily 内部已按 usePrimaryContext() 真实定位(班级多班
                扇出取本周课/自学按节奏取本周计划),点进来就是"该学的那节"。副文案(2026-07-11 补做)
                同一套数据算出真实本周课数,不再是死文案 */}
            <BigCard href="/daily" icon={<BookOpen size={22} color={INK2} />} title="每日功课" sub={dailySub} />
            <BigCard href="/activities" icon={<Flower2 size={22} color={INK2} />} title="共修法会" sub={activitiesSub} />
          </View>
          <View className="flex-row gap-2.5">
            <BigCard href="/speech" icon={<ClipboardCheck size={22} color={INK2} />} title="大学演讲" sub="自学读物 · 随时读" />
            {/* useMyVows 查询失败时别显"今日 0 项功课"——对已发愿师兄是假空态(全文件审计 2026-07-12);
                本卡低调提示,不做整页阻断式报错(首页其余卡片仍应可用)。 */}
            <BigCard testID={testIds.home.quickCountCard} onPress={() => setQcOpen(true)} icon={<Plus size={22} color={INK2} />} title="快速计数" sub={vowsError ? '加载失败,请稍后重试' : `今日 ${qcItems.length} 项功课`} accent />
          </View>
        </View>
      </SafeAreaView>

      {/* 快速计数底部弹层(复用组件) */}
      <QuickCountSheet
        visible={qcOpen}
        items={qcItems}
        onRecord={async (id, n, clientToken) => {
          try { return await recordLog.mutateAsync({ vowId: id, count: n, clientToken }); }
          catch (e) { notify('记录失败', e instanceof Error ? e.message : '请重试'); throw e; }
        }}
        onUndo={async (logId) => {
          try { await undoLog.mutateAsync({ logId }); }
          catch (e) { notify('撤销失败', e instanceof Error ? e.message : '可到计数历史里修改'); throw e; }
        }}
        onClose={() => setQcOpen(false)}
      />
    </View>
  );
}

function BigCard({ href, onPress, icon, title, sub, accent, testID }: { href?: string; onPress?: () => void; icon: ReactNode; title: string; sub?: string; accent?: boolean; testID?: string }) {
  const inner = (
    <BlurView intensity={24} tint="light" style={styles.card}>
      <View className="flex-row items-center gap-2">
        {icon}
        <Text className="font-serif" numberOfLines={1} style={{ flexShrink: 1, fontSize: 16, fontWeight: '700', color: INK, letterSpacing: 2 }}>
          {title}
        </Text>
      </View>
      {sub ? (
        <Text numberOfLines={1} style={{ paddingLeft: 30, fontSize: 12, fontWeight: '600', color: accent ? SAFFRON_DARK : INK3, letterSpacing: 1 }}>
          {sub}
        </Text>
      ) : null}
    </BlurView>
  );
  if (onPress) {
    return (
      <Pressable testID={testID} className="flex-1" onPress={onPress}>
        {inner}
      </Pressable>
    );
  }
  return (
    <Link href={href as never} asChild>
      <Pressable testID={testID} className="flex-1">{inner}</Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  overlayWhite: { color: '#ffffff', textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: { position: 'absolute', top: -1, right: -1, width: 10, height: 10, borderRadius: 5, backgroundColor: CRIMSON, borderWidth: 1.5, borderColor: '#fff' },
  card: {
    minHeight: 64,
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    overflow: 'hidden',
    justifyContent: 'center',
  },
});
