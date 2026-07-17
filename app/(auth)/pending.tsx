import { useRouter } from 'expo-router';
import { Clock } from 'lucide-react-native';
import { Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { supabase } from '@/lib/supabase';

// 「待审核」页(决策058)。注册后 status=pending,看不到任何学修内容,等辅导员/admin 批准。暖藏式。
const INK = '#2b2218';
const INK3 = '#7e6d5b';
const SAFFRON_DARK = '#b35535';

export default function Pending() {
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF4E9' }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 16 }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(224,120,86,0.12)', alignItems: 'center', justifyContent: 'center' }}>
          <Clock size={34} color={SAFFRON_DARK} />
        </View>
        <Text className="font-serif" style={{ fontSize: 20, fontWeight: '700', color: INK }}>报名已提交,等待审核</Text>
        <RNText style={{ fontSize: 14, color: INK3, textAlign: 'center', lineHeight: 24 }}>管理员确认后,你就能进入学修。请耐心等候,无需重复提交。</RNText>
        <Pressable style={styles.refresh} onPress={() => router.replace('/')}>
          <RNText style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>刷新审核状态</RNText>
        </Pressable>
        <Pressable onPress={async () => { await supabase.auth.signOut(); router.replace('/login'); }} style={{ paddingVertical: 8 }}>
          <RNText style={{ fontSize: 13, color: INK3 }}>退出登录</RNText>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  refresh: { marginTop: 8, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 9999, backgroundColor: '#e07856' },
});
