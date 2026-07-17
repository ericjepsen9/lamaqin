// 三殊胜 App · 颜色与圆角 单一事实源(管理端)
// PM 拍板 2026-06-25(决策 A–E),权威说明见 docs/ui_spec_v2.md §1/§6。
// 文字色铁律:实心底 → 白字;浅底 → 同族深色字(深橙/深绿/深金);禁止浅底配近黑。
// 各页应从此引用,勿再各自硬编码色值。

// ── 藏红 Saffron · 主操作 / 激活 / 强调 ──
export const SAFFRON       = '#e07856'; // 主按钮实心、选中态、强调、色点
export const SAFFRON_DARK  = '#b35535'; // 浅橙底上的文字/图标、文字链接、否定按钮字
export const SAFFRON_LIGHT = '#fbe5da'; // 次按钮(软橙药丸)底、头像底、标签底
export const SAFFRON_PALE  = '#fdf4ee'; // 更浅的卡底 / tint

// ── 竹叶绿 Sage · 进度 / 正常 / 已完成 ──
export const SAGE_DARK = '#4d6e3d'; // 浅底上的状态字/进度字(决策 D)
export const SAGE      = '#6f8a5e'; // 分类色点 / 中色块
export const SAGE_PALE = '#f1f6ec'; // 浅绿底
export const SAGE_SOFT = '#a8bc9a'; // 淡绿:仅大色块/进度填充(决策 D,勿做文字)

// ── 禅金 Gold · 偏滞 / 提醒 / 等第 ──
export const GOLD_DARK = '#b88956'; // 浅金底上的文字/图标(决策 E)
export const GOLD_PALE = '#fbf3e8'; // 浅金底
export const GOLD_SOFT = '#d4a574'; // 淡金:仅大色块(决策 E,勿做文字)

// ── 深绛红 Crimson · 否决 / 危险(克制使用) ──
export const CRIMSON       = '#a13c2e'; // 危险操作描边/文字、红点
export const CRIMSON_LIGHT = '#f5d9d3';
export const CRIMSON_PALE  = '#fbedea'; // 危险按钮底

// ── 暖墨 Ink · 文字 5 档 ──
export const INK  = '#2b2218'; // 标题 / 正文
export const INK2 = '#55463a'; // 次要文字
export const INK3 = '#7e6d5b'; // 辅助 / 说明
export const INK4 = '#b5a99a'; // 最弱 / 占位
export const INK5 = '#ddd3ca'; // 分隔 / 禁用 / 否定按钮描边

// ── 底 / 描边 ──
export const SURFACE      = '#f7f2ec'; // 页面底
export const CARD         = '#ffffff'; // 卡片 / 否定按钮底
export const BORDER       = 'rgba(43,34,24,0.08)';
export const BORDER_LIGHT = 'rgba(43,34,24,0.06)';

// ── 圆角档位 ──
export const RADIUS = {
  badge: 7,    // 状态标签
  input: 10,   // 输入框
  card: 16,    // 卡片
  cardLg: 18,  // 大卡 / KPI
  pill: 9999,  // 主/次/否定按钮、筛选 chip、头像(决策 A)
} as const;

// ── 按钮配方(容器样式;文字色见注释,放在 Text 上)──
export const BTN = {
  // 主按钮:实心橙 + 白字
  primary:   { backgroundColor: SAFFRON, borderRadius: RADIUS.pill },
  // 次按钮(软橙药丸):浅橙底 + 深橙字
  secondary: { backgroundColor: SAFFRON_LIGHT, borderRadius: RADIUS.pill },
  // 否定按钮(取消/拒绝):白底 + 灰描边 + 深橙字
  negative:  { backgroundColor: CARD, borderWidth: 1, borderColor: INK5, borderRadius: RADIUS.pill },
  // 危险按钮(删除/撤销):浅绛红底 + 绛红描边 + 绛红字
  danger:    { backgroundColor: CRIMSON_PALE, borderWidth: 1, borderColor: 'rgba(161,60,46,0.3)', borderRadius: RADIUS.pill },
} as const;
