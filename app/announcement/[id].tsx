import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, Pin } from 'lucide-react-native';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text as RNText, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { useAnnouncementDetail } from '@/lib/queries/community';

// 班级公告详情(审计 P0 清假数据·2026-07-02 接真:cohort_announcements,决策064 公告推全班含旁听)。
// RLS=本班成员/管理员可读;非本班或不存在 → 诚实空态(铁律1 不臆造)。后台发布口在 法会管理→班级公告。
const INK = '#2b2218';
const INK2 = '#55463a';
const INK3 = '#7e6d5b';
const SAFFRON = '#e07856';
const SAFFRON_DARK = '#b35535';

export default function AnnouncementDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, isError } = useAnnouncementDetail(id);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF4E9' }} edges={['top']}>
      <View style={styles.top}>
        <Pressable hitSlop={8} onPress={() => router.back()}><ChevronLeft size={24} color={INK} /></Pressable>
        <Text className="font-serif" style={{ fontSize: 17, fontWeight: '700', color: INK }}>班级公告</Text>
      </View>
      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={SAFFRON} /></View>
      ) : isError ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <RNText style={{ fontSize: 14, color: INK2, textAlign: 'center' }}>加载失败,请检查网络后重试(不代表公告不存在)。</RNText>
        </View>
      ) : !data ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <RNText style={{ fontSize: 14, color: INK2, textAlign: 'center' }}>公告不存在,或不属于你的班级。</RNText>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {data.isPinned ? (
              <View style={styles.pinTag}><Pin size={11} color={SAFFRON_DARK} /><RNText style={{ fontSize: 11, fontWeight: '700', color: SAFFRON_DARK }}>置顶</RNText></View>
            ) : null}
            {data.cohortName ? <RNText style={{ fontSize: 12, color: INK3 }}>{data.cohortName}</RNText> : null}
          </View>
          <Text className="font-serif" style={{ fontSize: 21, fontWeight: '700', color: INK, marginTop: 8, lineHeight: 30 }}>
            {data.title || '班级公告'}
          </Text>
          <RNText style={{ fontSize: 12, color: INK3, marginTop: 6 }}>
            {data.postedByName ? `${data.postedByName} · ` : ''}{data.postedAt ? data.postedAt.slice(0, 10) : ''}
          </RNText>
          <RNText style={{ fontSize: 15, color: INK2, lineHeight: 26, marginTop: 18 }}>{data.content}</RNText>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  pinTag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: 'rgba(224,120,86,0.12)' },
});
