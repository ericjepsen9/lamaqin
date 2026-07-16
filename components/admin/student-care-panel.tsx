import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AdminButton, Badge, EmptyState, type BadgeTone } from '@/components/ui/admin-kit';
import { Text } from '@/components/ui/text';
import { useAddFollowup } from '@/lib/mutations/care';
import { useStudentCare, type CareDims, type FollowStatus, type LagLevel } from '@/lib/queries/care';
import { testIds } from '@/lib/testids';
import { GOLD_DARK as GOLD, GOLD_PALE, INK, INK2, INK3, INK4, SAFFRON, SAFFRON_DARK, SAFFRON_LIGHT, SAGE_DARK, SAGE_PALE } from '@/lib/theme';
import { genClientToken } from '@/lib/utils';

// 5维滞后 + 跟进记录(设计②关怀详情页内容,2026-07-10 抽成共享组件同时喂 care/[studentId] 和
//   students/[id] 两处——后者这两块此前一直是"待接入"占位文案,数据层/交互其实早就现成,只是
//   没人接到这个页面。跟进记录写权对齐 RLS(care_followups 写=本班 zhumai/aixin;决策035/044-046,
//   admin 只读不录),canWrite 由调用方按 me.role 算好传入,本组件不重复判。
//   SectionCard 外壳由调用方包(两处标题不同:关怀页"学修滞后指标",学员详情页"学修统计")。

const LAG_COLOR: Record<LagLevel, string> = { low: SAGE_DARK, medium: GOLD, high: SAFFRON_DARK, na: INK4 };
const LAG_BG: Record<LagLevel, string> = { low: SAGE_PALE, medium: GOLD_PALE, high: SAFFRON_LIGHT, na: 'rgba(43,34,24,0.05)' };
const LAG_LABEL: Record<LagLevel, string> = { low: '正常', medium: '偏滞', high: '滞后', na: '未接入' };
const LAG_W: Record<LagLevel, string> = { low: '30%', medium: '60%', high: '90%', na: '8%' };

const STATUS_TONE: Record<FollowStatus, BadgeTone> = { active: 'sage', resolved: 'neutral', pending: 'gold' };
const STATUS_COLOR: Record<FollowStatus, string> = { active: SAGE_DARK, resolved: INK4, pending: GOLD };
const STATUS_BG: Record<FollowStatus, string> = { active: SAGE_PALE, resolved: '#f0f0ef', pending: GOLD_PALE };
const STATUS_LABEL: Record<FollowStatus, string> = { active: '跟进中', resolved: '已结案', pending: '待跟进' };

const DIMS: { key: keyof CareDims; label: string }[] = [
  { key: 'attendance', label: '出勤情况' },
  { key: 'task', label: '功课完成' },
  { key: 'content', label: '听课进度' },
  { key: 'quiz', label: '答题进度' },
  { key: 'meditation', label: '观修情况' },
];

function LagRow({ label, level }: { label: string; level: LagLevel }) {
  return (
    <View style={styles.lagRow}>
      <Text style={styles.lagLabel}>{label}</Text>
      <View style={styles.lagTrack}>
        <View style={[styles.lagFill, { width: LAG_W[level] as `${number}%`, backgroundColor: LAG_COLOR[level] }]} />
      </View>
      <View style={[styles.lagChip, { backgroundColor: LAG_BG[level] }]}>
        <Text style={[styles.lagChipText, { color: LAG_COLOR[level] }]}>{LAG_LABEL[level]}</Text>
      </View>
    </View>
  );
}

export function StudentCareDims({ userId }: { userId: string }) {
  const { data: s, isLoading, isError } = useStudentCare(userId);
  if (isLoading) return <View style={styles.center}><ActivityIndicator color={SAFFRON} /></View>;
  if (isError) return <Text style={styles.errNote}>加载失败,请检查网络后重试</Text>;
  if (!s) return <Text style={styles.dimNote}>暂无数据(未入班或找不到该学员)</Text>;
  return (
    <>
      <View style={styles.dimsBlock}>
        {DIMS.map((d) => <LagRow key={d.key} label={d.label} level={s.dims[d.key]} />)}
      </View>
      {s.dimsError ? (
        <Text style={[styles.dimNote, { color: SAFFRON_DARK, marginTop: 8 }]}>五维数据本次加载失败,以上暂按“未接入”显示,不代表真实情况——请稍后刷新重试。</Text>
      ) : (
        <Text style={[styles.dimNote, { marginTop: 8 }]}>{s.snapshotNote} 仅供辅导员定位关怀重点,师兄端不显示(决策035/107)。</Text>
      )}
    </>
  );
}

export function StudentCareFollowups({ userId, canWrite }: { userId: string; canWrite: boolean }) {
  const { data: s, isLoading, isError } = useStudentCare(userId);
  const addFollowup = useAddFollowup();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSummary, setNewSummary] = useState('');
  const [newStatus, setNewStatus] = useState<FollowStatus>('active');
  const [err, setErr] = useState<string | null>(null);
  // 弱网幂等(2026-07-14补:此前只在mutation层接了clientToken参数,调用方一直没传——
  //   双击/网络重试「保存记录」会真的落2条一模一样的跟进记录,DB层唯一索引形同虚设)。
  const [token, setToken] = useState(() => genClientToken());

  if (isLoading) return <View style={styles.center}><ActivityIndicator color={SAFFRON} /></View>;
  if (isError) return <Text style={styles.errNote}>加载失败,请检查网络后重试</Text>;
  if (!s) return <EmptyState>暂无关怀数据(未入班或找不到该学员)</EmptyState>;

  const handleSave = async () => {
    if (!newSummary.trim()) return;
    setErr(null);
    try {
      await addFollowup.mutateAsync({ userId: s.userId, cohortId: s.cohortId, summary: newSummary, status: newStatus, clientToken: token });
      setNewSummary('');
      setShowAddForm(false);
      setToken(genClientToken()); // 换新凭证:下一条是新的一笔,不能复用这一笔的
    } catch (e) {
      setErr(e instanceof Error ? e.message : '保存失败,请重试');
    }
  };

  return (
    <>
      <View style={styles.sectionHeader}>
        <Text className="font-serif" style={styles.sectionTitle}>跟进记录</Text>
        {canWrite && (
          <AdminButton
            testID={testIds.care.addFollowupButton}
            variant={showAddForm ? 'negative' : 'primary'} size="sm"
            onPress={() => setShowAddForm((v) => { if (!v) setToken(genClientToken()); return !v; })}
          >
            {showAddForm ? '取消' : '＋ 添加记录'}
          </AdminButton>
        )}
      </View>

      {showAddForm && (
        <View style={styles.addForm}>
          <Text style={styles.formLabel}>跟进摘要</Text>
          <TextInput
            testID={testIds.care.followupSummaryInput}
            style={styles.formTextarea} multiline numberOfLines={4}
            placeholder="记录本次联系情况、师兄状态、后续建议…" placeholderTextColor={INK4}
            value={newSummary} onChangeText={setNewSummary} textAlignVertical="top"
          />
          <Text style={styles.formLabel}>状态</Text>
          <View style={styles.statusOptions}>
            {(['active', 'pending', 'resolved'] as FollowStatus[]).map((st) => (
              <Pressable key={st} style={[styles.statusOption, newStatus === st && { backgroundColor: STATUS_BG[st], borderColor: STATUS_COLOR[st] }]} onPress={() => setNewStatus(st)}>
                <Text style={[styles.statusOptionText, newStatus === st && { color: STATUS_COLOR[st], fontWeight: '600' }]}>{STATUS_LABEL[st]}</Text>
              </Pressable>
            ))}
          </View>
          {err ? <Text style={styles.errText}>{err}</Text> : null}
          <AdminButton testID={testIds.care.followupSaveButton} variant="primary" onPress={handleSave} disabled={!newSummary.trim() || addFollowup.isPending} style={styles.saveBtn}>
            {addFollowup.isPending ? '保存中…' : '保存记录'}
          </AdminButton>
        </View>
      )}

      {s.followups.map((f, i) => (
        <View key={f.id} style={[styles.followupCard, i < s.followups.length - 1 && styles.followupCardBorder]}>
          <View style={styles.followupTop}>
            <Text style={styles.followupDate}>{f.contactedAt}</Text>
            <Badge tone={STATUS_TONE[f.status]}>{STATUS_LABEL[f.status]}</Badge>
          </View>
          <Text style={styles.followupSummary}>{f.summary}</Text>
          {f.workerName ? <Text style={styles.followupWorker}>记录人:{f.workerName}</Text> : null}
        </View>
      ))}

      {s.followups.length === 0 && !showAddForm && <EmptyState>暂无跟进记录</EmptyState>}
    </>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: 20, alignItems: 'center' },
  errNote: { fontSize: 12, color: SAFFRON_DARK, textAlign: 'center', paddingVertical: 12 },
  dimsBlock: { gap: 10 },
  dimNote: { fontSize: 11, color: INK4, lineHeight: 16 },
  lagRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lagLabel: { fontSize: 12, color: INK2, width: 60 },
  lagTrack: { flex: 1, height: 6, backgroundColor: 'rgba(43,34,24,0.07)', borderRadius: 3, overflow: 'hidden' },
  lagFill: { height: '100%', borderRadius: 3 },
  lagChip: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, minWidth: 44, alignItems: 'center' },
  lagChipText: { fontSize: 10, fontWeight: '600' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: INK },
  addForm: { backgroundColor: '#f7f2ec', borderRadius: 12, padding: 14, gap: 10, marginTop: 10, borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)' },
  formLabel: { fontSize: 12, fontWeight: '600', color: INK2 },
  formTextarea: { backgroundColor: '#fff', borderRadius: 8, padding: 12, fontSize: 13, color: INK, minHeight: 90, borderWidth: 1, borderColor: 'rgba(43,34,24,0.10)' },
  statusOptions: { flexDirection: 'row', gap: 8 },
  statusOption: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(43,34,24,0.12)', backgroundColor: '#fff' },
  statusOptionText: { fontSize: 12, color: INK3 },
  errText: { fontSize: 12, color: '#a13c2e', fontWeight: '600' },
  saveBtn: { alignSelf: 'stretch', marginTop: 4 },
  followupCard: { gap: 8, paddingVertical: 10 },
  followupCardBorder: { borderBottomWidth: 1, borderColor: 'rgba(43,34,24,0.06)' },
  followupTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  followupDate: { fontSize: 12, color: INK3, fontWeight: '500' },
  followupSummary: { fontSize: 13, color: INK2, lineHeight: 20 },
  followupWorker: { fontSize: 11, color: INK4 },
});
