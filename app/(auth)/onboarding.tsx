import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

import { TextInput } from '@/components/ui/text-input';
// 完善资料 / 入学申请(D-2/D-3·2026-07-02 接真;决策059/168 一页 2 项 + 进度条)。
// 步1 身份:姓名(必填)+ 法名(可选,D-3)+ 手机(可选);
// 步2 学习意愿 + 无障碍:想自学(选专业)/想进班(D-3,写 learning_mode + intended_program_id,
//   仅供审批页展示、照单赋权,不构成资格·决策119/096)+ 盲/聋登记(accessibility_needs)。
// 提交 = UPDATE 自己的 profiles 行(RLS 放行本人)→ /pending 等审批;status 始终 pending,不由客户端改。
const INK = '#2b2218';
const INK2 = '#55463a';
const INK3 = '#7e6d5b';
const SAFFRON = '#e07856';
const SAFFRON_DARK = '#b35535';
const CRIMSON = '#a13c2e';
const STEPS = 2;

export default function Onboarding() {
  const router = useRouter();
  const { session } = useAuth();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [dharma, setDharma] = useState('');
  const [phone, setPhone] = useState('');
  const [mode, setMode] = useState<'self_study' | 'class'>('self_study');
  const [programId, setProgramId] = useState<string | null>(null);
  const [blind, setBlind] = useState(false);
  const [deaf, setDeaf] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { data: programs = [], isLoading: programsLoading, isError: programsError } = useQuery({
    queryKey: ['programs-list'],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from('programs').select('id, name, display_order').order('display_order');
      if (error) throw error;
      return data ?? [];
    },
  });

  const canNext = step === 0 ? name.trim().length > 0 : (mode === 'class' || !!programId) && !busy;

  async function submit() {
    const uid = session?.user.id;
    if (!uid) { setErr('会话已失效,请重新登录'); return; }
    setBusy(true); setErr(null);
    const a11y: string[] = [...(blind ? ['blind'] : []), ...(deaf ? ['deaf'] : [])];
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: name.trim(),
        dharma_name: dharma.trim() || null,
        phone: phone.trim() || null,
        accessibility_needs: a11y,
        learning_mode: mode,
        intended_program_id: mode === 'self_study' ? programId : null,
      })
      .eq('id', uid);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    router.replace('/pending' as never);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF4E9' }} edges={['top']}>
      <View style={styles.top}>
        <Pressable hitSlop={8} onPress={() => (step === 0 ? router.back() : setStep(0))}><ChevronLeft size={24} color={INK} /></Pressable>
        <Text style={{ fontSize: 13, color: INK3 }}>第 {step + 1} / {STEPS} 步</Text>
      </View>
      <View style={styles.progress}><View style={[styles.progressFill, { width: `${((step + 1) / STEPS) * 100}%` }]} /></View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Text className="font-serif" style={{ fontSize: 24, fontWeight: '700', color: INK, letterSpacing: 1 }}>完善资料</Text>
        <Text style={{ fontSize: 13, color: INK3, marginTop: 6 }}>{step === 0 ? '先填你的身份信息' : '再说说你想怎么学(管理员按此审批开通)'}</Text>

        {step === 0 ? (
          <View style={{ gap: 14, marginTop: 22 }}>
            <Field label="真实姓名" required value={name} onChange={setName} placeholder="用于管理员核对身份" />
            <Field label="法名(可选)" value={dharma} onChange={setDharma} placeholder="有师父赐的法名可填" />
            <Field label="手机号 / 微信(可选)" value={phone} onChange={setPhone} placeholder="便于管理员联系" keyboard="phone-pad" />
          </View>
        ) : (
          <View style={{ gap: 16, marginTop: 22 }}>
            <View style={{ gap: 8 }}>
              <Text style={styles.label}>学习意愿</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable style={[styles.modeChip, mode === 'self_study' && styles.chipOn]} onPress={() => setMode('self_study')}>
                  <Text style={[styles.chipTxt, mode === 'self_study' && { color: '#fff' }]}>自学</Text>
                </Pressable>
                <Pressable style={[styles.modeChip, mode === 'class' && styles.chipOn]} onPress={() => { setMode('class'); setProgramId(null); }}>
                  <Text style={[styles.chipTxt, mode === 'class' && { color: '#fff' }]}>想进班共修</Text>
                </Pressable>
              </View>
            </View>
            {mode === 'self_study' ? (
              <View style={{ gap: 8 }}>
                <Text style={styles.label}>想自学哪个专业?</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {programs.map((p) => (
                    <Pressable key={p.id} style={[styles.modeChip, programId === p.id && styles.chipOn]} onPress={() => setProgramId(p.id)}>
                      <Text style={[styles.chipTxt, programId === p.id && { color: '#fff' }]}>{p.name}</Text>
                    </Pressable>
                  ))}
                </View>
                {programs.length === 0 ? (
                  <Text style={{ fontSize: 12, color: programsError ? CRIMSON : INK3 }}>
                    {programsLoading ? '专业列表加载中…' : programsError ? '专业列表加载失败,请检查网络后重试(也可先选「想进班共修」,由管理员审批时再确认专业)' : '暂无可选专业,可先选「想进班共修」'}
                  </Text>
                ) : null}
              </View>
            ) : (
              <Text style={{ fontSize: 12, color: INK3, lineHeight: 18 }}>管理员审批时会与你联系,安排合适的班级。</Text>
            )}
            <View style={{ gap: 8 }}>
              <Text style={styles.label}>无障碍学修(可选)</Text>
              <CheckRow checked={blind} onPress={() => setBlind((v) => !v)} title="我有视力障碍" sub="听两遍即圆满(免看法本、免答题)" />
              <CheckRow checked={deaf} onPress={() => setDeaf((v) => !v)} title="我有听力障碍" sub="看两遍即圆满(免听、免答题)" />
            </View>
            {err ? <Text style={{ fontSize: 12, color: CRIMSON }}>{err}</Text> : null}
          </View>
        )}

        <Pressable style={[styles.primary, !canNext && { opacity: 0.4 }]} disabled={!canNext} onPress={() => (step === 0 ? setStep(1) : submit())}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{step === 0 ? '下一步' : busy ? '提交中…' : '提交入学申请'}</Text>
        </Pressable>
        {step === 1 ? <Text style={{ fontSize: 11, color: INK3, textAlign: 'center', marginTop: 12 }}>提交后进入「待审核」,无需重复提交。</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, required, value, onChange, placeholder, keyboard }: { label: string; required?: boolean; value: string; onChange: (v: string) => void; placeholder: string; keyboard?: 'phone-pad' }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}{required ? <Text style={{ color: SAFFRON_DARK }}> *</Text> : null}</Text>
      <View style={styles.field}>
        <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={INK3} keyboardType={keyboard} style={styles.input} />
      </View>
    </View>
  );
}
function CheckRow({ checked, onPress, title, sub }: { checked: boolean; onPress: () => void; title: string; sub: string }) {
  return (
    <Pressable style={styles.a11yRow} onPress={onPress}>
      <View style={[styles.check, checked && { backgroundColor: SAFFRON, borderColor: SAFFRON }]}>{checked ? <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✓</Text> : null}</View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, color: INK, fontWeight: '600' }}>{title}</Text>
        <Text style={{ fontSize: 12, color: INK3, marginTop: 1 }}>{sub}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8 },
  progress: { height: 4, backgroundColor: 'rgba(43,34,24,0.08)', marginHorizontal: 16, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 4, backgroundColor: SAFFRON, borderRadius: 2 },
  label: { fontSize: 13, color: INK2, fontWeight: '600' },
  field: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(43,34,24,0.12)', paddingHorizontal: 14 },
  input: { paddingVertical: 12, fontSize: 15, color: INK },
  modeChip: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 9999, backgroundColor: 'rgba(43,34,24,0.05)', borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)' },
  chipOn: { backgroundColor: SAFFRON, borderColor: SAFFRON },
  chipTxt: { fontSize: 14, fontWeight: '600', color: INK2 },
  a11yRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(43,34,24,0.06)' },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: 'rgba(43,34,24,0.2)', alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: SAFFRON, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 26 },
});
