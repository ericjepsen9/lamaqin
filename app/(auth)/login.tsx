import { useRouter } from 'expo-router';
import { Flower2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { testIds } from '@/lib/testids';

import { TextInput } from '@/components/ui/text-input';
// 登录 / 注册 第 1 步:邮箱(决策168·一页一操作)。确定 → /verify(第 2 步:验证码 / 密码)。
const INK = '#2b2218';
const INK3 = '#7e6d5b';
const SAFFRON = '#e07856';
const SAFFRON_DARK = '#b35535';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');

  return (
    <SafeAreaView role="main" style={{ flex: 1, backgroundColor: '#FBF4E9' }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 8 }}>
        <View style={styles.mark}><Flower2 size={34} color={SAFFRON_DARK} /></View>
        <Text className="font-serif" style={{ fontSize: 26, fontWeight: '700', color: INK, letterSpacing: 2, marginTop: 8 }}>纽约佛学会</Text>
        <Text style={{ fontSize: 13, color: INK3, letterSpacing: 1 }}>前行发心 · 正行无缘 · 结行回向</Text>

        <View style={{ width: '100%', maxWidth: 320, gap: 12, marginTop: 28 }}>
          <View style={styles.field}>
            <TextInput testID={testIds.login.emailInput} value={email} onChangeText={setEmail} placeholder="邮箱" placeholderTextColor={INK3} keyboardType="email-address" autoCapitalize="none" style={styles.input} />
          </View>
          <Pressable testID={testIds.login.nextButton} style={[styles.primary, email.trim().length === 0 && { opacity: 0.4 }]} disabled={email.trim().length === 0} onPress={() => router.push({ pathname: '/verify', params: { email } } as never)}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>下一步</Text>
          </Pressable>
        </View>

        <Pressable onPress={() => router.push({ pathname: '/register', params: email.trim() ? { email } : {} } as never)} style={{ paddingVertical: 10, marginTop: 6 }}>
          <Text style={{ fontSize: 13.5, color: SAFFRON_DARK, fontWeight: '700', textAlign: 'center' }}>新师兄?注册账号 ›</Text>
        </Pressable>
        <Text style={{ fontSize: 12, color: INK3, textAlign: 'center', marginTop: 8, lineHeight: 18 }}>注册后进入「待审核」,管理员审批通过即可学修</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  mark: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(224,120,86,0.12)', alignItems: 'center', justifyContent: 'center' },
  field: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(43,34,24,0.12)', paddingHorizontal: 14 },
  input: { paddingVertical: 13, fontSize: 15, color: INK },
  primary: { backgroundColor: SAFFRON, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 2 },
});
