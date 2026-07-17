import { useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NewSessionForm } from '@/components/new-session-form';
import { NewSpeakingForm } from '@/components/new-speaking-form';
import { AdminButton, AdminModal, Badge, EmptyState, FilterChips, SCREEN_BG, type BadgeTone } from '@/components/ui/admin-kit';
import { Text } from '@/components/ui/text';
import { useCohortSessions, type CohortSession } from '@/lib/queries/attendance';
import { useSpeakingSessions, type SpeakingSession } from '@/lib/queries/speaking';
import { useAdminCohorts, useCohortCurrentWeek, useCohortDetail } from '@/lib/queries/classes';
import { useCurrentUser } from '@/lib/queries/profile';
import { testIds } from '@/lib/testids';
import { INK, INK2, INK3, INK4, SAFFRON, SAFFRON_DARK, SAGE_DARK } from '@/lib/theme';
import { useAdminLayout } from '../_layout';
import { bookTitle } from '@/lib/utils';

const WIDE = 900;
const MASTER_W = 300;

// 设计③(2026-07-08 PM):讲考并入出勤区——「共修与讲考」双 tab,同一班级选择器下切换。
type AreaTab = 'sessions' | 'speaking';
const AREA_TABS: { key: AreaTab; label: string }[] = [
  { key: 'sessions', label: '共修出勤' },
  { key: 'speaking', label: '讲考' },
];

const fmtDate = (iso: string) => {
  try { return new Date(iso).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }); } catch { return iso; }
};

function SessionRow({ s, onPress }: { s: CohortSession; onPress: () => void }) {
  const weekLabel = s.semesterNumber ? `第${s.semesterNumber}学期 · 周${s.weekInSemester}` : '未排课周';
  const tone: BadgeTone = s.type === 'practice' ? 'gold' : 'saffron';
  return (
    <Pressable style={styles.sessionCard} onPress={onPress}>
      <View style={styles.sessionTop}>
        <Badge tone={tone}>{weekLabel}</Badge>
        {s.type === 'practice' ? <Badge tone="neutral">习题课</Badge> : null}
        {s.tracksAttendance === false ? <Badge tone="neutral">不计出勤</Badge> : null}
        <Text style={styles.sessionDate}>{fmtDate(s.scheduledAt)}</Text>
      </View>
      <Text className="font-serif" style={styles.sessionTitle} numberOfLines={1}>{bookTitle(s.courseName)}第 {s.lessonNumber} 节 · {s.lessonTitle}</Text>
      <View style={styles.sessionStats}>
        {s.tracksAttendance === false ? (
          <Text style={[styles.statChip, { color: INK4 }]}>临时集会 · 不计率</Text>
        ) : s.hasRecords ? (
          <>
            <Text style={[styles.statChip, { color: SAGE_DARK }]}>到课 {s.presentCount}</Text>
            <Text style={[styles.statChip, { color: SAFFRON_DARK }]}>缺席 {s.absentCount}</Text>
          </>
        ) : (
          <Text style={[styles.statChip, { color: INK4 }]}>未录出勤</Text>
        )}
        <Text style={styles.sessionArrow}>点名 →</Text>
      </View>
    </Pressable>
  );
}

// ── 某班的场次面板(周信息 + 场次列表 + 新建)——宽屏右栏 / 窄屏下半 ──
function AttendancePanel({ cohortId, cohortName, canWrite }: { cohortId: string; cohortName: string; canWrite: boolean }) {
  const router = useRouter();
  const { data: cohort } = useCohortDetail(cohortId);
  const { data: week } = useCohortCurrentWeek(
    cohort ? { cohortId: cohort.id, programId: cohort.programId, startDate: cohort.startDate, timezone: cohort.timezone } : undefined,
  );
  const { data: sessionsData, isLoading, error: sessionsError } = useCohortSessions(cohortId, cohort?.programId);
  const sessions = sessionsData?.sessions ?? [];
  const [newOpen, setNewOpen] = useState(false);

  return (
    <View style={{ gap: 12 }}>
      <View style={styles.actionBar}>
        <Text className="font-serif" style={styles.panelTitle} numberOfLines={1}>{cohortName}</Text>
        {canWrite ? (
          <AdminButton variant="primary" size="sm" icon={<Plus size={15} color="#fff" />} onPress={() => setNewOpen(true)}>新建场次</AdminButton>
        ) : null}
      </View>

      <View style={styles.weekCard}>
        {week && week.status === 'ok' ? (
          <>
            <Badge tone="saffron">本班当前 · 第 {week.calWeek} 周</Badge>
            <Text style={styles.weekSub}>第 {week.semesterNumber} 学期 · 第 {week.weekInSemester} 周</Text>
          </>
        ) : week && week.status === 'not_started' ? (
          <Text style={styles.weekSub}>尚未开班 · {week.startDate} 起</Text>
        ) : (
          <Text style={styles.weekSub}>未设开班日期</Text>
        )}
        <Text style={styles.memberCount}>{sessionsData?.memberCount ?? 0} 人在读</Text>
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={SAFFRON} /></View>
      ) : sessionsError ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>加载失败</Text>
          <Text style={styles.emptyDesc}>共修场次加载失败,请检查网络后重试。</Text>
        </View>
      ) : sessions.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>本班还没有共修场次</Text>
          <Text style={styles.emptyDesc}>点「＋ 新建场次」记录一次共修(可补录过去的场次)。出勤只由辅导员 / 管理员录入。</Text>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {sessions.map((s) => <SessionRow key={s.id} s={s} onPress={() => router.push(`/(admin)/attendance/${s.id}` as never)} />)}
        </View>
      )}

      <AdminModal visible={newOpen} onClose={() => setNewOpen(false)} title="新建共修场次" maxWidth={560} dismissOnOverlay={false}>
        <ScrollView style={{ maxHeight: 520 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <NewSessionForm cohortId={cohortId} cohortName={cohortName} programId={cohort?.programId} onDone={() => setNewOpen(false)} />
        </ScrollView>
      </AdminModal>
    </View>
  );
}

// ── 某班的讲考面板(场次列表 + 新建)——与 AttendancePanel 平行(设计③双tab)──
function SpeakingRow({ s, onPress }: { s: SpeakingSession; onPress: () => void }) {
  return (
    <Pressable style={styles.sessionCard} onPress={onPress}>
      <View style={styles.sessionTop}>
        <Badge tone="teal">讲考</Badge>
        <Text style={styles.sessionDate}>{fmtDate(s.sessionEndAt)}</Text>
      </View>
      <Text className="font-serif" style={styles.sessionTitle} numberOfLines={1}>{bookTitle(s.courseName)}第 {s.lessonNumber} 节 · {s.lessonTitle}</Text>
      {s.notes ? <Text style={styles.speakingNotes} numberOfLines={1}>{s.notes}</Text> : null}
      <Text style={styles.speakingGroupLink}>
        {s.groupSessionId && s.groupSessionAt ? `挂共修 · ${fmtDate(s.groupSessionAt)}` : '独立记录 · 未挂共修'}
      </Text>
      <View style={styles.sessionStats}>
        {s.recordedCount > 0 ? (
          <>
            <Text style={[styles.statChip, { color: SAGE_DARK }]}>已记 {s.recordedCount} 人</Text>
            <Text style={[styles.statChip, { color: SAFFRON_DARK }]}>主讲 {s.presenterCount}</Text>
          </>
        ) : (
          <Text style={[styles.statChip, { color: INK4 }]}>未记录</Text>
        )}
        <Text style={styles.sessionArrow}>记录 →</Text>
      </View>
    </Pressable>
  );
}

function SpeakingPanel({ cohortId, cohortName, canWrite }: { cohortId: string; cohortName: string; canWrite: boolean }) {
  const router = useRouter();
  const { data: cohort } = useCohortDetail(cohortId);
  const { data: sessions = [], isLoading, error: sessionsError } = useSpeakingSessions(cohortId);
  const [newOpen, setNewOpen] = useState(false);

  return (
    <View style={{ gap: 12 }}>
      <View style={styles.actionBar}>
        <Text className="font-serif" style={styles.panelTitle} numberOfLines={1}>{cohortName}</Text>
        {canWrite ? (
          <AdminButton testID={testIds.speaking.newButton} variant="primary" size="sm" icon={<Plus size={15} color="#fff" />} onPress={() => setNewOpen(true)}>新建讲考</AdminButton>
        ) : null}
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={SAFFRON} /></View>
      ) : sessionsError ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>加载失败</Text>
          <Text style={styles.emptyDesc}>讲考场次加载失败,请检查网络后重试。</Text>
        </View>
      ) : sessions.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>本班还没有讲考场次</Text>
          <Text style={styles.emptyDesc}>点「＋ 新建讲考」安排一场(选课节+截止日期);建好后逐人记 主讲/提问/听讲 三态,主讲可附等级评价(仅管理端可见)。</Text>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {sessions.map((s) => <SpeakingRow key={s.id} s={s} onPress={() => router.push(`/(admin)/attendance/speaking/${s.id}` as never)} />)}
        </View>
      )}

      <AdminModal visible={newOpen} onClose={() => setNewOpen(false)} title="新建讲考场次" maxWidth={560} dismissOnOverlay={false}>
        <ScrollView style={{ maxHeight: 520 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <NewSpeakingForm cohortId={cohortId} cohortName={cohortName} programId={cohort?.programId} onDone={() => setNewOpen(false)} />
        </ScrollView>
      </AdminModal>
    </View>
  );
}

export default function AttendanceIndex() {
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE;
  const { setTitle } = useAdminLayout();
  const { data: me } = useCurrentUser();
  const canWrite = me?.role === 'admin' || me?.role === 'zhumai';

  const { data: groups = [], isLoading: cohortsLoading, error: cohortsError } = useAdminCohorts();
  const cohorts = useMemo(() => groups.flatMap((g) => g.cohorts.map((c) => ({ id: c.id, name: c.name }))), [groups]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<AreaTab>('sessions');
  const activeId = selectedId ?? cohorts[0]?.id ?? null;
  const activeName = cohorts.find((c) => c.id === activeId)?.name ?? '';

  useEffect(() => { setTitle('共修与讲考'); }, [setTitle]);

  if (cohortsLoading) return <View style={styles.center}><ActivityIndicator color={SAFFRON} /></View>;
  if (cohortsError) {
    return <SafeAreaView style={styles.root} edges={['bottom']}><View style={{ padding: 16 }}><EmptyState>加载失败,请检查网络后重试</EmptyState></View></SafeAreaView>;
  }
  if (cohorts.length === 0) {
    return <SafeAreaView style={styles.root} edges={['bottom']}><View style={{ padding: 16 }}><EmptyState>暂无班级</EmptyState></View></SafeAreaView>;
  }

  // ── 宽屏:左班级列表 + 右场次面板 ──
  if (isWide) {
    return (
      <SafeAreaView style={styles.root} edges={['bottom']}>
        <View style={styles.masterDetail}>
          <View style={styles.masterPanel}>
            <Text className="font-serif" style={styles.masterTitle}>共修与讲考</Text>
            <Text style={styles.pickHint}>选班级</Text>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 24 }}>
              {cohorts.map((c) => {
                const on = c.id === activeId;
                return (
                  <Pressable key={c.id} style={[styles.classRow, on && styles.classRowOn]} onPress={() => setSelectedId(c.id)}>
                    <Text style={[styles.classRowText, on && styles.classRowTextOn]} numberOfLines={1}>{c.name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
          <ScrollView style={styles.detailPanel} contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }} showsVerticalScrollIndicator={false}>
            <FilterChips items={AREA_TABS} value={tab} onChange={setTab} />
            {activeId ? (
              tab === 'sessions'
                ? <AttendancePanel key={activeId} cohortId={activeId} cohortName={activeName} canWrite={canWrite} />
                : <SpeakingPanel key={activeId} cohortId={activeId} cohortName={activeName} canWrite={canWrite} />
            ) : null}
          </ScrollView>
        </View>
      </SafeAreaView>
    );
  }

  // ── 窄屏:班级 chips + 场次面板 ──
  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text className="font-serif" style={styles.pageTitle}>共修与讲考</Text>
        <Text style={styles.pickHint}>选班级</Text>
        <View style={styles.chips}>
          {cohorts.map((c) => {
            const on = c.id === activeId;
            return (
              <Pressable key={c.id} style={[styles.chip, on && styles.chipActive]} onPress={() => setSelectedId(c.id)}>
                <Text style={[styles.chipText, on && styles.chipTextActive]} numberOfLines={1}>{c.name}</Text>
              </Pressable>
            );
          })}
        </View>
        <FilterChips items={AREA_TABS} value={tab} onChange={setTab} />
        {activeId ? (
          tab === 'sessions'
            ? <AttendancePanel key={activeId} cohortId={activeId} cohortName={activeName} canWrite={canWrite} />
            : <SpeakingPanel key={activeId} cohortId={activeId} cohortName={activeName} canWrite={canWrite} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SCREEN_BG },
  scroll: { padding: 16, gap: 12, paddingBottom: 40 },
  center: { flex: 1, paddingVertical: 40, alignItems: 'center', justifyContent: 'center' },
  // 宽屏主从
  masterDetail: { flex: 1, flexDirection: 'row' },
  masterPanel: { width: MASTER_W, borderRightWidth: 1, borderRightColor: 'rgba(43,34,24,0.08)', padding: 14, gap: 6 },
  masterTitle: { fontSize: 18, fontWeight: '700', color: INK, letterSpacing: 1 },
  detailPanel: { flex: 1, backgroundColor: '#faf5ef' },
  classRow: { paddingHorizontal: 14, paddingVertical: 11, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)' },
  classRowOn: { backgroundColor: SAFFRON, borderColor: SAFFRON },
  classRowText: { fontSize: 14, color: INK2, fontWeight: '500' },
  classRowTextOn: { color: '#fff', fontWeight: '700' },
  // 通用
  actionBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  pageTitle: { fontSize: 20, fontWeight: '700', color: INK, letterSpacing: 1 },
  panelTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: INK, letterSpacing: 1 },
  pickHint: { fontSize: 12, color: INK3, fontWeight: '600', letterSpacing: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 9999, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(43,34,24,0.1)' },
  chipActive: { backgroundColor: SAFFRON, borderColor: SAFFRON },
  chipText: { fontSize: 13, color: INK2, fontWeight: '500', maxWidth: 180 },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  weekCard: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', backgroundColor: '#fff', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)' },
  weekSub: { fontSize: 13, color: INK2, fontWeight: '500' },
  memberCount: { fontSize: 12, color: INK3, marginLeft: 'auto' },
  emptyBox: { backgroundColor: '#fff', borderRadius: 14, padding: 24, alignItems: 'center', gap: 8, borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)' },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: INK },
  emptyDesc: { fontSize: 13, color: INK3, textAlign: 'center', lineHeight: 19 },
  sessionCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, gap: 8, borderWidth: 1, borderColor: 'rgba(43,34,24,0.07)' },
  sessionTop: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  sessionDate: { fontSize: 12, color: INK3, marginLeft: 'auto' },
  sessionTitle: { fontSize: 15, fontWeight: '600', color: INK },
  sessionStats: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statChip: { fontSize: 13, fontWeight: '600' },
  sessionArrow: { fontSize: 12, color: SAFFRON_DARK, fontWeight: '600', marginLeft: 'auto' },
  speakingNotes: { fontSize: 12, color: INK3 },
  speakingGroupLink: { fontSize: 11, color: INK4 },
});
