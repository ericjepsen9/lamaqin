import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AdminButton,
  Badge,
  DetailHeader,
  SCREEN_BG,
  type BadgeTone,
} from '@/components/ui/admin-kit';
import { QuestionPayloadEditor, isPayloadComplete } from '@/components/admin/question-payload-editor';
import { Text } from '@/components/ui/text';
import { QUIZ_TEXT_MAX_LENGTH } from '@/lib/admin-thresholds';
import { useCurrentUser } from '@/lib/queries/profile';
import { confirmAsync, notify } from '@/lib/dialog';
import { useAdminQuestion,
  useQuestionResponses, useDeleteQuestion, useUpdateQuestion, useUpsertQuestionReference, type QuestionPayload, type QuestionType } from '@/lib/queries/admin/quiz';
import { testIds } from '@/lib/testids';
import { GOLD_DARK as GOLD, GOLD_PALE, INK, INK2, INK3, INK4 } from '@/lib/theme';
import { useAdminLayout } from '../_layout';

const TYPE_LABEL: Record<QuestionType, string> = {
  open: '问答题', single: '单选题', judge: '判断题', fill: '填空题', flip: '翻卡题', verse: '颂词题', chain: '联想题',
};
// 题型分类色 → kit BadgeTone（7 色：联想 chain 用 teal 与单选 sage 区分）
const TYPE_TONE: Record<QuestionType, BadgeTone> = {
  open: 'neutral', single: 'sage', judge: 'gold', fill: 'saffron', flip: 'violet', verse: 'crimson', chain: 'teal',
};

export default function QuestionDetail() {
  const { questionId } = useLocalSearchParams<{ questionId: string }>();
  const router = useRouter();
  const { setTitle } = useAdminLayout();
  const { data: q, isLoading, isError } = useAdminQuestion(questionId);
  const updateQuestion = useUpdateQuestion();
  const upsertRef = useUpsertQuestionReference();
  const deleteQuestion = useDeleteQuestion();

  const [editingRef, setEditingRef] = useState(false);
  const [refText, setRefText] = useState('');
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [promptText, setPromptText] = useState('');
  const [editingPayload, setEditingPayload] = useState(false);
  const [payloadDraft, setPayloadDraft] = useState<QuestionPayload>({});
  const isAdmin = useCurrentUser().data?.role === 'admin'; // 审计 P1:原写死 true,接真 role(RLS 仍兜底)
  const { data: responses = [] } = useQuestionResponses(questionId);
  const [respExpanded, setRespExpanded] = useState(false);

  // 渲染期间比对上一次的q(react-hooks/set-state-in-effect·2026-07-17 lint债清理)
  const [prevQ, setPrevQ] = useState(q);
  if (q !== prevQ) {
    setPrevQ(q);
    if (q) { setRefText(q.referenceText ?? ''); setPromptText(q.prompt); setPayloadDraft(q.payload ?? {}); }
  }
  useEffect(() => { if (q) setTitle(`Q${q.questionNumber} · ${q.lessonTitle}`); }, [setTitle, q]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.root} edges={['bottom']}>
        <DetailHeader title="题目" onBack={() => router.back()} backLabel="题库" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={GOLD} /></View>
      </SafeAreaView>
    );
  }
  if (isError) {
    return (
      <SafeAreaView style={styles.root} edges={['bottom']}>
        <DetailHeader title="题目" onBack={() => router.back()} backLabel="题库" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: INK3 }}>加载失败,请检查网络后重试(不代表题目不存在)</Text></View>
      </SafeAreaView>
    );
  }
  if (!q) {
    return (
      <SafeAreaView style={styles.root} edges={['bottom']}>
        <DetailHeader title="题目" onBack={() => router.back()} backLabel="题库" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: INK3 }}>题目不存在</Text></View>
      </SafeAreaView>
    );
  }

  const savePrompt = () => updateQuestion.mutate(
    { id: q.id, prompt: promptText },
    { onSuccess: () => setEditingPrompt(false), onError: (e) => notify('保存失败', (e as Error)?.message ?? '请重试') },
  );
  const savePayload = () => updateQuestion.mutate(
    { id: q.id, payload: payloadDraft },
    { onSuccess: () => setEditingPayload(false), onError: (e) => notify('保存失败', (e as Error)?.message ?? '请重试') },
  );
  const handleSaveRef = () => upsertRef.mutate(
    { questionId: q.id, referenceText: refText },
    { onSuccess: () => setEditingRef(false), onError: (e) => notify('保存失败', (e as Error)?.message ?? '请重试') },
  );
  const onDelete = async () => {
    const ok = await confirmAsync('删除题目', '确定删除这道题?师兄对它的作答记录也会一并删除,不可恢复。', '删除');
    if (!ok) return;
    deleteQuestion.mutate(q.id, { onSuccess: () => router.back(), onError: (e) => notify('删除失败', (e as Error)?.message ?? '请重试') });
  };

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <DetailHeader title={`Q${q.questionNumber} · ${q.lessonTitle}`} onBack={() => router.back()} backLabel="题库" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* 题目信息 */}
        <View style={styles.questionCard}>
          <View style={styles.qMeta}>
            <View style={styles.qNumRow}>
              <View style={styles.qNumBox}>
                <Text className="font-serif" style={styles.qNumText}>Q{q.questionNumber}</Text>
              </View>
              <Badge tone={TYPE_TONE[q.questionType]}>{TYPE_LABEL[q.questionType]}</Badge>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.breadcrumb}>{q.courseName} · 第{q.lessonNumber}节 · {q.lessonTitle}</Text>
            </View>
            {isAdmin && (
              <AdminButton testID={testIds.quiz.editPromptButton} variant="secondary" size="sm" onPress={() => (editingPrompt ? savePrompt() : setEditingPrompt(true))}>
                {editingPrompt ? '保存' : '编辑题目'}
              </AdminButton>
            )}
          </View>

          {editingPrompt && isAdmin ? (
            <TextInput
              testID={testIds.quiz.promptEditInput}
              style={styles.promptEditor}
              multiline
              value={promptText}
              onChangeText={setPromptText}
              placeholderTextColor={INK4}
              textAlignVertical="top"
              maxLength={QUIZ_TEXT_MAX_LENGTH}
            />
          ) : (
            <Text style={styles.prompt}>{q.prompt}</Text>
          )}

          {q.sourceHint && (
            <View style={styles.sourceRow}>
              <Text style={styles.sourceLabel}>来源：</Text>
              <Text style={styles.sourceText}>{q.sourceHint}</Text>
            </View>
          )}

          <View style={styles.responseRow}>
            <Text style={styles.responseCount}>{q.responseCount} 位师兄已作答</Text>
          </View>
        </View>

        {/* 选项 / 答案(客观题)*/}
        {q.questionType !== 'open' ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text className="font-serif" style={styles.sectionTitle}>选项 / 答案</Text>
              {isAdmin ? (
                <AdminButton
                  variant={editingPayload ? 'primary' : 'secondary'}
                  size="sm"
                  onPress={() => (editingPayload ? savePayload() : setEditingPayload(true))}
                  disabled={editingPayload && !isPayloadComplete(q.questionType, payloadDraft)}
                >
                  {editingPayload ? '保存' : '编辑选项'}
                </AdminButton>
              ) : null}
            </View>
            {editingPayload ? (
              <QuestionPayloadEditor type={q.questionType} initial={q.payload ?? {}} onChange={setPayloadDraft} />
            ) : (
              <PayloadSummary type={q.questionType} payload={q.payload} />
            )}
          </View>
        ) : null}

        {/* 参考答案 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text className="font-serif" style={styles.sectionTitle}>参考答案</Text>
            {q.hasReference && (
              <Text style={styles.publishedAt}>发布于 {q.referencePublishedAt}</Text>
            )}
            {isAdmin && (
              <AdminButton
                testID={testIds.quiz.editReferenceButton}
                variant={editingRef ? 'negative' : 'secondary'}
                size="sm"
                onPress={() => setEditingRef(v => !v)}
              >
                {editingRef ? '取消' : q.hasReference ? '修改答案' : '添加答案'}
              </AdminButton>
            )}
          </View>

          <View style={styles.refNotice}>
            <Text style={styles.refNoticeText}>仅 admin 可修改 · 辅导员只读 · 师兄提交答案后才可见</Text>
          </View>

          {editingRef ? (
            <View style={styles.refEditor}>
              <TextInput
                testID={testIds.quiz.referenceEditInput}
                style={styles.refTextarea}
                multiline
                numberOfLines={6}
                value={refText}
                onChangeText={setRefText}
                placeholder="输入参考答案…"
                placeholderTextColor={INK4}
                textAlignVertical="top"
                maxLength={QUIZ_TEXT_MAX_LENGTH}
              />
              <AdminButton
                testID={testIds.quiz.saveReferenceButton}
                variant="primary"
                onPress={handleSaveRef}
                disabled={!refText.trim()}
                style={styles.saveRefBtn}
              >
                保存参考答案
              </AdminButton>
            </View>
          ) : q.hasReference ? (
            <View style={styles.refContent}>
              <Text style={styles.refText}>{q.referenceText}</Text>
            </View>
          ) : (
            <View style={styles.refEmpty}>
              <Text style={styles.refEmptyText}>暂无参考答案</Text>
              {isAdmin && (
                <AdminButton variant="primary" onPress={() => setEditingRef(true)}>
                  ＋ 添加参考答案
                </AdminButton>
              )}
            </View>
          )}
        </View>

        {/* 作答情况(审计 P2:补查看器——原来只有计数,文案却称"可查看") */}
        <View style={styles.section}>
          <Text className="font-serif" style={styles.sectionTitle}>作答情况</Text>
          <View style={styles.responseStats}>
            <View style={styles.responseStatItem}>
              <Text className="font-serif" style={styles.responseStatNum}>{q.responseCount}</Text>
              <Text style={styles.responseStatLabel}>已作答师兄</Text>
            </View>
          </View>
          {responses.length > 0 ? (
            <View style={{ gap: 8, marginTop: 10 }}>
              {(respExpanded ? responses : responses.slice(0, 5)).map((r) => (
                <View key={r.id} style={styles.respRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={styles.respUser}>{r.userName}</Text>
                    <Text style={styles.respTime}>{r.updatedAt ? r.updatedAt.replace('T', ' ').slice(0, 16) : ''}</Text>
                  </View>
                  <Text style={styles.respText}>{r.answerText || '(空)'}</Text>
                </View>
              ))}
              {responses.length > 5 ? (
                <AdminButton variant="secondary" size="sm" onPress={() => setRespExpanded((v) => !v)}>
                  {respExpanded ? '收起' : `展开全部 ${responses.length} 条`}
                </AdminButton>
              ) : null}
            </View>
          ) : null}
          <Text style={styles.responseNote}>仅 admin 和辅导员可查看师兄作答(辅导员只读、按人去重取最新)。</Text>
        </View>

        {/* 删除 */}
        {isAdmin && (
          <AdminButton testID={testIds.quiz.deleteButton} variant="negative" onPress={onDelete} disabled={deleteQuestion.isPending}>删除题目</AdminButton>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

// 客观题 payload 只读摘要(非编辑态)
function PayloadSummary({ type, payload }: { type: QuestionType; payload: QuestionPayload | null }) {
  const p = payload ?? {};
  if (type === 'single') {
    const opts = p.options ?? [];
    return (
      <View style={{ gap: 6 }}>
        {opts.map((o, i) => (
          <Text key={`${o}-${i}`} style={[styles.refText, o === p.answer && { color: '#4f7a64', fontWeight: '700' }]}>{o === p.answer ? '✓ ' : '· '}{o}</Text>
        ))}
        {opts.length === 0 ? <Text style={styles.refEmptyText}>暂无选项,点「编辑选项」补充</Text> : null}
      </View>
    );
  }
  if (type === 'judge' || type === 'fill') return <Text style={styles.refText}>正确答案:{p.answer || '(未设置)'}</Text>;
  if (type === 'flip') return <Text style={styles.refText}>背面/答案:{p.back || '(未设置)'}</Text>;
  if (type === 'verse' || type === 'chain') {
    return (
      <View style={{ gap: 6 }}>
        {type === 'chain' && p.previousLine ? <Text style={styles.refText}>上一句:{p.previousLine}</Text> : null}
        {type === 'verse' && p.hint ? <Text style={styles.refText}>上文:{p.hint}</Text> : null}
        <Text style={styles.refText}>正确顺序:{(p.tokens ?? []).join(' / ') || '(未设置)'}</Text>
        {(p.distractors ?? []).length ? <Text style={styles.refText}>干扰词:{(p.distractors ?? []).join(' / ')}</Text> : null}
      </View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  respRow: { backgroundColor: 'rgba(43,34,24,0.03)', borderRadius: 10, padding: 12, gap: 4 },
  respUser: { fontSize: 12, fontWeight: '700', color: '#55463a' },
  respTime: { fontSize: 10, color: '#b5a99a' },
  respText: { fontSize: 13, color: '#2b2218', lineHeight: 20 },
  root: { flex: 1, backgroundColor: SCREEN_BG },
  scroll: { padding: 20, gap: 14, paddingBottom: 40 },

  questionCard: { backgroundColor: '#fff', borderRadius: 18, padding: 20, gap: 14, borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)', shadowColor: '#2b2218', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 2 },
  qMeta: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  qNumRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qNumBox: { width: 36, height: 36, borderRadius: 10, backgroundColor: GOLD_PALE, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: GOLD + '33' },
  qNumText: { fontSize: 14, fontWeight: '700', color: GOLD },
  breadcrumb: { fontSize: 11, color: INK4, lineHeight: 18 },
  prompt: { fontSize: 16, color: INK, lineHeight: 26, fontWeight: '500' },
  promptEditor: { fontSize: 15, color: INK, lineHeight: 24, borderWidth: 1, borderColor: 'rgba(43,34,24,0.15)', borderRadius: 10, padding: 12, minHeight: 80 },
  sourceRow: { flexDirection: 'row', alignItems: 'center' },
  sourceLabel: { fontSize: 11, color: INK4 },
  sourceText: { fontSize: 11, color: INK3 },
  responseRow: {},
  responseCount: { fontSize: 11, color: INK4 },

  section: { backgroundColor: '#fff', borderRadius: 16, padding: 18, gap: 12, borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: INK, flex: 1 },
  publishedAt: { fontSize: 11, color: INK4 },

  refNotice: { backgroundColor: GOLD_PALE, borderRadius: 8, padding: 10, borderWidth: 1, borderColor: GOLD + '33' },
  refNoticeText: { fontSize: 11, color: INK3 },

  refContent: { backgroundColor: '#f7f2ec', borderRadius: 12, padding: 14 },
  refText: { fontSize: 14, color: INK2, lineHeight: 24 },

  refEditor: { gap: 10 },
  refTextarea: { backgroundColor: '#f7f2ec', borderRadius: 10, padding: 14, fontSize: 14, color: INK, minHeight: 120, borderWidth: 1, borderColor: 'rgba(43,34,24,0.10)' },
  saveRefBtn: { paddingVertical: 12 },

  refEmpty: { alignItems: 'center', gap: 12, paddingVertical: 16 },
  refEmptyText: { fontSize: 13, color: INK4 },

  responseStats: { flexDirection: 'row', alignItems: 'center' },
  responseStatItem: { flex: 1, alignItems: 'center', gap: 4 },
  responseStatNum: { fontSize: 24, fontWeight: '700', color: INK },
  responseStatLabel: { fontSize: 11, color: INK3 },
  responseStatDivider: { width: 1, height: 32, backgroundColor: 'rgba(43,34,24,0.08)' },
  responseNote: { fontSize: 11, color: INK4, lineHeight: 17 },
});
