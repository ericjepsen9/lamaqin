import { format, isSameDay, subDays } from 'date-fns';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Calendar, ChevronLeft, Plus, Sliders, XCircle } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text as RNText, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DatePickerModal } from '@/components/month-calendar';
import { QuickCountSheet } from '@/components/quick-count-sheet';
import { Text } from '@/components/ui/text';
import { notify } from '@/lib/dialog';
import { useDeleteCustomVow, useRecordPracticeLog, useUpdateVowPace } from '@/lib/mutations/practice';
import { useMyVows, useVowLogs, vowPace, VOW_STATUS_LABEL, type MyVow } from '@/lib/queries/practice';
import { testIds } from '@/lib/testids';

// 功课详情 / 管理(决策160)。从修持页「我的功课」卡片点入(?id=vowId)。接真:useMyVows() 按 id 取本人这条愿。
// · 累计 = current_count(计数型)/ current_session_count(时长型);今日/本周来自 practice_logs 聚合。
// · 节奏(决策085/原则4):每日/每周目标本人可改、无需审批(auto/custom 均可改节奏);追加 pace_history。
// · 补录(原则6·信任师兄):补打过去日期遍数/座次,即时生效(DB 约束禁未来)。
// · 计数历史:practice_logs 倒序。
// · 放弃:仅自定功课(custom)软删(status→abandoned·保留历史);班级/自学功课由系统管理不可放弃。
const INK = '#2b2218';
const INK2 = '#55463a';
const INK3 = '#7e6d5b';
const SAFFRON = '#e07856';
const SAFFRON_DARK = '#b35535';
const SAGE = '#6f9a86';
const CRIM = '#a13c2e';
const WARN = '#b88956';

const PERIOD_LABEL: Record<string, string> = { lifetime: '终生持诵', until_complete: '限期完成', daily: '每日功课', weekly: '每周功课' };

export default function VowDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: vows = [], isLoading, isError } = useMyVows();
  const record = useRecordPracticeLog();
  const del = useDeleteCustomVow();
  const [qcOpen, setQcOpen] = useState(false);
  const [paceOpen, setPaceOpen] = useState(false);
  const [backfillOpen, setBackfillOpen] = useState(false);
  const [confirmAbandon, setConfirmAbandon] = useState(false);

  const vow = vows.find((v) => v.vowId === id);

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF4E9' }} edges={['top']}>
        <Header title="功课详情" onBack={() => router.back()} />
        <View style={{ paddingVertical: 60, alignItems: 'center' }}><ActivityIndicator color={SAFFRON_DARK} /></View>
      </SafeAreaView>
    );
  }
  if (isError) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF4E9' }} edges={['top']}>
        <Header title="功课详情" onBack={() => router.back()} />
        <View style={{ padding: 24, alignItems: 'center' }}>
          <RNText style={{ fontSize: 14, color: INK3, textAlign: 'center', lineHeight: 22 }}>加载失败,请检查网络后重试(不代表这项功课不存在)。</RNText>
        </View>
      </SafeAreaView>
    );
  }
  if (!vow) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF4E9' }} edges={['top']}>
        <Header title="功课详情" onBack={() => router.back()} />
        <View style={{ padding: 24, alignItems: 'center' }}>
          <RNText style={{ fontSize: 14, color: INK3, textAlign: 'center', lineHeight: 22 }}>没有找到这项功课,可能已放弃或不在当前列表。</RNText>
        </View>
      </SafeAreaView>
    );
  }

  const isCount = vow.measurement === 'count';
  const done = isCount ? vow.currentCount : vow.currentSessions;
  const unit = isCount ? vow.unit : '座';
  const target = vow.targetCount;
  const pct = target ? Math.round((done / target) * 100) : null;
  const reached = target ? done >= target : false;
  const sourceTag = vow.source === 'auto'
    ? (vow.cohortName ? `班级功课 · ${vow.cohortName}` : '班级功课')
    : '自定功课';
  // 应完成配速:班级愿存量 / 限期愿反向算(剩余÷剩余天·周) / 终生设的每日目标(见 vowPace)
  const pace = vowPace(vow);
  const paceMain = pace.daily != null
    ? `每日应完成 ${pace.daily.toLocaleString()} ${unit} · 每周 ${(pace.weekly ?? 0).toLocaleString()} ${unit}`
    : vow.targetPeriod === 'until_complete' ? (reached ? '已达标 · 可继续' : '按进度推进')
    : '随心积累';
  const periodText = PERIOD_LABEL[vow.targetPeriod] ?? vow.targetPeriod;
  const canAdjustPace = vow.targetPeriod !== 'until_complete';  // 终生/班级可手调每日·每周;限期由截止日反算,不手调
  const isDerivedLimited = vow.targetPeriod === 'until_complete' && pace.daily != null;
  const todayHit = pace.daily != null && pace.daily > 0 && vow.todayCount >= pace.daily;  // 今日达成 → 绿色

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF4E9' }} edges={['top']}>
      <Header title={vow.name} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }}>
        {/* 进度 hero */}
        <View style={styles.hero}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <View style={styles.tag}><RNText style={{ fontSize: 11, fontWeight: '700', color: vow.source === 'auto' ? SAFFRON_DARK : INK3 }}>{sourceTag}</RNText></View>
            {vow.isRequired ? <View style={[styles.tag, { backgroundColor: 'rgba(224,120,86,0.12)' }]}><RNText style={{ fontSize: 11, fontWeight: '700', color: SAFFRON_DARK }}>升学硬依据</RNText></View> : null}
            {vow.timeLimited ? <View style={[styles.tag, { backgroundColor: 'rgba(161,60,46,0.10)' }]}><RNText style={{ fontSize: 11, fontWeight: '700', color: CRIM }}>限时{vow.endDate ? ` · 截止 ${vow.endDate}` : ''}</RNText></View> : null}
          </View>
          {/* A3·SD-5:掉队/告急提示(克制,on_track/na 不出现) */}
          {VOW_STATUS_LABEL[vow.status] ? (
            <View style={[styles.statusBanner, { backgroundColor: vow.status === 'at_risk' ? 'rgba(161,60,46,0.10)' : 'rgba(184,137,86,0.12)' }]}>
              <RNText style={{ fontSize: 12.5, fontWeight: '700', color: vow.status === 'at_risk' ? CRIM : WARN }}>{VOW_STATUS_LABEL[vow.status]}</RNText>
            </View>
          ) : null}
          <Text className="font-serif" style={{ fontSize: 44, fontWeight: '700', color: INK, marginTop: 8 }}>{done.toLocaleString()}</Text>
          <RNText style={{ fontSize: 13, color: INK3 }}>{unit}{target ? ` / 目标 ${target.toLocaleString()}` : ' · 终生累积'}</RNText>
          {pct != null ? (
            <View style={styles.bar}><View style={[styles.barFill, { width: `${Math.min(pct, 100)}%`, backgroundColor: reached ? SAGE : SAFFRON }]} /></View>
          ) : null}
          {reached ? <RNText style={{ fontSize: 12, color: SAGE, fontWeight: '700', marginTop: 8 }}>已达标 · 可继续超额积累</RNText> : null}
        </View>

        {/* 今日 / 本周 / 进度(今日达成每日目标 → 绿色) */}
        <View style={styles.statsCard}>
          <Stat k="今日" v={`${vow.todayCount.toLocaleString()} ${unit}`} hl={todayHit} />
          <View style={styles.statDiv} />
          <Stat k="本周" v={`${vow.weekCount.toLocaleString()} ${unit}`} />
          {pct != null ? (<><View style={styles.statDiv} /><Stat k="进度" v={`${pct}%`} /></>) : null}
        </View>

        {/* 计数(计数型)/ 记一笔(时长型;2026-07-17 修:此前文案指向"快速计数",但该弹层结构性
            只收计数型愿、从不含时长型,师兄找不到打卡入口——改为本页直接开「记录」弹层,默认今天,
            也可选过去日期,不再依赖措辞正确的说明文字) */}
        {isCount ? (
          <Pressable style={styles.countBtn} onPress={() => setQcOpen(true)}>
            <Plus size={18} color="#fff" /><RNText style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>计数</RNText>
          </Pressable>
        ) : (
          <Pressable style={styles.countBtn} onPress={() => setBackfillOpen(true)}>
            <Plus size={18} color="#fff" /><RNText style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>记一笔</RNText>
          </Pressable>
        )}

        {/* 节奏 + 周期(决策085 节奏自主) */}
        <Section title="节奏 · 周期">
          <View style={styles.infoRow}>
            <View style={{ flex: 1 }}>
              <RNText style={{ fontSize: 14, fontWeight: '600', color: INK }}>{paceMain}</RNText>
              <RNText style={{ fontSize: 12, color: INK3, marginTop: 2 }}>
                {periodText}
                {vow.endDate ? ` · 截止 ${vow.endDate}` : ''}
                {vow.startDate ? ` · 起修 ${vow.startDate}` : ''}
              </RNText>
            </View>
            {canAdjustPace ? (
              <Pressable testID={testIds.vowDetail.paceButton} hitSlop={6} style={styles.smallBtn} onPress={() => setPaceOpen(true)}>
                <Sliders size={14} color={SAFFRON_DARK} /><RNText style={{ fontSize: 13, fontWeight: '700', color: SAFFRON_DARK }}>{pace.daily != null ? '调整' : '设目标'}</RNText>
              </Pressable>
            ) : null}
          </View>
          {vow.source === 'auto' ? <RNText style={{ fontSize: 11, color: INK3, marginTop: 6 }}>班级功课:项目 / 总数 / 周期锁定,仅节奏可调。</RNText>
            : isDerivedLimited ? <RNText style={{ fontSize: 11, color: INK3, marginTop: 6 }}>限期功课:每日 / 每周量按&ldquo;剩余 ÷ 剩余天 · 周&rdquo;自动算,落下会自动调高。</RNText> : null}
        </Section>

        {/* 补录(信任师兄·原则6)。时长型愿已改用上方「记一笔」统一入口(同一个 BackfillSheet,
            自带"今天/昨天/前天/选日期",不必再重复一个入口),此处只留给计数型愿单独补过去的遍数。 */}
        {isCount ? (
          <Section title="补录">
            <Pressable testID={testIds.vowDetail.backfillButton} style={styles.infoRow} onPress={() => setBackfillOpen(true)}>
              <Calendar size={18} color={INK2} />
              <View style={{ flex: 1 }}>
                <RNText style={{ fontSize: 14, fontWeight: '600', color: INK }}>补录过去的遍数</RNText>
                <RNText style={{ fontSize: 12, color: INK3, marginTop: 1 }}>选过去日期补记,即时生效</RNText>
              </View>
              <RNText style={{ fontSize: 13, fontWeight: '700', color: SAFFRON_DARK }}>补录 ›</RNText>
            </Pressable>
          </Section>
        ) : null}

        {/* 计数历史 */}
        <VowHistory vowId={vow.vowId} isCount={isCount} unit={unit} />

        {/* 管理操作 */}
        {vow.source === 'custom' ? (
          <View style={{ gap: 8, marginTop: 4 }}>
            {confirmAbandon ? (
              <View style={styles.confirmCard}>
                <RNText style={{ fontSize: 13, color: INK, lineHeight: 20 }}>放弃后这项功课会从「我的功课」移除,已积累的计数记录仍永久保留。确认放弃?</RNText>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                  <Pressable style={[styles.ghost, { flex: 1 }]} disabled={del.isPending} onPress={() => setConfirmAbandon(false)}>
                    <RNText style={{ color: INK2, fontWeight: '700', fontSize: 14 }}>取消</RNText>
                  </Pressable>
                  <Pressable
                    testID={testIds.vowDetail.abandonConfirmButton}
                    style={[styles.solidCrim, { flex: 1 }, del.isPending && { opacity: 0.5 }]}
                    disabled={del.isPending}
                    onPress={() => del.mutate(vow.vowId, {
                      onSuccess: () => router.back(),
                      onError: (e) => notify('放弃失败', (e as Error)?.message ?? '请重试'),
                    })}
                  >
                    <RNText style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>确认放弃</RNText>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable testID={testIds.vowDetail.abandonButton} style={[styles.ghost, { borderColor: 'rgba(161,60,46,0.4)' }]} onPress={() => setConfirmAbandon(true)}>
                <XCircle size={16} color={CRIM} /><RNText style={{ color: CRIM, fontWeight: '700', fontSize: 14 }}>放弃此功课</RNText>
              </Pressable>
            )}
            <RNText style={{ fontSize: 11, color: INK3, paddingHorizontal: 4, lineHeight: 16 }}>「放弃」= 软删(标记放弃);学修档案永久保留,物理删除仅管理员。</RNText>
          </View>
        ) : (
          <RNText style={{ fontSize: 12, color: INK3, paddingHorizontal: 4, lineHeight: 18 }}>班级 / 自学功课由系统按专业发放与管理,不在此放弃;{vow.isRequired ? '为升学必修,' : ''}念满可结愿。</RNText>
        )}
      </ScrollView>

      {isCount ? (
        <QuickCountSheet
          visible={qcOpen}
          items={[{ id: vow.vowId, name: vow.name }]}
          onRecord={(vowId, n, clientToken) => record.mutate({ vowId, count: n, clientToken })}
          onClose={() => setQcOpen(false)}
        />
      ) : null}
      <PaceSheet open={paceOpen} onClose={() => setPaceOpen(false)} vow={vow} />
      <BackfillSheet open={backfillOpen} onClose={() => setBackfillOpen(false)} vow={vow} isCount={isCount} />
    </SafeAreaView>
  );
}

// 调整节奏:按周期显示对应字段(每日/每周制必填;终生/限期可选)。保留未编辑的另一项。
// A2·PD-9/PD-19(2026-07-10 补):daily_target 若配了白名单(如心经={1..9}),本人自调也只能选白名单值,
//   不给自由输入——原来只在提交后靠 DB 触发器拒绝,现在前端先拦;若锁定(如净土三选一),本人完全不可改,
//   仅admin能纠错(见后台学员详情)。白名单/锁定只管 daily_target,weekly_target 不受影响(DB 触发器同样只查 daily_target)。
function PaceSheet({ open, onClose, vow }: { open: boolean; onClose: () => void; vow: MyVow }) {
  const update = useUpdateVowPace();
  const isWeekly = vow.targetPeriod === 'weekly';
  const initial = isWeekly ? vow.weeklyTarget : vow.dailyTarget;
  // 节奏锁定/白名单(PD-6/9/19,2026-07-17方案3双通道):班级(auto)/自学(custom)各自独立配置,
  // useMyVows 已按 vow.source 选好对应那组字段暴露成 vow.dailyTargetLocked/allowedDailyTargets,
  // 这里不用再关心是哪个通道——同一条修法完全可能班级锁定、自学自由(或反过来)。
  const locked = !isWeekly && vow.dailyTargetLocked;
  const whitelist = !isWeekly && !locked && vow.allowedDailyTargets && vow.allowedDailyTargets.length > 0 ? vow.allowedDailyTargets : null;
  // 当前值若不在白名单里(老数据·约束是后补的,历史行没被回填过),不要预选一个"看似选中"却非法的值——
  // 强制本人显式重选,而不是让"什么都没碰就保存"悄悄把这个非法旧值原样传回去被DB拒绝。
  const initialPicked = whitelist && initial != null && whitelist.includes(initial) ? initial : null;
  const [val, setVal] = useState(initial ? String(initial) : '');
  const [picked, setPicked] = useState<number | null>(initialPicked);
  const num = whitelist ? picked : (val.trim() ? Number(val.replace(/[^0-9]/g, '')) : null);
  const required = vow.targetPeriod === 'daily' || vow.targetPeriod === 'weekly';
  const canSave = !locked && (!required || (num != null && num > 0)) && !update.isPending;
  const label = isWeekly ? '每周目标' : '每日目标';

  const submit = () => {
    if (!canSave) return;
    const dailyTarget = isWeekly ? vow.dailyTarget : num;   // 编辑每日时用新值,否则保留
    const weeklyTarget = isWeekly ? num : vow.weeklyTarget; // 编辑每周时用新值,否则保留
    update.mutate({ vowId: vow.vowId, dailyTarget, weeklyTarget }, {
      onSuccess: onClose,
      onError: (e) => notify('调整失败', (e as Error)?.message ?? '请重试'),
    });
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      {/* KeyboardAvoidingView(2026-07-17·PM真机实测反馈:键盘弹出挡住输入框+保存按钮,不会自动
          让位)——Modal 是独立原生层,系统不会帮它避让键盘,必须显式包一层。 */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.handle} />
            <Text className="font-serif" style={{ fontSize: 17, fontWeight: '700', color: INK }}>调整节奏</Text>
            {locked ? (
              <RNText style={{ fontSize: 13, color: INK2, marginTop: 8, lineHeight: 20 }}>
                该功课的每日目标已锁定,不可自行更改(避免变相换号)。选错了请联系管理员纠正。
              </RNText>
            ) : (
              <>
                <RNText style={{ fontSize: 12, color: INK3, marginTop: 2, marginBottom: 12 }}>改节奏无需审批,随时按自己的状态调整。</RNText>
                <Text style={{ fontSize: 12, fontWeight: '600', color: INK3, marginBottom: 6 }}>{label}{required ? '(必填)' : '(可选)'}</Text>
                {whitelist ? (
                  <>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {whitelist.map((t) => (
                        <Pressable key={t} style={[styles.pchip, picked === t && styles.pchipOn]} onPress={() => setPicked(t)}>
                          <RNText style={{ fontSize: 14, fontWeight: '700', color: picked === t ? '#fff' : INK2 }}>{t}</RNText>
                        </Pressable>
                      ))}
                    </View>
                    <RNText style={{ fontSize: 11, color: INK3, marginTop: 8 }}>该修法每日目标只能选以上数值之一。</RNText>
                  </>
                ) : (
                  <TextInput testID={testIds.vowDetail.paceInput} value={val} onChangeText={setVal} keyboardType="number-pad" placeholder={`${isWeekly ? '每周' : '每日'} ${vow.unit}数${required ? '' : ';留空=不设'}`} placeholderTextColor={INK3} maxLength={9} style={styles.fieldInput} />
                )}
              </>
            )}
            {!locked ? (
              <Pressable testID={testIds.vowDetail.paceSaveButton} style={[styles.saveBtn, !canSave && { opacity: 0.4 }]} disabled={!canSave} onPress={submit}>
                <RNText style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>保存</RNText>
              </Pressable>
            ) : null}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// 补录:选过去日期(今天/昨天/前天 快选 + 月历选具体日)+ 数量,写 practice_logs(log_date=过去日;DB 禁未来)。
const QUICK_DAYS = [{ label: '今天', back: 0 }, { label: '昨天', back: 1 }, { label: '前天', back: 2 }];
function BackfillSheet({ open, onClose, vow, isCount }: { open: boolean; onClose: () => void; vow: MyVow; isCount: boolean }) {
  const record = useRecordPracticeLog();
  const [date, setDate] = useState<Date>(new Date());
  const [calOpen, setCalOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const amountNum = amount.trim() ? Number(amount.replace(/[^0-9]/g, '')) : 0;
  const logDate = format(date, 'yyyy-MM-dd');
  const canSave = amountNum > 0 && !record.isPending;

  const reset = () => { setDate(new Date()); setCalOpen(false); setAmount(''); };
  const submit = () => {
    if (!canSave) return;
    const payload = isCount ? { vowId: vow.vowId, count: amountNum, logDate } : { vowId: vow.vowId, durationMinutes: amountNum, logDate };
    record.mutate(payload, {
      onSuccess: () => { reset(); onClose(); },
      onError: (e) => notify('补录失败', (e as Error)?.message ?? '请重试'),
    });
  };

  return (
    <>
      <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={styles.backdrop} onPress={onClose}>
            <Pressable style={styles.sheet} onPress={() => {}}>
              <View style={styles.handle} />
              <Text className="font-serif" style={{ fontSize: 17, fontWeight: '700', color: INK }}>记录 · {vow.name}</Text>
              <RNText style={{ fontSize: 12, color: INK3, marginTop: 2, marginBottom: 12 }}>选日期(默认今天,也可选过去日期补记)+ 填{isCount ? `${vow.unit}数` : '时长(分钟)'},即时累计(不能选未来)。</RNText>
              <Text style={{ fontSize: 12, fontWeight: '600', color: INK3, marginBottom: 6 }}>哪天</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {QUICK_DAYS.map((q) => {
                  const qd = subDays(new Date(), q.back);
                  const on = isSameDay(date, qd);
                  return (
                    <Pressable key={q.label} style={[styles.pchip, on && styles.pchipOn]} onPress={() => setDate(qd)}>
                      <RNText style={{ fontSize: 13, fontWeight: '600', color: on ? '#fff' : INK2 }}>{q.label}</RNText>
                    </Pressable>
                  );
                })}
                <Pressable style={styles.pchip} onPress={() => setCalOpen(true)}>
                  <RNText style={{ fontSize: 13, fontWeight: '600', color: SAFFRON_DARK }}>选日期</RNText>
                </Pressable>
              </View>
              <RNText style={{ fontSize: 11, color: SAGE, marginTop: 6 }}>补录日期:{logDate}</RNText>
              <Text style={{ fontSize: 12, fontWeight: '600', color: INK3, marginTop: 14, marginBottom: 6 }}>{isCount ? `${vow.unit}数` : '时长(分钟)'}</Text>
              <TextInput testID={testIds.vowDetail.backfillAmountInput} value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder={isCount ? `补录的${vow.unit}数` : '分钟数(≥30 计 1 座)'} placeholderTextColor={INK3} maxLength={9} style={styles.fieldInput} />
              <Pressable testID={testIds.vowDetail.backfillSubmitButton} style={[styles.saveBtn, !canSave && { opacity: 0.4 }]} disabled={!canSave} onPress={submit}>
                <RNText style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>记录</RNText>
              </Pressable>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
      <DatePickerModal visible={calOpen} value={date} maxDate={new Date()} onPick={setDate} onClose={() => setCalOpen(false)} title="选择补录日期" />
    </>
  );
}

// 计数历史:practice_logs 倒序(最多 60 条)。
function VowHistory({ vowId, isCount, unit }: { vowId: string; isCount: boolean; unit: string }) {
  const { data: logs = [], isLoading } = useVowLogs(vowId);
  return (
    <Section title="计数历史">
      {isLoading ? (
        <View style={{ paddingVertical: 16, alignItems: 'center' }}><ActivityIndicator color={SAFFRON_DARK} /></View>
      ) : logs.length === 0 ? (
        <RNText style={{ fontSize: 13, color: INK3 }}>{isCount ? '还没有记录。点上面「计数」或「补录」记一笔。' : '还没有记录。点上面「记一笔」试试。'}</RNText>
      ) : (
        <View style={styles.histCard}>
          {logs.map((l, i) => {
            const n = isCount ? l.count : (l.durationMinutes ?? l.count);
            return (
              <View key={l.id} style={[styles.histRow, i === logs.length - 1 && { borderBottomWidth: 0 }]}>
                <RNText style={{ fontSize: 13, color: INK2 }}>{l.logDate}</RNText>
                <Text className="font-serif" style={{ fontSize: 14, fontWeight: '700', color: INK }}>+{(n ?? 0).toLocaleString()} {isCount ? unit : '分钟'}</Text>
              </View>
            );
          })}
        </View>
      )}
    </Section>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.top}>
      <Pressable hitSlop={8} onPress={onBack}><ChevronLeft size={24} color={INK} /></Pressable>
      <Text className="font-serif" style={{ fontSize: 17, fontWeight: '700', color: INK, flex: 1 }} numberOfLines={1}>{title}</Text>
    </View>
  );
}

function Stat({ k, v, hl }: { k: string; v: string; hl?: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <RNText style={{ fontSize: 12, color: INK3 }}>{k}</RNText>
      <Text className="font-serif" style={{ fontSize: 17, fontWeight: '700', color: hl ? SAGE : INK, marginTop: 3 }}>{v}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text className="font-serif" style={{ fontSize: 15, fontWeight: '700', color: INK }}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  hero: { backgroundColor: '#fff', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)' },
  tag: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(43,34,24,0.06)' },
  statusBanner: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, marginTop: 8 },
  bar: { height: 6, borderRadius: 3, backgroundColor: 'rgba(43,34,24,0.10)', marginTop: 12, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  statsCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, paddingVertical: 16, borderWidth: 1, borderColor: 'rgba(43,34,24,0.06)' },
  statDiv: { width: 1, alignSelf: 'stretch', backgroundColor: 'rgba(43,34,24,0.08)', marginVertical: 4 },
  countBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: 14, backgroundColor: SAFFRON },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(43,34,24,0.06)' },
  smallBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: 'rgba(224,120,86,0.5)', borderRadius: 9999, paddingHorizontal: 12, paddingVertical: 6 },
  histCard: { backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 14, borderWidth: 1, borderColor: 'rgba(43,34,24,0.06)' },
  histRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: 'rgba(43,34,24,0.06)' },
  confirmCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(161,60,46,0.25)' },
  ghost: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(43,34,24,0.15)' },
  solidCrim: { alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: CRIM },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FBF4E9', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 32 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(43,34,24,0.18)', alignSelf: 'center', marginBottom: 12 },
  pchip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9999, backgroundColor: 'rgba(43,34,24,0.05)' },
  pchipOn: { backgroundColor: SAFFRON },
  fieldInput: { borderWidth: 1, borderColor: 'rgba(43,34,24,0.18)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 15, color: INK, backgroundColor: '#fff' },
  saveBtn: { marginTop: 16, paddingVertical: 13, borderRadius: 12, backgroundColor: SAFFRON, alignItems: 'center' },
});
