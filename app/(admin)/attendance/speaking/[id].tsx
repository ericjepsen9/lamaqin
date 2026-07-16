import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AdminButton, AdminModal, Avatar, DetailHeader, SCREEN_BG } from '@/components/ui/admin-kit';
import { Text } from '@/components/ui/text';
import { confirmAsync, notify } from '@/lib/dialog';
import { useDeleteSpeakingSession, useSaveSpeaking, useSetSpeakingSessionGroupSession } from '@/lib/mutations/speaking';
import { useSpeakingSessionDetail, type SpeakingGrade, type SpeakingStatus } from '@/lib/queries/speaking';
import { useCohortSessions } from '@/lib/queries/attendance';
import { useCurrentUser } from '@/lib/queries/profile';
import { testIds } from '@/lib/testids';
import { GOLD_DARK as GOLD, GOLD_PALE, INK, INK2, INK3, INK4, SAFFRON, SAFFRON_DARK, SAGE_DARK, SAGE_PALE } from '@/lib/theme';
import { useAdminLayout } from '../../_layout';
import { bookTitle } from '@/lib/utils';

// 讲考逐人记录页(设计③·决策067):三态 主讲/提问/听讲(speaking_observe UI 文案=「听讲」·067要点3,
//   避免与旁听身份撞名)+ 未录(未参加不打卡·prd §7);主讲可附等级评价 通过/待加强(选填·仅管理端可见)。
const STATUS_ITEMS: { key: SpeakingStatus; label: string }[] = [
  { key: 'speaking_present', label: '主讲' },
  { key: 'speaking_question', label: '提问' },
  { key: 'speaking_observe', label: '听讲' },
  { key: 'none', label: '未录' },
];
const GRADE_ITEMS: { key: SpeakingGrade | null; label: string }[] = [
  { key: 'pass', label: '通过' },
  { key: 'needs_improvement', label: '待加强' },
  { key: null, label: '未评' },
];
const SESSION_DATE = (iso: string) => new Date(iso).toLocaleDateString('en-CA'); // 记到场次截止日当天(设备本地)
const fmtWhen = (iso: string) => {
  try { return new Date(iso).toLocaleString('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return iso; }
};
const fmtSessionDate = (iso: string) => {
  try { return new Date(iso).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }); } catch { return iso; }
};

type Mark = { status: SpeakingStatus; grade: SpeakingGrade | null };

export default function SpeakingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { setTitle } = useAdminLayout();

  const { data: me } = useCurrentUser();
  const canWrite = me?.role === 'admin' || me?.role === 'zhumai';
  const { data: session, isLoading, isError } = useSpeakingSessionDetail(id);
  const save = useSaveSpeaking();
  const del = useDeleteSpeakingSession();
  const setGroupSession = useSetSpeakingSessionGroupSession();
  const { data: cohortSessionsData } = useCohortSessions(session?.cohortId, undefined);
  const groupSessions = cohortSessionsData?.sessions ?? [];
  const boundGroupSession = groupSessions.find((s) => s.id === session?.groupSessionId);

  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [dirty, setDirty] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingGroupSessionId, setPendingGroupSessionId] = useState('');

  useEffect(() => { setTitle('讲考记录'); }, [setTitle]);
  useEffect(() => {
    if (session && !dirty) setMarks(Object.fromEntries(session.members.map((m) => [m.userId, { status: m.status, grade: m.grade }])));
  }, [session, dirty]);

  const counts = useMemo(() => {
    const vals = Object.values(marks);
    return {
      present: vals.filter((m) => m.status === 'speaking_present').length,
      question: vals.filter((m) => m.status === 'speaking_question').length,
      observe: vals.filter((m) => m.status === 'speaking_observe').length,
      none: vals.filter((m) => m.status === 'none').length,
    };
  }, [marks]);

  const setStatus = (userId: string, status: SpeakingStatus) => {
    if (!canWrite) return;
    setMarks((prev) => ({
      ...prev,
      // 非主讲不留等级(评价只挂主讲·决策067)
      [userId]: { status, grade: status === 'speaking_present' ? (prev[userId]?.grade ?? null) : null },
    }));
    setDirty(true);
  };
  const setGrade = (userId: string, grade: SpeakingGrade | null) => {
    if (!canWrite) return;
    setMarks((prev) => ({ ...prev, [userId]: { status: prev[userId]?.status ?? 'none', grade } }));
    setDirty(true);
  };

  const onSave = () => {
    if (!session) return;
    save.mutate(
      { sessionId: session.id, cohortId: session.cohortId, lessonId: session.lessonId, studyDate: SESSION_DATE(session.sessionEndAt), marks },
      {
        onSuccess: () => { setDirty(false); notify('已保存', `主讲 ${counts.present} · 提问 ${counts.question} · 听讲 ${counts.observe}`); },
        onError: (e) => {
          const msg = (e as Error)?.message ?? '请重试';
          const perm = /row-level security|42501|permission/i.test(msg);
          notify('保存失败', perm ? '没有该班讲考录入权限(需该班辅导员或管理员)。' : msg);
        },
      },
    );
  };

  const openGroupSessionPicker = () => {
    setPendingGroupSessionId(session?.groupSessionId ?? '');
    setPickerOpen(true);
  };
  const saveGroupSession = () => {
    if (!session) return;
    setGroupSession.mutate(
      { sessionId: session.id, cohortId: session.cohortId, groupSessionId: pendingGroupSessionId || null },
      {
        onSuccess: () => { setPickerOpen(false); notify('已更新', pendingGroupSessionId ? '已挂靠共修场次。' : '已改为独立记录。'); },
        onError: (e) => notify('更新失败', (e as Error)?.message ?? '请重试'),
      },
    );
  };

  const onDelete = async () => {
    if (!session) return;
    if (!(await confirmAsync('删除该讲考场次?', '已记的三态记录保留(按人×课节),仅删场次本身。', '删除'))) return;
    del.mutate(
      { sessionId: session.id, cohortId: session.cohortId },
      { onSuccess: () => router.back(), onError: (e) => notify('删除失败', (e as Error)?.message ?? '请重试') },
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <DetailHeader title="讲考记录" onBack={() => router.back()} backLabel="共修与讲考" right={
        canWrite && session ? <Pressable testID={testIds.speakingDetail.deleteButton} hitSlop={8} onPress={onDelete}><Text style={styles.deleteText}>删场次</Text></Pressable> : null
      } />
      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={SAFFRON} /></View>
      ) : isError ? (
        <View style={styles.center}><Text style={{ color: INK3 }}>加载失败,请检查网络后重试(不代表讲考场次不存在)</Text></View>
      ) : !session ? (
        <View style={styles.center}><Text style={{ color: INK3 }}>讲考场次不存在</Text></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.infoCard}>
            <Text className="font-serif" style={styles.sessionTitle}>{bookTitle(session.courseName)}第 {session.lessonNumber} 节 · {session.lessonTitle}</Text>
            <Text style={styles.sessionMeta}>截止 {fmtWhen(session.sessionEndAt)}{session.notes ? ` · ${session.notes}` : ''}</Text>
            <View style={styles.groupLinkRow}>
              <Text style={styles.sessionMeta}>
                {boundGroupSession ? `挂靠共修 · ${fmtSessionDate(boundGroupSession.scheduledAt)}` : '独立记录 · 未挂共修(决策080允许)'}
              </Text>
              {canWrite ? (
                <Pressable testID={testIds.speakingDetail.groupLinkButton} hitSlop={8} onPress={openGroupSessionPicker}>
                  <Text style={styles.groupLinkAction}>{boundGroupSession ? '更改' : '挂靠…'}</Text>
                </Pressable>
              ) : null}
            </View>
            <View style={styles.statRow}>
              <View style={styles.statItem}><Text className="font-serif" style={[styles.statNum, { color: SAFFRON_DARK }]}>{counts.present}</Text><Text style={styles.statLabel}>主讲</Text></View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}><Text className="font-serif" style={[styles.statNum, { color: GOLD }]}>{counts.question}</Text><Text style={styles.statLabel}>提问</Text></View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}><Text className="font-serif" style={[styles.statNum, { color: SAGE_DARK }]}>{counts.observe}</Text><Text style={styles.statLabel}>听讲</Text></View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}><Text className="font-serif" style={[styles.statNum, { color: INK4 }]}>{counts.none}</Text><Text style={styles.statLabel}>未录</Text></View>
            </View>
          </View>

          <View style={styles.memberList}>
            {session.members.length === 0 ? (
              <View style={styles.memberCard}><Text style={{ color: INK3, fontSize: 13 }}>本班暂无在读成员</Text></View>
            ) : session.members.map((m) => {
              const mark = marks[m.userId] ?? { status: 'none' as SpeakingStatus, grade: null };
              const isPresenter = mark.status === 'speaking_present';
              return (
                <View key={m.userId} style={styles.memberCard}>
                  <View style={styles.memberInfo}>
                    <Avatar name={m.name} size={34} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.memberName}>{m.name}{m.memberRole === 'auditor' ? '  · 旁听生' : ''}</Text>
                      {m.dharmaName && <Text style={styles.memberDharma}>法名·{m.dharmaName}</Text>}
                    </View>
                  </View>
                  <View style={styles.chipsRow}>
                    {STATUS_ITEMS.map((it) => {
                      const on = mark.status === it.key;
                      return (
                        <Pressable key={it.key} testID={testIds.speakingDetail.statusChip(m.userId, it.key)} style={[styles.stChip, on && styles.stChipOn, !canWrite && { opacity: 0.5 }]} onPress={() => setStatus(m.userId, it.key)}>
                          <Text style={[styles.stChipText, on && styles.stChipTextOn]}>{it.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {isPresenter ? (
                    <View style={styles.gradeRow}>
                      <Text style={styles.gradeLabel}>等级评价(选填·仅管理端可见)</Text>
                      <View style={styles.chipsRow}>
                        {GRADE_ITEMS.map((g) => {
                          const on = mark.grade === g.key;
                          return (
                            <Pressable key={g.label} testID={testIds.speakingDetail.gradeChip(m.userId, g.key ?? 'none')} style={[styles.gChip, on && styles.gChipOn, !canWrite && { opacity: 0.5 }]} onPress={() => setGrade(m.userId, g.key)}>
                              <Text style={[styles.gChipText, on && styles.gChipTextOn]}>{g.label}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>

          {canWrite ? (
            <AdminButton testID={testIds.speakingDetail.saveButton} variant="primary" style={styles.saveBtn} onPress={onSave} disabled={!dirty || save.isPending}>
              {save.isPending ? '保存中…' : '保存讲考记录'}
            </AdminButton>
          ) : (
            <View style={styles.readonlyNotice}>
              <Text style={styles.readonlyNoticeText}>讲考仅由辅导员 / 管理员录入;等级评价师兄端不显示(决策067)。</Text>
            </View>
          )}
        </ScrollView>
      )}
      {pickerOpen && session ? (
        <AdminModal visible onClose={() => setPickerOpen(false)} title="挂靠共修场次" maxWidth={480} dismissOnOverlay={false}>
          {groupSessions.length === 0 ? (
            <Text style={styles.sessionMeta}>本班还没有共修场次。</Text>
          ) : (
            <ScrollView style={styles.groupPickerList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              <Pressable testID={testIds.speakingDetail.groupPickerNoneRow} style={[styles.groupPickerRow, !pendingGroupSessionId && styles.groupPickerRowActive]} onPress={() => setPendingGroupSessionId('')}>
                <Text style={[styles.groupPickerText, !pendingGroupSessionId && styles.groupPickerTextActive]}>不挂靠 · 独立记录</Text>
                {!pendingGroupSessionId && <Text style={styles.groupPickerCheck}>✓</Text>}
              </Pressable>
              {groupSessions.map((s) => {
                const active = s.id === pendingGroupSessionId;
                return (
                  <Pressable key={s.id} testID={testIds.speakingDetail.groupPickerRow(s.id)} style={[styles.groupPickerRow, active && styles.groupPickerRowActive]} onPress={() => setPendingGroupSessionId(s.id)}>
                    <Text style={styles.groupPickerDate}>{fmtSessionDate(s.scheduledAt)}</Text>
                    <Text style={[styles.groupPickerText, active && styles.groupPickerTextActive]} numberOfLines={1}>
                      {bookTitle(s.courseName)}第{s.lessonNumber}节 · {s.type === 'practice' ? '习题课' : '共修'}
                    </Text>
                    {active && <Text style={styles.groupPickerCheck}>✓</Text>}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          <AdminButton testID={testIds.speakingDetail.groupPickerConfirmButton} variant="primary" style={{ marginTop: 12 }} onPress={saveGroupSession} disabled={setGroupSession.isPending}>
            {setGroupSession.isPending ? '保存中…' : '确定'}
          </AdminButton>
        </AdminModal>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SCREEN_BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  scroll: { padding: 20, gap: 14, paddingBottom: 40 },
  deleteText: { fontSize: 12, color: '#a13c2e', fontWeight: '600' },
  infoCard: { backgroundColor: '#fff', borderRadius: 18, padding: 20, gap: 10, borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)', shadowColor: '#2b2218', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 2 },
  sessionTitle: { fontSize: 18, fontWeight: '700', color: INK, letterSpacing: 0.5 },
  sessionMeta: { fontSize: 12, color: INK3 },
  groupLinkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  groupLinkAction: { fontSize: 12, color: SAFFRON_DARK, fontWeight: '600' },
  groupPickerList: { maxHeight: 320, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(43,34,24,0.1)' },
  groupPickerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(43,34,24,0.06)' },
  groupPickerRowActive: { backgroundColor: GOLD_PALE },
  groupPickerDate: { fontSize: 10, fontWeight: '700', color: SAFFRON_DARK, backgroundColor: '#fff', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, overflow: 'hidden' },
  groupPickerText: { flex: 1, fontSize: 12.5, color: INK2 },
  groupPickerTextActive: { color: SAFFRON_DARK, fontWeight: '600' },
  groupPickerCheck: { fontSize: 14, color: SAFFRON_DARK, fontWeight: '700' },
  statRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 6 },
  statItem: { flex: 1, alignItems: 'center', gap: 2 },
  statNum: { fontSize: 26, fontWeight: '700' },
  statLabel: { fontSize: 10, color: INK3 },
  statDivider: { width: 1, height: 32, backgroundColor: 'rgba(43,34,24,0.08)' },
  memberList: { gap: 8 },
  memberCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, gap: 10, borderWidth: 1, borderColor: 'rgba(43,34,24,0.06)' },
  memberInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  memberName: { fontSize: 14, fontWeight: '600', color: INK },
  memberDharma: { fontSize: 11, color: INK3, marginTop: 1 },
  chipsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  stChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 9999, backgroundColor: '#f7f2ec', borderWidth: 1, borderColor: 'rgba(43,34,24,0.1)' },
  stChipOn: { backgroundColor: SAFFRON, borderColor: SAFFRON },
  stChipText: { fontSize: 12, color: INK2, fontWeight: '500' },
  stChipTextOn: { color: '#fff', fontWeight: '700' },
  gradeRow: { gap: 6, borderTopWidth: 1, borderTopColor: 'rgba(43,34,24,0.06)', paddingTop: 10 },
  gradeLabel: { fontSize: 11, color: INK3, fontWeight: '600' },
  gChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, backgroundColor: SAGE_PALE, borderWidth: 1, borderColor: 'rgba(77,110,61,0.2)' },
  gChipOn: { backgroundColor: SAGE_DARK, borderColor: SAGE_DARK },
  gChipText: { fontSize: 12, color: SAGE_DARK, fontWeight: '500' },
  gChipTextOn: { color: '#fff', fontWeight: '700' },
  saveBtn: { paddingVertical: 14 },
  readonlyNotice: { backgroundColor: GOLD_PALE, borderRadius: 12, padding: 14, alignItems: 'center' },
  readonlyNoticeText: { fontSize: 12, color: GOLD, textAlign: 'center' },
});
