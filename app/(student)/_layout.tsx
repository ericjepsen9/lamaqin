import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, Tabs } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { useAuth } from '@/lib/auth';

// 师兄端 4-Tab(决策158:首页/闻思/修持/班级;「我的」移到首页左上头像·不占 tab)。第4个 tab 班级对纯自学用户动态变「自学」(决策144)。
// tab 栏=磨砂玻璃浮层(纯文字、激活 saffron + 下划线):首页浮在画报上、内容页(闻思/修持/班级浅底)上靠磨砂与滚动内容分层(原纯透明会与背景糊在一起·PM 2026-06-25)。
const PREVIEW = process.env.EXPO_PUBLIC_PREVIEW === '1';
const ACTIVE = '#e07856'; // saffron
const INACTIVE = '#7e6d5b'; // ink-3

// 自定义 tab 栏只用到 state/descriptors/navigation 三项,本地最小类型即可(免依赖 @react-navigation 类型)。
type TabBarProps = {
  state: { index: number; routes: { key: string; name: string }[] };
  descriptors: Record<string, { options: { title?: string } }>;
  navigation: {
    emit: (event: { type: 'tabPress'; target: string; canPreventDefault: true }) => { defaultPrevented: boolean };
    navigate: (name: string) => void;
  };
};

function FloatingTextTabBar({ state, descriptors, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      role="navigation"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        paddingTop: 16,
        paddingBottom: Math.max(insets.bottom, 10),
      }}>
      {/* 高斯模糊磨砂 + 暖奶油薄渐变(PM 2026-06-29):画报/内容在栏后被磨,文字不再与下方内容糊在一起;顶部软淡入,非纯色块 */}
      <BlurView intensity={32} tint="light" style={StyleSheet.absoluteFill} pointerEvents="none" />
      <LinearGradient
        colors={['rgba(251,244,233,0)', 'rgba(251,244,233,0.45)', 'rgba(251,244,233,0.6)']}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {state.routes.map((route, index) => {
        const label = (descriptors[route.key]?.options.title ?? route.name) as string;
        const focused = state.index === index;
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        };
        return (
          <Pressable key={route.key} onPress={onPress} style={{ flex: 1, alignItems: 'center' }}>
            <Text
              className="font-serif"
              style={{ color: focused ? ACTIVE : INACTIVE, fontWeight: focused ? '700' : '500', fontSize: 15, letterSpacing: 1, textShadowColor: 'rgba(255,255,255,0.7)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 4 }}>
              {label}
            </Text>
            <View style={{ marginTop: 5, height: 2.5, width: 16, borderRadius: 2, backgroundColor: focused ? ACTIVE : 'transparent' }} />
          </Pressable>
        );
      })}
    </View>
  );
}

export default function StudentTabsLayout() {
  const { session, loading } = useAuth();
  // 会话过期/登出 → 回登录(防停在 RLS 读空的页面,误以为"数据没了"·PM 2026-06-29)
  if (!PREVIEW && !loading && !session) return <Redirect href="/login" />;
  return (
    <Tabs tabBar={(props) => <FloatingTextTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="home" options={{ title: '首页' }} />
      <Tabs.Screen name="courses" options={{ title: '闻思' }} />
      <Tabs.Screen name="practice" options={{ title: '修持' }} />
      <Tabs.Screen name="class" options={{ title: '班级' }} />
    </Tabs>
  );
}
