import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { supabase } from '@/lib/supabase';
import { testIds } from '@/lib/testids';

import { TextInput } from '@/components/ui/text-input';
// 登录 / 注册 第 2 步:密码 或 验证码(决策168·一页一操作)。
// 接 Supabase Auth:密码=signInWithPassword;验证码=signInWithOtp 发码 + verifyOtp 校验。
// 密码登录成功 → router.replace('/') 直接走入口闸门(index)按 session + profiles.status 分流。
// 验证码登录成功 → 先转 /set-password(找回密码路径·PM 2026-07-12·选项B):忘了密码的人借这条
//   路重新进来,顺路给个机会设新密码(可跳过),避免往后每次都要等邮件验证码。
// 开发测试建议用「密码」(免邮件配置);验证码需 Supabase 邮件模板含 {{ .Token }}。
const INK = '#2b2218';
const INK3 = '#7e6d5b';
const SAFFRON = '#e07856';
const SAFFRON_DARK = '#b35535';
const CRIMSON = '#a13c2e';

export default function Verify() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email?: string }>();
  const [mode, setMode] = useState<'pwd' | 'code'>('pwd'); // 开发默认密码(最省事)
  const [val, setVal] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const otpSent = useRef(false);

  // 切到验证码模式且有邮箱时,发一次 OTP(不自动建用户)
  useEffect(() => {
    if (mode === 'code' && email && !otpSent.current) {
      otpSent.current = true;
      supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    }
  }, [mode, email]);

  async function submit() {
    if (!val.trim() || busy) return;
    if (!email) { setErr('缺少邮箱,请返回重填'); return; }
    setBusy(true); setErr(null);
    const res = mode === 'pwd'
      ? await supabase.auth.signInWithPassword({ email, password: val })
      : await supabase.auth.verifyOtp({ email, token: val.trim(), type: 'email' });
    setBusy(false);
    if (res.error) { setErr(res.error.message); return; }
    if (mode === 'code') { router.replace('/set-password' as never); return; } // 找回密码路径,顺路给设新密码机会
    router.replace('/'); // 入口闸门按 status 分流
  }

  function resend() {
    if (!email) return;
    setErr(null);
    supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  }

  return (
    <SafeAreaView role="main" style={{ flex: 1, backgroundColor: '#FBF4E9' }} edges={['top']}>
      <View style={styles.top}>
        <Pressable hitSlop={8} onPress={() => router.back()}><ChevronLeft size={24} color={INK} /></Pressable>
      </View>
      <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 32, paddingTop: 24 }}>
        <Text className="font-serif" style={{ fontSize: 22, fontWeight: '700', color: INK, alignSelf: 'flex-start' }}>{mode === 'code' ? '输入验证码' : '输入密码'}</Text>
        <Text style={{ fontSize: 13, color: INK3, alignSelf: 'flex-start', marginTop: 6 }}>
          {mode === 'code' ? `验证码已发送至 ${email ?? '你的邮箱'}` : `账号 ${email ?? ''}`}
        </Text>

        <View style={{ width: '100%', gap: 12, marginTop: 24 }}>
          <View style={styles.field}>
            <TextInput
              testID={testIds.verify.codeInput}
              value={val}
              onChangeText={(t) => { setVal(t); setErr(null); }}
              placeholder={mode === 'code' ? '6 位验证码' : '密码'}
              placeholderTextColor={INK3}
              keyboardType={mode === 'code' ? 'number-pad' : 'default'}
              secureTextEntry={mode === 'pwd'}
              autoCapitalize="none"
              onSubmitEditing={submit}
              style={[styles.input, mode === 'code' && { letterSpacing: 6, fontSize: 20 }]}
            />
          </View>
          {err ? <Text style={{ fontSize: 13, color: CRIMSON }}>{err}</Text> : null}
          <Pressable testID={testIds.verify.submitButton} style={[styles.primary, (val.trim().length === 0 || busy) && { opacity: 0.4 }]} disabled={val.trim().length === 0 || busy} onPress={submit}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{busy ? '登录中…' : '登录'}</Text>
          </Pressable>
        </View>

        <View className="flex-row items-center justify-between" style={{ width: '100%', marginTop: 16 }}>
          <Pressable onPress={() => { setMode((m) => (m === 'code' ? 'pwd' : 'code')); setVal(''); setErr(null); }}>
            <Text style={{ fontSize: 13, color: SAFFRON_DARK, fontWeight: '700' }}>{mode === 'code' ? '用密码登录' : '忘记密码?用验证码登录'}</Text>
          </Pressable>
          {mode === 'code' ? <Pressable onPress={resend} hitSlop={6}><Text style={{ fontSize: 13, color: INK3 }}>重新发送</Text></Pressable> : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  field: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(43,34,24,0.12)', paddingHorizontal: 16 },
  input: { paddingVertical: 14, fontSize: 15, color: INK },
  primary: { backgroundColor: SAFFRON, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 2 },
});
