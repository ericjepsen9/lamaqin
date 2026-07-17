import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Camera, ChevronLeft } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text as RNText, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { notify } from '@/lib/dialog';
import { useAuth } from '@/lib/auth';
import { useCurrentUser } from '@/lib/queries/profile';
import { supabase } from '@/lib/supabase';

// 编辑资料(设置 → 账号与隐私)。法名 / 头像 / 联系方式可改;真实姓名供辅导员核对;
// 学号 = 转正后发放·只读(决策134);无障碍登记(盲聋豁免·听看两遍即圆满)。
// 守:无状态色。保存已接真(D-9·2026-07-02:full_name/dharma_name/phone/accessibility_needs);头像上传仍待 storage。
const INK = '#2b2218';
const INK3 = '#7e6d5b';
const SAFFRON = '#e07856';
const SAFFRON_DARK = '#b35535';

export default function EditProfile() {
  const router = useRouter();
  const { session } = useAuth();
  const qc = useQueryClient();
  const { data: me, isError: meError } = useCurrentUser();
  const [dharma, setDharma] = useState('');
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [blind, setBlind] = useState(false);
  const [deaf, setDeaf] = useState(false);
  const [busy, setBusy] = useState(false);
  // 档案到位后灌初值(只灌一次:以 me.id 变化为准)——渲染期间比对上一次的me?.id
  // (react-hooks/set-state-in-effect·2026-07-17 lint债清理)。刻意只跟me?.id比,不跟me本身比
  // (原exhaustive-deps disable注释的既有用意):同一个人的资料后台刷新拿到新对象引用时不应该
  // 覆盖用户正在编辑的内容,只有真的换了人(id变了)才重灌。
  const [prevMeId, setPrevMeId] = useState(me?.id);
  if (me?.id !== prevMeId) {
    setPrevMeId(me?.id);
    if (me) {
      setDharma(me.dharmaName ?? '');
      setName(me.fullName ?? '');
      setContact(me.phone ?? '');
      setBlind(me.accessibilityNeeds.includes('blind'));
      setDeaf(me.accessibilityNeeds.includes('deaf'));
    }
  }
  const initial = (dharma || name || '师').slice(0, 1);

  async function save() {
    const uid = session?.user.id;
    if (!uid || busy) return;
    setBusy(true);
    const { error } = await supabase.from('profiles').update({
      full_name: name.trim() || null,
      dharma_name: dharma.trim() || null,
      phone: contact.trim() || null,
      accessibility_needs: [...(blind ? ['blind'] : []), ...(deaf ? ['deaf'] : [])],
    }).eq('id', uid);
    setBusy(false);
    if (error) { notify('保存失败', error.message); return; }
    qc.invalidateQueries({ queryKey: ['current-user'] });
    router.back();
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF4E9' }} edges={['top']}>
      <View style={styles.top}>
        <Pressable hitSlop={8} onPress={() => router.back()}><ChevronLeft size={24} color={INK} /></Pressable>
        <Text className="font-serif" style={{ flex: 1, fontSize: 17, fontWeight: '700', color: INK }}>编辑资料</Text>
        <Pressable hitSlop={8} disabled={busy} onPress={save}><RNText style={{ fontSize: 14, fontWeight: '700', color: SAFFRON_DARK }}>{busy ? '保存中…' : '保存'}</RNText></Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
        {/* 查询失败别让表单静默留空——那和"还没填过"没法区分(全文件审计 2026-07-12):
            资料没到位时明确提示,避免师兄误以为字段本就是空/未转正而直接保存覆盖旧值。 */}
        {meError ? (
          <View style={styles.errorBanner}>
            <RNText style={{ fontSize: 12.5, color: '#a13c2e', lineHeight: 18 }}>资料加载失败,请检查网络后重试。下方字段可能未取到你的现有资料,建议刷新后再保存,以免覆盖为空值。</RNText>
          </View>
        ) : null}

        {/* 头像 */}
        <View className="items-center" style={{ gap: 10, paddingVertical: 8 }}>
          <Pressable style={styles.avatarWrap}>
            <View style={styles.avatar}><Text className="font-serif" style={{ fontSize: 30, fontWeight: '700', color: '#fff' }}>{initial}</Text></View>
            <View style={styles.cam}><Camera size={14} color="#fff" /></View>
          </Pressable>
          <RNText style={{ fontSize: 12, color: INK3 }}>更换头像</RNText>
        </View>

        <View style={styles.group}>
          <Field label="法名" value={dharma} onChange={setDharma} placeholder="师父赐的法名" />
          <Field label="真实姓名" value={name} onChange={setName} placeholder="用于辅导员核对身份" note="改动后辅导员可能需重新核对" />
          <Field label="手机号 / 微信" value={contact} onChange={setContact} placeholder="便于辅导员联系(可选)" last />
        </View>

        {/* 学号(只读) */}
        <View style={styles.group}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}><RNText style={styles.label}>学号</RNText><RNText style={styles.note}>转正后由辅导员发放,不可自行修改</RNText></View>
            <RNText style={{ fontSize: 15, color: INK3 }}>{me?.studentId ?? '转正后发放'}</RNText>
          </View>
        </View>

        {/* 无障碍(盲/聋分列,与注册登记一致) */}
        <Pressable style={styles.a11y} onPress={() => setBlind((v) => !v)}>
          <View style={[styles.check, blind && { backgroundColor: SAFFRON, borderColor: SAFFRON }]}>{blind ? <RNText style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✓</RNText> : null}</View>
          <View style={{ flex: 1 }}>
            <RNText style={{ fontSize: 14, color: INK, fontWeight: '600' }}>我有视力障碍</RNText>
            <RNText style={{ fontSize: 12, color: INK3, marginTop: 1 }}>听两遍即圆满(免看法本、免答题)</RNText>
          </View>
        </Pressable>
        <Pressable style={styles.a11y} onPress={() => setDeaf((v) => !v)}>
          <View style={[styles.check, deaf && { backgroundColor: SAFFRON, borderColor: SAFFRON }]}>{deaf ? <RNText style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✓</RNText> : null}</View>
          <View style={{ flex: 1 }}>
            <RNText style={{ fontSize: 14, color: INK, fontWeight: '600' }}>我有听力障碍</RNText>
            <RNText style={{ fontSize: 12, color: INK3, marginTop: 1 }}>看两遍即圆满(免听、免答题)</RNText>
          </View>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, value, onChange, placeholder, note, last }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; note?: string; last?: boolean }) {
  return (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <View style={{ flex: 1 }}>
        <RNText style={styles.label}>{label}</RNText>
        {note ? <RNText style={styles.note}>{note}</RNText> : null}
      </View>
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={INK3} style={styles.input} />
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  errorBanner: { backgroundColor: 'rgba(161,60,46,0.08)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(161,60,46,0.25)' },
  avatarWrap: { width: 84, height: 84 },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: '#C99563', alignItems: 'center', justifyContent: 'center' },
  cam: { position: 'absolute', right: 0, bottom: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: SAFFRON, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FBF4E9' },
  group: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(43,34,24,0.06)', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(43,34,24,0.06)' },
  label: { fontSize: 15, fontWeight: '600', color: INK },
  note: { fontSize: 12, color: INK3, marginTop: 1 },
  input: { flex: 1, textAlign: 'right', fontSize: 15, color: INK, paddingVertical: 0 },
  a11y: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(43,34,24,0.06)' },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: 'rgba(43,34,24,0.2)', alignItems: 'center', justifyContent: 'center' },
});
