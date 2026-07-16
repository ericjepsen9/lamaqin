import { useLocalSearchParams, useRouter } from 'expo-router';
import { CalendarClock, ChevronLeft, MapPin } from 'lucide-react-native';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text as RNText, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { useGroupSessionStudentDetail } from '@/lib/queries/community';

// 共修详情(审计 P0 清假数据·2026-07-02 接真:group_sessions;班级时间轴点入)。
// ⛔ 红线不变:出勤由主麦/爱心后台录入,师兄不自报(决策094/135)→ 本页无签到;原假出勤统计整块撤除,
//   不显任何臆造数字(铁律1)。location 字段=线上链接或线下地点(建场次时填)。
const INK = '#2b2218';
const INK2 = '#55463a';
const INK3 = '#7e6d5b';
const SAFFRON = '#e07856';
const SAFFRON_DARK = '#b35535';

function fmtRange(startIso: string, endIso: string): string {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const wd = ['日', '一', '二', '三', '四', '五', '六'][s.getDay()];
  const hm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${s.getMonth() + 1}月${s.getDate()}日 周${wd} ${hm(s)} – ${hm(e)}`;
}

export default function SessionDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, isError } = useGroupSessionStudentDetail(id);

  const isLink = !!data?.location && /^https?:\/\//i.test(data.location);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF4E9' }} edges={['top']}>
      <View style={styles.top}>
        <Pressable hitSlop={8} onPress={() => router.back()}><ChevronLeft size={24} color={INK} /></Pressable>
        <Text className="font-serif" style={{ fontSize: 17, fontWeight: '700', color: INK }}>共修详情</Text>
      </View>
      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={SAFFRON} /></View>
      ) : isError ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <RNText style={{ fontSize: 14, color: INK2, textAlign: 'center' }}>加载失败,请检查网络后重试(不代表该场次不存在)。</RNText>
        </View>
      ) : !data ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <RNText style={{ fontSize: 14, color: INK2, textAlign: 'center' }}>共修场次不存在,或不属于你的班级。</RNText>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }}>
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={styles.typeTag}>
                <RNText style={{ fontSize: 11, fontWeight: '700', color: SAFFRON_DARK }}>{data.type === 'practice' ? '实修共修' : '常规共修'}</RNText>
              </View>
              {data.cohortName ? <RNText style={{ fontSize: 12, color: INK3 }}>{data.cohortName}</RNText> : null}
            </View>
            <Text className="font-serif" style={{ fontSize: 19, fontWeight: '700', color: INK, marginTop: 10, lineHeight: 28 }}>
              {data.lessonNumber != null ? `第 ${data.lessonNumber} 节 · ` : ''}{data.lessonTitle ?? '本班共修'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
              <CalendarClock size={15} color={INK3} />
              <RNText style={{ fontSize: 13, color: INK2 }}>{fmtRange(data.scheduledAt, data.sessionEndAt)}</RNText>
            </View>
            {data.location ? (
              isLink ? (
                <Pressable style={styles.joinBtn} onPress={() => Linking.openURL(data.location!)}>
                  <RNText style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>进入线上共修</RNText>
                </Pressable>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
                  <MapPin size={15} color={INK3} />
                  <RNText style={{ fontSize: 13, color: INK2 }}>{data.location}</RNText>
                </View>
              )
            ) : null}
            {data.notes ? <RNText style={{ fontSize: 13, color: INK2, lineHeight: 21, marginTop: 12 }}>{data.notes}</RNText> : null}
          </View>

          {data.lessonId ? (
            <Pressable style={styles.lessonBtn} onPress={() => router.push(`/lesson/${data.lessonId}?step=wensi` as never)}>
              <RNText style={{ fontSize: 14, fontWeight: '700', color: SAFFRON_DARK }}>去学修本节 ›</RNText>
            </Pressable>
          ) : null}

          <RNText style={{ fontSize: 11, color: INK3, textAlign: 'center', lineHeight: 17 }}>
            出勤由辅导员/爱心师兄在共修后统一录入,无需自行签到。
          </RNText>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(43,34,24,0.06)' },
  typeTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: 'rgba(224,120,86,0.12)' },
  joinBtn: { marginTop: 14, paddingVertical: 12, borderRadius: 12, backgroundColor: SAFFRON, alignItems: 'center' },
  lessonBtn: { paddingVertical: 12, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(197,95,61,0.35)', alignItems: 'center' },
});
