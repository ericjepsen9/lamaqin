// ════════════════════════════════════════════════════════════════════
// 管理端共享 UI 组件库（单一组件源）
// ────────────────────────────────────────────────────────────────────
// 目的：徽章 / 头像 / 卡片 / 统计块 / 按钮 / 区块标题 / 搜索框 / 筛选标签 / 表格
// 全后台统一引用此处，改一处所有页面跟着变（与 lib/theme.ts 色值源配套）。
// 色彩铁律见 theme.ts：实心底→白字，浅底→同族深色字，禁止浅底配近黑。
// 规范说明：docs/ui_spec_v2.md §6 / §9。
// ════════════════════════════════════════════════════════════════════
import { ChevronLeft, X } from 'lucide-react-native';
import { type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import {
  BORDER,
  BORDER_LIGHT,
  CARD,
  CRIMSON,
  CRIMSON_PALE,
  GOLD_DARK,
  GOLD_PALE,
  INK,
  INK2,
  INK3,
  INK4,
  INK5,
  RADIUS,
  SAFFRON,
  SAFFRON_DARK,
  SAFFRON_LIGHT,
  SAGE_DARK,
  SAGE_PALE,
  SURFACE,
} from '@/lib/theme';

// 密法专用紫（仅审计/权限标签用，theme 未收为通用 token）
const VIOLET = '#7b6ea0';
const VIOLET_PALE = '#f0edf8';
// 青绿（题型等需第 7 色时用，与 sage 区分）
const TEAL = '#3a7b6e';
const TEAL_PALE = '#e4efec';
// 米色（详情页返回栏背景，与 _layout TopBar 一致）
const CREAM = '#FBF4E9';

// ─── Badge 通用徽章 ───────────────────────────────────────────────────
// 各页状态枚举不同（学员/班级/成员/出勤…），故基座只认「色调 tone」，
// 各页把自己的 status 映射成 tone + 文案即可，视觉永远一致。
export type BadgeTone = 'saffron' | 'sage' | 'gold' | 'crimson' | 'neutral' | 'violet' | 'teal';

const BADGE_COLORS: Record<BadgeTone, { bg: string; fg: string }> = {
  saffron: { bg: SAFFRON_LIGHT, fg: SAFFRON_DARK },
  sage: { bg: SAGE_PALE, fg: SAGE_DARK },
  gold: { bg: GOLD_PALE, fg: GOLD_DARK },
  crimson: { bg: CRIMSON_PALE, fg: CRIMSON },
  neutral: { bg: 'rgba(43,34,24,0.07)', fg: INK3 },
  violet: { bg: VIOLET_PALE, fg: VIOLET },
  teal: { bg: TEAL_PALE, fg: TEAL },
};

export function Badge({ tone = 'neutral', children, style }: { tone?: BadgeTone; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = BADGE_COLORS[tone];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }, style]}>
      <Text style={[styles.badgeText, { color: c.fg }]}>{children}</Text>
    </View>
  );
}

// ─── Avatar 首字头像 ──────────────────────────────────────────────────
export function Avatar({ name, size = 42 }: { name: string | null | undefined; size?: number }) {
  const initial = name ? name.slice(0, 1) : '?';
  const fontSize = Math.round(size * 0.38);
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text className="font-serif" style={[styles.avatarText, { fontSize }]}>{initial}</Text>
    </View>
  );
}

// ─── Card / SectionCard / SectionHeader ───────────────────────────────
export function Card({ children, style, onPress, selected }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; selected?: boolean }) {
  const content = [styles.card, selected && styles.cardSelected, style];
  if (onPress) {
    return <Pressable style={content} onPress={onPress}>{children}</Pressable>;
  }
  return <View style={content}>{children}</View>;
}

export function SectionCard({ title, children, style }: { title?: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.card, styles.sectionCard, style]}>
      {title ? <Text className="font-serif" style={styles.sectionTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

export function SectionHeader({ title, moreLabel, onMore }: { title: string; moreLabel?: string; onMore?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <Text className="font-serif" style={styles.sectionHeaderTitle}>{title}</Text>
      {moreLabel ? (
        <Pressable onPress={onMore} hitSlop={6}><Text style={styles.sectionMore}>{moreLabel}</Text></Pressable>
      ) : null}
    </View>
  );
}

// ─── StatCard 统计块 ──────────────────────────────────────────────────
// variant 'bar' = 左侧 accent 竖条（学员详情等）；'tint' = 柔色卡底（Dashboard KPI）
export function StatCard({ label, value, accent, sub, tint, variant = 'bar', onPress }: {
  label: string;
  value: string | number;
  accent: string;
  sub?: string;
  tint?: string;
  variant?: 'bar' | 'tint';
  onPress?: () => void;
}) {
  const isTint = variant === 'tint';
  const containerStyle: StyleProp<ViewStyle> = isTint
    ? [styles.statCardTint, { backgroundColor: tint ?? (accent + '14'), borderColor: accent + '22' }]
    : [styles.statCardBar, { borderLeftColor: accent }];
  const inner = (
    <>
      {isTint ? <Text style={styles.statTintLabel}>{label}</Text> : null}
      <Text className="font-serif" style={[isTint ? styles.statTintValue : styles.statBarValue, { color: accent }]}>{value}</Text>
      {!isTint ? <Text style={styles.statBarLabel}>{label}</Text> : null}
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </>
  );
  if (onPress) return <Pressable onPress={onPress} style={containerStyle}>{inner}</Pressable>;
  return <View style={containerStyle}>{inner}</View>;
}

// ─── AdminButton 按钮（主 / 次 / 否定 / 危险，胶囊形）────────────────────
// 配方对齐 ui_spec_v2.md §6 + theme.ts BTN。primary 实心橙白字；
// secondary 软橙药丸；negative 白底灰边深橙；danger 浅绛红描边。
// primary 实心橙白字 / secondary 软橙药丸 / negative 白底灰边深橙 /
// confirm 正向确认浅绿底深绿字(确认毕业等) / danger 浅绛红描边
export type AdminButtonVariant = 'primary' | 'secondary' | 'negative' | 'confirm' | 'danger';

const BTN_CONTAINER: Record<AdminButtonVariant, ViewStyle> = {
  primary: { backgroundColor: SAFFRON },
  secondary: { backgroundColor: SAFFRON_LIGHT },
  negative: { backgroundColor: CARD, borderWidth: 1, borderColor: INK5 },
  confirm: { backgroundColor: SAGE_PALE, borderWidth: 1, borderColor: 'rgba(77,110,61,0.25)' },
  danger: { backgroundColor: CRIMSON_PALE, borderWidth: 1, borderColor: 'rgba(161,60,46,0.3)' },
};
const BTN_TEXT: Record<AdminButtonVariant, string> = {
  primary: '#fff',
  secondary: SAFFRON_DARK,
  negative: SAFFRON_DARK,
  confirm: SAGE_DARK,
  danger: CRIMSON,
};

export function AdminButton({ variant = 'primary', children, onPress, size = 'md', style, disabled, icon, testID }: {
  variant?: AdminButtonVariant;
  children: ReactNode;
  onPress?: () => void;
  size?: 'md' | 'sm';
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  icon?: ReactNode; // 可选左图标，颜色由调用方按变体文字色传入（primary 用 #fff）
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      style={[styles.btn, size === 'sm' ? styles.btnSm : styles.btnMd, BTN_CONTAINER[variant], disabled && { opacity: 0.45 }, style]}
    >
      {icon}
      <Text style={[styles.btnText, size === 'sm' && styles.btnTextSm, { color: BTN_TEXT[variant] }]}>{children}</Text>
    </Pressable>
  );
}

// 按变体取文字色，供调用方给 icon 配色（如 ADMIN_BTN_FG.primary）
export const ADMIN_BTN_FG = BTN_TEXT;

// ─── SearchBar 搜索框 ─────────────────────────────────────────────────
export function SearchBar({ value, onChangeText, placeholder = '搜索…', style, testID }: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <View style={[styles.searchBar, style]}>
      <TextInput
        testID={testID}
        style={styles.searchInput}
        placeholder={placeholder}
        placeholderTextColor={INK4}
        value={value}
        onChangeText={onChangeText}
      />
    </View>
  );
}

// ─── FilterChips 筛选标签组 ───────────────────────────────────────────
export function FilterChips<T extends string>({ items, value, onChange, style }: {
  items: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.chipRow, style]}>
      {items.map((it) => {
        const active = it.key === value;
        return (
          <Pressable key={it.key} style={[styles.chip, active && styles.chipActive]} onPress={() => onChange(it.key)}>
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{it.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Table 宽屏表格基座 ───────────────────────────────────────────────
export type TableColumn = { label: string; flex: number };

export function Table({ columns, children }: { columns: TableColumn[]; children: ReactNode }) {
  return (
    <View style={styles.table}>
      <View style={styles.tableHeader}>
        {columns.map((col, i) => (
          <Text key={i} style={[styles.tableHeaderText, { flex: col.flex }]}>{col.label}</Text>
        ))}
      </View>
      {children}
    </View>
  );
}

export function TableRow({ children, onPress, last }: { children: ReactNode; onPress?: () => void; last?: boolean }) {
  const rowStyle = [styles.tableRow, last && { borderBottomWidth: 0 }];
  if (onPress) return <Pressable style={rowStyle} onPress={onPress}>{children}</Pressable>;
  return <View style={rowStyle}>{children}</View>;
}

// ─── Divider / EmptyState 辅助 ────────────────────────────────────────
export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, style]} />;
}

export function EmptyState({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.empty, style]}>{children}</Text>;
}

// 查询失败态(审计 P2·2026-07-02:多屏只有 loading+empty,error 静默装成"空数据"会误导)。
// 与 EmptyState 同视觉层级,仅换文案与色;调用处:error ? <ErrorState /> : …
export function ErrorState({ children }: { children?: ReactNode }) {
  return <Text style={[styles.empty, { color: '#a13c2e' }]}>{children ?? '加载失败,请检查网络或权限后重试。'}</Text>;
}

// ─── AdminModal 居中弹窗 + ModalField / ModalActions / ModalFootnote ────
// 统一外壳:白底圆角18 卡、遮罩 rgba(43,34,24,.4)、顶部标题 + X 关闭、fade 动画。
// dismissOnOverlay 默认 true(点遮罩关闭);**含表单输入的弹窗传 false**,防点遮罩误关丢数据。
export function AdminModal({ visible, onClose, title, children, maxWidth = 460, dismissOnOverlay = true }: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: number;
  dismissOnOverlay?: boolean;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={dismissOnOverlay ? onClose : undefined}>
        {/* 内层 Pressable 拦截点击冒泡,点卡片内部不触发遮罩关闭 */}
        <Pressable style={[styles.modalCard, { maxWidth }]} onPress={() => {}}>
          <View style={styles.modalHeader}>
            <Text className="font-serif" style={styles.modalTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <X size={20} color={INK3} />
            </Pressable>
          </View>
          {/* 内容区补ScrollView(2026-07-14 e2e首次测到admin端长表单发现):此前无maxHeight/无滚动,
              字段多的表单(如新建法会)内容比视口高时,底部提交按钮会被推到视口外且点不到。 */}
          <ScrollView contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function ModalActions({ children }: { children: ReactNode }) {
  return <View style={styles.modalActions}>{children}</View>;
}

export function ModalFootnote({ children }: { children: ReactNode }) {
  return <Text style={styles.modalFootnote}>{children}</Text>;
}

// 弹窗内统一表单输入框(标签 + 输入;multiline 用于 JSON/多行文本)
export function ModalField({ label, value, onChangeText, placeholder, multiline, keyboardType, secureTextEntry, testID }: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'numeric';
  secureTextEntry?: boolean; // 密码类字段遮罩(2026-07-15·后台创建学员的初始密码输入)
  testID?: string;
}) {
  return (
    <View style={styles.modalFieldWrap}>
      <Text style={styles.modalFieldLabel}>{label}</Text>
      <TextInput
        testID={testID}
        style={[styles.modalFieldInput, multiline && styles.modalFieldInputMultiline]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={INK4}
        multiline={multiline}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        autoCapitalize={secureTextEntry ? 'none' : undefined}
      />
    </View>
  );
}

// ─── Screen 页面骨架（SafeAreaView + 背景 + 可选固定头 / 滚动区）────────
// 新页面统一用它起头：<Screen scroll header={<DetailHeader .../>}>...</Screen>
// header 固定不滚，children 进滚动区；scroll=false 时 children 直接铺满（自管滚动）。
export function Screen({ children, scroll = false, edges = ['bottom'], contentStyle, header }: {
  children: ReactNode;
  scroll?: boolean;
  edges?: readonly Edge[];
  contentStyle?: StyleProp<ViewStyle>;
  header?: ReactNode;
}) {
  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      {header}
      {scroll ? (
        <ScrollView contentContainerStyle={[styles.screenScroll, contentStyle]} showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      ) : (
        children
      )}
    </SafeAreaView>
  );
}

// ─── DetailHeader 详情页返回栏（← 返回 + 居中标题 + 可选右侧操作）────────
export function DetailHeader({ title, onBack, backLabel = '返回', right }: {
  title: string;
  onBack: () => void;
  backLabel?: string; // 默认「返回」；可传「关怀清单」「题库」等指明返回去向
  right?: ReactNode;
}) {
  return (
    <View style={styles.detailHeader}>
      <Pressable onPress={onBack} hitSlop={8} style={styles.detailHeaderBack}>
        <ChevronLeft size={20} color={SAFFRON} />
        <Text style={styles.detailHeaderBackText} numberOfLines={1}>{backLabel}</Text>
      </Pressable>
      <Text className="font-serif" style={styles.detailHeaderTitle} numberOfLines={1}>{title}</Text>
      <View style={styles.detailHeaderRight}>{right}</View>
    </View>
  );
}

// ─── SegmentedControl 整宽分段选择器（单选；与 FilterChips 的区别=等宽分段）─
export function SegmentedControl<T extends string>({ items, value, onChange, style }: {
  items: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.segContainer, style]}>
      {items.map((it) => {
        const active = it.key === value;
        return (
          <Pressable key={it.key} style={[styles.segItem, active && styles.segItemActive]} onPress={() => onChange(it.key)}>
            <Text style={[styles.segText, active && styles.segTextActive]}>{it.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// 页面根容器背景（各页 SafeAreaView 统一用）
export const SCREEN_BG = SURFACE;

const styles = StyleSheet.create({
  // Badge
  badge: { paddingHorizontal: 9, paddingVertical: 2, borderRadius: RADIUS.pill, alignSelf: 'flex-start' },
  badgeText: { fontSize: 11, fontWeight: '600' },
  // Avatar
  avatar: { backgroundColor: SAFFRON_LIGHT, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '700', color: SAFFRON_DARK },
  // Card
  card: { backgroundColor: CARD, borderRadius: RADIUS.card, borderWidth: 1, borderColor: BORDER, shadowColor: '#2b2218', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  cardSelected: { borderColor: SAFFRON, backgroundColor: '#fdf8f4' },
  sectionCard: { padding: 16, gap: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: INK },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  sectionHeaderTitle: { fontSize: 17, fontWeight: '700', color: INK, letterSpacing: 1 },
  sectionMore: { fontSize: 11, color: SAFFRON_DARK, fontWeight: '500' },
  // StatCard
  // minWidth 用【像素下限】而非 '45%':45% 下限放进不换行的横排里,3+ 张就总宽 >100% 溢出、被外层
  //   overflow:hidden 切掉右侧(PM 反馈"卡片被挡住")。像素下限可在 PC 一行排 4 张、窄屏自动换行 2 张。
  statCardBar: { flex: 1, minWidth: 132, backgroundColor: SURFACE, borderRadius: RADIUS.input, padding: 12, gap: 4, borderLeftWidth: 3 },
  statBarValue: { fontSize: 20, fontWeight: '800' },
  statBarLabel: { fontSize: 12, color: INK3 },
  statCardTint: { flex: 1, minWidth: 132, borderRadius: RADIUS.cardLg, padding: 18, gap: 6, borderWidth: 1 },
  statTintLabel: { fontSize: 12, color: INK2, fontWeight: '600', letterSpacing: 1 },
  statTintValue: { fontSize: 34, fontWeight: '700', letterSpacing: -0.5 },
  statSub: { fontSize: 11, color: INK3 },
  // Button
  btn: { borderRadius: RADIUS.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  btnMd: { paddingHorizontal: 16, paddingVertical: 10 },
  btnSm: { paddingHorizontal: 12, paddingVertical: 6 },
  btnText: { fontSize: 13, fontWeight: '600' },
  btnTextSm: { fontSize: 12 },
  // SearchBar
  searchBar: { padding: 16, paddingBottom: 8 },
  searchInput: { backgroundColor: CARD, borderRadius: RADIUS.input + 2, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: INK, borderWidth: 1, borderColor: 'rgba(43,34,24,0.1)' },
  // Chips
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: RADIUS.pill, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER },
  chipActive: { backgroundColor: SAFFRON, borderColor: SAFFRON },
  chipText: { fontSize: 13, color: INK2, fontWeight: '500' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  // Table
  table: { backgroundColor: CARD, borderRadius: RADIUS.card, overflow: 'hidden', borderWidth: 1, borderColor: BORDER, shadowColor: '#2b2218', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  tableHeader: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 11, backgroundColor: '#faf6f0', borderBottomWidth: 1, borderBottomColor: BORDER_LIGHT },
  tableHeaderText: { fontSize: 11, fontWeight: '700', color: INK3, letterSpacing: 1 },
  tableRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 13, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: 'rgba(43,34,24,0.05)' },
  // Divider / Empty
  divider: { height: 1, backgroundColor: 'rgba(43,34,24,0.07)' },
  empty: { color: INK3, fontSize: 13, textAlign: 'center', paddingVertical: 16 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(43,34,24,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { width: '100%', maxHeight: '90%', backgroundColor: CARD, borderRadius: 18, padding: 22, gap: 14 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  modalScrollContent: { gap: 14 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: INK, letterSpacing: 0.5, flex: 1 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  modalFootnote: { fontSize: 10, color: INK4, textAlign: 'center', marginTop: 4 },
  modalFieldWrap: { gap: 6 },
  modalFieldLabel: { fontSize: 13, color: INK2, fontWeight: '500' },
  modalFieldInput: { backgroundColor: SURFACE, borderRadius: RADIUS.input, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: INK, borderWidth: 1, borderColor: BORDER },
  modalFieldInputMultiline: { minHeight: 100, textAlignVertical: 'top' },
  // Screen
  screen: { flex: 1, backgroundColor: SURFACE },
  screenScroll: { padding: 16, gap: 12, paddingBottom: 40 },
  // DetailHeader
  detailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 12, backgroundColor: CREAM, borderBottomWidth: 1, borderBottomColor: BORDER },
  detailHeaderBack: { flexDirection: 'row', alignItems: 'center', minWidth: 64 },
  detailHeaderBackText: { fontSize: 14, color: SAFFRON, fontWeight: '600' },
  detailHeaderTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: INK },
  detailHeaderRight: { minWidth: 64, alignItems: 'flex-end' },
  // SegmentedControl
  segContainer: { flexDirection: 'row', backgroundColor: SURFACE, borderRadius: RADIUS.pill, padding: 3, borderWidth: 1, borderColor: BORDER },
  segItem: { flex: 1, paddingVertical: 8, borderRadius: RADIUS.pill, alignItems: 'center', justifyContent: 'center' },
  segItemActive: { backgroundColor: SAFFRON },
  segText: { fontSize: 13, color: INK2, fontWeight: '500' },
  segTextActive: { color: '#fff', fontWeight: '600' },
});
