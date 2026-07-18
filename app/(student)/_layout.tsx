import { BlurView } from 'expo-blur';
import { Redirect, Tabs } from 'expo-router';
import { BookOpen, Flower2, Home as HomeIcon, Users, type LucideIcon } from 'lucide-react-native';
import { useEffect } from 'react';
import { Image, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { useAuth } from '@/lib/auth';
import { useCurrentPoster, type HomePoster } from '@/lib/queries/home';
import { hexToRgba, readableTextTone } from '@/lib/utils';

// 师兄端 4-Tab(决策158:首页/闻思/修持/班级;「我的」移到首页左上头像·不占 tab)。第4个 tab 班级对纯自学用户动态变「自学」(决策144)。
// tab 栏(2026-07-18 改版·PM 参照示例图定案):图标+文字、四角大圆角胶囊(离屏幕边缘留白,不再
//   贴边铺满)、激活态整块换实心色背景(不再是"文字变色+下划线"那种弱高亮)。
//   之前"纯文字+磨砂"那版无论怎么调颜色都没法跟画报"融为一体"——这是浮层+半透明这套做法本身
//   的结构性矛盾(同一个栏要同时兼顾3个tab各自固定的渐变背景+首页每月可能换的画报),不是数值
//   没调对。改成明确的独立胶囊(不追求"融入",追求"精致地浮在上面"),画报强调色只影响胶囊自己
//   的底色/未激活态文字色,不再追求跟背景融合。激活态胶囊固定用品牌橙,不随画报变(保证任何
//   画报下都认得出"这是选中的")。
const PREVIEW = process.env.EXPO_PUBLIC_PREVIEW === '1';
const ACTIVE = '#e07856'; // saffron(激活态胶囊底色,固定不随画报主题变)
const INACTIVE = '#7e6d5b'; // ink-3(未激活态默认文字/图标色)
const DEFAULT_BAR_BG = 'rgba(251,244,233,0.72)'; // 无画报强调色时的胶囊底色(暖米,同 app 基础背景色系)

const TAB_ICONS: Record<string, LucideIcon> = { home: HomeIcon, courses: BookOpen, practice: Flower2, class: Users };

// 自定义 tab 栏只用到 state/descriptors/navigation 三项,本地最小类型即可(免依赖 @react-navigation 类型)。
type TabBarProps = {
  state: { index: number; routes: { key: string; name: string }[] };
  descriptors: Record<string, { options: { title?: string } }>;
  navigation: {
    emit: (event: { type: 'tabPress'; target: string; canPreventDefault: true }) => { defaultPrevented: boolean };
    navigate: (name: string) => void;
  };
  poster?: HomePoster | null;
};

export type TabBarVisualItem = { key: string; label: string; Icon: LucideIcon; active?: boolean; onPress?: () => void };

// 纯视觉部分抽出(2026-07-18·后台画报强调色预览窗新用):磨砂+底色+胶囊行,不含导航/贴屏定位。
// 真实 tab 栏(定位:position absolute 贴屏幕底)与后台预览(定位:随表单正常排版)各自套自己的外层
// 容器,共用同一份视觉渲染——保证预览跟线上样式永远同步,不会有人改了这里的样式忘记改预览。
export function TabBarVisual({ accentColor, overlayOpacity, items, style, bgTestID }: {
  accentColor: string | null;
  overlayOpacity: number;
  items: TabBarVisualItem[];
  style?: StyleProp<ViewStyle>;
  bgTestID?: string; // 仅供 e2e 读取这层背景色用(components/admin/poster-theme-preview.tsx)
}) {
  const light = accentColor != null && readableTextTone(accentColor) === 'light';
  const inactiveColor = light ? 'rgba(255,255,255,0.82)' : INACTIVE;
  return (
    <View style={[styles.barVisual, style]}>
      {/* 高斯模糊磨砂 + 底色(2026-07-18):有画报强调色→叠强调色(浅/深由 readableTextTone 配文字);
          没有→维持原来暖米色调,不受画报是否设置影响。 */}
      <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View testID={bgTestID} pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: accentColor ? hexToRgba(accentColor, overlayOpacity) : DEFAULT_BAR_BG }]} />
      {items.map((it) => {
        const itemColor = it.active ? '#fff' : inactiveColor;
        const content = (
          <View style={[styles.tabPill, it.active && styles.tabPillActive]}>
            <it.Icon size={18} color={itemColor} />
            <Text className="font-serif" style={{ color: itemColor, fontWeight: it.active ? '700' : '500', fontSize: 12.5, letterSpacing: 0.5, marginTop: 2 }}>
              {it.label}
            </Text>
          </View>
        );
        return it.onPress ? (
          <Pressable key={it.key} onPress={it.onPress} style={styles.tabItem}>{content}</Pressable>
        ) : (
          <View key={it.key} style={styles.tabItem}>{content}</View>
        );
      })}
    </View>
  );
}

function FloatingTextTabBar({ state, descriptors, navigation, poster }: TabBarProps) {
  const insets = useSafeAreaInsets();
  // 画报强调色只在"首页"这个tab激活时生效(其余3个tab各自有固定的渐变背景,不受画报影响)。
  const activeRouteName = state.routes[state.index]?.name;
  const onHome = activeRouteName === 'home';
  const accentColor = onHome ? (poster?.accentColor ?? null) : null;
  const overlayOpacity = poster?.overlayOpacity ?? 0.55;

  const items: TabBarVisualItem[] = state.routes.map((route, index) => ({
    key: route.key,
    label: (descriptors[route.key]?.options.title ?? route.name) as string,
    Icon: TAB_ICONS[route.name] ?? HomeIcon,
    active: state.index === index,
    onPress: () => {
      const focused = state.index === index;
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
    },
  }));

  return (
    <View role="navigation" style={[styles.floatWrap, { bottom: Math.max(insets.bottom, 12) }]}>
      <TabBarVisual accentColor={accentColor} overlayOpacity={overlayOpacity} items={items} />
    </View>
  );
}

export default function StudentTabsLayout() {
  const { session, loading } = useAuth();
  // 首页画报预取(PM 2026-07-17 定):原生 Image 没有跨次挂载的预取/持久缓存,首页 home.tsx
  // 自己的 ImageBackground 挂载了才开始下载,下载完之前露的是兜底渐变——看起来像"先渐变、
  // 后画报"两段式。这里在 4-Tab 壳层(比首页早一步挂载/常驻)一拿到画报链接就 Image.prefetch,
  // 等真正划到首页时大概率已经在系统图片缓存里,基本秒开(仍是"提前起跑",不是消除首次冷启动
  // 那一趟网络请求本身)。hooks 规则要求在下面的提前 return 之前调用。
  // 同一份查询结果(2026-07-18)也传给底部tab栏做画报强调色主题,不重复发请求(react-query
  // 按 queryKey 去重)。
  const { data: poster } = useCurrentPoster();
  useEffect(() => {
    if (poster?.imageUrl) void Image.prefetch(poster.imageUrl);
  }, [poster?.imageUrl]);
  // 会话过期/登出 → 回登录(防停在 RLS 读空的页面,误以为"数据没了"·PM 2026-06-29)
  if (!PREVIEW && !loading && !session) return <Redirect href="/login" />;
  return (
    <Tabs tabBar={(props) => <FloatingTextTabBar {...props} poster={poster} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="home" options={{ title: '首页' }} />
      <Tabs.Screen name="courses" options={{ title: '闻思' }} />
      <Tabs.Screen name="practice" options={{ title: '修持' }} />
      <Tabs.Screen name="class" options={{ title: '班级' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  floatWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
  },
  barVisual: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    borderRadius: 28,
    overflow: 'hidden',
    paddingVertical: 8,
    paddingHorizontal: 6,
    shadowColor: '#2b2218',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 6,
  },
  tabItem: { flex: 1, alignItems: 'center' },
  tabPill: { alignItems: 'center', justifyContent: 'center', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 18, minWidth: 56 },
  tabPillActive: { backgroundColor: ACTIVE },
});
