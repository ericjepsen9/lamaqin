import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AdminButton, SegmentedControl } from '@/components/ui/admin-kit';
import { Text } from '@/components/ui/text';
import { notify } from '@/lib/dialog';
import { useCreateSession } from '@/lib/mutations/attendance';
import { useSchedulableLessons } from '@/lib/queries/attendance';
import { useCurrentUser } from '@/lib/queries/profile';
import { INK, INK2, INK3, INK4, SAFFRON, SAFFRON_DARK, SAFFRON_LIGHT } from '@/lib/theme';
import { bookTitle } from '@/lib/utils';

import { TextInput } from '@/components/ui/text-input';
const CREAM = '#FBF4E9';
type SessionType = 'regular' | 'practice';
const TYPE_LABEL: Record<SessionType, string> = { regular: '共修', practice: '习题课' };

// 新建共修场次表单(可复用:出勤页弹窗 / 独立 /new 页)。
// 关联课节用【搜索 + 真 ScrollView】(原 maxHeight+overflow:hidden 把 272 节裁没了·PM 2026-06-29)。
export function NewSessionForm({ cohortId, cohortName, programId, onDone }: {
  cohortId: string;
  cohortName?: string | null;
  programId?: string;
  onDone: () => void;
}) {
  const { data: me } = useCurrentUser();
  const canWrite = me?.role === 'admin' || me?.role === 'zhumai';
  const { data: lessons = [], isLoading } = useSchedulableLessons(programId);
  const create = useCreateSession();

  const [q, setQ] = useState('');
  const [lessonId, setLessonId] = useState('');
  const [type, setType] = useState<SessionType>('regular');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [tracks, setTracks] = useState(true); // 是否计入出勤率

  const filtered = useMemo(() => {
    const s = q.trim();
    if (!s) return lessons;
    return lessons.filter((l) =>
      `${l.courseName} 第${l.lessonNumber}节 ${l.lessonTitle} 第${l.semesterNumber}学期周${l.weekInSemester}`.includes(s));
  }, [lessons, q]);

  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const startOk = /^([01]?\d|2[0-3]):[0-5]\d$/.test(startTime);
  const endOk = /^([01]?\d|2[0-3]):[0-5]\d$/.test(endTime);
  const canSubmit = canWrite && !!lessonId && dateOk && startOk && endOk && !create.isPending;
  const selected = lessons.find((l) => l.lessonId === lessonId);

  const submit = () => {
    if (!canSubmit) return;
    const scheduledAt = new Date(`${date}T${startTime}:00`).toISOString();
    const sessionEndAt = new Date(`${date}T${endTime}:00`).toISOString();
    create.mutate(
      { cohortId, lessonId, scheduledAt, sessionEndAt, type, tracksAttendance: tracks, location: location.trim() || null, notes: notes.trim() || null },
      {
        onSuccess: () => { notify('场次已创建', `${cohortName ?? ''} · ${selected ? `${bookTitle(selected.courseName)}第${selected.lessonNumber}节` : ''}`); onDone(); },
        onError: (e) => {
          const msg = (e as Error)?.message ?? '请重试';
          const perm = /row-level security|42501|permission/i.test(msg);
          notify('创建失败', perm ? '没有该班排场次的权限(需该班辅导员或管理员)。' : msg);
        },
      },
    );
  };

  return (
    <View style={{ gap: 16 }}>
      <Text style={styles.subtitle}>
        为「{cohortName ?? '本班'}」新建共修场次。课表发布后常规场次可批量生成,这里用于临时/计划外集会,也可补录过去的场次。
      </Text>

      <View style={styles.section}>
        <Text style={styles.label}>关联课节(本专业排课内)</Text>
        {!programId ? (
          <Text style={styles.note}>未指定班级。</Text>
        ) : isLoading ? (
          <ActivityIndicator color={SAFFRON} style={{ marginVertical: 12 }} />
        ) : lessons.length === 0 ? (
          <Text style={styles.note}>本专业还没有排课。请先去「排课管理」排课,再来建场次。</Text>
        ) : (
          <>
            <View style={styles.searchBox}>
              <TextInput style={styles.searchInput} placeholder="搜课节:课名 / 节号 / 第几学期周…" placeholderTextColor={INK4} value={q} onChangeText={setQ} />
              {q ? <Pressable hitSlop={8} onPress={() => setQ('')}><Text style={styles.clearX}>✕</Text></Pressable> : null}
            </View>
            {selected ? (
              <Text style={styles.selectedHint}>已选:{bookTitle(selected.courseName)}第{selected.lessonNumber}节 · {selected.lessonTitle}</Text>
            ) : null}
            <ScrollView style={styles.lessonList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {filtered.length === 0 ? (
                <Text style={styles.emptyHit}>没有匹配的课节</Text>
              ) : filtered.map((l) => {
                const active = l.lessonId === lessonId;
                return (
                  <Pressable key={l.lessonId} style={[styles.lessonRow, active && styles.lessonRowActive]} onPress={() => setLessonId(l.lessonId)}>
                    <Text style={styles.weekTag}>第{l.semesterNumber}学期 周{l.weekInSemester}</Text>
                    <Text style={[styles.lessonText, active && styles.lessonTextActive]} numberOfLines={1}>{bookTitle(l.courseName)}第{l.lessonNumber}节 {l.lessonTitle}</Text>
                    {active && <Text style={styles.checkMark}>✓</Text>}
                  </Pressable>
                );
              })}
            </ScrollView>
            <Text style={styles.fieldNote}>共 {lessons.length} 节{q ? ` · 筛出 ${filtered.length}` : ''}。</Text>
          </>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>场次类型</Text>
        <SegmentedControl items={(['regular', 'practice'] as SessionType[]).map((t) => ({ key: t, label: TYPE_LABEL[t] }))} value={type} onChange={setType} />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>是否计入出勤</Text>
        <SegmentedControl
          items={[{ key: 'yes', label: '计入出勤率' }, { key: 'no', label: '不计入(临时集会)' }]}
          value={tracks ? 'yes' : 'no'}
          onChange={(k) => setTracks(k === 'yes')}
        />
        <Text style={styles.fieldNote}>{tracks ? '此场计入本班出勤率,可逐人点名。' : '此场只记录、不计入出勤率(如临时/计划外集会)。'}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>日期与起止时间</Text>
        <TextInput style={styles.input} placeholder="日期 2026-07-06" placeholderTextColor={INK4} value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" maxLength={10} />
        <View style={styles.timeRow}>
          <TextInput style={[styles.input, { flex: 1 }]} placeholder="开始 19:30" placeholderTextColor={INK4} value={startTime} onChangeText={setStartTime} keyboardType="numbers-and-punctuation" maxLength={5} />
          <TextInput style={[styles.input, { flex: 1 }]} placeholder="结束 21:00" placeholderTextColor={INK4} value={endTime} onChangeText={setEndTime} keyboardType="numbers-and-punctuation" maxLength={5} />
        </View>
        <Text style={styles.fieldNote}>按班级本地时间填(可填过去日期补录场次)。</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>地点 / 备注(可选)</Text>
        <TextInput style={styles.input} placeholder="如:Zoom / 道场" placeholderTextColor={INK4} value={location} onChangeText={setLocation} />
        <TextInput style={[styles.input, { height: 64, textAlignVertical: 'top', marginTop: 8 }]} placeholder="如:莲师节特别共修" placeholderTextColor={INK4} multiline value={notes} onChangeText={setNotes} />
      </View>

      {!canWrite ? <Text style={styles.note}>仅该班辅导员或管理员可新建场次。</Text> : null}
      <AdminButton variant="primary" style={{ paddingVertical: 14 }} disabled={!canSubmit} onPress={submit}>
        {create.isPending ? '创建中…' : '创建场次'}
      </AdminButton>
    </View>
  );
}

const styles = StyleSheet.create({
  subtitle: { fontSize: 12.5, color: INK3, lineHeight: 18 },
  note: { fontSize: 12.5, color: INK3, lineHeight: 18 },
  section: { gap: 8 },
  label: { fontSize: 12, fontWeight: '600', color: INK3, letterSpacing: 0.5 },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 9, borderWidth: 1, borderColor: 'rgba(43,34,24,0.12)', paddingHorizontal: 12 },
  searchInput: { flex: 1, paddingVertical: 9, fontSize: 13.5, color: INK },
  clearX: { fontSize: 13, color: INK4, paddingLeft: 6 },
  selectedHint: { fontSize: 11.5, color: SAFFRON_DARK, fontWeight: '600' },
  lessonList: { backgroundColor: CREAM, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(43,34,24,0.1)', maxHeight: 260 },
  lessonRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(43,34,24,0.05)' },
  lessonRowActive: { backgroundColor: SAFFRON_LIGHT },
  weekTag: { fontSize: 10, fontWeight: '700', color: SAFFRON_DARK, backgroundColor: '#fff', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, overflow: 'hidden' },
  lessonText: { flex: 1, fontSize: 12.5, color: INK2 },
  lessonTextActive: { color: SAFFRON_DARK, fontWeight: '600' },
  checkMark: { fontSize: 14, color: SAFFRON_DARK, fontWeight: '700' },
  emptyHit: { fontSize: 12.5, color: INK4, padding: 16, textAlign: 'center' },
  timeRow: { flexDirection: 'row', gap: 10 },
  input: { backgroundColor: CREAM, borderRadius: 9, borderWidth: 1, borderColor: 'rgba(43,34,24,0.12)', paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: INK },
  fieldNote: { fontSize: 11, color: INK4 },
});
