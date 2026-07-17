import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { BookOpen, CalendarCheck, ChevronLeft, GraduationCap, Headphones, ListChecks, Mic2, Sparkles, Timer } from 'lucide-react-native';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import {
  useMyAttendance,
  useMyPracticeTotals,
  useMyQuestionCount,
  useMySpeakingParticipation,
  useMyStudyCompletion,
} from '@/lib/queries/dossier';
import { useMyStudyFootprint, type FootprintItem } from '@/lib/queries/footprint';

// 学修档案(决策160·从「我的」进)= 本人学修进度与累计中枢(采觉学 DossierPage 多维骨架)。
// ⭐ 这是「本人可见自己总目标+进度」的落点(决策014/145):闻思圆满 / 修持咒数 / 观修座次 / 答题 / 讲考 / 法会出勤。
// 守红线:全部为【本人】数据 —— 绝不显他人累计/排名/具名对比(#193 永久);师兄端无状态色(无 at_risk 红黄·克制);密法 0 痕迹。
//   讲考维度额外守决策067"克制"红线:只显参与次数,不接评价等级(该表师兄本人也不可见,见 lib/queries/dossier.ts 头注)。
// 数据进度(2026-07-11 六维全接):听读足迹(决策183 规则2)+ 闻思圆满/咒数/座次/答题/讲考/出勤,详见 lib/queries/dossier.ts。
const INK = '#2b2218';
const INK2 = '#55463a';
const INK3 = '#7e6d5b';
const SAFFRON = '#e07856';
const SAGE = '#6f9a86';

const KIND_META: Record<FootprintItem['kind'], { label: string; icon: React.ReactNode }> = {
  listen: { label: '听闻', icon: <Headphones size={15} color={SAFFRON} /> },
  read_notes: { label: '阅读', icon: <BookOpen size={15} color={SAFFRON} /> },
  speech: { label: '演讲', icon: <Mic2 size={15} color={SAFFRON} /> },
};

function fmtDate(d: string): string {
  const parts = d.split('-');
  return parts.length === 3 ? `${Number(parts[1])}月${Number(parts[2])}日` : d;
}

export default function Dossier() {
  const router = useRouter();
  const { data: footprint, isLoading: fpLoading, isError: fpError } = useMyStudyFootprint();
  const { data: completion, isLoading: complLoading, isError: complError } = useMyStudyCompletion();
  const { data: totals, isLoading: totalsLoading, isError: totalsError } = useMyPracticeTotals();
  const { data: questionCount, isLoading: qLoading, isError: qError } = useMyQuestionCount();
  const { data: speaking, isLoading: spLoading, isError: spError } = useMySpeakingParticipation();
  const { data: attendance, isLoading: attLoading, isError: attError } = useMyAttendance();
  const attendTotal = (attendance?.attendCount ?? 0) + (attendance?.absentCount ?? 0);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF4E9' }} edges={['top']}>
      <View style={styles.top}>
        <Pressable hitSlop={8} onPress={() => router.back()}><ChevronLeft size={24} color={INK} /></Pressable>
        <Text className="font-serif" style={{ fontSize: 17, fontWeight: '700', color: INK }}>学修档案</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }}>
        {/* 头部(D-9·2026-07-02):原假数字 hero(64%/218天)隐藏,真进度聚合待 v1.5;先中性头 */}
        <View style={styles.hero}>
          <LinearGradient colors={['#E8C99A', '#F3E2C6', '#FBF4E9']} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 0.7, y: 1 }} />
          <Text className="font-serif" style={{ fontSize: 20, fontWeight: '700', color: INK }}>我的学修积累</Text>
          <Text style={{ fontSize: 12, color: INK2, marginTop: 4 }}>以下均为你本人的数据,仅本人可见</Text>
        </View>

        {/* 听读足迹(真实数据·决策183 规则2):本人全部听课 / 读讲记 / 大学演讲完成,班级 + 个人合并 */}
        <View style={styles.card}>
          <View className="flex-row items-center" style={{ gap: 10 }}>
            <View style={styles.iconWrap}><Headphones size={19} color={SAFFRON} /></View>
            <Text className="font-serif" style={{ fontSize: 15, fontWeight: '700', color: INK, flex: 1 }}>听读足迹</Text>
            {fpLoading ? <ActivityIndicator size="small" color={SAFFRON} /> : null}
          </View>
          {/* 查询失败别落进"三计数=0"+"还没有听读记录"——那对有真实积累的师兄像是历史被清空了
              (全文件审计 2026-07-12);查询失败单独给一条"加载失败",不套用空态文案。 */}
          {fpError ? (
            <Text style={{ fontSize: 12, color: INK3, marginTop: 10 }}>加载失败,请检查网络后重试(不代表记录被清空)</Text>
          ) : (
            <>
              {/* 三计数 */}
              <View style={styles.statRow}>
                <Stat n={footprint?.listenCount ?? 0} label="听闻" />
                <Stat n={footprint?.readCount ?? 0} label="阅读讲记" />
                <Stat n={footprint?.speechCount ?? 0} label="大学演讲" />
              </View>
              {/* 最近明细 */}
              {footprint && footprint.recent.length > 0 ? (
                <View style={{ marginTop: 12, gap: 10 }}>
                  <Text style={{ fontSize: 11, color: INK3, fontWeight: '600' }}>最近</Text>
                  {footprint.recent.map((it) => (
                    <View key={it.key} className="flex-row items-center" style={{ gap: 9 }}>
                      {KIND_META[it.kind].icon}
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, color: INK, fontWeight: '600' }} numberOfLines={1}>{it.title}</Text>
                        <Text style={{ fontSize: 11, color: INK3 }} numberOfLines={1}>
                          {KIND_META[it.kind].label} · {it.context}{it.scope === 'self' ? ' · 个人' : ''}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 11, color: INK3 }}>{fmtDate(it.date)}</Text>
                    </View>
                  ))}
                </View>
              ) : !fpLoading ? (
                <Text style={{ fontSize: 12, color: INK3, marginTop: 10 }}>还没有听读记录。学修一课后,标记完成即可在此看到。</Text>
              ) : null}
            </>
          )}
        </View>

        {/* 闻思圆满(已加入课程·班级+自学去重合并;分母=真实 course_lessons 行数,非运营手填的 total_lessons 列) */}
        <Module
          icon={<GraduationCap size={19} color={SAFFRON} />} title="闻思圆满" loading={complLoading} error={complError}
          main={`${completion?.completeCount ?? 0} 课`}
          pct={completion && completion.totalLessons > 0 ? Math.round((completion.completeCount / completion.totalLessons) * 100) : undefined}
          sub={completion && completion.totalLessons > 0 ? `共 ${completion.totalLessons} 课(已加入课程合并统计)` : '暂无已加入课程'}
        />

        {/* 修持咒数(count 型愿终身累计,含已换/已完成的愿) */}
        <Module
          icon={<Sparkles size={19} color={SAFFRON} />} title="修持咒数" loading={totalsLoading} error={totalsError}
          main={`${(totals?.totalCount ?? 0).toLocaleString()} 遍`}
          sub="历史累计(含已换 / 已完成的愿)"
        />

        {/* 观修座次(duration 型愿终身累计;≥30分钟计1座,同大纲口径) */}
        <Module
          icon={<Timer size={19} color={SAFFRON} />} title="观修座次" loading={totalsLoading} error={totalsError}
          main={`${totals?.totalSessions ?? 0} 座`}
          sub="≥30 分钟计 1 座 · 历史累计"
        />

        {/* 答题(question_responses 去重计数,防多班扇出重复) */}
        <Module
          icon={<ListChecks size={19} color={SAFFRON} />} title="答题" loading={qLoading} error={qError}
          main={`${questionCount ?? 0} 题`}
          sub="历史累计作答(法本思考题)"
        />

        {/* 讲考(仅参与次数;⛔ 不显评价等级,该表师兄本人也不可见·决策067) */}
        <Module
          icon={<Mic2 size={19} color={SAFFRON} />} title="讲考" loading={spLoading} error={spError}
          main={`${speaking?.presentCount ?? 0} 次主讲`}
          sub={`提问 ${speaking?.questionCount ?? 0} · 听讲 ${speaking?.observeCount ?? 0}`}
        />

        {/* 共修出勤(历史所有班级累计;非 tracking 场次已排除) */}
        <Module
          icon={<CalendarCheck size={19} color={SAFFRON} />} title="共修出勤" loading={attLoading} error={attError}
          main={attendTotal > 0 ? `${attendance?.attendCount ?? 0}/${attendTotal}` : '暂无记录'}
          pct={attendTotal > 0 ? Math.round(((attendance?.attendCount ?? 0) / attendTotal) * 100) : undefined}
          sub="历史所有班级累计"
        />

        <Text style={{ fontSize: 11, color: INK3, lineHeight: 18, marginTop: 2, paddingHorizontal: 4 }}>
          此处展示你的学修积累——功德、进度与里程碑(决策014/145)。
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text className="font-serif" style={{ fontSize: 26, fontWeight: '700', color: INK }}>{n}</Text>
      <Text style={{ fontSize: 11, color: INK3, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function Module({ icon, title, main, pct, sub, loading, error }: { icon: React.ReactNode; title: string; main: string; pct?: number; sub: string; loading?: boolean; error?: boolean }) {
  // 查询失败别显真实数字位的"0"/"暂无记录"——那对本人历史累计像是被清空了(全文件审计 2026-07-12);
  // 失败时数字位置换成"—"、说明换成"加载失败",且不画百分比进度条(pct 在失败时无意义)。
  return (
    <View style={styles.card}>
      <View className="flex-row items-center" style={{ gap: 10 }}>
        <View style={styles.iconWrap}>{icon}</View>
        <Text className="font-serif" style={{ fontSize: 15, fontWeight: '700', color: INK, flex: 1 }}>{title}</Text>
        {loading ? <ActivityIndicator size="small" color={SAFFRON} /> : <Text className="font-serif" style={{ fontSize: 15, fontWeight: '700', color: INK }}>{error ? '—' : main}</Text>}
      </View>
      {pct != null && !error ? <View style={[styles.bar, { marginTop: 12 }]}><View style={[styles.fill, { width: `${pct}%` }]} /></View> : null}
      <Text style={{ fontSize: 12, color: INK3, marginTop: pct != null ? 8 : 6 }}>{error ? '加载失败,请检查网络后重试' : sub}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  hero: { borderRadius: 18, overflow: 'hidden', padding: 18, borderWidth: 1, borderColor: 'rgba(43,34,24,0.06)' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(43,34,24,0.06)' },
  iconWrap: { width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(224,120,86,0.10)', alignItems: 'center', justifyContent: 'center' },
  statRow: { flexDirection: 'row', marginTop: 14, paddingVertical: 6, borderTopWidth: 1, borderColor: 'rgba(43,34,24,0.06)' },
  bar: { height: 6, borderRadius: 3, backgroundColor: 'rgba(43,34,24,0.10)', overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: SAGE },
});
