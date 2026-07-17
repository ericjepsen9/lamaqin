import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AdminButton } from '@/components/ui/admin-kit';
import { Text } from '@/components/ui/text';
import { notify } from '@/lib/dialog';
import { useCreateSpeakingSession } from '@/lib/mutations/speaking';
import { useCohortSessions, useSchedulableLessons } from '@/lib/queries/attendance';
import { useCurrentUser } from '@/lib/queries/profile';
import { testIds } from '@/lib/testids';
import { INK, INK2, INK3, INK4, SAFFRON, SAFFRON_DARK, SAFFRON_LIGHT } from '@/lib/theme';
import { bookTitle, genClientToken } from '@/lib/utils';

import { TextInput } from '@/components/ui/text-input';
const CREAM = '#FBF4E9';

const fmtSessionDate = (iso: string) => {
  try { return new Date(iso).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }); } catch { return iso; }
};

// 日期+时刻(可空默认23:59)→ 本地时刻的 Date;单位数小时(如"9:30")用构造器传参而非拼ISO字符串解析,
// 免踩 new Date('...T9:30:00') 在部分引擎(V8)判 Invalid Date → toISOString() 抛未捕获异常的坑;
// 再回读年/月/日核对,拦掉"2026-02-31"这类被引擎悄悄滚成 3 月 4 日的非法日期(见波D审查发现)。
function parseLocalDateTime(dateStr: string, timeStr: string): Date | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!dm) return null;
  const [, y, mo, d] = dm;
  const tm = /^(\d{1,2}):(\d{2})$/.exec(timeStr) ?? ['', '23', '59'];
  const [, h, mi] = tm;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), 0);
  if (dt.getFullYear() !== Number(y) || dt.getMonth() !== Number(mo) - 1 || dt.getDate() !== Number(d)) return null;
  return dt;
}

// 新建讲考场次表单(设计③·决策067):选课节(=讲考范围)+截止日期(+可选时刻)+备注。
// 建好后在场次里逐人记三态(主讲/提问/听讲)+主讲等级评价。课节选择器复用共修场次的搜索式清单。
export function NewSpeakingForm({ cohortId, cohortName, programId, onDone }: {
  cohortId: string;
  cohortName?: string | null;
  programId?: string;
  onDone: () => void;
}) {
  const { data: me } = useCurrentUser();
  const canWrite = me?.role === 'admin' || me?.role === 'zhumai';
  const { data: lessons = [], isLoading } = useSchedulableLessons(programId);
  const { data: cohortSessionsData } = useCohortSessions(cohortId, programId);
  const groupSessions = cohortSessionsData?.sessions ?? [];
  const create = useCreateSpeakingSession();
  // 弱网幂等(2026-07-13):本组件挂在AdminModal里,visible=false只是不显示、并不会真正卸载
  // (RN Modal的行为),故不能靠"重新mount"换新凭证——改成成功后手动换新(见下方onSuccess)。
  const [token, setToken] = useState(() => genClientToken());

  const [q, setQ] = useState('');
  const [lessonId, setLessonId] = useState('');
  const [date, setDate] = useState('');
  const [endTime, setEndTime] = useState('');
  const [notes, setNotes] = useState('');
  const [groupSessionId, setGroupSessionId] = useState('');

  const filtered = useMemo(() => {
    const s = q.trim();
    if (!s) return lessons;
    return lessons.filter((l) =>
      `${l.courseName} 第${l.lessonNumber}节 ${l.lessonTitle} 第${l.semesterNumber}学期周${l.weekInSemester}`.includes(s));
  }, [lessons, q]);

  const timeOk = !endTime.trim() || /^([01]?\d|2[0-3]):[0-5]\d$/.test(endTime.trim());
  const parsedDt = timeOk ? parseLocalDateTime(date, endTime.trim()) : null;
  const canSubmit = canWrite && !!lessonId && !!parsedDt && !create.isPending;
  const selected = lessons.find((l) => l.lessonId === lessonId);

  const submit = () => {
    if (!canSubmit || !parsedDt) return;
    // 截止时刻可空=当天 23:59(只当截止日用);按设备本地时间落 timestamptz
    const sessionEndAt = parsedDt.toISOString();
    create.mutate(
      { cohortId, lessonId, sessionEndAt, notes: notes.trim() || null, groupSessionId: groupSessionId || null, clientToken: token },
      {
        onSuccess: () => { setToken(genClientToken()); notify('讲考已创建', `${cohortName ?? ''} · ${selected ? `${bookTitle(selected.courseName)}第${selected.lessonNumber}节` : ''}`); onDone(); },
        onError: (e) => {
          const msg = (e as Error)?.message ?? '请重试';
          const perm = /row-level security|42501|permission/i.test(msg);
          notify('创建失败', perm ? '没有该班讲考安排的权限(需该班辅导员或管理员)。' : msg);
        },
      },
    );
  };

  return (
    <View style={{ gap: 16 }}>
      <Text style={styles.subtitle}>
        为「{cohortName ?? '本班'}」安排一场讲考:选课节(=讲考范围)、定截止日期。建好后逐人记 主讲/提问/听讲,主讲可附等级评价(仅管理端可见,师兄端不显)。
      </Text>

      <View style={styles.section}>
        <Text style={styles.label}>讲考课节(本专业排课内)</Text>
        {!programId ? (
          <Text style={styles.note}>未指定班级。</Text>
        ) : isLoading ? (
          <ActivityIndicator color={SAFFRON} style={{ marginVertical: 12 }} />
        ) : lessons.length === 0 ? (
          <Text style={styles.note}>本专业还没有排课。请先去「排课管理」排课,再来安排讲考。</Text>
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
                  <Pressable key={l.lessonId} testID={testIds.speaking.lessonRow(l.lessonId)} style={[styles.lessonRow, active && styles.lessonRowActive]} onPress={() => setLessonId(l.lessonId)}>
                    <Text style={styles.weekTag}>第{l.semesterNumber}学期 周{l.weekInSemester}</Text>
                    <Text style={[styles.lessonText, active && styles.lessonTextActive]} numberOfLines={1}>{bookTitle(l.courseName)}第{l.lessonNumber}节 {l.lessonTitle}</Text>
                    {active && <Text style={styles.checkMark}>✓</Text>}
                  </Pressable>
                );
              })}
            </ScrollView>
            <Text style={styles.fieldNote}>共 {lessons.length} 节{q ? ` · 筛出 ${filtered.length}` : ''}。每人每节讲考记录唯一(三态互斥)。</Text>
          </>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>截止日期(+可选时刻)</Text>
        <TextInput testID={testIds.speaking.dateInput} style={styles.input} placeholder="日期 2026-07-12" placeholderTextColor={INK4} value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" maxLength={10} />
        <TextInput style={styles.input} placeholder="截止时刻 20:00(可空=当天末)" placeholderTextColor={INK4} value={endTime} onChangeText={setEndTime} keyboardType="numbers-and-punctuation" maxLength={5} />
        <Text style={styles.fieldNote}>可填过去日期补录历史讲考。</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>挂靠共修场次(可选)</Text>
        <Text style={styles.fieldNote}>讲考若就在某次共修课上进行,可挂靠该场次;留空=独立记录(如线下单独安排·决策080)。</Text>
        {groupSessions.length === 0 ? (
          <Text style={styles.note}>本班还没有共修场次可挂靠。</Text>
        ) : (
          <ScrollView style={styles.lessonList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            <Pressable style={[styles.lessonRow, !groupSessionId && styles.lessonRowActive]} onPress={() => setGroupSessionId('')}>
              <Text style={[styles.lessonText, !groupSessionId && styles.lessonTextActive]}>不挂靠 · 独立记录</Text>
              {!groupSessionId && <Text style={styles.checkMark}>✓</Text>}
            </Pressable>
            {groupSessions.map((s) => {
              const active = s.id === groupSessionId;
              return (
                <Pressable key={s.id} style={[styles.lessonRow, active && styles.lessonRowActive]} onPress={() => setGroupSessionId(s.id)}>
                  <Text style={styles.weekTag}>{fmtSessionDate(s.scheduledAt)}</Text>
                  <Text style={[styles.lessonText, active && styles.lessonTextActive]} numberOfLines={1}>
                    {bookTitle(s.courseName)}第{s.lessonNumber}节 · {s.type === 'practice' ? '习题课' : '共修'}
                  </Text>
                  {active && <Text style={styles.checkMark}>✓</Text>}
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>备注(可选)</Text>
        <TextInput style={[styles.input, { height: 64, textAlignVertical: 'top' }]} placeholder="如:范围=本周两节 / 线下道场进行" placeholderTextColor={INK4} multiline value={notes} onChangeText={setNotes} />
      </View>

      {!canWrite ? <Text style={styles.note}>仅该班辅导员或管理员可安排讲考。</Text> : null}
      <AdminButton testID={testIds.speaking.submitButton} variant="primary" style={{ paddingVertical: 14 }} disabled={!canSubmit} onPress={submit}>
        {create.isPending ? '创建中…' : '创建讲考场次'}
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
  input: { backgroundColor: CREAM, borderRadius: 9, borderWidth: 1, borderColor: 'rgba(43,34,24,0.12)', paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: INK },
  fieldNote: { fontSize: 11, color: INK4 },
});
