import { useRouter } from 'expo-router';
import { ChevronLeft, Flower2 } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';

// 关于三殊胜(设置 → 关于)。三殊胜总纲 + 应用定位 + 版本。最高总纲=三殊胜(产品灵魂)。
const INK = '#2b2218';
const INK2 = '#55463a';
const INK3 = '#7e6d5b';
const SAFFRON_DARK = '#b35535';

const THREE = [
  ['前行 · 发心', '修法之前,先调整动机——为利益一切众生而闻思修。'],
  ['正行 · 无缘', '修持之时,专注安住、不散乱、不执著。'],
  ['结行 · 回向', '修法之后,把功德回向给一切众生,愿共成佛道。'],
];

export default function About() {
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF4E9' }} edges={['top']}>
      <View style={styles.top}>
        <Pressable hitSlop={8} onPress={() => router.back()}><ChevronLeft size={24} color={INK} /></Pressable>
        <Text className="font-serif" style={{ fontSize: 17, fontWeight: '700', color: INK }}>关于</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 18 }}>
        {/* 标识 */}
        <View className="items-center" style={{ gap: 10, paddingVertical: 14 }}>
          <View style={styles.logo}><Flower2 size={38} color={SAFFRON_DARK} /></View>
          <Text className="font-serif" style={{ fontSize: 24, fontWeight: '700', color: INK, letterSpacing: 2 }}>纽约佛学会 · 闻思修</Text>
          <Text style={{ fontSize: 13, color: INK3, letterSpacing: 1 }}>学修端 · v1.0.0</Text>
        </View>

        {/* 三殊胜总纲 */}
        <View style={{ gap: 10 }}>
          <Text className="font-serif" style={{ fontSize: 15, fontWeight: '700', color: INK, marginLeft: 4 }}>何为三殊胜</Text>
          {THREE.map(([t, d]) => (
            <View key={t} style={styles.card}>
              <Text className="font-serif" style={{ fontSize: 16, fontWeight: '700', color: SAFFRON_DARK }}>{t}</Text>
              <Text style={{ fontSize: 14, color: INK2, lineHeight: 23, marginTop: 5 }}>{d}</Text>
            </View>
          ))}
        </View>

        {/* 应用定位 */}
        <View style={styles.card}>
          <Text className="font-serif" style={{ fontSize: 15, fontWeight: '700', color: INK }}>关于本应用</Text>
          <Text style={{ fontSize: 14, color: INK2, lineHeight: 23, marginTop: 6 }}>
            本应用是面向已入学师兄的学修端,陪伴你完成闻思修的日常:听课、思考、答题、观修、计数、共修与回向。愿它伴你日日增上,让修行融入生活。
          </Text>
        </View>

        <Text style={{ fontSize: 11, color: INK3, textAlign: 'center', lineHeight: 18 }}>愿以此功德,普及于一切,{'\n'}我等与众生,皆共成佛道。</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  logo: { width: 76, height: 76, borderRadius: 38, backgroundColor: 'rgba(224,120,86,0.12)', alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(43,34,24,0.06)' },
});
