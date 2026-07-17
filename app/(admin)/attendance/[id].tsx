import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AdminButton, Avatar, DetailHeader, SCREEN_BG } from '@/components/ui/admin-kit';
import { Text } from '@/components/ui/text';
import { notify } from '@/lib/dialog';
import { PartialSaveError, useSaveAttendance } from '@/lib/mutations/attendance';
import { useSessionDetail, type AttendanceStatus } from '@/lib/queries/attendance';
import { useCurrentUser } from '@/lib/queries/profile';
import { testIds } from '@/lib/testids';
import { GOLD_DARK as GOLD, GOLD_PALE, INK, INK3, INK4, SAFFRON, SAFFRON_DARK, SAFFRON_LIGHT, SAGE, SAGE_DARK, SAGE_PALE } from '@/lib/theme';
import { useAdminLayout } from '../_layout';
import { bookTitle } from '@/lib/utils';

const WIDE = 900;
const STATUS_LABEL: Record<AttendanceStatus, string> = { present: '到课', absent: '缺席', none: '未录' };
const SESSION_DATE = (iso: string) => new Date(iso).toLocaleDateString('en-CA'); // 出勤记到场次当天(设备本地)
const fmtWhen = (iso: string) => {
  try { return new Date(iso).toLocaleString('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return iso; }
};

function StatusToggle({ status, onPress, disabled, testID }: { status: AttendanceStatus; onPress: () => void; disabled: boolean; testID?: string }) {
  const colors: Record<AttendanceStatus, { bg: string; text: string; border: string }> = {
    present: { bg: SAGE_PALE, text: SAGE_DARK, border: SAGE + '44' },
    absent: { bg: SAFFRON_LIGHT, text: SAFFRON_DARK, border: SAFFRON + '44' },
    none: { bg: 'transparent', text: INK4, border: 'rgba(43,34,24,0.15)' },
  };
  const c = colors[status];
  return (
    <Pressable testID={testID} onPress={disabled ? undefined : onPress} style={[styles.statusToggle, { backgroundColor: c.bg, borderColor: c.border }, disabled && { opacity: 0.5 }]}>
      <Text style={[styles.statusToggleText, { color: c.text }]}>{STATUS_LABEL[status]}</Text>
    </Pressable>
  );
}

export default function AttendanceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE;
  const router = useRouter();
  const { setTitle } = useAdminLayout();

  const { data: me } = useCurrentUser();
  const canWrite = me?.role === 'admin' || me?.role === 'zhumai';
  const { data: session, isLoading, isError } = useSessionDetail(id);
  const save = useSaveAttendance();

  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => { setTitle('出勤点名'); }, [setTitle]);
  // 数据到达/刷新后,用真实出勤态初始化(未脏时)——换成渲染期间比对上一次的session/dirty
  // (react-hooks/set-state-in-effect·2026-07-17 lint债清理),逐项对应原effect的依赖数组,
  // 行为不变:session或dirty任一变化都重新判定,session存在且未脏才真的同步。
  const [prevSession, setPrevSession] = useState(session);
  const [prevDirty, setPrevDirty] = useState(dirty);
  if (session !== prevSession || dirty !== prevDirty) {
    setPrevSession(session);
    setPrevDirty(dirty);
    if (session && !dirty) setMarks(Object.fromEntries(session.members.map((m) => [m.userId, m.status])));
  }

  const counts = useMemo(() => {
    const vals = Object.values(marks);
    return {
      present: vals.filter((s) => s === 'present').length,
      absent: vals.filter((s) => s === 'absent').length,
      none: vals.filter((s) => s === 'none').length,
      total: vals.length,
    };
  }, [marks]);

  const cycle = (userId: string) => {
    if (!canWrite) return;
    const next: Record<AttendanceStatus, AttendanceStatus> = { none: 'present', present: 'absent', absent: 'none' };
    setMarks((prev) => ({ ...prev, [userId]: next[prev[userId] ?? 'none'] }));
    setDirty(true);
  };
  const markAll = (status: AttendanceStatus) => {
    if (!canWrite || !session) return;
    setMarks(Object.fromEntries(session.members.map((m) => [m.userId, status])));
    setDirty(true);
  };

  const onSave = () => {
    if (!session) return;
    save.mutate(
      { sessionId: session.id, cohortId: session.cohortId, lessonId: session.lessonId, studyDate: SESSION_DATE(session.scheduledAt), marks },
      {
        onSuccess: () => { setDirty(false); notify('已保存', `到课 ${counts.present} · 缺席 ${counts.absent}`); },
        onError: (e) => {
          const err = e instanceof PartialSaveError ? e : null;
          if (err && session) {
            // 部分失败:已成功的行已落库(mutation的onSettled已刷新缓存),marks保持dirty=true,
            // admin再点一次"保存"只会重新diff出这几个失败的人(其余因study_type已匹配不会再进updates)。
            const names = err.failedUserIds.map((id) => session.members.find((m) => m.userId === id)?.name ?? id).join('、');
            notify('部分保存失败', `${names} 未保存成功,其余已保存。可再次点「保存」重试这几位。`);
            return;
          }
          const msg = (e as Error)?.message ?? '请重试';
          const perm = /row-level security|42501|permission/i.test(msg);
          notify('保存失败', perm ? '没有该班出勤录入权限(需该班辅导员或管理员)。' : msg);
        },
      },
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <DetailHeader title="出勤点名" onBack={() => router.back()} backLabel="共修出勤" />
      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={SAFFRON} /></View>
      ) : isError ? (
        <View style={styles.center}><Text style={{ color: INK3 }}>加载失败,请检查网络后重试(不代表场次不存在)</Text></View>
      ) : !session ? (
        <View style={styles.center}><Text style={{ color: INK3 }}>场次不存在</Text></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.infoCard}>
            <Text className="font-serif" style={styles.sessionTitle}>{bookTitle(session.courseName)}第 {session.lessonNumber} 节 · {session.lessonTitle}</Text>
            <Text style={styles.sessionMeta}>{fmtWhen(session.scheduledAt)}{session.type === 'practice' ? ' · 习题课' : ''}</Text>
            <View style={styles.statRow}>
              <View style={styles.statItem}><Text className="font-serif" style={[styles.statNum, { color: SAGE_DARK }]}>{counts.present}</Text><Text style={styles.statLabel}>到课</Text></View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}><Text className="font-serif" style={[styles.statNum, { color: SAFFRON_DARK }]}>{counts.absent}</Text><Text style={styles.statLabel}>缺席</Text></View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}><Text className="font-serif" style={[styles.statNum, { color: INK4 }]}>{counts.none}</Text><Text style={styles.statLabel}>未录</Text></View>
              {counts.total > 0 && (
                <>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}><Text className="font-serif" style={[styles.statNum, { color: GOLD }]}>{Math.round((counts.present / counts.total) * 100)}%</Text><Text style={styles.statLabel}>出勤率</Text></View>
                </>
              )}
            </View>
          </View>

          {canWrite && (
            <View style={styles.batchRow}>
              <Text style={styles.batchLabel}>批量</Text>
              <Pressable style={[styles.batchBtn, { backgroundColor: SAGE_PALE, borderColor: SAGE + '44' }]} onPress={() => markAll('present')}><Text style={[styles.batchBtnText, { color: SAGE_DARK }]}>全部到课</Text></Pressable>
              <Pressable style={[styles.batchBtn, { backgroundColor: SAFFRON_LIGHT, borderColor: SAFFRON + '44' }]} onPress={() => markAll('absent')}><Text style={[styles.batchBtnText, { color: SAFFRON_DARK }]}>全部缺席</Text></Pressable>
              <Pressable style={[styles.batchBtn, { backgroundColor: 'transparent', borderColor: 'rgba(43,34,24,0.15)' }]} onPress={() => markAll('none')}><Text style={[styles.batchBtnText, { color: INK4 }]}>清空</Text></Pressable>
            </View>
          )}

          <View style={isWide ? styles.memberTableContainer : styles.memberList}>
            {session.members.length === 0 ? (
              <View style={styles.memberCard}><Text style={{ color: INK3, fontSize: 13 }}>本班暂无在读成员</Text></View>
            ) : session.members.map((m, i) => (
              <View key={m.userId} style={[isWide ? styles.memberTableRow : styles.memberCard, i === session.members.length - 1 && isWide && { borderBottomWidth: 0 }]}>
                <View style={styles.memberInfo}>
                  <Avatar name={m.name} size={34} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.memberName}>{m.name}{m.memberRole === 'auditor' ? '  · 旁听' : ''}</Text>
                    {m.dharmaName && <Text style={styles.memberDharma}>法名·{m.dharmaName}</Text>}
                  </View>
                </View>
                <StatusToggle status={marks[m.userId] ?? 'none'} onPress={() => cycle(m.userId)} disabled={!canWrite} testID={testIds.attendance.statusToggle(m.userId)} />
              </View>
            ))}
          </View>

          {canWrite ? (
            <AdminButton testID={testIds.attendance.saveButton} variant="primary" style={styles.saveBtn} onPress={onSave} disabled={!dirty || save.isPending}>
              {save.isPending ? '保存中…' : '保存出勤记录'}
            </AdminButton>
          ) : (
            <View style={styles.readonlyNotice}>
              <Text style={styles.readonlyNoticeText}>出勤仅由辅导员 / 管理员录入(师兄不自报)</Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SCREEN_BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  scroll: { padding: 20, gap: 14, paddingBottom: 40 },
  infoCard: { backgroundColor: '#fff', borderRadius: 18, padding: 20, gap: 10, borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)', shadowColor: '#2b2218', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 2 },
  sessionTitle: { fontSize: 18, fontWeight: '700', color: INK, letterSpacing: 0.5 },
  sessionMeta: { fontSize: 12, color: INK3 },
  statRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 6 },
  statItem: { flex: 1, alignItems: 'center', gap: 2 },
  statNum: { fontSize: 26, fontWeight: '700' },
  statLabel: { fontSize: 10, color: INK3 },
  statDivider: { width: 1, height: 32, backgroundColor: 'rgba(43,34,24,0.08)' },
  batchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  batchLabel: { fontSize: 11, color: INK3, fontWeight: '600', marginRight: 2 },
  batchBtn: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1 },
  batchBtnText: { fontSize: 12, fontWeight: '500' },
  memberList: { gap: 8 },
  memberCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: 'rgba(43,34,24,0.06)' },
  memberTableContainer: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)', overflow: 'hidden' },
  memberTableRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderColor: 'rgba(43,34,24,0.05)' },
  memberInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  memberName: { fontSize: 14, fontWeight: '600', color: INK },
  memberDharma: { fontSize: 11, color: INK3, marginTop: 1 },
  statusToggle: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, minWidth: 56, alignItems: 'center' },
  statusToggleText: { fontSize: 12, fontWeight: '600' },
  saveBtn: { paddingVertical: 14 },
  readonlyNotice: { backgroundColor: GOLD_PALE, borderRadius: 12, padding: 14, alignItems: 'center' },
  readonlyNoticeText: { fontSize: 12, color: GOLD, textAlign: 'center' },
});
