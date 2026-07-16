import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AdminButton,
  AdminModal,
  EmptyState,
  ModalActions,
  ModalFootnote,
  SCREEN_BG,
  SectionCard,
} from '@/components/ui/admin-kit';
import { Text } from '@/components/ui/text';
import { confirmAsync, notify } from '@/lib/dialog';
import {
  useGenerateScheduleFromOutline,
  useAssignSelfStudy,
  useDeleteSemester,
  useToggleWeekHoliday,
  useRemoveWeekCourse,
  useRemoveWeekSelfStudy,
} from '@/lib/mutations/scheduling';
import {
  useAdminPrograms,
  useProgramCourses,
  useProgramSchedule,
  type AdminProgram,
  type ScheduleSemester,
  type ScheduleWeek,
} from '@/lib/queries/scheduling';
import { useSelfStudyBooks } from '@/lib/queries/self_study';
import { testIds } from '@/lib/testids';
import { INK, INK2, INK3, INK4, SAFFRON, SAFFRON_DARK } from '@/lib/theme';
import { useAdminLayout } from '../_layout';
import { bookTitle } from '@/lib/utils';

// 管理端「排课管理」· 排表模板录入端(决策:PM 2026-06-28)。
//   一句话排课:选专业 → 选一门课、学到第几节 → 自动按周铺好(program_semesters→weeks→week_courses)。
//   写的就是进度算法 get_week_lessons 的数据源 → 师兄端「本周应学 / 班级进度 / 继续学习」即真实点亮。
//   排课全局固定(不按班),班级靠 cohort.start_date + 算法定位到第几周。写库全走 RLS(is_system_admin)。

// 放假周底色(比 GOLD_PALE 更淡的米金,与白卡区分而不刺眼)
const GOLD_PALE_BG = '#fbf3e0';

// ── 小步进器(学期号 / 每周节数:点 ± 不易填错)─────────────────────
function Stepper({ value, onChange, min = 1, max = 99, testID }: { value: number; onChange: (v: number) => void; min?: number; max?: number; testID?: string }) {
  return (
    <View style={styles.stepper}>
      <Pressable testID={testID ? `${testID}-minus` : undefined} style={styles.stepBtn} hitSlop={6} onPress={() => onChange(Math.max(min, value - 1))}>
        <Text style={styles.stepBtnText}>−</Text>
      </Pressable>
      <Text style={styles.stepVal}>{value}</Text>
      <Pressable testID={testID ? `${testID}-plus` : undefined} style={styles.stepBtn} hitSlop={6} onPress={() => onChange(Math.min(max, value + 1))}>
        <Text style={styles.stepBtnText}>＋</Text>
      </Pressable>
    </View>
  );
}

// ── 周行:第W周 + 本周节次(× 移除)+ 放假切换 ──────────────────────
function WeekRow({
  week,
  onToggleHoliday,
  onRemoveCourse,
  onRemoveBook,
}: {
  week: ScheduleWeek;
  onToggleHoliday: () => void;
  onRemoveCourse: (wcId: string, label: string) => void;
  onRemoveBook: (weekId: string, bookId: string, label: string) => void;
}) {
  const empty = week.courses.length === 0 && week.books.length === 0;
  return (
    <View style={[styles.weekRow, week.isHoliday && styles.weekRowHoliday]}>
      <View style={styles.weekHead}>
        <Text style={styles.weekNum}>第 {week.weekNumber} 周</Text>
        <Pressable testID={testIds.scheduling.holidayToggle(week.id)} onPress={onToggleHoliday} hitSlop={6} style={[styles.holidayBtn, week.isHoliday && styles.holidayBtnOn]}>
          <Text style={[styles.holidayBtnText, week.isHoliday && styles.holidayBtnTextOn]}>
            {week.isHoliday ? '● 放假周(点恢复)' : '设为放假'}
          </Text>
        </Pressable>
      </View>
      {empty ? (
        <Text style={styles.weekEmpty}>{week.isHoliday ? '放假,本周无课' : '本周暂未排课'}</Text>
      ) : (
        <View style={styles.chipWrap}>
          {week.courses.map((c) => {
            const label = `${bookTitle(c.courseName)}第${c.lessonNumber ?? '?'}节`;
            return (
              <View key={c.id} style={styles.lessonChip}>
                <Text style={styles.lessonChipNum}>第{c.lessonNumber ?? '?'}节</Text>
                <Text style={styles.lessonChipTitle} numberOfLines={1}>{c.lessonTitle ?? c.courseName}</Text>
                <Pressable testID={testIds.scheduling.removeCourseButton(c.id)} hitSlop={8} onPress={() => onRemoveCourse(c.id, label)} style={styles.lessonChipDel}>
                  <Text style={styles.lessonChipDelText}>×</Text>
                </Pressable>
              </View>
            );
          })}
          {week.books.map((bk) => (
            <View key={bk.bookId} style={styles.bookChip}>
              <Text style={styles.bookChipTag}>自学</Text>
              <Text style={styles.bookChipTitle} numberOfLines={1}>{bookTitle(bk.bookTitle)}</Text>
              <Pressable hitSlop={8} onPress={() => onRemoveBook(week.id, bk.bookId, bookTitle(bk.bookTitle))} style={styles.lessonChipDel}>
                <Text style={styles.lessonChipDelText}>×</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ── 学期卡:名 + 课程/已排节 + 清空 + 周列表 ─────────────────────────
function SemesterCard({ semester, programId }: { semester: ScheduleSemester; programId: string }) {
  const delSem = useDeleteSemester();
  const toggleHoliday = useToggleWeekHoliday();
  const removeCourse = useRemoveWeekCourse();
  const removeBook = useRemoveWeekSelfStudy();

  const courseNames = useMemo(() => {
    const set = new Set<string>();
    for (const w of semester.weeks) for (const c of w.courses) set.add(c.courseName);
    return Array.from(set);
  }, [semester]);

  const onDelete = async () => {
    const ok = await confirmAsync(
      `清空「${semester.semesterName}」?`,
      '会删掉这个学期排好的所有周和课程(不影响课程内容本身)。之后可以重新排。',
      '清空',
    );
    if (!ok) return;
    delSem.mutate({ semesterId: semester.id, programId }, { onError: (e) => notify('清空失败', (e as Error)?.message ?? '请重试') });
  };

  const onToggleHoliday = (week: ScheduleWeek) => {
    toggleHoliday.mutate(
      { weekId: week.id, isHoliday: !week.isHoliday, programId },
      { onError: (e) => notify('操作失败', (e as Error)?.message ?? '请重试') },
    );
  };

  const onRemoveCourse = async (wcId: string, label: string) => {
    const ok = await confirmAsync(`移除 ${label}?`, '只把这一节从本周课表移走,不删课程内容。', '移除');
    if (!ok) return;
    removeCourse.mutate({ weekCourseId: wcId, programId }, { onError: (e) => notify('移除失败', (e as Error)?.message ?? '请重试') });
  };

  const onRemoveBook = async (weekId: string, bookId: string, label: string) => {
    const ok = await confirmAsync(`移除自学读物 ${label}?`, '只把这本从本周自学移走,不删读物内容。', '移除');
    if (!ok) return;
    removeBook.mutate({ weekId, bookId, programId }, { onError: (e) => notify('移除失败', (e as Error)?.message ?? '请重试') });
  };

  return (
    <SectionCard>
      <View style={styles.semHead}>
        <View style={{ flex: 1 }}>
          <Text className="font-serif" style={styles.semTitle}>{semester.semesterName}</Text>
          <Text style={styles.semSub}>
            第 {semester.semesterNumber} 学期 · {courseNames.length > 0 ? courseNames.join('、') : '未排课'} · 共 {semester.lessonCount} 节 / {semester.weeks.length} 周
          </Text>
        </View>
        <AdminButton testID={testIds.scheduling.clearSemesterButton(semester.id)} variant="danger" size="sm" onPress={onDelete}>清空</AdminButton>
      </View>

      {semester.weeks.length === 0 ? (
        <EmptyState>本学期暂无周次</EmptyState>
      ) : (
        <View style={{ gap: 6 }}>
          {semester.weeks.map((w) => (
            <WeekRow key={w.id} week={w} onToggleHoliday={() => onToggleHoliday(w)} onRemoveCourse={onRemoveCourse} onRemoveBook={onRemoveBook} />
          ))}
        </View>
      )}
    </SectionCard>
  );
}

// ── 一句话排课 弹窗 ──────────────────────────────────────────────────
function GenerateModal({
  program,
  semesters,
  onClose,
}: {
  program: AdminProgram;
  semesters: ScheduleSemester[];
  onClose: () => void;
}) {
  const { data: courses = [], isLoading } = useProgramCourses(program.id);
  const gen = useGenerateScheduleFromOutline();

  const [courseId, setCourseId] = useState('');
  const [semNum, setSemNum] = useState(program.startSemester);
  const [semNameInput, setSemNameInput] = useState('');
  const [fromN, setFromN] = useState(1);
  const [toN, setToN] = useState(1);
  const [perWeek, setPerWeek] = useState(1);
  const [showAdv, setShowAdv] = useState(false);
  const [startWeekOverride, setStartWeekOverride] = useState<number | null>(null);

  const selected = courses.find((c) => c.courseId === courseId);
  const total = selected?.totalLessons ?? null;

  // 选课时自动把"学到第几节"填成整门(从第1节到末节)
  useEffect(() => {
    if (selected) {
      setFromN(1);
      setToN(selected.totalLessons ?? 1);
    }
  }, [courseId]); // eslint-disable-line react-hooks/exhaustive-deps

  const autoName = `${program.name}·第${semNum}学期`;
  // 起始周:该学期已排到的最大周 + 1(没有就第1周)。高级里可手动改。
  const existing = semesters.find((s) => s.semesterNumber === semNum);
  const defaultStartWeek = existing && existing.weeks.length > 0 ? Math.max(...existing.weeks.map((w) => w.weekNumber)) + 1 : 1;
  const startWeek = showAdv && startWeekOverride != null ? startWeekOverride : defaultStartWeek;

  const lessonCount = Math.max(0, toN - fromN + 1);
  const weekCount = Math.ceil(lessonCount / Math.max(1, perWeek));
  const endWeek = startWeek + weekCount - 1;
  const canSubmit = !!courseId && semNum > 0 && toN >= fromN && lessonCount > 0 && !gen.isPending;

  const submit = () => {
    if (!canSubmit) return;
    gen.mutate(
      {
        programId: program.id,
        courseId,
        semesterNumber: semNum,
        semesterName: semNameInput.trim() || autoName,
        startWeek,
        lessonsPerWeek: perWeek,
        fromLessonNumber: fromN,
        toLessonNumber: toN,
      },
      {
        onSuccess: (r) => {
          onClose();
          notify('排好了', `${bookTitle(selected?.name)}${r.lessons} 节,排进「${semNameInput.trim() || autoName}」第 ${startWeek}–${endWeek} 周。`);
        },
        onError: (e) => {
          const msg = (e as { message?: string })?.message ?? '请重试';
          const perm = /row-level security|42501|permission/i.test(msg);
          notify('排课失败', perm ? '没有排课权限(需在系统管理员名单内)。' : msg);
        },
      },
    );
  };

  return (
    <AdminModal visible onClose={onClose} title={`给「${program.name}」排课`} dismissOnOverlay={false} maxWidth={520}>
      <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 460 }}>
        {/* 1. 选课程 */}
        <Text style={styles.stepLabel}>1 · 学哪门课?</Text>
        {isLoading ? (
          <ActivityIndicator color={SAFFRON} style={{ marginVertical: 12 }} />
        ) : courses.length === 0 ? (
          <Text style={styles.note}>本专业还没挂课程,无法排课。</Text>
        ) : (
          <View style={{ gap: 6, marginBottom: 14 }}>
            {courses.map((c) => {
              const active = c.courseId === courseId;
              return (
                <Pressable key={c.courseId} testID={testIds.scheduling.courseOption(c.courseId)} style={[styles.courseOpt, active && styles.courseOptActive]} onPress={() => setCourseId(c.courseId)}>
                  <View style={[styles.radio, active && styles.radioOn]}>{active ? <View style={styles.radioDot} /> : null}</View>
                  <Text style={[styles.courseOptName, active && { color: SAFFRON_DARK, fontWeight: '700' }]} numberOfLines={1}>{bookTitle(c.name)}</Text>
                  <Text style={styles.courseOptMeta}>{c.totalLessons ?? '?'} 节</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* 2. 学到第几节 */}
        <Text style={styles.stepLabel}>2 · 学多少?</Text>
        <View style={styles.rangeRow}>
          <Text style={styles.inlineText}>从第</Text>
          <Stepper value={fromN} onChange={(v) => setFromN(Math.min(v, toN))} min={1} max={total ?? 999} />
          <Text style={styles.inlineText}>节 到第</Text>
          <Stepper value={toN} onChange={(v) => setToN(Math.max(v, fromN))} min={1} max={total ?? 999} />
          <Text style={styles.inlineText}>节</Text>
        </View>
        {total ? <Text style={styles.hintTiny}>整门共 {total} 节;只排前半段就把"到第几节"调小。</Text> : null}

        {/* 3. 排进哪个学期 */}
        <Text style={[styles.stepLabel, { marginTop: 14 }]}>3 · 排进第几学期?</Text>
        <View style={styles.semRow}>
          <Text style={styles.inlineText}>第</Text>
          <Stepper value={semNum} onChange={(v) => { setSemNum(v); setStartWeekOverride(null); }} min={1} max={20} />
          <Text style={styles.inlineText}>学期</Text>
          <View style={styles.semNameWrap}>
            <SimpleInput value={semNameInput} onChangeText={setSemNameInput} placeholder={autoName} />
          </View>
        </View>
        <Text style={styles.hintTiny}>基础专业从第 1 学期起;加行 / 入行 / 净土等从第 2 学期起(留空用默认名)。</Text>

        {/* 4. 节奏 */}
        <View style={styles.paceRow}>
          <Text style={styles.stepLabelInline}>每周</Text>
          <Stepper value={perWeek} onChange={setPerWeek} min={1} max={10} testID={testIds.scheduling.perWeekStepper} />
          <Text style={styles.stepLabelInline}>节</Text>
          <Pressable onPress={() => setShowAdv((v) => !v)} hitSlop={6} style={{ marginLeft: 'auto' }}>
            <Text style={styles.advToggle}>{showAdv ? '收起' : '更多设置'}</Text>
          </Pressable>
        </View>
        {showAdv ? (
          <View style={styles.advBox}>
            <Text style={styles.inlineText}>从第</Text>
            <Stepper value={startWeek} onChange={setStartWeekOverride} min={1} max={200} />
            <Text style={styles.inlineText}>周开始排</Text>
            <Text style={styles.hintTiny}>  (默认接在本学期已排周之后)</Text>
          </View>
        ) : null}

        {/* 预览 */}
        {selected ? (
          <View style={styles.previewBox}>
            <Text style={styles.previewLabel}>将这样排:</Text>
            <Text style={styles.previewText}>
              {bookTitle(selected.name)}第 {fromN}–{toN} 节(共 {lessonCount} 节),每周 {perWeek} 节,
              排进「{semNameInput.trim() || autoName}」第 {startWeek}–{endWeek} 周。
            </Text>
          </View>
        ) : (
          <Text style={[styles.note, { marginTop: 12 }]}>先在上面选一门课。</Text>
        )}
      </ScrollView>
      <ModalActions>
        <AdminButton variant="negative" onPress={onClose} style={{ flex: 1 }}>取消</AdminButton>
        <AdminButton testID={testIds.scheduling.generateSubmitButton} variant="primary" disabled={!canSubmit} onPress={submit} style={{ flex: 1.4 }}>
          {gen.isPending ? '排课中…' : '确认排课'}
        </AdminButton>
      </ModalActions>
      <ModalFootnote>同学期里别的课和已设的放假周都会保留;对同一门课再排=按新设置重排。</ModalFootnote>
    </AdminModal>
  );
}

// 轻量内联输入(学期名,无标签)
function SimpleInput({ value, onChangeText, placeholder }: { value: string; onChangeText: (t: string) => void; placeholder?: string }) {
  return (
    <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={INK4} style={styles.semNameInput} />
  );
}

// ── 排自学读物(大学演讲整本挂连续周)弹窗 ──────────────────────────────
function SelfStudyModal({ program, onClose }: { program: AdminProgram; onClose: () => void }) {
  const { data: books = [], isLoading } = useSelfStudyBooks();
  const assign = useAssignSelfStudy();
  const [bookId, setBookId] = useState('');
  const [semNum, setSemNum] = useState(program.startSemester);
  const [semNameInput, setSemNameInput] = useState('');
  const [startWeek, setStartWeek] = useState(1);
  const [weekCount, setWeekCount] = useState(1);

  const selected = books.find((b) => b.id === bookId);
  const autoName = `${program.name}·第${semNum}学期`;
  const endWeek = startWeek + weekCount - 1;
  const canSubmit = !!bookId && semNum > 0 && startWeek > 0 && weekCount > 0 && !assign.isPending;

  const submit = () => {
    if (!canSubmit) return;
    assign.mutate(
      { programId: program.id, bookId, semesterNumber: semNum, semesterName: semNameInput.trim() || autoName, startWeek, weekCount },
      {
        onSuccess: () => { onClose(); notify('已排自学读物', `${bookTitle(selected?.title)}排进「${semNameInput.trim() || autoName}」第 ${startWeek}–${endWeek} 周。`); },
        onError: (e) => {
          const msg = (e as { message?: string })?.message ?? '请重试';
          const perm = /row-level security|42501|permission/i.test(msg);
          notify('排课失败', perm ? '没有排课权限(需系统管理员)。' : msg);
        },
      },
    );
  };

  return (
    <AdminModal visible onClose={onClose} title={`给「${program.name}」排自学读物`} dismissOnOverlay={false} maxWidth={520}>
      <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 440 }}>
        <Text style={styles.stepLabel}>1 · 哪本读物?</Text>
        {isLoading ? (
          <ActivityIndicator color={SAFFRON} style={{ marginVertical: 12 }} />
        ) : books.length === 0 ? (
          <Text style={styles.note}>暂无自学读物(大学演讲)。</Text>
        ) : (
          <View style={{ gap: 6, marginBottom: 14 }}>
            {books.map((b) => {
              const active = b.id === bookId;
              return (
                <Pressable key={b.id} testID={testIds.scheduling.selfStudyBookOption(b.id)} style={[styles.courseOpt, active && styles.courseOptActive]} onPress={() => setBookId(b.id)}>
                  <View style={[styles.radio, active && styles.radioOn]}>{active ? <View style={styles.radioDot} /> : null}</View>
                  <Text style={[styles.courseOptName, active && { color: SAFFRON_DARK, fontWeight: '700' }]} numberOfLines={1}>{bookTitle(b.title)}</Text>
                  <Text style={styles.courseOptMeta}>{b.articleCount} 篇</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <Text style={styles.stepLabel}>2 · 排进第几学期?</Text>
        <View style={styles.semRow}>
          <Text style={styles.inlineText}>第</Text>
          <Stepper value={semNum} onChange={setSemNum} min={1} max={20} />
          <Text style={styles.inlineText}>学期</Text>
          <View style={styles.semNameWrap}>
            <SimpleInput value={semNameInput} onChangeText={setSemNameInput} placeholder={autoName} />
          </View>
        </View>

        <Text style={[styles.stepLabel, { marginTop: 14 }]}>3 · 占哪几周?</Text>
        <View style={styles.rangeRow}>
          <Text style={styles.inlineText}>从第</Text>
          <Stepper value={startWeek} onChange={setStartWeek} min={1} max={200} />
          <Text style={styles.inlineText}>周起,占</Text>
          <Stepper value={weekCount} onChange={setWeekCount} min={1} max={52} testID={testIds.scheduling.selfStudyWeekCountStepper} />
          <Text style={styles.inlineText}>周</Text>
        </View>
        <Text style={styles.hintTiny}>整本读物挂在这几周(每周都标“本周读这本”);通常和课程同周,辅助阅读。</Text>

        {selected ? (
          <View style={styles.previewBox}>
            <Text style={styles.previewLabel}>将这样排:</Text>
            <Text style={styles.previewText}>{bookTitle(selected.title)}排进「{semNameInput.trim() || autoName}」第 {startWeek}–{endWeek} 周({weekCount} 周)。</Text>
          </View>
        ) : (
          <Text style={[styles.note, { marginTop: 12 }]}>先在上面选一本读物。</Text>
        )}
      </ScrollView>
      <ModalActions>
        <AdminButton variant="negative" onPress={onClose} style={{ flex: 1 }}>取消</AdminButton>
        <AdminButton testID={testIds.scheduling.selfStudySubmitButton} variant="primary" disabled={!canSubmit} onPress={submit} style={{ flex: 1.4 }}>{assign.isPending ? '排课中…' : '确认'}</AdminButton>
      </ModalActions>
      <ModalFootnote>同周已有的课程/读物保留;重复排同一本不会翻倍。</ModalFootnote>
    </AdminModal>
  );
}

export default function SchedulingIndex() {
  const { setTitle } = useAdminLayout();
  useEffect(() => { setTitle('排课管理'); }, [setTitle]);

  const { data: programs = [], isLoading: progLoading, error: progError } = useAdminPrograms();
  const [programId, setProgramId] = useState<string | null>(null);
  const [genOpen, setGenOpen] = useState(false);
  const [ssOpen, setSsOpen] = useState(false);

  const activeProgramId = programId ?? programs[0]?.id ?? null;
  const program = programs.find((p) => p.id === activeProgramId) ?? null;
  const { data: schedule = [], isLoading: schedLoading, error: schedError } = useProgramSchedule(activeProgramId ?? undefined);

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {progLoading ? (
          <View style={styles.center}><ActivityIndicator color={SAFFRON} /></View>
        ) : progError ? (
          <EmptyState>专业加载失败,请稍后重试</EmptyState>
        ) : programs.length === 0 ? (
          <EmptyState>暂无专业</EmptyState>
        ) : (
          <>
            <Text style={styles.pickHint}>选专业</Text>
            <View style={styles.progChips}>
              {programs.map((p) => {
                const active = p.id === activeProgramId;
                return (
                  <Pressable key={p.id} testID={testIds.scheduling.programOption(p.id)} style={[styles.progChip, active && styles.progChipActive]} onPress={() => setProgramId(p.id)}>
                    <Text style={[styles.progChipText, active && styles.progChipTextActive]} numberOfLines={1}>{p.name}</Text>
                  </Pressable>
                );
              })}
            </View>

            {program ? (
              <>
                <View style={styles.progInfoCard}>
                  <View style={{ flex: 1 }}>
                    <Text className="font-serif" style={styles.progName}>{program.name}</Text>
                    <Text style={styles.progMeta}>每学期 {program.weeksPerSemester} 周 · 排课从第 {program.startSemester} 学期起</Text>
                  </View>
                  <View style={{ gap: 6 }}>
                    <AdminButton testID={testIds.scheduling.generateButton} variant="primary" size="sm" onPress={() => setGenOpen(true)}>＋ 排课</AdminButton>
                    <AdminButton testID={testIds.scheduling.selfStudyButton} variant="secondary" size="sm" onPress={() => setSsOpen(true)}>＋ 自学读物</AdminButton>
                  </View>
                </View>

                {schedLoading ? (
                  <View style={styles.center}><ActivityIndicator color={SAFFRON} /></View>
                ) : schedError ? (
                  <EmptyState>课表加载失败,请稍后重试</EmptyState>
                ) : schedule.length === 0 ? (
                  <View style={styles.emptyBox}>
                    <Text style={styles.emptyTitle}>「{program.name}」还没有排课</Text>
                    <Text style={styles.emptyDesc}>点右上「＋ 排课」:选一门课、设学到第几节,就自动按周排好。{'\n'}教务给的排课表也先这样排,再逐周微调即可。</Text>
                    <AdminButton variant="primary" size="sm" onPress={() => setGenOpen(true)} style={{ marginTop: 4 }}>＋ 开始排课</AdminButton>
                  </View>
                ) : (
                  schedule.map((s) => <SemesterCard key={s.id} semester={s} programId={program.id} />)
                )}
              </>
            ) : null}
          </>
        )}
      </ScrollView>

      {genOpen && program ? <GenerateModal program={program} semesters={schedule} onClose={() => setGenOpen(false)} /> : null}
      {ssOpen && program ? <SelfStudyModal program={program} onClose={() => setSsOpen(false)} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SCREEN_BG },
  scroll: { padding: 16, gap: 12, paddingBottom: 48 },
  center: { paddingVertical: 40, alignItems: 'center' },
  // 选专业
  pickHint: { fontSize: 12, color: INK3, fontWeight: '600', letterSpacing: 1 },
  progChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  progChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 9999, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(43,34,24,0.1)' },
  progChipActive: { backgroundColor: SAFFRON, borderColor: SAFFRON },
  progChipText: { fontSize: 13, color: INK2, fontWeight: '500', maxWidth: 160 },
  progChipTextActive: { color: '#fff', fontWeight: '700' },
  // 专业信息卡
  progInfoCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)', marginTop: 2 },
  progName: { fontSize: 17, fontWeight: '700', color: INK },
  progMeta: { fontSize: 12, color: INK3, marginTop: 3 },
  // 空态
  emptyBox: { backgroundColor: '#fff', borderRadius: 14, padding: 24, alignItems: 'center', gap: 10, borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)' },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: INK },
  emptyDesc: { fontSize: 13, color: INK3, textAlign: 'center', lineHeight: 20 },
  // 学期卡头
  semHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  semTitle: { fontSize: 16, fontWeight: '700', color: INK },
  semSub: { fontSize: 12, color: INK3, marginTop: 3 },
  // 周行
  weekRow: { borderWidth: 1, borderColor: 'rgba(43,34,24,0.07)', borderRadius: 10, padding: 10, gap: 6, backgroundColor: '#fdfbf7' },
  weekRowHoliday: { backgroundColor: GOLD_PALE_BG, borderColor: 'rgba(176,141,46,0.25)' },
  weekHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  weekNum: { fontSize: 13, fontWeight: '700', color: INK2 },
  weekEmpty: { fontSize: 12, color: INK4 },
  holidayBtn: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 9999, borderWidth: 1, borderColor: 'rgba(43,34,24,0.14)' },
  holidayBtnOn: { backgroundColor: '#f3e2b8', borderColor: 'rgba(176,141,46,0.4)' },
  holidayBtnText: { fontSize: 11, color: INK3, fontWeight: '600' },
  holidayBtnTextOn: { color: '#8a6d1e' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  lessonChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(43,34,24,0.12)', borderRadius: 8, paddingLeft: 9, paddingRight: 5, paddingVertical: 5, maxWidth: '100%' },
  lessonChipNum: { fontSize: 12, fontWeight: '700', color: SAFFRON_DARK },
  lessonChipTitle: { fontSize: 12, color: INK2, maxWidth: 170 },
  lessonChipDel: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(43,34,24,0.06)' },
  lessonChipDelText: { fontSize: 13, color: INK3, fontWeight: '700', lineHeight: 15 },
  bookChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#eef4f1', borderWidth: 1, borderColor: 'rgba(58,123,110,0.25)', borderRadius: 8, paddingLeft: 8, paddingRight: 5, paddingVertical: 5, maxWidth: '100%' },
  bookChipTag: { fontSize: 10, fontWeight: '700', color: '#3a7b6e', backgroundColor: '#dcebe6', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  bookChipTitle: { fontSize: 12, color: INK2, maxWidth: 160 },
  // 生成弹窗
  stepLabel: { fontSize: 14, fontWeight: '700', color: INK, marginBottom: 8 },
  stepLabelInline: { fontSize: 14, fontWeight: '700', color: INK },
  courseOpt: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: '#faf6f0', borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)' },
  courseOptActive: { borderColor: SAFFRON, backgroundColor: '#fdf2ec' },
  courseOptName: { fontSize: 14, color: INK, flex: 1 },
  courseOptMeta: { fontSize: 12, color: INK3 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: 'rgba(43,34,24,0.25)', alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: SAFFRON },
  radioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: SAFFRON },
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  semRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  inlineText: { fontSize: 14, color: INK2 },
  hintTiny: { fontSize: 11, color: INK4, marginTop: 6, lineHeight: 16 },
  semNameWrap: { flex: 1, minWidth: 120 },
  semNameInput: { backgroundColor: '#faf6f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, fontSize: 13, color: INK, borderWidth: 1, borderColor: 'rgba(43,34,24,0.1)' },
  paceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  advToggle: { fontSize: 12, color: SAFFRON_DARK, fontWeight: '600' },
  advBox: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginTop: 8, padding: 10, backgroundColor: '#faf6f0', borderRadius: 10 },
  previewBox: { marginTop: 16, padding: 12, borderRadius: 10, backgroundColor: '#f1f6f3', borderWidth: 1, borderColor: 'rgba(77,110,61,0.18)' },
  previewLabel: { fontSize: 11, color: '#4d6e3d', fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
  previewText: { fontSize: 13.5, color: INK, lineHeight: 21 },
  note: { fontSize: 12, color: INK3, lineHeight: 18 },
  // 步进器
  stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 9, borderWidth: 1, borderColor: 'rgba(43,34,24,0.15)' },
  stepBtn: { width: 30, height: 32, alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { fontSize: 17, color: SAFFRON_DARK, fontWeight: '700' },
  stepVal: { minWidth: 30, textAlign: 'center', fontSize: 15, fontWeight: '700', color: INK },
});
