import { useLocalSearchParams, useRouter } from 'expo-router';
import { CalendarClock, ChevronLeft } from 'lucide-react-native';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text as RNText, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { useSpeakingSessionStudentDetail } from '@/lib/queries/community';

// 讲考详情(审计 P0 清假数据·2026-07-02 接真:speaking_sessions;原假范围/假评价/假报名整页撤除)。
// ⛔ 红线不变:讲考=升学人工参考不自动计分(决策017/101);评价仅本人+辅导员可见(#193)。
// v1 库里尚无讲考数据与报名/评价表 UI——本页按真数据展示,查无 → 诚实空态;报名/评价随班级模式接。
const INK = '#2b2218';
const INK2 = '#55463a';
const INK3 = '#7e6d5b';
const SAFFRON = '#e07856';
const SAFFRON_DARK = '#b35535';

export default function SpeakingDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, isError } = useSpeakingSessionStudentDetail(id);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF4E9' }} edges={['top']}>
      <View style={styles.top}>
        <Pressable hitSlop={8} onPress={() => router.back()}><ChevronLeft size={24} color={INK} /></Pressable>
        <Text className="font-serif" style={{ fontSize: 17, fontWeight: '700', color: INK }}>讲考详情</Text>
      </View>
      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={SAFFRON} /></View>
      ) : isError ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <RNText style={{ fontSize: 14, color: INK2, textAlign: 'center' }}>加载失败,请检查网络后重试(不代表没有此讲考安排)。</RNText>
        </View>
      ) : !data ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <RNText style={{ fontSize: 14, color: INK2, textAlign: 'center' }}>暂无此讲考安排,或不属于你的班级。</RNText>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }}>
          <View style={styles.card}>
            {data.cohortName ? <RNText style={{ fontSize: 12, color: INK3 }}>{data.cohortName}</RNText> : null}
            <Text className="font-serif" style={{ fontSize: 19, fontWeight: '700', color: INK, marginTop: 6, lineHeight: 28 }}>
              {data.lessonNumber != null ? `第 ${data.lessonNumber} 节 · ` : ''}{data.lessonTitle ?? '讲考'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
              <CalendarClock size={15} color={INK3} />
              <RNText style={{ fontSize: 13, color: INK2 }}>截止 {data.sessionEndAt.slice(0, 10)}</RNText>
            </View>
            {data.notes ? <RNText style={{ fontSize: 13, color: INK2, lineHeight: 21, marginTop: 12 }}>{data.notes}</RNText> : null}
          </View>
          <RNText style={{ fontSize: 11, color: INK3, textAlign: 'center', lineHeight: 17 }}>
            参与方式与记录由辅导员在讲考时登记;讲考作升学人工参考,不自动计分。
          </RNText>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(43,34,24,0.06)' },
});
