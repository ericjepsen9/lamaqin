import { addDays, addMonths, differenceInCalendarDays, format } from 'date-fns';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ChevronRight, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text as RNText, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { DatePickerModal } from '@/components/month-calendar';
import { QuickCountSheet } from '@/components/quick-count-sheet';
import { ScrollTitleBar, useScrollTitleBar } from '@/components/scroll-title-bar';
import { Text } from '@/components/ui/text';
import { notify } from '@/lib/dialog';
import { useCreateCustomVow, useDeleteCustomVow, useRecordPracticeLog, useUndoPracticeLog } from '@/lib/mutations/practice';
import { useMyCohorts } from '@/lib/queries/classes';
import { useOptionalPracticesForPrograms } from '@/lib/queries/optional-practices';
import { useMyVows, usePractices, type MyVow } from '@/lib/queries/practice';
import { NEIJIAXING_EXPIRY_WARNING_DAYS, neijiaxingExpiry, vowPace } from '@/lib/queries/vow-pace';
import { useMySelfStudyPrograms } from '@/lib/queries/self-study-progress';
import { testIds } from '@/lib/testids';

// 修持 Tab = 实修中枢(决策155/159/160)。接真:user_practice_vows(active)+ practice_logs(本周聚合)。
//   顶部(PM 2026-06-30):紫色连续渐变(融入奶白)+ 念珠图标(念珠=念诵计数,正合修持;莲花已让给班级页)+ 念诵合计大数字 + 今日/本周;右上「累计·至今」纯文字按钮(与标签同色)。
//   今日修持:计数型愿两列卡片(名称 + 今日遍数 + 橙色「添加」药丸 → 写 practice_logs,触发器累加 current_count)。
//   内加行(限时必修网格)/ 观修·座次(时长型)按需显示。守:本人自视无他人具名(#193);密法0痕迹。
//   颜色:页面主题紫(模块色),行动按钮用规范橙(决策·PM);念珠素材见 assets/images/mala.png(商用授权 PM 确认)。
const INK = '#2b2218';
const INK2 = '#55463a';
const INK3 = '#7e6d5b';
const SAFFRON = '#e07856';
const SAFFRON_DARK = '#b35535';
const SAGE = '#6f9a86';
const SAGE_DARK = '#4e7a64';   // 浅绿卡片上的达成文字(对比更清)
const WARN = '#b88956';        // 掉队提醒(A3·SD-5,克制:只在真掉队时才出现)
const CRIM = '#a13c2e';        // 进度告急
const PLUM = '#3a2a5e';        // 紫顶上的深色文字(大数字/统计值)
const PLUM_SOFT = '#6e5a96';   // 念诵合计 / 累计·至今 同色

export default function Practice() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: vows = [], isLoading, isError } = useMyVows();
  const record = useRecordPracticeLog();
  const undoLog = useUndoPracticeLog();
  const [qcOpen, setQcOpen] = useState(false);
  const [qcVow, setQcVow] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [scope, setScope] = useState<'total' | 'today' | 'week'>('total'); // 顶部大数字口径(可点累计按钮切换)
  const [manageOpen, setManageOpen] = useState(false);

  const countVows = vows.filter((v) => v.measurement === 'count');
  const durationVows = vows.filter((v) => v.measurement === 'duration');
  const neijiaxing = countVows.filter((v) => v.isRequired && v.timeLimited);

  // 顶部:念诵合计(全部计数型愿)累计 / 今日 / 本周
  const topTotal = countVows.reduce((s, v) => s + v.currentCount, 0);
  const topToday = countVows.reduce((s, v) => s + v.todayCount, 0);
  const topWeek = countVows.reduce((s, v) => s + v.weekCount, 0);
  // 顶部大数字口径:累计 / 今日 / 本周(点右上按钮循环切换);下方两统计显示其余两项
  const scopeVal = scope === 'today' ? topToday : scope === 'week' ? topWeek : topTotal;
  const scopePill = scope === 'today' ? '今日念诵' : scope === 'week' ? '本周念诵' : '累计 · 至今';
  const otherStats: [string, number][] = scope === 'total' ? [['今日念诵', topToday], ['本周念诵', topWeek]]
    : scope === 'today' ? [['本周念诵', topWeek], ['累计', topTotal]]
    : [['今日念诵', topToday], ['累计', topTotal]];
  const cycleScope = () => setScope((s) => (s === 'total' ? 'today' : s === 'today' ? 'week' : 'total'));
  const scopeStr = scopeVal.toLocaleString();
  const scopeFont = scopeStr.length > 9 ? 34 : scopeStr.length > 6 ? 42 : 50;

  const qcItems = countVows.map((v) => ({ id: v.vowId, name: v.name }));
  const openQc = (vowId: string) => { const i = countVows.findIndex((v) => v.vowId === vowId); setQcVow(Math.max(i, 0)); setQcOpen(true); };
  const bar = useScrollTitleBar(); // 头图滚出后顶部淡入细标题栏(PM 2026-07-02)

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF4E9' }} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 90 }} showsVerticalScrollIndicator={false} onScroll={bar.onScroll} scrollEventThrottle={16}>
        {/* 顶部紫色渐变:下延一点、融入奶白;pointerEvents none 不挡点击 */}
        <LinearGradient
          colors={['#DCCDEE', '#E6DCF3', '#F0EAF4', '#FBF4E9']}
          locations={[0, 0.4, 0.72, 1]}
          pointerEvents="none"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top + 300 }}
        />
        <View onLayout={bar.onHeaderLayout} style={{ paddingTop: insets.top + 16, paddingHorizontal: 22, paddingBottom: 30 }}>
          <Image source={require('../../assets/images/mala.png')} resizeMode="contain" style={styles.lotus} />
          {/* 口径切换(累计/今日/本周)移到左上,去掉「念诵合计」标签;点击循环切换 */}
          <Pressable hitSlop={10} onPress={cycleScope} style={styles.pill}>
            <RNText style={{ fontSize: 13, fontWeight: '700', color: PLUM_SOFT, letterSpacing: 0.5 }}>{scopePill} ▾</RNText>
          </Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 10 }}>
            <RNText className="font-serif" style={{ fontSize: scopeFont, lineHeight: Math.round(scopeFont * 1.1), fontWeight: '800', color: PLUM, letterSpacing: 0.5 }}>{scopeStr}</RNText>
            <RNText style={{ fontSize: 16, color: '#6a4f9a', fontWeight: '700', marginBottom: 6 }}>遍</RNText>
          </View>
          <View style={{ flexDirection: 'row', gap: 30, marginTop: 16 }}>
            {otherStats.map(([k, val]) => <Stat key={k} k={k} v={`${val.toLocaleString()} 遍`} />)}
          </View>
        </View>

        {isLoading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}><ActivityIndicator color={SAFFRON_DARK} /></View>
        ) : isError ? (
          // 查询失败别落进"还没有功课"——那对已发愿师兄是假消息(全文件审计 2026-07-12)。
          <View style={{ padding: 24, alignItems: 'center' }}>
            <RNText style={{ fontSize: 13, color: INK3, textAlign: 'center', lineHeight: 20 }}>加载失败,请检查网络后重试(不代表没有功课)</RNText>
          </View>
        ) : vows.length === 0 ? (
          <View style={{ padding: 24, alignItems: 'center' }}>
            <RNText style={{ fontSize: 13, color: INK3, textAlign: 'center', lineHeight: 20 }}>还没有功课。加入班级或开始自学后,系统会按专业自动为你发愿。</RNText>
          </View>
        ) : (
          <>
            {/* 我的功课:计数型愿两列卡片。卡身点按 → 详情页;「添加」药丸 → 直接计数(写 practice_logs) */}
            {countVows.length > 0 ? (
              <View style={{ paddingHorizontal: 16, marginTop: 30 }}>
                <View style={styles.sechRow}>
                  <Text className="font-serif" style={styles.sech}>我的功课</Text>
                  <Pressable hitSlop={8} onPress={() => setManageOpen(true)}><RNText style={styles.manageLink}>管理</RNText></Pressable>
                </View>
                <View style={styles.grid}>
                  {countVows.map((v) => {
                    // 每日应完成(班级愿存量 / 限期愿反向算 / 终生设的每日目标);达成→今日数字转绿
                    const goal = vowPace(v).daily;
                    const hit = goal != null && goal > 0 && v.todayCount >= goal;
                    return (
                      // 兄弟式两个点击区(避免 web 上嵌套 Pressable 双触发):卡身文字 → 详情页;「添加」药丸 → 计数
                      // 今日达成每日目标 → 整张卡片浅绿
                      <View key={v.vowId} style={[styles.gcard, hit && styles.gcardHit]}>
                        <Pressable style={styles.tx} onPress={() => router.push(`/vow/${v.vowId}`)}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                            {/* 状态点(A3·克制:只在掉队/告急时出现,on_track 不额外提示) */}
                            {v.status === 'at_risk' ? <View style={[styles.statusDot, { backgroundColor: CRIM }]} /> : v.status === 'falling_behind' ? <View style={[styles.statusDot, { backgroundColor: WARN }]} /> : null}
                            <Text className="font-serif" numberOfLines={1} style={[styles.gName, { flex: 1 }]}>{v.name}</Text>
                          </View>
                          <RNText numberOfLines={1} style={{ fontSize: 12, marginTop: 3, fontWeight: hit ? '700' : '400', color: hit ? SAGE_DARK : INK3 }}>
                            今日 {v.todayCount.toLocaleString()}{goal != null ? ` / 目标 ${goal.toLocaleString()}` : ''} {v.unit}
                          </RNText>
                        </Pressable>
                        <Pressable hitSlop={6} style={styles.daka} onPress={() => openQc(v.vowId)}><RNText style={styles.dakaTxt}>添加</RNText></Pressable>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {/* 内加行(限时必修计数愿·进度) */}
            {neijiaxing.length > 0 ? (
              <Section title="内加行" sub="限时必修 · 升学硬依据">
                <View style={styles.njGrid}>
                  {neijiaxing.map((j) => {
                    const p = j.targetCount ? Math.round((j.currentCount / j.targetCount) * 100) : 0;
                    const { daysLeft, expired, nearExpiry } = neijiaxingExpiry(j.endDate, new Date(), NEIJIAXING_EXPIRY_WARNING_DAYS);
                    return (
                      <View key={j.vowId} style={styles.jcell}>
                        <RNText style={{ fontSize: 13, fontWeight: '700', color: INK }} numberOfLines={1}>{j.name}</RNText>
                        <Text className="font-serif" style={{ fontSize: 16, fontWeight: '700', color: p >= 100 ? SAGE : INK, marginTop: 2 }}>{j.currentCount >= 10000 ? `${(j.currentCount / 10000).toFixed(1)}万` : j.currentCount.toLocaleString()}</Text>
                        <View style={styles.barSm}><View style={[styles.barSmFill, { width: `${Math.min(p, 100)}%`, backgroundColor: p >= 100 ? SAGE : SAFFRON }]} /></View>
                        {expired ? (
                          <RNText style={{ fontSize: 11, fontWeight: '700', color: CRIM, marginTop: 4 }}>已过期 · 打卡已锁定</RNText>
                        ) : nearExpiry ? (
                          <RNText style={{ fontSize: 11, fontWeight: '700', color: WARN, marginTop: 4 }}>剩 {daysLeft} 天到期</RNText>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              </Section>
            ) : null}

            {/* 观修 · 座次(时长型愿) */}
            {durationVows.length > 0 ? (
              <Section title="观修 · 座次">
                {durationVows.map((v) => (
                  <Pressable key={v.vowId} style={styles.todayRow} onPress={() => router.push(`/vow/${v.vowId}`)}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        {v.status === 'at_risk' ? <View style={[styles.statusDot, { backgroundColor: CRIM }]} /> : v.status === 'falling_behind' ? <View style={[styles.statusDot, { backgroundColor: WARN }]} /> : null}
                        <Text className="font-serif" style={{ fontSize: 15, fontWeight: '700', color: INK }}>{v.name}</Text>
                      </View>
                      <RNText style={{ fontSize: 12, color: INK3, marginTop: 1 }}>累计 {v.currentSessions} 座{v.targetCount ? ` / ${v.targetCount}` : ''}</RNText>
                    </View>
                    <ChevronRight size={18} color={INK3} />
                  </Pressable>
                ))}
              </Section>
            ) : null}
          </>
        )}

        {!isLoading ? (
          <View style={{ paddingHorizontal: 16, marginTop: 14 }}>
            <Pressable testID={testIds.practice.addVowButton} style={styles.addVowBtn} onPress={() => setAddOpen(true)}>
              <Plus size={16} color={SAFFRON_DARK} /><RNText style={{ color: SAFFRON_DARK, fontWeight: '700', fontSize: 14 }}>加功课</RNText>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
      <ScrollTitleBar title="修持" shown={bar.shown} topInset={insets.top} />
      <QuickCountSheet
        visible={qcOpen}
        items={qcItems}
        initialVow={qcVow}
        onRecord={async (vowId, n, clientToken) => {
          try { return await record.mutateAsync({ vowId, count: n, clientToken }); }
          catch (e) { notify('记录失败', e instanceof Error ? e.message : '请重试'); throw e; }
        }}
        onUndo={async (logId) => {
          try { await undoLog.mutateAsync({ logId }); }
          catch (e) { notify('撤销失败', e instanceof Error ? e.message : '可到计数历史里修改'); throw e; }
        }}
        onClose={() => setQcOpen(false)}
      />
      <AddVowModal open={addOpen} onClose={() => setAddOpen(false)} />
      <ManageVowsModal open={manageOpen} onClose={() => setManageOpen(false)} vows={vows} />
    </SafeAreaView>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <View>
      <RNText style={{ fontSize: 12, color: '#6a578f' }}>{k}</RNText>
      <Text className="font-serif" style={{ fontSize: 19, fontWeight: '700', color: PLUM, marginTop: 3 }}>{v}</Text>
    </View>
  );
}

// 加功课:自定愿(PRD §2.4 完全自定义 / §2.4「必填截止日或选终生」/ §节奏自主「反向算」)。
//   周期只两个:终生持诵(lifetime,随心累积) / 限期完成(until_complete,定总目标+截止日)。
//   限期:按 总目标 ÷ 剩余周数 自动算"每周约需 X"(反向算·只展示不入库,详情页按剩余进度动态重算)。
//   截止日走弹窗月历(DatePickerModal)。daily/weekly 制不再让用户手选,由截止日反推配速。
type Period = 'lifetime' | 'until_complete';
const PERIODS: { key: Period; label: string; hint: string }[] = [
  { key: 'lifetime', label: '终生持诵', hint: '长期累积,不设截止' },
  { key: 'until_complete', label: '限期完成', hint: '定总目标 + 截止日,自动算每周进度' },
];
// 今天到截止日的周数(向上取整,至少 1 周)
const weeksUntil = (end: Date) => Math.max(1, Math.ceil(differenceInCalendarDays(end, new Date()) / 7));
// 加功课来源(设计④/A1·2026-07-08):自选经/抄经/拜经必须从后台候选清单选,不能自由输入(决策052/PD-20/XJ-8);
//   其它自定愿维持"完全自定义"原样(PRD §2.4),不收紧——两者互不影响,只是候选池不同来源。
type VowSource = 'library' | 'optional';
const SOURCES: { key: VowSource; label: string }[] = [
  { key: 'library', label: '其它自定愿' },
  { key: 'optional', label: '自选经/抄经/拜经' },
];
function AddVowModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: practices = [] } = usePractices();
  const { data: myCohorts = [] } = useMyCohorts();
  const { data: myPrograms = [] } = useMySelfStudyPrograms();
  const programIds = [...new Set([...myCohorts.map((c) => c.programId), ...myPrograms.map((p) => p.programId)])];
  const { data: optionalPractices = [] } = useOptionalPracticesForPrograms(programIds);
  const create = useCreateCustomVow();
  const [source, setSource] = useState<VowSource>('library');
  const [pid, setPid] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [period, setPeriod] = useState<Period>('lifetime');
  const [daily, setDaily] = useState('');          // 终生愿:可选每日目标
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [calOpen, setCalOpen] = useState(false);

  const isOptional = source === 'optional';
  const chipPool = isOptional
    ? optionalPractices.map((o) => ({ id: o.practiceId, name: o.name, unit: o.unit }))
    : practices.map((p) => ({ id: p.id, name: p.name, unit: p.unit }));
  const sel = chipPool.find((p) => p.id === pid);
  const unit = sel?.unit ?? '遍';
  const targetNum = target.trim() ? Number(target.replace(/[^0-9]/g, '')) : null;
  const dailyNum = daily.trim() ? Number(daily.replace(/[^0-9]/g, '')) : null;
  const limited = period === 'until_complete';
  const endIso = limited && endDate ? format(endDate, 'yyyy-MM-dd') : null;
  // 反向算:每周约需 = 总目标 ÷ 剩余周数(向上取整)
  const weeklyNeed = limited && targetNum && targetNum > 0 && endDate ? Math.ceil(targetNum / weeksUntil(endDate)) : null;
  // 限期须同时有总目标 + 截止日(否则没法反推配速);
  // 终生:每日目标留空=随心合法,但填了就必须>0——填0会被mutation层静默转成null(佛前发愿变"随心"却无提示),故按钮层先挡(2026-07-13·PM测出此边界问题,选方案②)
  const dailyOk = !limited && (!daily.trim() || (!!dailyNum && dailyNum > 0));
  const canSave = !!pid && (limited ? (!!targetNum && targetNum > 0 && !!endDate) : dailyOk) && !create.isPending;

  const pickPeriod = (key: Period) => {
    setPeriod(key);
    if (key === 'lifetime') { setEndDate(null); setCalOpen(false); }
    else if (!endDate) setEndDate(addMonths(new Date(), 3)); // 默认 3 月后,可改
  };
  const reset = () => { setSource('library'); setPid(null); setName(''); setTarget(''); setDaily(''); setPeriod('lifetime'); setEndDate(null); setCalOpen(false); };
  const pickSource = (key: VowSource) => { setSource(key); setPid(null); }; // 换池子,已选的修法作废重选
  const submit = () => {
    if (!pid || !canSave) return;
    create.mutate(
      {
        // 自选经模式:名称固定用清单里的经名(决策052不能自由输入),不采用户可能填的自定名称
        practiceId: pid, customName: isOptional ? null : name, targetPeriod: period,
        targetCount: limited ? targetNum : null,        // 总目标仅限期用
        dailyTarget: limited ? null : dailyNum,          // 每日目标仅终生用(限期由截止日反推)
        weeklyTarget: null,
        endDate: endIso,
      },
      { onSuccess: () => { reset(); onClose(); }, onError: (e) => notify('添加失败', (e as Error)?.message ?? '请重试') },
    );
  };

  return (
    <>
      <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable style={[styles.sheet, { maxHeight: '92%' }]} onPress={() => {}}>
            <View style={styles.handle} />
            <Text className="font-serif" style={{ fontSize: 17, fontWeight: '700', color: INK }}>加功课</Text>
            <RNText style={{ fontSize: 12, color: INK3, marginTop: 2, marginBottom: 10 }}>自己发愿一项功课:选修法、定周期,随时计数(随时可改)。</RNText>
            <ScrollView style={{ maxHeight: '82%' }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                {SOURCES.map((s) => (
                  <Pressable key={s.key} style={[styles.pchip, source === s.key && styles.pchipOn]} onPress={() => pickSource(s.key)}>
                    <RNText style={{ fontSize: 13, fontWeight: '600', color: source === s.key ? '#fff' : INK2 }}>{s.label}</RNText>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.fieldLabel0}>{isOptional ? '自选经/抄经/拜经' : '选修法'}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {chipPool.map((p) => (
                  <Pressable key={p.id} style={[styles.pchip, pid === p.id && styles.pchipOn]} onPress={() => setPid(p.id)}>
                    <RNText style={{ fontSize: 13, fontWeight: '600', color: pid === p.id ? '#fff' : INK2 }}>{p.name}</RNText>
                  </Pressable>
                ))}
              </View>
              {isOptional && chipPool.length === 0 ? (
                <RNText style={{ fontSize: 12, color: INK3, marginTop: 6 }}>暂无可选项目,请联系管理员配置。</RNText>
              ) : null}

              <Text style={styles.fieldLabel}>修持周期</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {PERIODS.map((pr) => (
                  <Pressable key={pr.key} style={[styles.pchip, period === pr.key && styles.pchipOn]} onPress={() => pickPeriod(pr.key)}>
                    <RNText style={{ fontSize: 13, fontWeight: '600', color: period === pr.key ? '#fff' : INK2 }}>{pr.label}</RNText>
                  </Pressable>
                ))}
              </View>
              <RNText style={{ fontSize: 11, color: INK3, marginTop: 6 }}>{PERIODS.find((p) => p.key === period)?.hint}</RNText>

              {isOptional ? null : (
                <>
                  <Text style={styles.fieldLabel}>自定名称(可选)</Text>
                  <TextInput value={name} onChangeText={setName} placeholder="如:我的金刚萨埵心咒" placeholderTextColor={INK3} maxLength={30} style={styles.fieldInput} />
                </>
              )}

              {limited ? (
                /* 限期:总目标(必填)+ 截止日(弹窗月历)→ 自动算每周/每日配速 */
                <>
                  <Text style={styles.fieldLabel}>总目标(必填)</Text>
                  <TextInput testID={testIds.practice.addVowTargetInput} value={target} onChangeText={setTarget} keyboardType="number-pad" placeholder="到截止日念满,如 100000" placeholderTextColor={INK3} maxLength={9} style={styles.fieldInput} />
                  <Text style={styles.fieldLabel}>截止日</Text>
                  <Pressable style={styles.dateField} onPress={() => setCalOpen(true)}>
                    <RNText style={{ fontSize: 15, color: endIso ? INK : INK3 }}>{endIso ?? '选择日期'}</RNText>
                    <RNText style={{ fontSize: 13, fontWeight: '700', color: SAFFRON_DARK }}>选择</RNText>
                  </Pressable>
                  {weeklyNeed ? (
                    <View style={styles.paceHint}>
                      <RNText style={{ fontSize: 13, color: SAFFRON_DARK, fontWeight: '700' }}>每周约需 {weeklyNeed.toLocaleString()} {unit} · 每天约 {Math.ceil(weeklyNeed / 7).toLocaleString()} {unit}</RNText>
                      <RNText style={{ fontSize: 11, color: INK3, marginTop: 2 }}>按此进度到 {endIso} 圆满 · 落下会在详情页自动调高</RNText>
                    </View>
                  ) : (
                    <RNText style={{ fontSize: 11, color: INK3, marginTop: 6 }}>填总目标 + 选截止日后,自动算每周 / 每天需完成多少。</RNText>
                  )}
                </>
              ) : (
                /* 终生:可选每日目标(每天定量;留空=随心) */
                <>
                  <Text style={styles.fieldLabel}>每日目标(可选)</Text>
                  <TextInput testID={testIds.practice.addVowDailyInput} value={daily} onChangeText={setDaily} keyboardType="number-pad" placeholder={`如 108;留空=随心,不设每日目标`} placeholderTextColor={INK3} maxLength={9} style={styles.fieldInput} />
                  {dailyNum ? <RNText style={{ fontSize: 11, color: SAGE, marginTop: 6 }}>每天念满 {dailyNum.toLocaleString()} {unit} 即达成(每周约 {(dailyNum * 7).toLocaleString()} {unit})</RNText> : null}
                </>
              )}
            </ScrollView>

            <Pressable testID={testIds.practice.addVowSaveButton} style={[styles.saveBtn, !canSave && { opacity: 0.4 }]} disabled={!canSave} onPress={submit}>
              <RNText style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>保存</RNText>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
      <DatePickerModal visible={calOpen} value={endDate} minDate={addDays(new Date(), 1)} onPick={setEndDate} onClose={() => setCalOpen(false)} title="选择截止日" />
    </>
  );
}

// 功课管理:列出自定功课,可删除(软删·status→abandoned)。班级/自学发放的愿由系统管理,不在此删。
function ManageVowsModal({ open, onClose, vows }: { open: boolean; onClose: () => void; vows: MyVow[] }) {
  const del = useDeleteCustomVow();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const custom = vows.filter((v) => v.source === 'custom');
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <Text className="font-serif" style={{ fontSize: 17, fontWeight: '700', color: INK }}>功课管理</Text>
          <RNText style={{ fontSize: 12, color: INK3, marginTop: 2, marginBottom: 8 }}>自己发愿的功课可删除;班级 / 自学发放的功课由系统管理。</RNText>
          {custom.length === 0 ? (
            <RNText style={{ fontSize: 13, color: INK3, textAlign: 'center', paddingVertical: 24 }}>暂无自定功课。点「加功课」自己发愿。</RNText>
          ) : (
            <ScrollView style={{ maxHeight: 340 }}>
              {custom.map((v) => (
                <View key={v.vowId} style={styles.mvRow}>
                  <View style={{ flex: 1 }}>
                    <Text className="font-serif" numberOfLines={1} style={{ fontSize: 15, fontWeight: '700', color: INK }}>{v.name}</Text>
                    <RNText style={{ fontSize: 12, color: INK3, marginTop: 1 }}>已积累 {v.currentCount.toLocaleString()} {v.unit}</RNText>
                  </View>
                  {confirmId === v.vowId ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Pressable style={styles.mvConfirm} disabled={del.isPending} onPress={() => del.mutate(v.vowId, { onSuccess: () => setConfirmId(null), onError: (e) => notify('删除失败', (e as Error)?.message ?? '请重试') })}>
                        <RNText style={{ fontSize: 12.5, color: '#fff', fontWeight: '700' }}>确认删除</RNText>
                      </Pressable>
                      <Pressable hitSlop={6} onPress={() => setConfirmId(null)}><RNText style={{ fontSize: 12.5, color: INK3 }}>取消</RNText></Pressable>
                    </View>
                  ) : (
                    <Pressable style={styles.mvDel} onPress={() => setConfirmId(v.vowId)}>
                      <RNText style={{ fontSize: 12.5, color: '#a13c2e', fontWeight: '700' }}>删除</RNText>
                    </Pressable>
                  )}
                </View>
              ))}
            </ScrollView>
          )}
          <Pressable style={[styles.saveBtn, { backgroundColor: 'rgba(43,34,24,0.06)' }]} onPress={onClose}>
            <RNText style={{ color: INK2, fontWeight: '700', fontSize: 14 }}>完成</RNText>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <View style={{ paddingHorizontal: 16, marginTop: 18 }}>
      <View style={{ marginBottom: 10 }}>
        <Text className="font-serif" style={{ fontSize: 16, fontWeight: '700', color: INK }}>{title}</Text>
        {sub ? <RNText style={{ fontSize: 11, color: INK3, marginTop: 1 }}>{sub}</RNText> : null}
      </View>
      <View style={{ gap: 8 }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  lotus: { position: 'absolute', right: 30, top: 40, width: 95, height: 121, pointerEvents: 'none' },
  pill: { alignSelf: 'flex-start', paddingVertical: 2, zIndex: 5 },
  sechRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sech: { fontSize: 16, fontWeight: '700', color: PLUM },
  manageLink: { fontSize: 13, color: SAFFRON_DARK, fontWeight: '700' },
  mvRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(43,34,24,0.06)' },
  mvDel: { borderWidth: 1, borderColor: 'rgba(161,60,46,0.5)', borderRadius: 9999, paddingHorizontal: 12, paddingVertical: 5 },
  mvConfirm: { backgroundColor: '#a13c2e', borderRadius: 9999, paddingHorizontal: 12, paddingVertical: 5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  gcard: { width: '48.5%', marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 16, paddingVertical: 12, paddingHorizontal: 13, borderWidth: 1, borderColor: 'rgba(160,130,210,0.16)', shadowColor: '#5a3c8c', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  gcardHit: { backgroundColor: '#e9f3ee', borderColor: 'rgba(111,154,134,0.45)' },
  tx: { flex: 1, minWidth: 0 },
  gName: { fontSize: 15, fontWeight: '700', color: INK },
  statusDot: { width: 7, height: 7, borderRadius: 3.5, flexShrink: 0 },
  daka: { flexShrink: 0, borderWidth: 1, borderColor: SAFFRON, borderRadius: 9999, paddingHorizontal: 9, paddingVertical: 3 },
  dakaTxt: { color: SAFFRON_DARK, fontSize: 11, fontWeight: '700' },

  todayRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(43,34,24,0.06)' },
  njGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  jcell: { width: '31%', backgroundColor: '#fff', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: 'rgba(43,34,24,0.06)', marginBottom: 8 },
  barSm: { height: 4, borderRadius: 2, backgroundColor: 'rgba(43,34,24,0.10)', marginTop: 6, overflow: 'hidden' },
  barSmFill: { height: 4, borderRadius: 2 },
  addVowBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(224,120,86,0.55)' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FBF4E9', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 32 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(43,34,24,0.18)', alignSelf: 'center', marginBottom: 12 },
  pchip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9999, backgroundColor: 'rgba(43,34,24,0.05)' },
  pchipOn: { backgroundColor: SAFFRON },
  fieldLabel0: { fontSize: 12, fontWeight: '600', color: INK3, marginTop: 2, marginBottom: 8 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: INK3, marginTop: 14, marginBottom: 6 },
  fieldInput: { borderWidth: 1, borderColor: 'rgba(43,34,24,0.18)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 15, color: INK, backgroundColor: '#fff' },
  dateField: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: 'rgba(43,34,24,0.18)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, backgroundColor: '#fff' },
  paceHint: { marginTop: 8, padding: 10, borderRadius: 10, backgroundColor: 'rgba(224,120,86,0.10)', borderWidth: 1, borderColor: 'rgba(224,120,86,0.25)' },
  saveBtn: { marginTop: 16, paddingVertical: 13, borderRadius: 12, backgroundColor: SAFFRON, alignItems: 'center' },
});
