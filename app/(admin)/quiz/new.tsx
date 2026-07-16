import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { QuestionPayloadEditor, isPayloadComplete } from '@/components/admin/question-payload-editor';
import { AdminButton, DetailHeader, SCREEN_BG } from '@/components/ui/admin-kit';
import { Text } from '@/components/ui/text';
import { useCreateQuestion, useUpsertQuestionReference, type QuestionPayload, type QuestionType } from '@/lib/queries/admin/quiz';
import { useCourseDetail, useCourses } from '@/lib/queries/courses';
import { testIds } from '@/lib/testids';
import { GOLD_DARK as GOLD, GOLD_PALE, INK, INK3, INK4, SAFFRON, SAFFRON_DARK } from '@/lib/theme';
import { useAdminLayout } from '../_layout';

const TYPES: { k: QuestionType; label: string }[] = [
  { k: 'open', label: '问答' }, { k: 'single', label: '单选' }, { k: 'judge', label: '判断' },
  { k: 'fill', label: '填空' }, { k: 'flip', label: '记忆卡' }, { k: 'verse', label: '颂词组句' }, { k: 'chain', label: '颂词续接' },
];

// 新建思考题(决策082/083)。v1 聚焦【问答题 open】:选课→选节→题干→(可选)参考答案。
// 客观题(单选/填空/翻卡/颂词/联想)的选项/答案 payload 编辑器后续单独做。
export default function NewQuestion() {
  const router = useRouter();
  const { setTitle } = useAdminLayout();
  useEffect(() => { setTitle('新建题目'); }, [setTitle]);

  const { data: courses = [], error: coursesError } = useCourses();
  const [courseId, setCourseId] = useState<string | null>(null);
  const { data: course, error: courseError } = useCourseDetail(courseId ?? undefined);
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [courseOpen, setCourseOpen] = useState(false);
  const [lessonOpen, setLessonOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [reference, setReference] = useState('');
  const [type, setType] = useState<QuestionType>('open');
  const [payload, setPayload] = useState<QuestionPayload>({});

  const createQuestion = useCreateQuestion();
  const upsertRef = useUpsertQuestionReference();

  const courseName = courses.find((c) => c.id === courseId)?.name ?? null;
  const lesson = course?.lessons.find((l) => l.id === lessonId) ?? null;
  const payloadOk = type === 'open' || isPayloadComplete(type, payload);
  const canCreate = !!lessonId && !!prompt.trim() && payloadOk && !createQuestion.isPending;

  const onCreate = () => {
    if (!lessonId || !prompt.trim() || !payloadOk) return;
    createQuestion.mutate(
      { lessonId, prompt, questionType: type, payload: type === 'open' ? null : payload },
      {
        onSuccess: async (qid) => {
          if (reference.trim()) await upsertRef.mutateAsync({ questionId: qid, referenceText: reference });
          router.replace(`/(admin)/quiz/${qid}` as never);
        },
      },
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <DetailHeader title="新建题目" onBack={() => router.back()} backLabel="题库" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.notice}><Text style={styles.noticeText}>v1 支持「问答题」(题干 + 参考答案)。客观题(单选/填空等)的选项编辑器后续。</Text></View>

        {/* 课程 */}
        <Text style={styles.label}>课程</Text>
        {coursesError ? <Text style={styles.errText}>课程列表加载失败,请检查网络后重试</Text> : null}
        <Pressable testID={testIds.quiz.coursePickerTrigger} style={styles.picker} onPress={() => setCourseOpen((o) => !o)}>
          <Text style={[styles.pickerText, { color: courseName ? INK : INK4 }]} numberOfLines={1}>{courseName ?? '选择课程'}</Text>
          <Text style={styles.caret}>{courseOpen ? '∨' : '›'}</Text>
        </Pressable>
        {courseOpen ? (
          <View style={styles.dropdown}>
            <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled>
              {courses.map((c) => (
                <Pressable key={c.id} testID={testIds.quiz.courseOption(c.id)} style={styles.option} onPress={() => { setCourseId(c.id); setLessonId(null); setCourseOpen(false); }}>
                  <Text style={{ color: INK }}>{c.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* 节次 */}
        {courseId ? (
          <>
            <Text style={styles.label}>节次</Text>
            {courseError ? <Text style={styles.errText}>节次加载失败,请检查网络后重试</Text> : null}
            <Pressable testID={testIds.quiz.lessonPickerTrigger} style={styles.picker} onPress={() => setLessonOpen((o) => !o)}>
              <Text style={[styles.pickerText, { color: lesson ? INK : INK4 }]} numberOfLines={1}>{lesson ? `第${lesson.lessonNumber}课 · ${lesson.title}` : '选择节次'}</Text>
              <Text style={styles.caret}>{lessonOpen ? '∨' : '›'}</Text>
            </Pressable>
            {lessonOpen ? (
              <View style={styles.dropdown}>
                <ScrollView style={{ maxHeight: 260 }} nestedScrollEnabled>
                  {(course?.lessons ?? []).map((l) => (
                    <Pressable key={l.id} testID={testIds.quiz.lessonOption(l.id)} style={styles.option} onPress={() => { setLessonId(l.id); setLessonOpen(false); }}>
                      <Text style={{ color: INK }}>第{l.lessonNumber}课 · {l.title}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}
          </>
        ) : null}

        {/* 题型 */}
        <Text style={styles.label}>题型</Text>
        <View style={styles.typeRow}>
          {TYPES.map((t) => (
            <Pressable key={t.k} onPress={() => { setType(t.k); setPayload({}); }} style={[styles.typeChip, type === t.k && styles.typeChipOn]}>
              <Text style={{ fontSize: 13, color: type === t.k ? '#fff' : INK3, fontWeight: '600' }}>{t.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* 题干 */}
        <Text style={styles.label}>题目</Text>
        <TextInput testID={testIds.quiz.promptInput} style={styles.textarea} multiline value={prompt} onChangeText={setPrompt} placeholder="输入思考题题干…" placeholderTextColor={INK4} textAlignVertical="top" />

        {/* 客观题选项/答案编辑器 */}
        {type !== 'open' ? <QuestionPayloadEditor type={type} initial={payload} onChange={setPayload} /> : null}

        {/* 参考答案 */}
        <Text style={styles.label}>{type === 'open' ? '参考答案(可选 · 仅 admin/辅导员可见)' : '解析/参考(可选)'}</Text>
        <TextInput testID={testIds.quiz.referenceInput} style={styles.textarea} multiline value={reference} onChangeText={setReference} placeholder="可留空,稍后在题目页补充…" placeholderTextColor={INK4} textAlignVertical="top" />

        <AdminButton testID={testIds.quiz.createButton} variant="primary" onPress={onCreate} disabled={!canCreate} style={{ marginTop: 8 }}>
          {createQuestion.isPending ? '创建中…' : '创建题目'}
        </AdminButton>
        {!lessonId ? <Text style={styles.hint}>请先选择课程和节次</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SCREEN_BG },
  scroll: { padding: 20, gap: 8, paddingBottom: 60 },
  notice: { backgroundColor: GOLD_PALE, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: GOLD + '33', marginBottom: 4 },
  noticeText: { fontSize: 12, color: GOLD, lineHeight: 18 },
  label: { fontSize: 13, fontWeight: '700', color: INK3, marginTop: 10 },
  picker: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: 'rgba(43,34,24,0.12)' },
  pickerText: { flex: 1, fontSize: 14 },
  caret: { fontSize: 16, color: INK4 },
  dropdown: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(43,34,24,0.12)', overflow: 'hidden' },
  option: { paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: 'rgba(43,34,24,0.06)' },
  textarea: { backgroundColor: '#fff', borderRadius: 10, padding: 14, fontSize: 15, color: INK, minHeight: 96, borderWidth: 1, borderColor: 'rgba(43,34,24,0.12)' },
  hint: { fontSize: 12, color: INK4, textAlign: 'center', marginTop: 6 },
  errText: { fontSize: 12, color: '#a13c2e', fontWeight: '600', marginTop: -2 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9999, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(43,34,24,0.14)' },
  typeChipOn: { backgroundColor: SAFFRON, borderColor: SAFFRON_DARK },
});
