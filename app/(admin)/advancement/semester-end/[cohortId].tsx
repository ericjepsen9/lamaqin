import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AdminButton,
  AdminModal,
  Avatar,
  Badge,
  DetailHeader,
  EmptyState,
  ModalActions,
  ModalField,
  SCREEN_BG,
  SectionCard,
  SegmentedControl,
} from '@/components/ui/admin-kit';
import { Text } from '@/components/ui/text';
import { confirmAsync, notify } from '@/lib/dialog';
import { useRecordAdvancement, useRecordAuditorContinue, useRecordHeldBackTransfer } from '@/lib/mutations/advancement';
import { useSetCohortActive, useUpdateMemberRole } from '@/lib/mutations/classes';
import { useAdminCohorts, useCohortDetail, useCohortRoster, type RosterMember } from '@/lib/queries/classes';
import { testIds } from '@/lib/testids';
import { GOLD_DARK as GOLD, GOLD_PALE, INK, INK2, INK3, SAFFRON, SAFFRON_DARK } from '@/lib/theme';
import { genClientToken } from '@/lib/utils';

// 学期末一站式工作流(决策099/延后-8):逐个处理本班在读学员的升学判定,全部处理完提示结班。
// 正式学员:毕业 / 留级(两种形态,决策018:留原班重修=原地不动 / 转下一届=选目标班+功课重建)/ 离班。
// 旁听学员:继续旁听(决策018 三选一,不改状态只留痕——见 lib/mutations/advancement.ts 头注,
//   此前误引"决策017")/ 转正式(复用既有转正 RPC)/ 离班。
// 本页"已处理"是会话内本地状态、不落库(admin 关页重开会重新看到全部在读学员,这是有意的
// 简化——延后-8 只要求"每学期过一次管理员之手",不要求持久化"本次会话处理过没有"这个中间态)。

type PendingAction = 'graduate' | 'held_back' | 'left' | 'continue' | 'become_formal' | null;
type HeldBackForm = 'stay' | 'transfer';

const CONFIRM_TEXT: Record<'graduate' | 'left' | 'continue' | 'become_formal', string> = {
  graduate: '确认标记该学员「已毕业」?不可撤销,数据保留但移出班级在读视图。',
  left: '确认标记该学员「已离班」?数据保留但不再计入班级统计。',
  continue: '确认该学员本学期「继续旁听」?留痕但不改变任何状态。',
  become_formal: '确认将该学员「转为正式学员」?转正不可逆(只能正式→其它,不能倒退回旁听)。',
};

function DecisionModal({ member, cohortId, programId, onClose, onDone }: {
  member: RosterMember; cohortId: string; programId: string; onClose: () => void; onDone: (userId: string) => void;
}) {
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [heldBackForm, setHeldBackForm] = useState<HeldBackForm>('stay');
  const [targetCohortId, setTargetCohortId] = useState<string | null>(null);
  const [basis, setBasis] = useState('');
  const [err, setErr] = useState<string | null>(null);
  // 弱网幂等凭证(2026-07-12):本弹层一次挂载=处理这一个学员的一次判定,挂载时生成一次、
  // 全程复用(不随子选项/重试变化),配合各 mutation 的 client_token 防止网络重试重复留痕。
  const [token] = useState(() => genClientToken());

  const { data: programGroups = [] } = useAdminCohorts();
  const candidates = (programGroups.find((g) => g.id === programId)?.cohorts ?? [])
    .filter((c) => c.status === 'active' && c.id !== cohortId);

  const record = useRecordAdvancement();
  const recordTransfer = useRecordHeldBackTransfer();
  const recordContinue = useRecordAuditorContinue();
  const promote = useUpdateMemberRole();
  const pending = record.isPending || recordTransfer.isPending || recordContinue.isPending || promote.isPending;

  const finish = (fn: () => Promise<unknown>) => async () => {
    setErr(null);
    try { await fn(); onDone(member.userId); }
    catch (e) { setErr(e instanceof Error ? e.message : '操作失败,请重试'); }
  };
  const submitGraduate = finish(() => record.mutateAsync({ userId: member.userId, cohortId, action: 'graduate', basis: basis || null, clientToken: token }));
  const submitLeft = finish(() => record.mutateAsync({ userId: member.userId, cohortId, action: 'left', basis: basis || null, clientToken: token }));
  const submitContinue = finish(() => recordContinue.mutateAsync({ userId: member.userId, cohortId, basis: basis || null, clientToken: token }));
  const submitBecomeFormal = finish(() => promote.mutateAsync({ cohortId, userId: member.userId, role: 'formal' }));
  const submitHeldBack = finish(async () => {
    if (heldBackForm === 'stay') {
      await record.mutateAsync({ userId: member.userId, cohortId, action: 'held_back', basis: basis || null, clientToken: token });
    } else {
      if (!targetCohortId) throw new Error('请选择转入的班级');
      await recordTransfer.mutateAsync({ userId: member.userId, fromCohortId: cohortId, toCohortId: targetCohortId, basis: basis || null, clientToken: token });
    }
  });

  return (
    <AdminModal visible onClose={onClose} title={`学期末处理:${member.name}`} dismissOnOverlay={false}>
      {pendingAction === null ? (
        <View style={{ gap: 10 }}>
          <Text style={styles.modalDesc}>{member.memberRole === 'formal' ? '该学员为正式学员,请选择本学期判定:' : '该学员为旁听,请选择本学期去留:'}</Text>
          {member.memberRole === 'formal' ? (
            <>
              <AdminButton variant="confirm" onPress={() => setPendingAction('graduate')}>毕业</AdminButton>
              <AdminButton variant="danger" onPress={() => setPendingAction('held_back')}>留级</AdminButton>
              <AdminButton variant="negative" onPress={() => setPendingAction('left')}>离班</AdminButton>
            </>
          ) : (
            <>
              <AdminButton variant="confirm" onPress={() => setPendingAction('continue')}>继续旁听</AdminButton>
              <AdminButton variant="primary" onPress={() => setPendingAction('become_formal')}>转正式</AdminButton>
              <AdminButton variant="negative" onPress={() => setPendingAction('left')}>离班</AdminButton>
            </>
          )}
        </View>
      ) : pendingAction === 'held_back' ? (
        <View style={{ gap: 10 }}>
          <Text style={styles.modalDesc}>留级形态(决策018):</Text>
          <SegmentedControl items={[{ key: 'stay', label: '留原班重修' }, { key: 'transfer', label: '转下一届' }]} value={heldBackForm} onChange={setHeldBackForm} />
          {heldBackForm === 'transfer' && (
            <View style={{ gap: 6 }}>
              <Text style={styles.modalSubLabel}>选择转入班级(同专业其它在读班):</Text>
              {candidates.length === 0 ? (
                <Text style={[styles.modalDesc, { color: SAFFRON_DARK }]}>本专业没有其它在读班级可转入。</Text>
              ) : candidates.map((c) => (
                <AdminButton key={c.id} variant={targetCohortId === c.id ? 'confirm' : 'secondary'} onPress={() => setTargetCohortId(c.id)}>{c.name}</AdminButton>
              ))}
            </View>
          )}
          <ModalField label="判定依据" value={basis} onChangeText={setBasis} placeholder="留级原因" multiline />
          {err ? <Text style={styles.errText}>{err}</Text> : null}
          <ModalActions>
            <AdminButton variant="negative" onPress={() => setPendingAction(null)} style={{ flex: 1 }}>返回</AdminButton>
            <AdminButton variant="danger" disabled={pending || (heldBackForm === 'transfer' && !targetCohortId)} onPress={submitHeldBack} style={{ flex: 1 }}>{pending ? '提交中…' : '确认留级'}</AdminButton>
          </ModalActions>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          <Text style={styles.modalDesc}>{CONFIRM_TEXT[pendingAction]}</Text>
          <ModalField label="判定依据(可选)" value={basis} onChangeText={setBasis} placeholder="补充说明" multiline />
          {err ? <Text style={styles.errText}>{err}</Text> : null}
          <ModalActions>
            <AdminButton variant="negative" onPress={() => setPendingAction(null)} style={{ flex: 1 }}>返回</AdminButton>
            <AdminButton
              variant="confirm"
              disabled={pending}
              onPress={
                pendingAction === 'graduate' ? submitGraduate
                  : pendingAction === 'left' ? submitLeft
                    : pendingAction === 'continue' ? submitContinue
                      : submitBecomeFormal
              }
              style={{ flex: 1 }}
            >
              {pending ? '提交中…' : '确认'}
            </AdminButton>
          </ModalActions>
        </View>
      )}
    </AdminModal>
  );
}

export default function SemesterEndWorkflow() {
  const { cohortId } = useLocalSearchParams<{ cohortId: string }>();
  const router = useRouter();
  const { data: cohort, isLoading, isError } = useCohortDetail(cohortId);
  const { data: roster = [] } = useCohortRoster(cohortId);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<RosterMember | null>(null);
  const setCohortActive = useSetCohortActive();

  const pendingMembers = roster.filter((m) => (m.status === 'active' || m.status === 'paused') && !doneIds.has(m.userId));
  const doneMembers = roster.filter((m) => doneIds.has(m.userId));

  const handleArchive = async () => {
    if (!cohort) return;
    if (!(await confirmAsync(`标记「${cohort.name}」结班?`, '结班后班级标为「已结业」,不再计入在读。可随时恢复。', '标记结班'))) return;
    setCohortActive.mutate(
      { cohortId: cohort.id, isActive: false },
      { onSuccess: () => router.back(), onError: (e) => notify('操作失败', (e as Error)?.message ?? '请重试') },
    );
  };

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color={SAFFRON} /></View>;
  }
  if (isError || !cohort) {
    return (
      <SafeAreaView style={styles.root} edges={['bottom']}>
        <DetailHeader title="学期末处理" onBack={() => router.back()} />
        <View style={{ padding: 24 }}><EmptyState>{isError ? '加载失败,请检查网络后重试(不代表班级不存在)' : '班级不存在'}</EmptyState></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <DetailHeader title={cohort.name + ' · 学期末处理'} onBack={() => router.back()} backLabel="班级详情" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        <View style={styles.noticeBanner}>
          <Text style={styles.noticeText}>逐个处理本班在读学员的升学/留级/旁听去留判定(决策017/018/099),全部处理完后可结班。</Text>
        </View>

        <SectionCard title={`待处理(${pendingMembers.length})`}>
          {pendingMembers.length === 0 ? (
            <EmptyState>本班在读学员都已处理完,可以结班了</EmptyState>
          ) : (
            pendingMembers.map((m, i) => (
              <View key={m.userId}>
                {i > 0 && <View style={styles.rowDivider} />}
                <View style={styles.row}>
                  <Avatar name={m.name} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{m.name}{m.dharmaName ? `(${m.dharmaName})` : ''}</Text>
                    <Badge tone="neutral">{m.memberRole === 'formal' ? '正式' : '旁听'}</Badge>
                  </View>
                  <AdminButton testID={testIds.semesterEnd.processButton(m.userId)} variant="secondary" size="sm" onPress={() => setActive(m)}>处理</AdminButton>
                </View>
              </View>
            ))
          )}
        </SectionCard>

        {doneMembers.length > 0 && (
          <SectionCard title={`本次已处理(${doneMembers.length})`}>
            <Text style={styles.doneNote}>{doneMembers.map((m) => m.name).join('、')}</Text>
          </SectionCard>
        )}

        <View style={styles.archiveSection}>
          <Text className="font-serif" style={styles.archiveTitle}>处理完后</Text>
          <Text style={styles.archiveNote}>确认本班学期末判定都处理完了,可以标记结班(随时可恢复)。</Text>
          <AdminButton variant="danger" onPress={handleArchive}>标记结班</AdminButton>
        </View>

      </ScrollView>

      {active && (
        <DecisionModal
          member={active}
          cohortId={cohort.id}
          programId={cohort.programId}
          onClose={() => setActive(null)}
          onDone={(userId) => { setDoneIds((s) => new Set([...s, userId])); setActive(null); }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SCREEN_BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: SCREEN_BG },
  scroll: { padding: 20, gap: 14, paddingBottom: 40 },

  noticeBanner: { backgroundColor: GOLD_PALE, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: GOLD + '33' },
  noticeText: { fontSize: 12, color: GOLD, lineHeight: 18 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  rowDivider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(43,34,24,0.08)' },
  name: { fontSize: 14, fontWeight: '600', color: INK, marginBottom: 3 },
  doneNote: { fontSize: 12, color: INK3, lineHeight: 18 },

  archiveSection: { backgroundColor: '#fff', borderRadius: 16, padding: 18, gap: 10, borderWidth: 1.5, borderColor: SAFFRON_DARK + '33' },
  archiveTitle: { fontSize: 15, fontWeight: '700', color: INK },
  archiveNote: { fontSize: 12, color: INK3, lineHeight: 18 },

  modalDesc: { fontSize: 13, color: INK2, lineHeight: 20 },
  modalSubLabel: { fontSize: 12, color: INK3 },
  errText: { fontSize: 13, color: '#a13c2e', fontWeight: '600', textAlign: 'center' },
});
