import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CoreviewList } from '@/components/coreview-timeline';
import { Text } from '@/components/ui/text';
import { useCoreviewTimeline } from '@/lib/queries/coreview';

// 历史 · 共修 / 法会(决策164)。全部往期,按月分组的时间轴。
// ⛔ 守:回向只总和不具名(#193);出勤展示(后台录入·094);无状态色。
const INK = '#2b2218';
const INK3 = '#7e6d5b';

export default function PastEvents() {
  const router = useRouter();
  const { data, isLoading, isError } = useCoreviewTimeline();
  const past = data?.past ?? [];
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF4E9' }} edges={['top']}>
      <View style={styles.top}>
        <Pressable hitSlop={8} onPress={() => router.back()}><ChevronLeft size={24} color={INK} /></Pressable>
        <Text className="font-serif" style={{ fontSize: 17, fontWeight: '700', color: INK }}>历史 · 共修 / 法会</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingLeft: 10, paddingRight: 14, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <View style={{ paddingVertical: 50, alignItems: 'center' }}><ActivityIndicator color="#b35535" /></View>
        ) : isError ? (
          // 查询失败别落进"还没有往期记录"——那对确有历史记录的师兄是假空态(全文件审计 2026-07-12)
          <View style={{ paddingVertical: 50, alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: INK3, textAlign: 'center' }}>加载失败,请检查网络后重试</Text>
          </View>
        ) : past.length === 0 ? (
          <View style={{ paddingVertical: 50, alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: INK3, textAlign: 'center' }}>还没有往期记录。</Text>
          </View>
        ) : (
          <>
            <CoreviewList nodes={past} showMonths />
            <Text style={{ fontSize: 11, color: INK3, textAlign: 'center', marginTop: 10 }}>展示你的个人参与与集体回向总和。</Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
});
