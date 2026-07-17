import { useRouter } from 'expo-router';
import { Calendar, ChevronRight, Minus, Plus, X } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text as RNText, TextInput, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { notify } from '@/lib/dialog';
import { useAddSelfStudyRestWeek, useRemoveSelfStudyRestWeek, useSetPrimarySelfStudyProgram, useSetSelfStudyPace } from '@/lib/mutations/self-study';
import {
  useMySelfStudyPrograms,
  useSelfStudyPlan,
  useSelfStudyRestWeeks,
  type SelfStudyProgramRow,
} from '@/lib/queries/self-study-progress';

// 自学管理面板(D-10·2026-07-02 从 app/selfstudy.tsx 抽出共用):主修本周计划(决策157)+ 节奏 +
// 休息周 + 其他专业设主修 + 空态引导。两处使用:/selfstudy 路由(保留深链)、班级 tab 无班分支(自学首发主入口)。
const INK = '#2b2218';
const INK2 = '#55463a';
const INK3 = '#7e6d5b';
const SAFFRON = '#e07856';
const SAFFRON_DARK = '#b35535';

const localToday = () => new Date().toLocaleDateString('en-CA');

export function SelfStudyPanel() {
  const router = useRouter();
  const { data: programs = [], isLoading } = useMySelfStudyPrograms();
  const primary = programs[0] ?? null; // 已按 is_primary 倒序;首条 = 主修
  const others = programs.slice(1);
  const [restOpen, setRestOpen] = useState(false);

  if (isLoading) {
    return <View style={{ paddingVertical: 60, alignItems: 'center' }}><ActivityIndicator color={SAFFRON_DARK} /></View>;
  }
  if (!primary) {
    // 空态文案 = D-10 拍板版
    return (
      <View style={styles.card}>
        <Text className="font-serif" style={{ fontSize: 16, fontWeight: '700', color: INK }}>还未开始自学</Text>
        <RNText style={{ fontSize: 13, color: INK3, marginTop: 6, lineHeight: 20 }}>去闻思页选一门课,点「加入自学」即可开始(需自学资格;没有请联系管理员开通)。</RNText>
        <Pressable style={styles.primaryBtn} onPress={() => router.push('/courses' as never)}>
          <RNText style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>去闻思选课</RNText>
        </Pressable>
      </View>
    );
  }
  return (
    <>
      <PrimaryCard program={primary} onRest={() => setRestOpen(true)} />
      {others.length > 0 ? <OthersCard others={others} /> : null}
      <RestModal open={restOpen} onClose={() => setRestOpen(false)} programId={primary.programId} />
    </>
  );
}

// ── 主修自学专业卡:本周计划(大纲) + 起修日 + 休息周 ──────────────────────
function PrimaryCard({ program, onRest }: { program: SelfStudyProgramRow; onRest: () => void }) {
  const router = useRouter();
  const { data: plan } = useSelfStudyPlan(program.programId);
  const { data: rests = [] } = useSelfStudyRestWeeks(program.programId);
  const [paceOpen, setPaceOpen] = useState(false);
  const lessons = plan?.lessons ?? [];
  const cont = lessons[0];

  return (
    <View style={styles.card}>
      <View className="flex-row items-center" style={{ gap: 6 }}>
        <Text className="font-serif" style={{ fontSize: 16, fontWeight: '700', color: INK }}>{program.programName}</Text>
        <View style={styles.primaryTag}><RNText style={{ fontSize: 10, fontWeight: '700', color: '#fff' }}>主修</RNText></View>
      </View>
      <RNText style={{ fontSize: 12, color: INK3, marginTop: 2 }}>起修日 {program.startDate}{rests.length ? ` · 已请假 ${rests.length} 周` : ''}{plan && plan.totalLessons > 0 ? ` · 全 ${plan.totalLessons} 节` : ''}</RNText>

      {/* 本周计划(决策157:起修日 + 节奏 + 休息周顺延) */}
      <View style={styles.planBox}>
        <RNText style={{ fontSize: 11, color: SAFFRON_DARK, fontWeight: '700' }}>{plan?.started ? `本周计划 · 第 ${plan.weekNumber} 周` : '本周计划'}</RNText>
        {plan && plan.started && lessons.length > 0 ? (
          <>
            <Text className="font-serif" style={{ fontSize: 15, fontWeight: '700', color: INK, marginTop: 4 }}>学第 {plan.fromSeq}–{plan.toSeq} 节 · 共 {plan.pace} 节/周</Text>
            <View style={{ gap: 6, marginTop: 10 }}>
              {lessons.map((l) => (
                <Pressable key={l.lessonId} style={styles.lessonRow} onPress={() => router.push(`/lesson/${l.lessonId}?step=wensi` as never)}>
                  <View style={styles.lessonNoBox}><RNText style={{ fontSize: 11, fontWeight: '700', color: INK3 }}>{l.seq}</RNText></View>
                  <RNText numberOfLines={1} style={{ flex: 1, fontSize: 13, color: INK2 }}>{l.lessonTitle}</RNText>
                  <RNText style={{ fontSize: 14, color: INK3 }}>›</RNText>
                </Pressable>
              ))}
            </View>
            {cont ? (
              <Pressable style={styles.continueBtn} onPress={() => router.push(`/lesson/${cont.lessonId}?step=wensi` as never)}>
                <RNText style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>继续学习</RNText>
              </Pressable>
            ) : null}
          </>
        ) : plan && !plan.started ? (
          <RNText style={{ fontSize: 13, color: INK2, marginTop: 6 }}>还没到起修日({program.startDate}),到日子按节奏开始。</RNText>
        ) : (
          <>
            <RNText style={{ fontSize: 13, color: INK2, marginTop: 6 }}>本专业暂未排课(无课节序列)。可去课程目录自选。</RNText>
            <Pressable style={styles.continueBtn} onPress={() => router.push('/catalog' as never)}>
              <RNText style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>去课程目录</RNText>
            </Pressable>
          </>
        )}
      </View>

      {/* 节奏调整(决策157:大纲默认 + 可自定) */}
      <Pressable style={styles.paceRow} onPress={() => setPaceOpen(true)}>
        <RNText style={{ fontSize: 13, color: INK2 }}>节奏:每周 {plan?.pace ?? '—'} 节{plan ? (plan.paceSource === 'default' ? '(大纲默认)' : '(自定)') : ''}</RNText>
        <RNText style={{ fontSize: 13, color: SAFFRON_DARK, fontWeight: '700' }}>调整 ▾</RNText>
      </Pressable>

      {/* 请假 / 休息周 */}
      <Pressable style={styles.restRow} onPress={onRest}>
        <Calendar size={15} color={INK3} />
        <RNText style={{ fontSize: 13, color: INK3 }}>请假 / 休息周{rests.length ? `(已设 ${rests.length} 周)` : '(进度顺延)'}</RNText>
        <ChevronRight size={15} color={INK3} />
      </Pressable>

      {paceOpen && plan ? (
        <PaceModal open onClose={() => setPaceOpen(false)} programId={program.programId} pace={plan.pace} isCustom={plan.paceSource === 'custom'} />
      ) : null}
    </View>
  );
}

// 节奏调整(决策157):跟随大纲默认 / 自定每周 N 节 → 写 weekly_target(null=跟默认)
function PaceModal({ open, onClose, programId, pace, isCustom }: { open: boolean; onClose: () => void; programId: string; pace: number; isCustom: boolean }) {
  const setPace = useSetSelfStudyPace();
  const [mode, setMode] = useState<'default' | 'custom'>(isCustom ? 'custom' : 'default');
  const [n, setN] = useState(pace);
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <Text className="font-serif" style={{ fontSize: 17, fontWeight: '700', color: INK }}>调整学习节奏</Text>
          <RNText style={{ fontSize: 12, color: INK3, marginTop: 2, marginBottom: 14 }}>本周计划按节奏 + 起修日算;大纲给默认节奏,你可自定。自学不限快慢,按你的时间走。</RNText>
          <Pressable style={[styles.paceOpt, mode === 'default' && styles.paceOptOn]} onPress={() => setMode('default')}>
            <RNText style={{ fontSize: 15, fontWeight: '600', color: mode === 'default' ? '#fff' : INK }}>跟随大纲默认</RNText>
          </Pressable>
          <View style={[styles.paceOpt, mode === 'custom' && styles.paceOptOn, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
            <Pressable style={{ flex: 1 }} onPress={() => setMode('custom')}><RNText style={{ fontSize: 15, fontWeight: '600', color: mode === 'custom' ? '#fff' : INK }}>自定:每周</RNText></Pressable>
            <View className="flex-row items-center" style={{ gap: 14 }}>
              <Pressable onPress={() => { setMode('custom'); setN((c) => Math.max(1, c - 1)); }}><Minus size={18} color={mode === 'custom' ? '#fff' : INK2} /></Pressable>
              <RNText style={{ fontSize: 18, fontWeight: '700', color: mode === 'custom' ? '#fff' : INK, minWidth: 20, textAlign: 'center' }}>{n}</RNText>
              <Pressable onPress={() => { setMode('custom'); setN((c) => Math.min(21, c + 1)); }}><Plus size={18} color={mode === 'custom' ? '#fff' : INK2} /></Pressable>
              <RNText style={{ fontSize: 14, color: mode === 'custom' ? '#fff' : INK2 }}>节</RNText>
            </View>
          </View>
          <Pressable style={[styles.doneBtn, setPace.isPending && { opacity: 0.5 }]} disabled={setPace.isPending} onPress={() => {
            setPace.mutate({ programId, weeklyTarget: mode === 'default' ? null : n }, { onSuccess: onClose, onError: (e) => notify('保存失败', (e as Error)?.message ?? '请重试') });
          }}>
            <RNText style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>保存</RNText>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── 其他自学专业:设为主修 ──────────────────────────────────────────────
function OthersCard({ others }: { others: SelfStudyProgramRow[] }) {
  const setPrimary = useSetPrimarySelfStudyProgram();
  return (
    <View style={styles.card}>
      <Text className="font-serif" style={{ fontSize: 15, fontWeight: '700', color: INK }}>其他自学专业</Text>
      <View style={{ gap: 8, marginTop: 8 }}>
        {others.map((p) => (
          <View key={p.programId} className="flex-row items-center" style={{ gap: 10 }}>
            <View style={{ flex: 1 }}>
              <RNText style={{ fontSize: 14, color: INK, fontWeight: '600' }}>{p.programName}</RNText>
              <RNText style={{ fontSize: 11, color: INK3, marginTop: 1 }}>起修日 {p.startDate}</RNText>
            </View>
            <Pressable
              style={styles.setPrimaryBtn}
              disabled={setPrimary.isPending}
              onPress={() => setPrimary.mutate({ programId: p.programId }, { onError: (e) => notify('切换失败', (e as Error)?.message ?? '请重试') })}
            >
              <RNText style={{ fontSize: 12, fontWeight: '700', color: SAFFRON_DARK }}>设为主修</RNText>
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── 请假 / 休息周弹层 ───────────────────────────────────────────────────
function RestModal({ open, onClose, programId }: { open: boolean; onClose: () => void; programId: string }) {
  const { data: rests = [] } = useSelfStudyRestWeeks(programId);
  const add = useAddSelfStudyRestWeek();
  const remove = useRemoveSelfStudyRestWeek();
  const [date, setDate] = useState(localToday());
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(new Date(date + 'T00:00:00').getTime());

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      {/* KeyboardAvoidingView(2026-07-17·PM真机反馈键盘挡住弹层输入框,全app排查后补齐) */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <Text className="font-serif" style={{ fontSize: 17, fontWeight: '700', color: INK }}>请假 / 休息周</Text>
          <RNText style={{ fontSize: 12, color: INK3, marginTop: 2, marginBottom: 12 }}>登记你休息的那一周(填该周任一天即可)。每登记一周,大纲进度顺延一周、不催。</RNText>

          {rests.length > 0 ? (
            <View style={{ gap: 8, marginBottom: 12 }}>
              {rests.map((r) => (
                <View key={r.id} style={styles.restItem}>
                  <RNText style={{ flex: 1, fontSize: 14, color: INK }}>{r.restStartDate} 那一周</RNText>
                  <Pressable hitSlop={8} disabled={remove.isPending} onPress={() => remove.mutate({ id: r.id, programId })}>
                    <X size={16} color={INK3} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : (
            <RNText style={{ fontSize: 12, color: INK3, marginBottom: 12 }}>还没有登记休息周。</RNText>
          )}

          <Text style={{ fontSize: 12, fontWeight: '600', color: INK3, marginBottom: 6 }}>新增休息周(YYYY-MM-DD)</Text>
          <View className="flex-row items-center" style={{ gap: 10 }}>
            <TextInput
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={INK3}
              autoCapitalize="none"
              keyboardType="numbers-and-punctuation"
              maxLength={10}
              style={styles.dateInput}
            />
            <Pressable
              style={[styles.addBtn, (!valid || add.isPending) && { opacity: 0.4 }]}
              disabled={!valid || add.isPending}
              onPress={() => add.mutate({ programId, restStartDate: date }, { onError: (e) => notify('登记失败', (e as Error)?.message ?? '请重试') })}
            >
              <Plus size={16} color="#fff" /><RNText style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>登记</RNText>
            </Pressable>
          </View>

          <Pressable style={styles.doneBtn} onPress={onClose}><RNText style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>完成</RNText></Pressable>
        </Pressable>
      </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)' },
  primaryTag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 9999, backgroundColor: SAFFRON_DARK },
  primaryBtn: { alignSelf: 'flex-start', marginTop: 14, paddingHorizontal: 22, paddingVertical: 10, borderRadius: 9999, backgroundColor: SAFFRON },
  planBox: { marginTop: 12, padding: 14, borderRadius: 14, backgroundColor: '#FBE5DA', borderWidth: 1, borderColor: 'rgba(224,120,86,0.3)' },
  lessonRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.7)' },
  lessonNoBox: { width: 24, height: 24, borderRadius: 7, backgroundColor: 'rgba(43,34,24,0.06)', alignItems: 'center', justifyContent: 'center' },
  continueBtn: { alignSelf: 'flex-start', marginTop: 12, paddingHorizontal: 22, paddingVertical: 10, borderRadius: 9999, backgroundColor: SAFFRON },
  paceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(43,34,24,0.08)' },
  paceOpt: { padding: 14, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(43,34,24,0.1)', marginBottom: 10 },
  paceOptOn: { backgroundColor: SAFFRON, borderColor: SAFFRON },
  restRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(43,34,24,0.08)' },
  setPrimaryBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9999, backgroundColor: '#FBE5DA' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FBF4E9', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 32 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(43,34,24,0.18)', alignSelf: 'center', marginBottom: 12 },
  restItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)' },
  dateInput: { flex: 1, borderWidth: 1, borderColor: 'rgba(43,34,24,0.18)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 15, color: INK, backgroundColor: '#fff' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: SAFFRON },
  doneBtn: { marginTop: 16, paddingVertical: 13, borderRadius: 12, backgroundColor: SAFFRON, alignItems: 'center' },
});
