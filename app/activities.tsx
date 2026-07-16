import { Link, useRouter } from 'expo-router';
import { ChevronLeft, History } from 'lucide-react-native';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text as RNText, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CoreviewList } from '@/components/coreview-timeline';
import { Text } from '@/components/ui/text';
import { useCoreviewTimeline } from '@/lib/queries/coreview';

// 共修 / 法会(决策140/162/164 + 法会场次决策②)。一条时间轴混排:法会(每场一节点)+ 本班共修。
//   进行中/即将在上,最近往期在下;「历史」看全部往期。状态按日期算;回向只出总和(#193);无状态色。
const INK = '#2b2218';
const INK2 = '#55463a';
const INK3 = '#7e6d5b';

export default function Activities() {
  const router = useRouter();
  const { data, isLoading, isError } = useCoreviewTimeline();
  const upcoming = data?.upcoming ?? [];
  const pastAll = data?.past ?? [];
  const past = pastAll.slice(0, 4);
  const hasMorePast = pastAll.length > past.length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF4E9' }} edges={['top']}>
      <View style={styles.top}>
        <Pressable hitSlop={8} onPress={() => router.back()}><ChevronLeft size={24} color={INK} /></Pressable>
        <Text className="font-serif" style={{ flex: 1, fontSize: 18, fontWeight: '700', color: INK }}>共修 / 法会</Text>
        <Link href="/past-events" asChild>
          <Pressable hitSlop={8} style={styles.histBtn}><History size={15} color={INK2} /><RNText style={{ fontSize: 12, color: INK2, fontWeight: '600' }}>历史</RNText></Pressable>
        </Link>
      </View>
      <ScrollView contentContainerStyle={{ paddingLeft: 10, paddingRight: 14, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <View style={{ paddingVertical: 50, alignItems: 'center' }}><ActivityIndicator color="#b35535" /></View>
        ) : isError ? (
          // 查询失败别落进"暂无安排"——那对确有共修/法会安排的师兄是假空态(全文件审计 2026-07-12)
          <View style={{ paddingVertical: 50, alignItems: 'center' }}>
            <RNText style={{ fontSize: 13, color: INK3, textAlign: 'center', lineHeight: 20 }}>加载失败,请检查网络后重试</RNText>
          </View>
        ) : upcoming.length === 0 && past.length === 0 ? (
          <View style={{ paddingVertical: 50, alignItems: 'center' }}>
            <RNText style={{ fontSize: 13, color: INK3, textAlign: 'center', lineHeight: 20 }}>暂无共修 / 法会安排。{'\n'}法会由管理员发布,本班共修按排课生成。</RNText>
          </View>
        ) : (
          <>
            {upcoming.length > 0 ? (
              <>
                <RNText style={styles.secLabel}>进行中 / 即将</RNText>
                <CoreviewList nodes={upcoming} />
              </>
            ) : null}
            {past.length > 0 ? (
              <>
                <RNText style={styles.secLabel}>往期</RNText>
                <CoreviewList nodes={past} />
                {hasMorePast ? (
                  <Link href="/past-events" asChild>
                    <Pressable style={styles.moreBtn}><RNText style={{ fontSize: 13, color: INK2, fontWeight: '600' }}>查看全部历史 →</RNText></Pressable>
                  </Link>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  histBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9999, backgroundColor: 'rgba(43,34,24,0.05)' },
  secLabel: { fontSize: 13, color: INK3, fontWeight: '700', paddingTop: 14, paddingBottom: 2 },
  moreBtn: { alignSelf: 'center', marginTop: 8, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 9999, backgroundColor: 'rgba(43,34,24,0.05)' },
});
