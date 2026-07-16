import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text as RNText, TextInput, View } from 'react-native';

import { AdminButton, Badge } from '@/components/ui/admin-kit';
import { Text } from '@/components/ui/text';
import { notify } from '@/lib/dialog';
import { useRecordTransmission } from '@/lib/mutations/proxy';
import { useStudentTransmissions, useTransmissions } from '@/lib/queries/admin/proxy';
import { INK, INK2, INK3, SAFFRON_DARK } from '@/lib/theme';

// 传承记录(设计②·2026-07-08):显宗传承录入(课程听闻/法会所得)。
// ⚠️ 灌顶/密法不做(维持决策060/112 红线决定,见 lib/queries/admin/proxy.ts 头注);
//   本组件只列 transmissions 表已有的显宗传承(source_kind ∈ course/assembly)。
// 写权仅 admin(RLS user_transmissions_write);辅导员只能看,不能录(与代行不同权限面)。
const SOURCE_LABEL: Record<string, string> = {
  course_listen: '听课自动', restricted_check: '限制性课勾选', assembly: '法会', proxy_recognize: '管理端录入',
};

export function StudentTransmissions({ userId, name, canWrite }: { userId: string; name: string; canWrite: boolean }) {
  const { data: obtained = [], isLoading } = useStudentTransmissions(userId);
  const { data: options = [] } = useTransmissions();
  const record = useRecordTransmission();

  const [open, setOpen] = useState(false);
  const [pickId, setPickId] = useState<string | null>(null);
  const [date, setDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [reason, setReason] = useState('');

  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(new Date(date + 'T00:00:00').getTime());
  const valid = !!pickId && dateValid && reason.trim().length > 0;
  const obtainedIds = new Set(obtained.map((o) => o.name));
  const pending = options.filter((o) => !obtainedIds.has(o.name));

  const onSubmit = () => {
    if (!pickId || !valid) return;
    record.mutate(
      { userId, transmissionId: pickId, obtainedAt: date, reason: reason.trim() },
      {
        onSuccess: () => { setOpen(false); setPickId(null); setReason(''); notify('已录入', '传承记录已保存,升学面板即时生效。'); },
        onError: (e) => notify('录入失败', e instanceof Error ? e.message : '请重试'),
      },
    );
  };

  return (
    <>
      {isLoading ? null : obtained.length === 0 ? (
        <RNText style={styles.hint}>暂无已得传承记录。</RNText>
      ) : (
        <View style={{ gap: 8 }}>
          {obtained.map((t) => (
            <View key={t.id} style={styles.row}>
              <RNText style={{ flex: 1, fontSize: 13, fontWeight: '600', color: INK }}>{t.name}</RNText>
              <Badge tone="sage">{t.obtainedAt ?? '—'}</Badge>
              <RNText style={{ fontSize: 10, color: INK3 }}>{SOURCE_LABEL[t.source] ?? t.source}</RNText>
            </View>
          ))}
        </View>
      )}
      {canWrite ? (
        <View style={{ marginTop: 12 }}>
          <AdminButton variant="secondary" size="sm" onPress={() => { setPickId(null); setReason(''); setDate(new Date().toLocaleDateString('en-CA')); setOpen(true); }}>
            录入传承
          </AdminButton>
        </View>
      ) : null}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.card} onPress={() => {}}>
            <Text className="font-serif" style={styles.cardTitle}>录入传承</Text>
            <RNText style={styles.cardSub}>为 {name} 录入显宗传承(听课/法会所得)。灌顶/密法传承不在本库处理。</RNText>
            {pending.length === 0 ? (
              <RNText style={[styles.hint, { marginTop: 12 }]}>已得全部已知传承,或暂无可选传承(先在中枢配置传承清单)。</RNText>
            ) : (
              <ScrollView style={{ maxHeight: 260, marginTop: 12 }}>
                <View style={{ gap: 6 }}>
                  {pending.map((o) => (
                    <Pressable key={o.id} style={[styles.opt, pickId === o.id && styles.optPick]} onPress={() => setPickId(o.id)}>
                      <RNText style={{ fontSize: 13, fontWeight: '600', color: INK }}>{o.name}</RNText>
                      <RNText style={{ fontSize: 10, color: INK3 }}>{SOURCE_LABEL[o.sourceKind] ?? o.sourceKind}</RNText>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            )}
            {pickId ? (
              <View style={{ gap: 6, marginTop: 12 }}>
                <TextInput value={date} onChangeText={setDate} placeholder="所得日 YYYY-MM-DD" placeholderTextColor={INK3} autoCapitalize="none" maxLength={10} style={styles.textInput} />
                <TextInput value={reason} onChangeText={setReason} placeholder="录入依据(如:法会签到记录)" placeholderTextColor={INK3} style={styles.textInput} />
                <AdminButton variant="primary" size="sm" disabled={!valid || record.isPending} onPress={onSubmit}>
                  {record.isPending ? '保存中…' : '确认录入'}
                </AdminButton>
              </View>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 12, color: INK3, textAlign: 'center', paddingVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backdrop: { flex: 1, backgroundColor: 'rgba(20,14,8,0.4)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  card: { width: '100%', maxWidth: 460, backgroundColor: '#FBF4E9', borderRadius: 18, padding: 18 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: INK },
  cardSub: { fontSize: 12, color: INK2, marginTop: 4, lineHeight: 18 },
  opt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(43,34,24,0.1)' },
  optPick: { borderColor: SAFFRON_DARK },
  textInput: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(43,34,24,0.15)', paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: INK },
});
