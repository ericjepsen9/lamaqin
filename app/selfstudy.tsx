import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text as RNText, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SelfStudyPanel } from '@/components/selfstudy-panel';
import { Text } from '@/components/ui/text';

// 自学页(决策119/144/157)。主体抽到 components/selfstudy-panel.tsx(D-10·2026-07-02):
// 班级 tab 无班分支同用;本路由保留(每日功课等处的深链不动)。
const INK = '#2b2218';
const INK3 = '#7e6d5b';

export default function SelfStudy() {
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF4E9' }} edges={['top']}>
      <View style={styles.top}>
        <Pressable hitSlop={8} onPress={() => router.back()}><ChevronLeft size={24} color={INK} /></Pressable>
        <Text className="font-serif" style={{ fontSize: 18, fontWeight: '700', color: INK }}>自学</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }}>
        <RNText style={{ fontSize: 12, color: INK3 }}>无班自学:按教学大纲的节奏走,完成本节圆满即可继续;可快可慢、可补录,请假可顺延进度。</RNText>
        <SelfStudyPanel />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
});
