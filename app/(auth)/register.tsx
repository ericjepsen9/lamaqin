import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, MailCheck } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { isEmailTakenError } from '@/lib/auth-errors';
import { supabase } from '@/lib/supabase';
import { testIds } from '@/lib/testids';

import { TextInput } from '@/components/ui/text-input';
// 注册(D-2/D-3·2026-07-02):邮箱+密码 signUp → 触发器自动建 pending 档案(审批门 058/132 fail-closed)。
// 成功后两种走向(按 Supabase 项目「邮箱确认」开关自适应):
//   · 关(直接给会话)→ 进 /onboarding 完善资料+学习意愿;
//   · 开(无会话)→ 输入邮箱收到的 6 位验证码完成确认(PM 2026-07-15·选项③,同找回密码一套
//     verifyOtp 模式,不再靠点邮件里的链接跳转——链接要跳去哪个网址依赖 Supabase 后台配置,
//     手机上跨 App 跳转体验也割裂,验证码从根上避开这两个问题)。
//     ⚠️ 这只是 App 侧一半:Supabase 后台"Confirm signup"邮件模板要把 {{ .ConfirmationURL }}
//     换成/加上 {{ .Token }} 才会真的把验证码写进邮件正文,这一步在 Dashboard 里,App 代码管不到。
//   确认成功后进 /onboarding 完善资料+学习意愿。
const INK = '#2b2218';
const INK2 = '#55463a';
const INK3 = '#7e6d5b';
const SAFFRON = '#e07856';
const SAFFRON_DARK = '#b35535';
const CRIMSON = '#a13c2e';

export default function Register() {
  const router = useRouter();
  const sp = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(sp.email ?? '');
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false); // 邮箱确认开着时:注册成功但无会话 → 输验证码态
  const [code, setCode] = useState('');
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeErr, setCodeErr] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  const valid = /.+@.+\..+/.test(email.trim()) && pwd.length >= 8 && pwd === pwd2;

  async function submitCode() {
    if (!code.trim() || codeBusy) return;
    setCodeBusy(true); setCodeErr(null);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'signup' });
    setCodeBusy(false);
    if (error) { setCodeErr(error.message); return; }
    router.replace('/onboarding' as never);
  }

  async function resendCode() {
    if (codeBusy) return;
    setResent(false); setCodeErr(null);
    await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      ...(Platform.OS === 'web' ? { options: { emailRedirectTo: window.location.origin } } : {}),
    });
    setResent(true);
  }

  async function submit() {
    if (!valid || busy) return;
    setBusy(true); setErr(null);
    // emailRedirectTo 传当前实际访问的域名(PM 2026-07-15 实测复现:不传时落回 Supabase 项目
    // Dashboard 里的 Site URL,曾是遗留的 localhost:3000,确认邮件里的链接点开直接"无法访问此网站"。
    // 传了之后还需该域名在 Supabase Dashboard → Authentication → URL Configuration 的
    // Redirect URLs 白名单里,否则仍会静默落回 Site URL——白名单本身要 PM 去后台加,App 代码管不到。
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password: pwd,
      ...(Platform.OS === 'web' ? { options: { emailRedirectTo: window.location.origin } } : {}),
    });
    setBusy(false);
    if (error) {
      setErr(isEmailTakenError(error.code, error.message) ? '该邮箱已注册,请直接登录。' : error.message);
      return;
    }
    if (data.session) { router.replace('/onboarding' as never); return; }
    setSent(true);
  }

  if (sent) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF4E9' }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 14 }}>
          <View style={styles.mark}><MailCheck size={30} color={SAFFRON_DARK} /></View>
          <Text className="font-serif" style={{ fontSize: 20, fontWeight: '700', color: INK }}>输入验证码完成确认</Text>
          <Text style={{ fontSize: 14, color: INK3, textAlign: 'center', lineHeight: 24 }}>验证码已发送至{'\n'}{email.trim()}</Text>

          <View style={{ width: '100%', gap: 10, marginTop: 8 }}>
            <View style={styles.field}>
              <TextInput
                testID={testIds.register.codeInput}
                value={code}
                onChangeText={(t) => { setCode(t); setCodeErr(null); }}
                placeholder="6 位验证码"
                placeholderTextColor={INK3}
                keyboardType="number-pad"
                autoCapitalize="none"
                onSubmitEditing={submitCode}
                style={[styles.input, { letterSpacing: 6, fontSize: 20, textAlign: 'center' }]}
              />
            </View>
            {codeErr ? <Text style={{ fontSize: 12, color: CRIMSON, textAlign: 'center' }}>{codeErr}</Text> : null}
            <Pressable
              testID={testIds.register.codeSubmitButton}
              style={[styles.primary, (!code.trim() || codeBusy) && { opacity: 0.4 }]}
              disabled={!code.trim() || codeBusy}
              onPress={submitCode}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{codeBusy ? '确认中…' : '确认'}</Text>
            </Pressable>
            <Pressable testID={testIds.register.resendButton} onPress={resendCode} hitSlop={6} style={{ alignItems: 'center', padding: 8 }}>
              <Text style={{ fontSize: 13, color: INK2 }}>{resent ? '已重新发送' : '没收到?重新发送'}</Text>
            </Pressable>
          </View>

          <Pressable onPress={() => router.replace('/login' as never)}>
            <Text style={{ fontSize: 13, color: SAFFRON_DARK, fontWeight: '700' }}>回登录页</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF4E9' }} edges={['top']}>
      <View style={styles.top}>
        <Pressable hitSlop={8} onPress={() => router.back()}><ChevronLeft size={24} color={INK} /></Pressable>
      </View>
      <View style={{ flex: 1, paddingHorizontal: 32, paddingTop: 24 }}>
        <Text className="font-serif" style={{ fontSize: 22, fontWeight: '700', color: INK }}>注册账号</Text>
        <Text style={{ fontSize: 13, color: INK3, marginTop: 6 }}>注册后完善资料,管理员审批通过即可开始学修。</Text>

        <View style={{ gap: 12, marginTop: 24 }}>
          <View style={styles.field}>
            <TextInput testID={testIds.register.emailInput} value={email} onChangeText={(t) => { setEmail(t); setErr(null); }} placeholder="邮箱" placeholderTextColor={INK3} keyboardType="email-address" autoCapitalize="none" style={styles.input} />
          </View>
          <View style={styles.field}>
            <TextInput testID={testIds.register.passwordInput} value={pwd} onChangeText={(t) => { setPwd(t); setErr(null); }} placeholder="设置密码(至少 8 位)" placeholderTextColor={INK3} secureTextEntry style={styles.input} />
          </View>
          <View style={styles.field}>
            <TextInput testID={testIds.register.password2Input} value={pwd2} onChangeText={(t) => { setPwd2(t); setErr(null); }} placeholder="再输一遍密码" placeholderTextColor={INK3} secureTextEntry style={styles.input} />
          </View>
          {pwd2.length > 0 && pwd !== pwd2 ? <Text style={{ fontSize: 12, color: CRIMSON }}>两次密码不一致</Text> : null}
          {err ? <Text style={{ fontSize: 12, color: CRIMSON }}>{err}</Text> : null}
          <Pressable testID={testIds.register.submitButton} style={[styles.primary, { alignSelf: 'stretch', marginTop: 4 }, (!valid || busy) && { opacity: 0.4 }]} disabled={!valid || busy} onPress={submit}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{busy ? '注册中…' : '注册'}</Text>
          </Pressable>
          <Text style={{ fontSize: 12, color: INK2, textAlign: 'center', marginTop: 6 }}>已有账号?返回上一页直接登录。</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  mark: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(224,120,86,0.12)', alignItems: 'center', justifyContent: 'center' },
  field: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(43,34,24,0.12)', paddingHorizontal: 14 },
  input: { paddingVertical: 13, fontSize: 15, color: INK },
  primary: { backgroundColor: SAFFRON, borderRadius: 9999, paddingHorizontal: 28, paddingVertical: 13, alignItems: 'center' },
});
