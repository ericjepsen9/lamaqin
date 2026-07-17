import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text as RNText, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { useAuth } from '@/lib/auth';
import type { CurrentUser } from '@/lib/queries/profile';
import { supabase } from '@/lib/supabase';
import { testIds } from '@/lib/testids';

// 验证码登录(找回密码路径)成功后的一次性顺路提示(PM 2026-07-12·选项B):此时已有 session,
// 但用户走的是"忘了密码"这条路,原密码永远没法再用——这里给个机会设个新密码,可跳过(不强制)。
// 密码模式登录成功不经过这一页,直接进 index 闸门(见 verify.tsx)。
//
// forced=1(2026-07-15·老学员默认密码场景):入口闸门(app/index.tsx)在 profiles.
// must_change_password=true 时强制跳到这里——此时不给"先跳过"选项(默认密码所有人共享,
// 不改掉就一直能被人拿那个默认密码登进来,必须走完才能放行),提交成功后顺带把该标记写回 false。
const INK = '#2b2218';
const INK2 = '#55463a';
const INK3 = '#7e6d5b';
const SAFFRON = '#e07856';
const CRIMSON = '#a13c2e';

export default function SetPassword() {
  const router = useRouter();
  const { session } = useAuth();
  const qc = useQueryClient();
  const { forced } = useLocalSearchParams<{ forced?: string }>();
  const isForced = forced === '1';
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const valid = pwd.length >= 8 && pwd === pwd2;

  function proceed() {
    router.replace('/'); // 入口闸门按 status 分流(同 verify.tsx 成功后的去向)
  }

  async function submit() {
    if (!valid || busy) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    if (error) { setBusy(false); setErr(error.message); return; }
    if (isForced && session?.user.id) {
      const { error: profileError } = await supabase.from('profiles').update({ must_change_password: false }).eq('id', session.user.id);
      if (profileError) { setBusy(false); setErr(profileError.message); return; }
      // 2026-07-17·PM报告"无限循环卡在重设密码页面":根因是这里只写了DB,没同步更新
      // useCurrentUser()的查询缓存——proceed()跳回入口闸门(index.tsx)时,闸门读到的还是
      // 缓存里旧的 mustChangePassword:true(哪怕后台会自动重取,闸门在重取完成前那一次渲染
      // 已经用旧值判定、把人redirect回本页),forced 模式又没有跳过按钮,于是死循环。
      // 这里已经拿到"确定成功"的新值,直接patch缓存,不必等一轮网络重取才生效。
      qc.setQueryData<CurrentUser | null | undefined>(['current-user', session.user.id], (old) =>
        (old ? { ...old, mustChangePassword: false } : old));
    }
    setBusy(false);
    proceed();
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF4E9' }} edges={['top']}>
      <View style={{ flex: 1, paddingHorizontal: 32, paddingTop: 40 }}>
        <Text className="font-serif" style={{ fontSize: 22, fontWeight: '700', color: INK }}>{isForced ? '请先设置你自己的密码' : '要不要顺便设个新密码?'}</Text>
        <RNText style={{ fontSize: 13, color: INK3, marginTop: 6, lineHeight: 20 }}>
          {isForced
            ? '你现在用的是系统给的默认密码,为了账号安全,需要先改成只有你自己知道的新密码,才能继续使用。'
            : '你刚才是用验证码登录的,原密码可能已经忘了。现在设一个新密码,以后就能直接用密码登录,不用每次都等邮件验证码。也可以先跳过,以后再说。'}
        </RNText>

        <View style={{ gap: 12, marginTop: 24 }}>
          <View style={styles.field}>
            <TextInput testID={testIds.setPassword.pwdInput} value={pwd} onChangeText={(t) => { setPwd(t); setErr(null); }} placeholder="设置新密码(至少 8 位)" placeholderTextColor={INK3} secureTextEntry style={styles.input} />
          </View>
          <View style={styles.field}>
            <TextInput testID={testIds.setPassword.pwd2Input} value={pwd2} onChangeText={(t) => { setPwd2(t); setErr(null); }} placeholder="再输一遍新密码" placeholderTextColor={INK3} secureTextEntry style={styles.input} />
          </View>
          {pwd2.length > 0 && pwd !== pwd2 ? <RNText style={{ fontSize: 12, color: CRIMSON }}>两次密码不一致</RNText> : null}
          {err ? <RNText style={{ fontSize: 12, color: CRIMSON }}>{err}</RNText> : null}
          <Pressable testID={testIds.setPassword.submitButton} style={[styles.primary, (!valid || busy) && { opacity: 0.4 }]} disabled={!valid || busy} onPress={submit}>
            <RNText style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{busy ? '设置中…' : '设置新密码'}</RNText>
          </Pressable>
          {isForced ? (
            // forced 模式不给"跳过"(必须改密码才放行,见上方注释),但仍需要一条退出路径——
            // 万一改密码本身出错(网络/服务端),不能把人困死在无返回、无跳过的页面上(2026-07-17
            // PM报告),给个和 pending.tsx/account-deletion-pending.tsx 一致的"退出登录"逃生口。
            <Pressable testID={testIds.setPassword.signOutButton} onPress={async () => { await supabase.auth.signOut(); router.replace('/login'); }} style={{ alignItems: 'center', marginTop: 4, padding: 8 }}>
              <RNText style={{ fontSize: 13, color: INK3 }}>退出登录</RNText>
            </Pressable>
          ) : (
            <Pressable onPress={proceed} style={{ alignItems: 'center', marginTop: 4, padding: 8 }}>
              <RNText style={{ fontSize: 13, color: INK2, fontWeight: '600' }}>先跳过,以后再说</RNText>
            </Pressable>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  field: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(43,34,24,0.12)', paddingHorizontal: 14 },
  input: { paddingVertical: 13, fontSize: 15, color: INK },
  primary: { backgroundColor: SAFFRON, borderRadius: 9999, paddingHorizontal: 28, paddingVertical: 13, alignItems: 'center' },
});
