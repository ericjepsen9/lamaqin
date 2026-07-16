import { ChevronLeft } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';

// 细标题栏(PM 2026-07-02 拍板方案):大头图(渐变+图标+统计)随内容正常滚动、不固定;
//   滚到头图【基本滚出屏幕】后,顶部淡入一条固定细标题栏(当前页标题,带返回的页面含返回按钮),
//   滚回顶部附近再淡出。解决「课程概览/日历周视图滚下去返回键就没了」+ tab 页滚下去不知身在何处。
// 用法(5 个页面同款):
//   const bar = useScrollTitleBar();
//   <ScrollView onScroll={bar.onScroll} scrollEventThrottle={16}>
//     <View onLayout={bar.onHeaderLayout}>…大头图…</View>…
//   </ScrollView>
//   <ScrollTitleBar title="闻思" shown={bar.shown} />   ← 放 ScrollView 后面(盖在其上)
const INK = '#2b2218';
const BAR_MARGIN = 44; // 头图还剩这么多 px 没滚出即算「基本滚出」(≈细栏自身高度,衔接不空窗)

export function useScrollTitleBar() {
  const headerH = useRef(160);
  const shownRef = useRef(false);
  const [shown, setShown] = useState(false);
  const onHeaderLayout = (e: { nativeEvent: { layout: { height: number } } }) => {
    headerH.current = e.nativeEvent.layout.height;
  };
  const onScroll = (e: { nativeEvent: { contentOffset: { y: number } } }) => {
    const next = e.nativeEvent.contentOffset.y > Math.max(headerH.current - BAR_MARGIN, BAR_MARGIN);
    if (next !== shownRef.current) {
      shownRef.current = next;
      setShown(next);
    }
  };
  const reset = () => {
    shownRef.current = false;
    setShown(false);
  };
  return { onHeaderLayout, onScroll, shown, reset };
}

export function ScrollTitleBar({ title, shown, onBack, topInset = 0 }: { title: string; shown: boolean; onBack?: () => void; topInset?: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: shown ? 1 : 0, duration: 180, useNativeDriver: true }).start();
  }, [shown, opacity]);
  return (
    <Animated.View pointerEvents={shown ? 'auto' : 'none'} style={[styles.bar, { opacity, paddingTop: topInset }]}>
      <View style={styles.row}>
        <View style={styles.side}>
          {onBack ? (
            <Pressable hitSlop={10} onPress={onBack}>
              <ChevronLeft size={22} color={INK} />
            </Pressable>
          ) : null}
        </View>
        <Text className="font-serif" numberOfLines={1} style={styles.title}>{title}</Text>
        <View style={styles.side} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, backgroundColor: 'rgba(251,244,233,0.97)', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(43,34,24,0.14)' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  side: { width: 30 },
  title: { flex: 1, fontSize: 16, fontWeight: '700', color: INK, textAlign: 'center' },
});
