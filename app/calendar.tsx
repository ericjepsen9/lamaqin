import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, Info, RotateCcw } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScrollTitleBar, useScrollTitleBar } from '@/components/scroll-title-bar';
import { Text } from '@/components/ui/text';
import { addDays, addMonths, buddhaEvents, dow, folkEvents, isCeremony, monthCells, todayUTC8, weekDays, WEEKDAYS, type TibetanDay } from '@/lib/tibetan';
import { useTibetanLookup } from '@/lib/queries/tibetan-db';

// 藏历页(手账卡·PM 2026-06-30)。
//   · 周视图(默认):暖渐变 + 大号「藏历月名」标题 + 螺旋装订圆角卡;卡内 周条 + 当日详情(居中·圆形日别徽章)。
//   · 月视图:细标题栏(藏历月名作标题)+ 同款螺旋装订圆角卡;卡内【详情可滚动(无圆徽·左对齐·小标签标日别)+ 月历网格固定】——
//     当天信息多也能滚动看全,日期区(网格)始终完整、不被挤掉(PM 2026-06-30)。
//   · 日别:法会(绛红)/ 功德日(金)/ 平日;斋戒/佛事有才显示;民俗(理发)灰显;说明只留真实事项(去通用宜修句·PM)。
//   · 选中/今日用规范主色 saffron(不用黑)。画报(决策172)移首页。藏历按 UTC+8 取「今天」(决策075)。
const INK = '#2b2218';
const INK2 = '#55463a';
const INK3 = '#7e6d5b';
const SAFFRON = '#e07856';
const SAFFRON_DARK = '#b35535';
const GOLD = '#b88956';        // 规范 gold-dark(功德日点)
const GOLD_PALE = '#fbf3e8';   // 规范 gold-pale(chip / 标签底)
const CRIMSON = '#a13c2e';
const CREAM = '#FBF4E9';

// 日别判定:法会 > 功德日 > 平日。
function dayKind(d?: TibetanDay): 'fa' | 'gong' | 'plain' {
  if (isCeremony(d)) return 'fa';
  if (d?.auspicious) return 'gong';
  return 'plain';
}
// 周条/月格小格只显示藏历「日」(去「五月」等月前缀,避免换行)。
const tibDay = (t?: string) => (t ?? '').replace(/^[一二三四五六七八九十]+月/, '');

export default function Calendar() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const today = todayUTC8();
  const [mode, setMode] = useState<'week' | 'month'>('week'); // 默认周视图
  const [selected, setSelected] = useState(today);            // 默认选中今天
  const [legend, setLegend] = useState(false);

  const tib = useTibetanLookup(selected);   // 设计⑥:共享库优先·本地JSON兜底
  const day = tib(selected);
  const heroMonth = day?.tibetanMonth ?? '藏历';
  const bar = useScrollTitleBar(); // 周视图:大标题滚出后顶部淡入细标题栏(带返回·PM 2026-07-02);月视图有自己的固定标题栏,不用

  // 卡头(周/月切换 + 图例 + 今日)——周月共用
  const chead = (
    <View style={styles.chead}>
      <View style={styles.seg}>
        {(['week', 'month'] as const).map((m) => (
          <Pressable key={m} onPress={() => { setMode(m); bar.reset(); }} style={[styles.segBtn, mode === m && styles.segOn]}>
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: mode === m ? SAFFRON : INK3 }}>{m === 'week' ? '周' : '月'}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.clinks}>
        <Pressable hitSlop={8} onPress={() => setLegend(true)} style={styles.clink}>
          <Info size={13} color={INK3} /><Text style={{ fontSize: 12, color: INK3 }}>图例</Text>
        </Pressable>
        <Pressable hitSlop={8} onPress={() => setSelected(today)} style={styles.todayBtn}>
          <RotateCcw size={12} color="#fff" /><Text style={{ fontSize: 12, color: '#fff', fontWeight: '700' }}>今日</Text>
        </Pressable>
      </View>
    </View>
  );
  const rings = <View style={styles.rings}>{Array.from({ length: 8 }).map((_, i) => <View key={i} style={styles.ring} />)}</View>;

  return (
    <View style={{ flex: 1, backgroundColor: CREAM }}>
      <LinearGradient colors={['#FBE0CE', '#FBEAD9', '#FBF4E9']} locations={[0, 0.45, 0.8]} style={[StyleSheet.absoluteFill, { height: 340 }]} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {mode === 'week' ? (
          // ---- 周视图:整页可滚(内容短),大标题 + 卡 ----
          <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false} onScroll={bar.onScroll} scrollEventThrottle={16}>
            <View onLayout={bar.onHeaderLayout} style={styles.weekHead}>
              <Pressable hitSlop={10} onPress={() => router.back()} style={styles.backCircle}><ChevronLeft size={22} color={INK} /></Pressable>
              <Text className="font-serif" style={styles.hero}>{heroMonth}</Text>
            </View>
            {rings}
            <View style={[styles.card, styles.weekCard]}>
              {chead}
              <View style={{ paddingHorizontal: 9 }}>
                <WeekStrip selected={selected} today={today} onPick={setSelected} onShift={(n) => setSelected(addDays(selected, n * 7))} />
              </View>
              <View style={styles.dash} />
              <View style={{ paddingHorizontal: 15 }}>
                <DayDetail day={day} />
              </View>
            </View>
          </ScrollView>
        ) : (
          // ---- 月视图:标题栏 + 卡(卡内详情可滚 + 网格固定) ----
          <View style={{ flex: 1 }}>
            <View style={styles.titlebar}>
              <Pressable hitSlop={10} onPress={() => router.back()} style={styles.backCircle}><ChevronLeft size={22} color={INK} /></Pressable>
              <Text className="font-serif" style={styles.titlebarTitle}>{heroMonth}</Text>
            </View>
            {rings}
            <View style={[styles.card, styles.monthCard]}>
              {chead}
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 15, paddingBottom: 12 }}>
                <DayDetail day={day} month />
              </ScrollView>
              <MonthGrid selected={selected} today={today} onPick={setSelected} onShift={(n) => setSelected(addMonths(selected, n))} />
            </View>
          </View>
        )}
        {/* topInset(同 course/[id].tsx 2026-07-17 修复):这里漏传,ScrollTitleBar 默认 topInset=0,
            周视图顶部标题栏会贴着状态栏画。这个文件本来就有 insets,漏的只是没传这一个参数。 */}
        {mode === 'week' ? <ScrollTitleBar title={heroMonth} shown={bar.shown} onBack={() => router.back()} topInset={insets.top} /> : null}
      </SafeAreaView>
      <LegendModal open={legend} onClose={() => setLegend(false)} />
    </View>
  );
}

// ---------- 当日详情(自适应·去通用宜修句) ----------
type Fact = { k: string; v?: string; chips?: string[]; muted?: boolean };
function DayDetail({ day, month }: { day?: TibetanDay; month?: boolean }) {
  const kind = dayKind(day);
  const events = buddhaEvents(day);              // 真实佛事/殊胜(去民俗)
  const tags = day?.tags ?? [];
  const folk = folkEvents(day);                  // 民俗(理发);灰显
  const emoji = kind === 'plain' ? '🪷' : '🌺';
  const label = kind === 'fa' ? '法会日' : kind === 'gong' ? '功德日' : '平日';
  const primary = events[0]?.split(/[,，]/)[0];
  const theme = primary ? `${day?.tibetan ?? ''} · ${primary}` : `${day?.tibetanMonth ?? ''} · ${day?.tibetan ?? '藏历数据待补'}`;
  const descReal = events.length ? `${events.join(';')}。` : '今日无特别加持日。安住正念,如常闻思修、护持善心。';
  const facts: Fact[] = [
    { k: '藏历', v: day ? `${day.tibetanMonth} · ${day.isIntercalary ? '闰' : ''}${day.tibetan}` : '—' },
    { k: '农历', v: day?.lunar ?? '—' },
    ...(tags.length ? [{ k: '斋戒', chips: tags } as Fact] : []),
    ...(events.length ? [{ k: '佛事', v: events.join(' · ') } as Fact] : []),
    ...(folk.length ? [{ k: '民俗', v: folk.join(' · '), muted: true } as Fact] : []),
  ];
  const factList = <View style={styles.facts}>{facts.map((f, i) => <FactRow key={f.k} {...f} last={i === facts.length - 1} />)}</View>;

  if (month) {
    // 月视图:左对齐 + 小标签(无圆形徽章·省空间)
    return (
      <View>
        <View style={[styles.badge, kind === 'fa' && styles.badgeFa, kind === 'plain' && styles.badgePlain]}>
          <Text style={[styles.badgeTxt, kind === 'fa' && { color: '#fff' }, kind === 'plain' && { color: INK3 }]}>{emoji} {label}</Text>
        </View>
        <Text className="font-serif" style={styles.themeLeft}>{theme}</Text>
        <Text style={styles.sigLeft}>{descReal}</Text>
        {factList}
      </View>
    );
  }
  // 周视图:居中 + 圆形日别徽章(保持原样)
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={[styles.medal, kind === 'gong' && styles.medalGold, kind === 'fa' && styles.medalFa]}>
        <Text style={{ fontSize: 30 }}>{emoji}</Text>
        {kind !== 'plain' ? <Text style={[styles.medalLb, kind === 'fa' && { color: '#fff' }]}>{label}</Text> : null}
      </View>
      <Text className="font-serif" style={styles.theme}>{theme}</Text>
      <Text style={styles.sig}>{descReal}</Text>
      {factList}
    </View>
  );
}

function FactRow({ k, v, chips, muted, last }: Fact & { last?: boolean }) {
  return (
    <View style={[styles.factRow, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.factK}>{k}</Text>
      {chips ? (
        <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {chips.map((c) => <View key={c} style={styles.chipGold}><Text style={{ fontSize: 11, color: '#7a5a16', fontWeight: '700' }}>{c}</Text></View>)}
        </View>
      ) : (
        <Text style={[styles.factV, muted && { color: INK3 }]}>{v}</Text>
      )}
    </View>
  );
}

// ---------- 周条 ----------
function WeekStrip({ selected, today, onPick, onShift }: { selected: string; today: string; onPick: (d: string) => void; onShift: (n: number) => void }) {
  const days = weekDays(selected);
  const tib = useTibetanLookup(selected);
  return (
    <View className="flex-row items-center" style={{ marginTop: 2 }}>
      <Pressable hitSlop={8} onPress={() => onShift(-1)}><ChevronLeft size={20} color={INK3} /></Pressable>
      <View className="flex-row" style={{ flex: 1 }}>
        {days.map((ymd) => {
          const d = tib(ymd);
          const sel = ymd === selected;
          const isToday = ymd === today;
          const k = dayKind(d);
          const dotColor = k === 'fa' ? CRIMSON : k === 'gong' ? GOLD : 'transparent';
          return (
            <Pressable key={ymd} onPress={() => onPick(ymd)} style={[styles.wcell, sel && styles.wcellSel]}>
              <Text style={[styles.wWd, sel && { color: 'rgba(255,255,255,0.85)' }]}>{WEEKDAYS[dow(ymd)]}</Text>
              <Text className="font-serif" style={[styles.wDn, { color: sel ? '#fff' : isToday ? SAFFRON_DARK : INK }]}>{Number(ymd.slice(8))}</Text>
              <Text numberOfLines={1} style={[styles.wTb, sel && { color: 'rgba(255,255,255,0.8)' }]}>{tibDay(d?.tibetan)}</Text>
              <View style={[styles.wDot, { backgroundColor: sel ? 'rgba(255,255,255,0.9)' : dotColor }]} />
            </Pressable>
          );
        })}
      </View>
      <Pressable hitSlop={8} onPress={() => onShift(1)}><ChevronRight size={20} color={INK3} /></Pressable>
    </View>
  );
}

// ---------- 月网格(固定区) ----------
function MonthGrid({ selected, today, onPick, onShift }: { selected: string; today: string; onPick: (d: string) => void; onShift: (n: number) => void }) {
  const cells = monthCells(selected);
  const tib = useTibetanLookup(selected);
  const y = selected.slice(0, 4);
  const m = Number(selected.slice(5, 7));
  return (
    <View style={styles.gridFixed}>
      <View className="flex-row items-center justify-center" style={{ gap: 18, marginBottom: 4 }}>
        <Pressable hitSlop={8} onPress={() => onShift(-1)}><ChevronLeft size={20} color={INK3} /></Pressable>
        <Text className="font-serif" style={{ fontSize: 15, fontWeight: '700', color: INK, letterSpacing: 1 }}>📿 {y} 年 {m} 月</Text>
        <Pressable hitSlop={8} onPress={() => onShift(1)}><ChevronRight size={20} color={INK3} /></Pressable>
      </View>
      <View className="flex-row">
        {WEEKDAYS.map((w) => <Text key={w} style={{ flex: 1, textAlign: 'center', fontSize: 10.5, color: INK3, paddingBottom: 2 }}>{w}</Text>)}
      </View>
      <View className="flex-row" style={{ flexWrap: 'wrap' }}>
        {cells.map((ymd, i) => {
          if (!ymd) return <View key={`e${i}`} style={styles.gcell} />;
          const d = tib(ymd);
          const sel = ymd === selected;
          const isToday = ymd === today;
          const k = dayKind(d);
          const dotColor = k === 'fa' ? CRIMSON : k === 'gong' ? GOLD : 'transparent';
          return (
            <Pressable key={ymd} onPress={() => onPick(ymd)} style={styles.gcell}>
              <View style={[styles.gnum, sel && styles.gnumSel]}>
                <Text className="font-serif" style={{ fontSize: 14, fontWeight: '700', color: sel ? '#fff' : isToday ? SAFFRON_DARK : INK }}>{Number(ymd.slice(8))}</Text>
              </View>
              <Text numberOfLines={1} style={{ fontSize: 8, color: INK3 }}>{tibDay(d?.tibetan)}</Text>
              <View style={[styles.gDot, { backgroundColor: dotColor }]} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ---------- 图例 ----------
function LegendModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.legendCard} onPress={() => {}}>
          <Text className="font-serif" style={{ fontSize: 16, fontWeight: '700', color: INK, marginBottom: 12 }}>图例</Text>
          <LegendRow color={GOLD} text="功德日 · 善恶增上(🌺)" />
          <LegendRow color={CRIMSON} text="法会日(绛红)" />
          <LegendRow color={SAFFRON} text="今日 / 选中" />
          <Text style={{ fontSize: 12, color: INK3, marginTop: 10, lineHeight: 18 }}>十斋日 / 八吉同聚 等标记在当日「斋戒」行显示。藏历按 UTC+8 取「今天」(全球同观)。民俗黄历(理发吉日)灰显。</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
function LegendRow({ color, text }: { color: string; text: string }) {
  return (
    <View className="flex-row items-center" style={{ gap: 10, paddingVertical: 5 }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
      <Text style={{ fontSize: 14, color: INK2 }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // 周视图头(大标题)
  weekHead: { paddingHorizontal: 18, paddingTop: 28, paddingBottom: 22, alignItems: 'center' },
  hero: { fontSize: 32, fontWeight: '700', color: INK, letterSpacing: 3, marginTop: 6, lineHeight: 42 },
  // 月视图标题栏
  titlebar: { height: 52, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 14 },
  titlebarTitle: { fontSize: 20, fontWeight: '700', color: INK, letterSpacing: 2, lineHeight: 28 },
  backCircle: { position: 'absolute', left: 14, top: 7, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.7)', alignItems: 'center', justifyContent: 'center', zIndex: 5 },

  rings: { flexDirection: 'row', justifyContent: 'center', gap: 17, marginBottom: -8, zIndex: 3 },
  ring: { width: 13, height: 13, borderRadius: 7, backgroundColor: '#dccdb4', borderWidth: 2, borderColor: '#c9b597' },

  // 卡片(周月同款:圆角22 + 同阴影 + 四周留白)
  card: { backgroundColor: '#fff', borderRadius: 22, marginHorizontal: 14, overflow: 'hidden', shadowColor: '#3c2814', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 22, elevation: 8 },
  weekCard: { paddingBottom: 16 },
  monthCard: { flex: 1, marginBottom: 16 },

  chead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, paddingTop: 13, paddingBottom: 10 },
  seg: { flexDirection: 'row', backgroundColor: 'rgba(43,34,24,0.06)', borderRadius: 9999, padding: 3 },
  segBtn: { paddingHorizontal: 15, paddingVertical: 5, borderRadius: 9999 },
  segOn: { backgroundColor: '#fff' },
  clinks: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 12 },
  clink: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  todayBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: SAFFRON, paddingHorizontal: 11, paddingVertical: 5, borderRadius: 9999 },

  // 周条
  wcell: { flex: 1, alignItems: 'center', borderRadius: 13, paddingVertical: 6 },
  wcellSel: { backgroundColor: SAFFRON },
  wWd: { fontSize: 11, color: INK3 },
  wDn: { fontSize: 17, fontWeight: '700', marginTop: 4 },
  wTb: { fontSize: 9, color: INK3, marginTop: 2 },
  wDot: { width: 5, height: 5, borderRadius: 3, marginTop: 3 },

  // 月网格(固定区)
  gridFixed: { backgroundColor: '#fff', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(43,34,24,0.14)', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 14 },
  // width用14.28%而非100/7算出来的长小数(2026-07-17 PM反馈"藏历页面周六不显示"根因排查):
  // 100/7=14.285714...是无限小数,7个格子按这个宽度累加在安卓上会有浮点误差,累计超出100%导致
  // flex-wrap判定"第7个放不下"提前换行——整月每一行都只排6格,周六被挤到下一行开头(顶到周日
  // 那一列),看起来"周六列永远空+日期整体错位一格"。14.28%×7=99.96%,留一点余量,不会溢出。
  gcell: { width: '14.28%', alignItems: 'center', paddingTop: 3, paddingBottom: 1, height: 44 },
  gnum: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  gnumSel: { backgroundColor: SAFFRON },
  gDot: { width: 4, height: 4, borderRadius: 2, marginTop: 2 },

  // 详情
  dash: { height: 9, marginHorizontal: 15, marginVertical: 12, borderTopWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(43,34,24,0.22)' },
  // 周视图:圆形徽章
  medal: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e6efea' },
  medalGold: { backgroundColor: '#f5e3ce' },
  medalFa: { backgroundColor: 'rgba(161,60,46,0.85)' },
  medalLb: { fontSize: 11, fontWeight: '700', color: '#7a5a16', marginTop: 1 },
  theme: { fontSize: 18, fontWeight: '700', color: INK, marginTop: 8, textAlign: 'center', paddingHorizontal: 8 },
  sig: { fontSize: 13, lineHeight: 22, marginTop: 5, marginHorizontal: 6, textAlign: 'center', color: INK2 },
  // 月视图:小标签 + 左对齐
  badge: { alignSelf: 'flex-start', backgroundColor: GOLD_PALE, borderRadius: 9999, paddingHorizontal: 11, paddingVertical: 3, marginTop: 2 },
  badgeFa: { backgroundColor: 'rgba(161,60,46,0.85)' },
  badgePlain: { backgroundColor: 'rgba(43,34,24,0.06)' },
  badgeTxt: { fontSize: 12, fontWeight: '700', color: '#7a5a16' },
  themeLeft: { fontSize: 18, fontWeight: '700', color: INK, marginTop: 7, lineHeight: 25 },
  sigLeft: { fontSize: 13.5, lineHeight: 23, marginTop: 6, color: INK, fontWeight: '600' },

  facts: { alignSelf: 'stretch', marginTop: 12 },
  factRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(43,34,24,0.06)' },
  factK: { fontSize: 14, fontWeight: '700', color: INK3, width: 40 },
  factV: { flex: 1, fontSize: 14, color: INK, lineHeight: 20 },
  chipGold: { backgroundColor: GOLD_PALE, borderRadius: 9999, paddingHorizontal: 10, paddingVertical: 3 },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  legendCard: { backgroundColor: CREAM, borderRadius: 18, padding: 20, width: '100%', maxWidth: 320 },
});
