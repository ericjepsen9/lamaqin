import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { useAuth } from '@/lib/auth';
import { useMyCohorts } from '@/lib/queries/classes';
import { useCurrentUser } from '@/lib/queries/profile';
import { supabase } from '@/lib/supabase';

// 老学员植入"欢迎回来"页(决策076沿用 prd §5.1.2,2026-07-12 正式建):
// 入口闸门(app/index.tsx)按 profiles.data_source='imported' 且 welcome_seen_at IS NULL
// 导向这里,展示学号/主班/已加入班,点「进入App」写 welcome_seen_at 后不再出现。
const INK = '#2b2218';
const INK2 = '#55463a';
const INK3 = '#7e6d5b';
const SAFFRON = '#e07856';

export default function WelcomeBack() {
  const router = useRouter();
  const { session } = useAuth();
  const { data: me } = useCurrentUser();
  const { data: cohorts = [] } = useMyCohorts();
  const [busy, setBusy] = useState(false);

  const primary = cohorts.find((c) => c.isPrimary) ?? cohorts[0] ?? null;

  async function enter() {
    if (busy || !session?.user.id) return;
    setBusy(true);
    await supabase.from('profiles').update({ welcome_seen_at: new Date().toISOString() }).eq('id', session.user.id);
    router.replace('/home');
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF4E9' }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 32, paddingTop: 56, paddingBottom: 24 }}>
        <Text className="font-serif" style={{ fontSize: 26, fontWeight: '700', color: INK }}>欢迎回来{me?.fullName ? `,${me.fullName}` : ''}</Text>
        <Text style={{ fontSize: 14, color: INK3, marginTop: 8, lineHeight: 22 }}>你此前的学修记录已经带过来了,继续从这里学修吧。</Text>

        <View style={{ marginTop: 28, gap: 14 }}>
          {me?.studentId ? (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>学号</Text>
              <Text style={styles.rowVal}>{me.studentId}</Text>
            </View>
          ) : null}
          {primary ? (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>主班</Text>
              <Text style={styles.rowVal}>{primary.programName ? `${primary.programName} · ` : ''}{primary.cohortName}</Text>
            </View>
          ) : null}
          {cohorts.length > 1 ? (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>已加入班</Text>
              <Text style={styles.rowVal}>{cohorts.map((c) => c.cohortName).join('、')}</Text>
            </View>
          ) : null}
        </View>

        <View style={{ flex: 1 }} />
        <Pressable style={[styles.primary, busy && { opacity: 0.6 }]} disabled={busy} onPress={enter}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>进入App</Text>}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)' },
  rowLabel: { fontSize: 13, color: INK2, fontWeight: '600' },
  rowVal: { fontSize: 13, color: INK, fontWeight: '600', flexShrink: 1, textAlign: 'right', marginLeft: 12 },
  primary: { backgroundColor: SAFFRON, borderRadius: 9999, paddingVertical: 15, alignItems: 'center', marginTop: 24 },
});
