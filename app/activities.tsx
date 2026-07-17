import { Link, useRouter } from 'expo-router';
import { ChevronLeft, History } from 'lucide-react-native';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CoreviewList } from '@/components/coreview-timeline';
import { Text } from '@/components/ui/text';
import { useCoreviewTimeline } from '@/lib/queries/coreview';

// 共修 / 法会(决策140/162/164 + 法会场次决策②)。一条时间轴:进行中/即将。
//   往期不在本页(2026-07-17 PM 定案):往期一律进「历史」独立页(/past-events),
//   本页只看向前看的安排,没有就是纯空态,不用"往期"兜底撑着页面有内容。
//   状态按日期算;回向只出总和(#193);无状态色。
const INK = '#2b2218';
const INK2 = '#55463a';
const INK3 = '#7e6d5b';

export default function Activities() {
  const router = useRouter();
  const { data, isLoading, isError } = useCoreviewTimeline();
  const upcoming = data?.upcoming ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF4E9' }} edges={['top']}>
      <View style={styles.top}>
        <Pressable hitSlop={8} onPress={() => router.back()}><ChevronLeft size={24} color={INK} /></Pressable>
        <Text className="font-serif" style={{ flex: 1, fontSize: 18, fontWeight: '700', color: INK }}>共修 / 法会</Text>
        <Link href="/past-events" asChild>
          <Pressable hitSlop={8} style={styles.histBtn}><History size={15} color={INK2} /><Text style={{ fontSize: 12, color: INK2, fontWeight: '600' }}>历史</Text></Pressable>
        </Link>
      </View>
      <ScrollView contentContainerStyle={{ paddingLeft: 10, paddingRight: 14, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <View style={{ paddingVertical: 50, alignItems: 'center' }}><ActivityIndicator color="#b35535" /></View>
        ) : isError ? (
          // 查询失败别落进"暂无安排"——那对确有共修/法会安排的师兄是假空态(全文件审计 2026-07-12)
          <View style={{ paddingVertical: 50, alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: INK3, textAlign: 'center', lineHeight: 20 }}>加载失败,请检查网络后重试</Text>
          </View>
        ) : upcoming.length === 0 ? (
          <View style={{ paddingVertical: 50, alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: INK3, textAlign: 'center', lineHeight: 20 }}>暂无共修 / 法会安排。{'\n'}法会由管理员发布,本班共修按排课生成。</Text>
            <Link href="/past-events" asChild>
              <Pressable style={[styles.moreBtn, { marginTop: 14 }]}><Text style={{ fontSize: 13, color: INK2, fontWeight: '600' }}>看往期历史 →</Text></Pressable>
            </Link>
          </View>
        ) : (
          <CoreviewList nodes={upcoming} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  histBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9999, backgroundColor: 'rgba(43,34,24,0.05)' },
  moreBtn: { alignSelf: 'center', marginTop: 8, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 9999, backgroundColor: 'rgba(43,34,24,0.05)' },
});
