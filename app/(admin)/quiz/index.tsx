import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AdminButton,
  Badge,
  FilterChips,
  SCREEN_BG,
  SearchBar,
  StatCard,
  type BadgeTone,
  ErrorState,
} from '@/components/ui/admin-kit';
import { Text } from '@/components/ui/text';
import { confirmAsync, notify } from '@/lib/dialog';
import { useAdminQuestions, useExtractQuestionsFromBlocks, type AdminQuestion, type QuestionType } from '@/lib/queries/admin/quiz';
import { testIds } from '@/lib/testids';
import { GOLD_DARK as GOLD, GOLD_PALE, INK, INK3, INK4, SAFFRON_DARK, SAGE_DARK } from '@/lib/theme';
import { useAdminLayout } from '../_layout';

const TYPE_LABEL: Record<QuestionType, string> = {
  open: '问答', single: '单选', judge: '判断', fill: '填空', flip: '翻卡', verse: '颂词', chain: '联想',
};
// 题型分类色 → kit BadgeTone（7 色：联想 chain 用 teal 与单选 sage 区分）
const TYPE_TONE: Record<QuestionType, BadgeTone> = {
  open: 'neutral', single: 'sage', judge: 'gold', fill: 'saffron', flip: 'violet', verse: 'crimson', chain: 'teal',
};

type FilterType = 'all' | QuestionType | 'no_ref';

export default function QuizList() {
  const router = useRouter();
  const { setTitle } = useAdminLayout();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [expandedLesson, setExpandedLesson] = useState<string | null>(null);
  const { data: questions = [], isLoading, error } = useAdminQuestions();
  const extract = useExtractQuestionsFromBlocks();

  useEffect(() => { setTitle('题库'); }, [setTitle]);

  const onExtract = async () => {
    const ok = await confirmAsync('从讲记提取思考题', '扫描全部讲记的「思考题」块,批量导入题库为问答题(已存在的自动跳过,可重复运行)。', '提取');
    if (!ok) return;
    extract.mutate(undefined, {
      onSuccess: (r) => notify('完成', r.created > 0 ? `已导入 ${r.created} 道思考题` : '没有新的思考题(都已在题库)'),
      onError: (e) => {
        const err = e as { message?: string; code?: string };
        const perm = err.code === '42501' || /row-level security|policy/i.test(err.message ?? '');
        notify('提取失败', perm
          ? '当前账号没有题库写入权限(题库写入仅限「系统管理员」)。需把预览登录的账号加入数据库 system_admins 表后重试。'
          : (err.message ?? String(e)));
      },
    });
  };

  const filtered = questions.filter(q => {
    if (filter === 'no_ref' && q.hasReference) return false;
    if (filter !== 'all' && filter !== 'no_ref' && q.questionType !== filter) return false;
    if (search) return q.prompt.includes(search) || q.lessonTitle.includes(search) || q.courseName.includes(search);
    return true;
  });

  const noRefCount = questions.filter(q => !q.hasReference).length;

  const filterTabs: { key: FilterType; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'no_ref', label: `待补充 ${noRefCount}` },
    { key: 'open', label: '问答' },
    { key: 'single', label: '单选' },
    { key: 'judge', label: '判断' },
    { key: 'fill', label: '填空' },
    { key: 'verse', label: '颂词' },
    { key: 'flip', label: '翻卡' },
    { key: 'chain', label: '联想' },
  ];

  // Group by lesson
  const lessonMap = new Map<string, { lessonId: string; lessonNumber: number; lessonTitle: string; courseName: string; questions: AdminQuestion[] }>();
  for (const q of filtered) {
    if (!lessonMap.has(q.lessonId)) {
      lessonMap.set(q.lessonId, { lessonId: q.lessonId, lessonNumber: q.lessonNumber, lessonTitle: q.lessonTitle, courseName: q.courseName, questions: [] });
    }
    lessonMap.get(q.lessonId)!.questions.push(q);
  }
  const lessonGroups = Array.from(lessonMap.values());

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* 新建 / 从讲记提取 */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><AdminButton variant="primary" onPress={() => router.push('/(admin)/quiz/new' as never)}>＋ 新建题目</AdminButton></View>
          <View style={{ flex: 1 }}><AdminButton testID={testIds.quiz.extractButton} variant="secondary" onPress={onExtract} disabled={extract.isPending}>{extract.isPending ? '提取中…' : '从讲记提取'}</AdminButton></View>
        </View>

        {/* 统计 */}
        <View style={styles.statsRow}>
          <StatCard label="总题目" value={questions.length} accent={INK} variant="tint" />
          <StatCard label="有参考答案" value={questions.filter(q => q.hasReference).length} accent={SAGE_DARK} variant="tint" />
          <StatCard label="待补充答案" value={noRefCount} accent={SAFFRON_DARK} variant="tint" />
          <StatCard label="涉及节次" value={new Set(questions.map(q => q.lessonId)).size} accent={GOLD} variant="tint" />
        </View>

        {/* 说明 */}
        <View style={styles.noticeBanner}>
          <Text style={styles.noticeText}>参考答案全局唯一（每题一份，所有班共用）。仅 admin 可修改参考答案；辅导员只读，师兄需提交答案后才能查看。</Text>
        </View>

        {/* 筛选 */}
        <FilterChips items={filterTabs} value={filter} onChange={setFilter} />

        {/* 搜索 */}
        <SearchBar value={search} onChangeText={setSearch} placeholder="搜索题目、节次或课程名…" style={styles.searchBar} />

        {/* 题目列表（按节次分组） */}
        {lessonGroups.map(group => (
          <View key={group.lessonId} style={styles.lessonGroup}>
            <Pressable
              testID={testIds.quiz.lessonGroupHeader(group.lessonId)}
              style={styles.lessonGroupHeader}
              onPress={() => setExpandedLesson(expandedLesson === group.lessonId ? null : group.lessonId)}
            >
              <View style={styles.lessonNumBox}>
                <Text className="font-serif" style={styles.lessonNum}>{group.lessonNumber}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.lessonTitle}>{group.lessonTitle}</Text>
                <Text style={styles.lessonCourse}>{group.courseName}</Text>
              </View>
              <Text style={styles.lessonCount}>{group.questions.length} 题</Text>
              <Text style={styles.chevron}>{expandedLesson === group.lessonId ? '∨' : '›'}</Text>
            </Pressable>

            {(expandedLesson === group.lessonId || search.length > 0) && group.questions.map((q, i) => (
              <Pressable
                key={q.id}
                testID={testIds.quiz.questionRow(q.id)}
                style={[styles.questionRow, i === group.questions.length - 1 && { borderBottomWidth: 0 }]}
                onPress={() => router.push(`/(admin)/quiz/${q.id}` as never)}
              >
                <View style={styles.qNumBox}>
                  <Text style={styles.qNum}>Q{q.questionNumber}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.qPrompt} numberOfLines={2}>{q.prompt}</Text>
                  {q.sourceHint && <Text style={styles.qHint}>{q.sourceHint}</Text>}
                </View>
                <View style={styles.qRight}>
                  <Badge tone={TYPE_TONE[q.questionType]}>{TYPE_LABEL[q.questionType]}</Badge>
                  <Badge tone={q.hasReference ? 'sage' : 'saffron'}>{q.hasReference ? '有答案' : '待补充'}</Badge>
                </View>
              </Pressable>
            ))}
          </View>
        ))}

        {error ? <ErrorState /> : isLoading ? (
          <View style={{ paddingVertical: 32, alignItems: 'center' }}><ActivityIndicator color={GOLD} /></View>
        ) : lessonGroups.length === 0 ? (
          <Text style={styles.emptyText}>{questions.length === 0 ? '暂无题目,点上方「新建题目」开始' : '没有符合条件的题目'}</Text>
        ) : null}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SCREEN_BG },
  scroll: { padding: 20, gap: 12, paddingBottom: 40 },

  statsRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },

  noticeBanner: { backgroundColor: GOLD_PALE, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: GOLD + '33' },
  noticeText: { fontSize: 12, color: GOLD, lineHeight: 18 },

  searchBar: { padding: 0 },

  lessonGroup: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)' },
  lessonGroupHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  lessonNumBox: { width: 36, height: 36, borderRadius: 10, backgroundColor: GOLD_PALE, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: GOLD + '33', flexShrink: 0 },
  lessonNum: { fontSize: 13, fontWeight: '700', color: GOLD },
  lessonTitle: { fontSize: 14, fontWeight: '600', color: INK },
  lessonCourse: { fontSize: 11, color: INK3, marginTop: 1 },
  lessonCount: { fontSize: 12, color: INK4 },
  chevron: { fontSize: 18, color: INK4, width: 20, textAlign: 'right' },

  questionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderColor: 'rgba(43,34,24,0.06)', borderBottomWidth: 1 },
  qNumBox: { width: 28, height: 28, borderRadius: 7, backgroundColor: '#f7f2ec', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  qNum: { fontSize: 10, fontWeight: '700', color: INK3 },
  qPrompt: { fontSize: 13, color: INK, lineHeight: 20 },
  qHint: { fontSize: 10, color: INK4, marginTop: 3 },
  qRight: { alignItems: 'flex-end', gap: 5, flexShrink: 0 },

  emptyText: { textAlign: 'center', color: INK4, fontSize: 13, padding: 24 },
});
