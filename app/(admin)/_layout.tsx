import { Redirect, Stack, usePathname, useRouter } from 'expo-router';
import { Bell, BookOpen, CalendarDays, CalendarRange, ChartBar, ChevronUp, ClipboardList, FileQuestionMark, GraduationCap, Heart, LayoutDashboard, Menu, MessageSquare, Repeat2, Sprout, Users, X } from 'lucide-react-native';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { useAuth } from '@/lib/auth';
import { useCurrentUser } from '@/lib/queries/profile';
import { supabase } from '@/lib/supabase';
import { INK, INK2, INK3, SAFFRON, SAFFRON_DARK, SAFFRON_LIGHT } from '@/lib/theme';

const CREAM = '#FBF4E9';
const PREVIEW = process.env.EXPO_PUBLIC_PREVIEW === '1';
const SIDEBAR_W = 224;
const WIDE = 900;

// ════════════════════════════════════════════════════════════════════
// 🎨 配色规范(全后台统一,以 PM 确认参考图为准)——按钮/头像一律遵守:
//   • 主操作(实心):  底 SAFFRON #e07856        + 字 白 #fff        例:＋添加记录/创建/批准
//   • 次级(软药丸):  底 SAFFRON_LIGHT #fbe5da  + 字 SAFFRON_DARK   例:取消标记/编辑/取消
//   • 正向确认:       底 SAGE_PALE              + 字 SAGE_DARK(+绿边)例:确认毕业
//   • 中性/取消:      底 浅灰 rgba(43,34,24,.06)+ 字 INK3           例:留级弹窗-取消
//   • 头像:           底 SAFFRON_LIGHT          + 首字 SAFFRON_DARK(粗)
//   • 左栏选中项:     实心 SAFFRON 胶囊         + 白图标白字(对齐参考图)
//   ⛔ 铁律:任何「橙色/浅色底」都禁止配近黑字(#2b2218);实心橙底必白字。
//   开关 Switch:ON=SAFFRON / OFF=INK4,全后台统一。
// ════════════════════════════════════════════════════════════════════

const ROLE_LABEL: Record<string, string> = { admin: '系统管理员', zhumai: '辅导员', aixin: '爱心' };

// group 1=运营，group 2=内容·系统（v2 觉学暖风：侧栏分两组）
type NavItem = { label: string; href: string; icon: ReactNode; roles: string[]; group: 1 | 2 };

const NAV_ITEMS: NavItem[] = [
  { label: '总览', href: '/(admin)/dashboard', icon: <LayoutDashboard size={18} color={INK3} />, roles: ['admin', 'zhumai', 'aixin'], group: 1 },
  { label: '学员管理', href: '/(admin)/students', icon: <Users size={18} color={INK3} />, roles: ['admin', 'zhumai', 'aixin'], group: 1 },
  { label: '班级管理', href: '/(admin)/classes', icon: <GraduationCap size={18} color={INK3} />, roles: ['admin', 'zhumai', 'aixin'], group: 1 },
  { label: '共修与讲考', href: '/(admin)/attendance', icon: <ClipboardList size={18} color={INK3} />, roles: ['admin', 'zhumai', 'aixin'], group: 1 },
  { label: '关怀清单', href: '/(admin)/care', icon: <Heart size={18} color={INK3} />, roles: ['admin', 'zhumai', 'aixin'], group: 1 },
  { label: '报数升学', href: '/(admin)/advancement', icon: <ChevronUp size={18} color={INK3} />, roles: ['admin', 'zhumai'], group: 1 },
  { label: '课程内容', href: '/(admin)/course-content', icon: <BookOpen size={18} color={INK3} />, roles: ['admin'], group: 2 },
  { label: '排课管理', href: '/(admin)/scheduling', icon: <CalendarRange size={18} color={INK3} />, roles: ['admin'], group: 2 },
  { label: '功课配置', href: '/(admin)/practice-config', icon: <Repeat2 size={18} color={INK3} />, roles: ['admin'], group: 2 },
  { label: '自学管理', href: '/(admin)/selfstudy-manage', icon: <Sprout size={18} color={INK3} />, roles: ['admin'], group: 2 },
  { label: '题库', href: '/(admin)/quiz', icon: <FileQuestionMark size={18} color={INK3} />, roles: ['admin'], group: 2 },
  { label: '法会管理', href: '/(admin)/events', icon: <ChartBar size={18} color={INK3} />, roles: ['admin', 'zhumai'], group: 2 },
  { label: '藏历画报', href: '/(admin)/poster-calendar', icon: <CalendarDays size={18} color={INK3} />, roles: ['admin'], group: 2 },
  { label: '提醒语库', href: '/(admin)/reminder-presets', icon: <Bell size={18} color={INK3} />, roles: ['admin', 'zhumai', 'aixin'], group: 2 },
  { label: '反馈清单', href: '/(admin)/feedback', icon: <MessageSquare size={18} color={INK3} />, roles: ['admin'], group: 2 },
  { label: '系统审计', href: '/(admin)/audit', icon: <Menu size={18} color={INK3} />, roles: ['admin'], group: 2 },
];

// ─── Admin layout context（供子屏设置标题）───────────────────────────
type AdminLayoutCtx = { setTitle: (t: string) => void };
const AdminLayoutContext = createContext<AdminLayoutCtx>({ setTitle: () => {} });
export const useAdminLayout = () => useContext(AdminLayoutContext);

// ─── Nav item 组件（v2：激活=saffron-light 软胶囊 + 左侧 saffron 竖条 + saffron-dark 字）──
function NavItemRow({ item, active, onPress }: { item: NavItem; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.navItem, active && styles.navItemActive]}>
      {/* 选中=实心藏红胶囊+白图标白字(对齐参考图);未选=INK2 图标 */}
      <View style={{ width: 20, alignItems: 'center' }}>
        {active
          ? (() => {
              const IconComp = (item.icon as React.ReactElement).type as React.ComponentType<{ size: number; color: string }>;
              return <IconComp size={18} color="#fff" />;
            })()
          : item.icon}
      </View>
      <Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text>
    </Pressable>
  );
}

// 分组导航：运营组 → 「内容 · 系统」小标 → 内容组
function NavList({ items, pathname, onNav }: { items: NavItem[]; pathname: string; onNav: (href: string) => void }) {
  const g1 = items.filter((i) => i.group === 1);
  const g2 = items.filter((i) => i.group === 2);
  const render = (item: NavItem) => (
    <NavItemRow
      key={item.href}
      item={item}
      active={pathname.startsWith(item.href.replace('/(admin)', ''))}
      onPress={() => onNav(item.href)}
    />
  );
  return (
    <View style={{ flex: 1, marginTop: 6 }}>
      {g1.map(render)}
      {g2.length > 0 && <Text style={styles.navGroupLabel}>内容 · 系统</Text>}
      {g2.map(render)}
    </View>
  );
}

// ─── 品牌头 + 用户页脚（侧栏/抽屉共用）──────────────────────────────────
function BrandHeader() {
  return (
    <View style={styles.brandRow}>
      <View style={styles.saffronDot} />
      <Text className="font-serif" style={styles.brandText}>纽约佛学会</Text>
      <Text style={styles.brandSub}>管理后台</Text>
    </View>
  );
}

function UserFooter({ role, name, onSignOut }: { role: string; name: string | null; onSignOut: () => void }) {
  const initial = name ? name.charAt(0) : '?';
  return (
    <View style={styles.userFooter}>
      <View style={styles.userAvatar}>
        <Text className="font-serif" style={styles.userAvatarText}>{initial}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.userName}>{name ?? '管理员'}</Text>
        <Text style={styles.userSub}>{ROLE_LABEL[role] ?? role}</Text>
      </View>
      <Pressable hitSlop={8} onPress={onSignOut}><Text style={styles.logoutText}>退出</Text></Pressable>
    </View>
  );
}

// ─── 侧边栏（宽屏）────────────────────────────────────────────────────
function Sidebar({ role, name, pathname, onNav, onSignOut }: { role: string; name: string | null; pathname: string; onNav: (href: string) => void; onSignOut: () => void }) {
  const items = NAV_ITEMS.filter((i) => i.roles.includes(role));
  return (
    <View style={styles.sidebar}>
      <BrandHeader />
      <NavList items={items} pathname={pathname} onNav={onNav} />
      <UserFooter role={role} name={name} onSignOut={onSignOut} />
    </View>
  );
}

// ─── 移动端顶部 TopBar ─────────────────────────────────────────────────
function TopBar({ role, title, onHamburger }: { role: string; title: string; onHamburger: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.topBar, { paddingTop: insets.top + 4 }]}>
      <Pressable onPress={onHamburger} hitSlop={8} style={styles.hamburger}>
        <Menu size={22} color={INK} />
      </Pressable>
      <Text className="font-serif" style={styles.topBarTitle} numberOfLines={1}>{title}</Text>
      <View style={styles.roleBadgeMini}>
        <Text style={styles.roleBadgeMiniText}>{ROLE_LABEL[role] ?? '管理'}</Text>
      </View>
    </View>
  );
}

// ─── 移动端抽屉 ───────────────────────────────────────────────────────
function Drawer({ role, name, pathname, open, onClose, onNav, onSignOut }: { role: string; name: string | null; pathname: string; open: boolean; onClose: () => void; onNav: (href: string) => void; onSignOut: () => void }) {
  const translateX = useRef(new Animated.Value(-SIDEBAR_W)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateX, { toValue: open ? 0 : -SIDEBAR_W, duration: 240, useNativeDriver: true }),
      Animated.timing(overlayOpacity, { toValue: open ? 1 : 0, duration: 240, useNativeDriver: true }),
    ]).start();
  }, [open, translateX, overlayOpacity]);

  const items = NAV_ITEMS.filter((i) => i.roles.includes(role));

  return (
    <>
      {/* 半透明遮罩 */}
      <Animated.View
        pointerEvents={open ? 'auto' : 'none'}
        style={[styles.drawerOverlay, { opacity: overlayOpacity }]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* 抽屉面板 */}
      <Animated.View style={[styles.drawerPanel, { transform: [{ translateX }], paddingTop: insets.top + 8 }]}>
        {/* 关闭按钮 + 品牌 */}
        <View style={styles.drawerHeader}>
          <BrandHeader />
          <Pressable onPress={onClose} hitSlop={8}>
            <X size={20} color={INK3} />
          </Pressable>
        </View>

        <NavList
          items={items}
          pathname={pathname}
          onNav={(href) => { onNav(href); onClose(); }}
        />

        <View style={{ paddingBottom: insets.bottom + 8 }}>
          <UserFooter role={role} name={name} onSignOut={onSignOut} />
        </View>
      </Animated.View>
    </>
  );
}

// ─── 主 Layout ────────────────────────────────────────────────────────
export default function AdminLayout() {
  const { session, loading } = useAuth();
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE;
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [screenTitle, setScreenTitle] = useState('总览');
  const { data: me, isError: meError, refetch: refetchMe } = useCurrentUser();

  // 未加载完前不给任何角色特权(2026-07-13订正:此前默认'admin'会让侧栏在加载窗口内闪现
  // 全部16项管理菜单给任何后台深链的人,含师兄——e2e/resilience.spec.ts已真机复现过这个闪现;
  // 方向反了,"还不知道是谁"该当"什么都不是"处理,不能当"admin"处理)。me 解析完后走下方角色门。
  const role = (me?.role && me.role !== 'student') ? me.role : '';
  const userName = me?.fullName ?? null;

  const setTitle = useCallback((t: string) => setScreenTitle(t), []);

  const handleNav = useCallback((href: string) => {
    router.push(href as never);
  }, [router]);

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  }, [router]);

  // 会话过期/登出 → 回登录(防停在 RLS 读空页·PM 2026-06-29)
  if (!PREVIEW && !loading && !session) return <Redirect href="/login" />;
  // useCurrentUser 查询失败(2026-07-12 审计发现):me 恒 undefined,下面"student→弹回"角色门
  // 判不出来、会一直停在默认 admin 全菜单——即角色门在报错时彻底失效,而非"加载中"那种短暂过渡。
  // 报错就不进后台壳(宁可挡一下真管理员重试,也不能让师兄在网络抖动时看到管理入口存在)。
  if (!PREVIEW && meError) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: CREAM, padding: 24, gap: 12 }}>
        <Text style={{ fontSize: 14, color: INK3, textAlign: 'center' }}>加载失败,请检查网络后重试</Text>
        <Pressable onPress={() => refetchMe()} style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 9999, backgroundColor: SAFFRON }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>重试</Text>
        </Pressable>
      </View>
    );
  }
  // 角色门(审计 P1·2026-07-02):设计要求「师兄看不到管理入口 + RLS 双重拦截」——原来只有 RLS 一层,
  //   师兄直输 URL 能打开后台壳(数据空但壳在)。me 加载完且确认是 student → 弹回学员端。
  if (!PREVIEW && me && me.role === 'student') return <Redirect href="/home" />;
  // 页面级角色门(2026-07-13发现:此前 NAV_ITEMS.roles 只用来过滤侧栏"给不给入口",
  // 页面本身零角色判断——zhumai/aixin 改URL能直达admin-only页面壳(如/audit),RLS仍挡真实
  // 数据、但页面壳本不该露。同一份 NAV_ITEMS.roles 现在兼职当路由门,不用在每个admin-only
  // 页面里各自补一份判断,以后新增页面漏了侧栏配置也不会漏防)。
  const matchedNavItem = NAV_ITEMS.find((item) => pathname.startsWith(item.href.replace('/(admin)', '')));
  if (!PREVIEW && me && matchedNavItem && !matchedNavItem.roles.includes(me.role)) return <Redirect href="/dashboard" />;

  return (
    <AdminLayoutContext.Provider value={{ setTitle }}>
      <View style={styles.root}>
        {isWide ? (
          // ── 宽屏：固定侧边栏 + 主内容 ──
          <View style={styles.wideLayout}>
            <Sidebar role={role} name={userName} pathname={pathname} onNav={handleNav} onSignOut={handleSignOut} />
            <View style={styles.mainContent}>
              <Stack screenOptions={{ headerShown: false }} />
            </View>
          </View>
        ) : (
          // ── 移动端：TopBar + Stack + 抽屉 ──
          <View style={styles.mobileLayout}>
            <TopBar role={role} title={screenTitle} onHamburger={() => setDrawerOpen(true)} />
            <View style={{ flex: 1 }}>
              <Stack screenOptions={{ headerShown: false }} />
            </View>
            <Drawer
              role={role}
              name={userName}
              pathname={pathname}
              open={drawerOpen}
              onClose={() => setDrawerOpen(false)}
              onNav={handleNav}
              onSignOut={handleSignOut}
            />
          </View>
        )}
      </View>
    </AdminLayoutContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f7f2ec' },
  wideLayout: { flex: 1, flexDirection: 'row' },
  mobileLayout: { flex: 1, flexDirection: 'column' },
  // ── 侧边栏 ──
  sidebar: { width: SIDEBAR_W, backgroundColor: CREAM, borderRightWidth: 1, borderRightColor: 'rgba(43,34,24,0.08)', paddingTop: 22, paddingHorizontal: 12, paddingBottom: 14 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 6, paddingBottom: 14 },
  saffronDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: SAFFRON },
  brandText: { fontSize: 18, fontWeight: '700', color: INK, letterSpacing: 2 },
  brandSub: { fontSize: 11, color: INK3, letterSpacing: 2, marginLeft: 2 },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, marginBottom: 2 },
  navItemActive: { backgroundColor: SAFFRON },
  navLabel: { fontSize: 14, color: INK3, fontWeight: '500', letterSpacing: 0.5 },
  navLabelActive: { color: '#fff', fontWeight: '700' },
  navGroupLabel: { fontSize: 10, color: '#b5a99a', letterSpacing: 2, marginLeft: 16, marginTop: 12, marginBottom: 6 },
  // ── 用户页脚 ──
  userFooter: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: 'rgba(43,34,24,0.08)', paddingTop: 14, paddingHorizontal: 6 },
  userAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: SAFFRON_DARK, alignItems: 'center', justifyContent: 'center' },
  userAvatarText: { fontSize: 13, color: '#fff', fontWeight: '700' },
  userName: { fontSize: 13, color: INK, fontWeight: '600' },
  userSub: { fontSize: 10, color: INK3, marginTop: 1 },
  logoutText: { fontSize: 12, color: INK3 },
  // ── TopBar ──
  topBar: { backgroundColor: CREAM, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(43,34,24,0.08)', gap: 12 },
  hamburger: { padding: 2 },
  topBarTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: INK, letterSpacing: 1 },
  roleBadgeMini: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: 'rgba(224,120,86,0.12)' },
  roleBadgeMiniText: { fontSize: 11, color: SAFFRON, fontWeight: '700' },
  // ── 主内容 ──
  mainContent: { flex: 1, overflow: 'hidden' },
  // ── 抽屉 ──
  drawerOverlay: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.32)', zIndex: 10 },
  drawerPanel: { position: 'absolute', left: 0, top: 0, bottom: 0, width: SIDEBAR_W, backgroundColor: CREAM, zIndex: 11, paddingHorizontal: 12, shadowColor: '#000', shadowOffset: { width: 2, height: 0 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 8 },
  drawerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(43,34,24,0.08)', paddingHorizontal: 4 },
});
