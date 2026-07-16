import { useLocalSearchParams, useRouter } from 'expo-router';
import { CalendarClock, ChevronLeft, HandHeart, Video } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text as RNText, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { notify } from '@/lib/dialog';
import { useJoinEventVow } from '@/lib/mutations/events';
import { useEventDetail } from '@/lib/queries/events';
import { testIds } from '@/lib/testids';
import { genClientToken } from '@/lib/utils';

// 法会详情(D-8·2026-07-02 接真;决策162/164)。法会=events;参加=法会愿(event_id·054-057,目标自设·056);
// 计数走现成愿系统(快速计数/愿详情)。⛔ 集体回向只总和·不具名·不排名(#193);无状态色;密法 0 痕迹。
const INK = '#2b2218';
const INK2 = '#55463a';
const INK3 = '#7e6d5b';
const SAFFRON = '#e07856';
const SAFFRON_DARK = '#b35535';
const SAGE = '#6f9a86';
const TARGETS: { label: string; value: number | null }[] = [
  { label: '随喜不限', value: null },
  { label: '1 万', value: 10000 },
  { label: '10 万', value: 100000 },
];
const mmdd = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const fmtWan = (n: number) => (n >= 10000 ? `${(n / 10000).toFixed(n >= 1000000 ? 0 : 1)} 万` : n.toLocaleString());

export default function EventDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: ev, isLoading, isError } = useEventDetail(id);
  const join = useJoinEventVow();
  const [joinToken] = useState(() => genClientToken());
  // 修法=法会默认(§3.12 愿模板·不让师兄选);目标可自设:快捷挡 或 自定数量(PM 2026-07-02 二拍)
  const [target, setTarget] = useState<number | null>(null);
  const [customStr, setCustomStr] = useState('');
  const [targetInited, setTargetInited] = useState(false);
  useEffect(() => {
    if (!targetInited && ev) {
      const sug = ev.suggestedTarget ?? null;
      if (sug != null && !TARGETS.some((t) => t.value === sug)) setCustomStr(String(sug)); // 建议值不在快捷挡 → 进自定框
      setTarget(sug);
      setTargetInited(true);
    }
  }, [ev, targetInited]);
  const customNum = customStr.trim() ? Math.max(1, parseInt(customStr, 10) || 0) || null : null;
  const effectiveTarget = customNum ?? target; // 自定填了数 → 覆盖挡位

  const joined = (ev?.myVows.length ?? 0) > 0;
  const statusMeta = ev?.status === 'live' ? { txt: '进行中', bg: SAGE } : ev?.status === 'upcoming' ? { txt: '即将开始', bg: SAFFRON } : { txt: '已圆满', bg: '#9a8a76' };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF4E9' }} edges={['top']}>
      <View style={styles.top}>
        <Pressable hitSlop={8} onPress={() => router.back()}><ChevronLeft size={24} color={INK} /></Pressable>
        <Text className="font-serif" style={{ fontSize: 17, fontWeight: '700', color: INK }}>法会详情</Text>
      </View>
      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={SAFFRON_DARK} /></View>
      ) : isError ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <RNText style={{ fontSize: 14, color: INK2, textAlign: 'center' }}>加载失败,请检查网络后重试(不代表法会不存在)</RNText>
        </View>
      ) : !ev ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <RNText style={{ fontSize: 14, color: INK2 }}>法会不存在或已下架</RNText>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }}>
          {/* 法会信息(真) */}
          <View style={styles.card}>
            <View style={[styles.tagLive, { backgroundColor: statusMeta.bg }]}><RNText style={{ fontSize: 10, fontWeight: '700', color: '#fff' }}>{statusMeta.txt}</RNText></View>
            <Text className="font-serif" style={{ fontSize: 20, fontWeight: '700', color: INK, marginTop: 8 }}>{ev.name}</Text>
            <View className="flex-row items-center" style={{ gap: 6, marginTop: 8 }}><CalendarClock size={15} color={INK3} /><RNText style={{ fontSize: 13, color: INK2 }}>{mmdd(ev.startDate)} – {mmdd(ev.endDate)}</RNText></View>
            {ev.description ? <RNText style={{ fontSize: 13, color: INK2, lineHeight: 21, marginTop: 8 }}>{ev.description}</RNText> : null}
          </View>

          {/* 场次(有才显) */}
          {ev.sessions.length > 0 ? (
            <View style={styles.card}>
              <Text className="font-serif" style={{ fontSize: 15, fontWeight: '700', color: INK }}>场次安排</Text>
              <View style={{ gap: 10, marginTop: 10 }}>
                {ev.sessions.map((s) => (
                  <View key={s.id} className="flex-row items-center" style={{ gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <RNText style={{ fontSize: 14, color: INK, fontWeight: '600' }}>{mmdd(s.sessionDate)}{s.startTime ? ` ${s.startTime}` : ''}{s.title ? ` · ${s.title}` : ''}</RNText>
                      <RNText style={{ fontSize: 12, color: INK3, marginTop: 1 }}>{s.mode === 'online' ? '线上 Zoom' : s.mode === 'offline' ? (s.location ?? '线下') : '线上 + 线下'}</RNText>
                    </View>
                    {s.onlineUrl ? (
                      <Pressable style={styles.joinMeet} onPress={() => Linking.openURL(s.onlineUrl!)}>
                        <Video size={13} color="#fff" /><RNText style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>进入</RNText>
                      </Pressable>
                    ) : null}
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* 集体回向(#193 只总和) + 我的(仅有共修功课的法会显示) */}
          {ev.defaultPractice || joined ? (
          <View style={styles.card}>
            <View className="flex-row" style={{ gap: 10 }}>
              <View style={styles.stat}><Text className="font-serif" style={styles.statV}>{ev.myCount.toLocaleString()}</Text><RNText style={styles.statK}>我已念(遍)</RNText></View>
              <View style={styles.stat}><Text className="font-serif" style={[styles.statV, { color: SAFFRON_DARK }]}>{fmtWan(ev.platformTotal)}</Text><RNText style={styles.statK}>全平台共修(遍)</RNText></View>
            </View>
          </View>
          ) : null}

          {/* 我的法会愿 / 发愿 */}
          {joined ? (
            <View style={styles.card}>
              <Text className="font-serif" style={{ fontSize: 15, fontWeight: '700', color: INK }}>我的法会功课</Text>
              <View style={{ gap: 10, marginTop: 10 }}>
                {ev.myVows.map((v) => (
                  <Pressable key={v.vowId} className="flex-row items-center" style={{ gap: 10 }} onPress={() => router.push(`/vow/${v.vowId}` as never)}>
                    <View style={{ flex: 1 }}>
                      <RNText style={{ fontSize: 14, color: INK, fontWeight: '600' }}>{v.name}</RNText>
                      <RNText style={{ fontSize: 12, color: INK3, marginTop: 1 }}>已念 {v.currentCount.toLocaleString()}{v.targetCount ? ` / ${v.targetCount.toLocaleString()}` : ''} {v.unit}</RNText>
                    </View>
                    <RNText style={{ fontSize: 12, fontWeight: '700', color: SAFFRON_DARK }}>去计数 ›</RNText>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : ev.status !== 'past' && ev.defaultPractice ? (
            <View style={styles.card}>
              <View className="flex-row items-center" style={{ gap: 8 }}>
                <HandHeart size={17} color={SAFFRON_DARK} />
                <Text className="font-serif" style={{ fontSize: 15, fontWeight: '700', color: INK }}>发愿参加</Text>
              </View>
              {/* 修法=法会统一(§3.12 愿模板,不选);目标自设,预选=法会建议 */}
              <View style={styles.defaultVowCard}>
                <RNText style={{ fontSize: 12, color: INK3 }}>本法会共修</RNText>
                <Text className="font-serif" style={{ fontSize: 19, fontWeight: '700', color: SAFFRON_DARK, marginTop: 3 }}>{ev.defaultPractice.name}</Text>
                <RNText style={{ fontSize: 12, color: INK2, marginTop: 4 }}>全体师兄同修此功课,法会期间的计数汇入集体回向。</RNText>
              </View>
              <RNText style={styles.pickLabel}>我的目标(可随喜不限,也可自定)</RNText>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {TARGETS.map((t) => {
                  const on = !customNum && target === t.value;
                  return (
                    <Pressable key={t.label} style={[styles.chip, on && styles.chipOn]} onPress={() => { setCustomStr(''); setTarget(t.value); }}>
                      <RNText style={{ fontSize: 13, fontWeight: '600', color: on ? '#fff' : INK2 }}>{t.label}</RNText>
                    </Pressable>
                  );
                })}
              </View>
              <View style={[styles.customBox, customNum ? styles.customBoxOn : null]}>
                <TextInput
                  value={customStr}
                  onChangeText={(v: string) => setCustomStr(v.replace(/[^0-9]/g, ''))}
                  placeholder="自定数量,如 21000"
                  placeholderTextColor={INK3}
                  keyboardType="number-pad"
                  maxLength={9}
                  style={styles.customInput}
                />
                {customNum ? <RNText style={{ fontSize: 12, fontWeight: '700', color: SAFFRON_DARK }}>目标 {customNum.toLocaleString()} 遍</RNText> : null}
              </View>
              <Pressable
                testID={testIds.event.joinButton}
                style={[styles.joinBtn, join.isPending && { opacity: 0.4 }]}
                disabled={join.isPending}
                onPress={() => join.mutate({ eventId: ev.id, practiceId: ev.defaultPractice!.id, targetCount: effectiveTarget, endDate: ev.endDate, clientToken: joinToken }, {
                  onSuccess: () => notify('已发愿', '随喜!法会期间在「修持」页或快速计数记录念修即可。'),
                  onError: (e) => notify('发愿失败', (e as Error)?.message ?? '请重试'),
                })}
              >
                <RNText style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{join.isPending ? '发愿中…' : '发愿 · 参加'}</RNText>
              </Pressable>
            </View>
          ) : null}

          <RNText style={{ fontSize: 11, color: INK3, paddingHorizontal: 4 }}>集体回向只显示全平台总量,不显示任何个人数据(#193)。</RNText>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  customBox: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, backgroundColor: 'rgba(43,34,24,0.04)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)', paddingHorizontal: 12 },
  customBoxOn: { borderColor: 'rgba(224,120,86,0.5)', backgroundColor: '#FBE5DA' },
  customInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: INK },
  defaultVowCard: { marginTop: 12, backgroundColor: '#FBE5DA', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(224,120,86,0.3)' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)' },
  tagLive: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 9999 },
  joinMeet: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 9999, backgroundColor: SAFFRON },
  stat: { flex: 1, alignItems: 'center', backgroundColor: 'rgba(43,34,24,0.03)', borderRadius: 10, paddingVertical: 10 },
  statV: { fontSize: 18, fontWeight: '700', color: INK },
  statK: { fontSize: 10, color: INK3, marginTop: 1 },
  pickLabel: { fontSize: 12, fontWeight: '600', color: INK3, marginTop: 12, marginBottom: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9999, backgroundColor: 'rgba(43,34,24,0.05)' },
  chipOn: { backgroundColor: SAFFRON },
  joinBtn: { marginTop: 14, paddingVertical: 12, borderRadius: 12, backgroundColor: SAFFRON, alignItems: 'center' },
});
