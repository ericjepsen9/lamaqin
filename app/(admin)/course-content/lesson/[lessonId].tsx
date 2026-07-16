import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, Badge, DetailHeader, EmptyState, SCREEN_BG } from '@/components/ui/admin-kit';
import { Text } from '@/components/ui/text';
import { useLessonDetail, type LessonBlock, type LessonResource } from '@/lib/queries/courses';
import { GOLD_DARK as GOLD, GOLD_PALE, INK, INK2, INK3, INK4, SAFFRON, SAFFRON_DARK, SAGE, SAGE_DARK } from '@/lib/theme';
import { useAdminLayout } from '../../_layout';
import { bookTitle } from '@/lib/utils';

const BLOCK_TYPE_LABEL: Record<string, string> = {
  title: '标题', homage: '顶礼', kepan: '科判', body: '正文', verse: '偈颂',
  question: '思考题', aspiration: '发愿', dedication: '回向', footnote: '脚注',
  inline_heading: '小标题',
};
const BLOCK_TYPE_COLOR: Record<string, string> = {
  title: GOLD, homage: SAGE, kepan: SAFFRON_DARK, body: INK3,
  verse: SAGE_DARK, question: GOLD, inline_heading: INK2,
};

// 媒体资源（视频/音频/法本/封面）由运营团队直接维护，后台只读（决策179）
function ResourceCard({ resource }: { resource: LessonResource }) {
  return (
    <View style={styles.resourceCard}>
      <View style={styles.resourceHeader}>
        <Avatar name={resource.speakerName} size={36} />
        <View style={{ flex: 1 }}>
          <Text style={styles.resourceName}>{resource.speakerName}</Text>
          {resource.notes ? <Text style={styles.resourceNotes}>{resource.notes}</Text> : null}
        </View>
      </View>
      <View style={styles.resourceLinks}>
        <Badge tone={resource.videoUrl ? 'sage' : 'neutral'}>视频</Badge>
        <Badge tone={resource.audioUrl ? 'sage' : 'neutral'}>音频</Badge>
        <Badge tone={resource.downloadUrl ? 'sage' : 'neutral'}>下载</Badge>
      </View>
    </View>
  );
}

function BlockPreview({ block }: { block: LessonBlock }) {
  const color = BLOCK_TYPE_COLOR[block.blockType] ?? INK3;
  const label = BLOCK_TYPE_LABEL[block.blockType] ?? block.blockType;
  return (
    <View style={styles.blockRow}>
      <View style={[styles.blockTypePill, { backgroundColor: color + '18' }]}>
        <Text style={[styles.blockTypePillText, { color }]}>{label}</Text>
      </View>
      {block.text ? (
        <Text style={styles.blockText} numberOfLines={3}>{block.text}</Text>
      ) : null}
    </View>
  );
}

export default function LessonDetail() {
  const { lessonId } = useLocalSearchParams<{ lessonId: string }>();
  const router = useRouter();
  const { setTitle } = useAdminLayout();
  const [showBlocks, setShowBlocks] = useState(false);

  const { data: lesson, isLoading, isError } = useLessonDetail(lessonId);

  const title = lesson?.title ?? '节次';
  useEffect(() => { setTitle(lesson ? `第 ${lesson.lessonNumber} 节` : '节次'); }, [setTitle, lesson]);

  const resources = lesson?.resources ?? [];
  const blocks = lesson?.blocks ?? [];

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <DetailHeader title={title} onBack={() => router.back()} backLabel={lesson?.courseName ? bookTitle(lesson.courseName) : '返回'} />

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={SAFFRON} /></View>
      ) : isError ? (
        <View style={styles.center}><Text style={{ color: INK3 }}>加载失败,请检查网络后重试(不代表节次不存在)</Text></View>
      ) : !lesson ? (
        <View style={styles.center}><Text style={{ color: INK3 }}>节次不存在</Text></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* 节次信息卡 */}
          <View style={styles.infoCard}>
            <View style={styles.lessonBadgeRow}>
              <Badge tone="gold">第 {lesson.lessonNumber} 节</Badge>
              {lesson.questionCount > 0 ? <Badge tone="saffron">{lesson.questionCount} 道思考题</Badge> : null}
            </View>
            <Text className="font-serif" style={styles.lessonTitle}>{lesson.title}</Text>
          </View>

          {/* 造论原文（source_text，可折叠） */}
          <View style={styles.section}>
            <Text className="font-serif" style={styles.sectionTitle}>造论原文</Text>
            {lesson.sourceText ? (
              <>
                <Text style={styles.sourceText} numberOfLines={4}>{lesson.sourceText}</Text>
                <Text style={styles.sourceTextNote}>ETL 导入 · 只读</Text>
              </>
            ) : (
              <Text style={styles.sourceTextNote}>暂无造论原文</Text>
            )}
          </View>

          {/* 讲解资源 */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text className="font-serif" style={styles.sectionTitle}>讲解资源 ({resources.length})</Text>
            </View>
            <View style={styles.etlNotice}>
              <Text style={styles.etlNoticeText}>媒体资源由运营团队直接维护 · 后台只读（决策179）</Text>
            </View>
            {resources.length === 0 ? (
              <EmptyState>暂无讲解资源</EmptyState>
            ) : (
              resources.map(r => (
                <ResourceCard key={r.id} resource={r} />
              ))
            )}
          </View>

          {/* 讲记内容（lesson_blocks，ETL 只读） */}
          <View style={styles.section}>
            <Pressable style={styles.sectionHeader} onPress={() => setShowBlocks(v => !v)}>
              <Text className="font-serif" style={styles.sectionTitle}>讲记内容 ({blocks.length} 块)</Text>
              <Text style={styles.toggleText}>{showBlocks ? '收起 ↑' : '展开 ↓'}</Text>
            </Pressable>
            <View style={styles.etlNotice}>
              <Text style={styles.etlNoticeText}>ETL 线权威 · 编辑功能延后（决策177）</Text>
            </View>
            {blocks.length === 0 ? (
              <EmptyState>暂无讲记内容</EmptyState>
            ) : showBlocks ? (
              blocks.map(b => <BlockPreview key={b.id} block={b} />)
            ) : null}
          </View>

        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SCREEN_BG },
  scroll: { padding: 20, gap: 14, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },

  infoCard: { backgroundColor: '#fff', borderRadius: 18, padding: 20, gap: 10, borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)', shadowColor: '#2b2218', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 2 },
  lessonBadgeRow: { flexDirection: 'row', gap: 8 },
  lessonTitle: { fontSize: 22, fontWeight: '700', color: INK },

  section: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 10, borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: INK },
  toggleText: { fontSize: 12, color: SAFFRON_DARK },
  sourceText: { fontSize: 13, color: INK2, lineHeight: 22, fontStyle: 'italic' },
  sourceTextNote: { fontSize: 10, color: INK4 },

  // 资源卡
  resourceCard: { borderRadius: 12, borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)', padding: 14, gap: 10, backgroundColor: '#fafaf8' },
  resourceHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  resourceName: { fontSize: 14, fontWeight: '600', color: INK },
  resourceNotes: { fontSize: 11, color: INK3, marginTop: 1 },
  resourceLinks: { flexDirection: 'row', gap: 8 },

  // lesson_blocks 预览
  etlNotice: { backgroundColor: GOLD_PALE, borderRadius: 8, padding: 8, borderWidth: 1, borderColor: GOLD + '22' },
  etlNoticeText: { fontSize: 11, color: GOLD, textAlign: 'center' },
  blockRow: { gap: 4, paddingVertical: 6, borderBottomWidth: 1, borderColor: 'rgba(43,34,24,0.05)' },
  blockTypePill: { alignSelf: 'flex-start', borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 },
  blockTypePillText: { fontSize: 10, fontWeight: '600' },
  blockText: { fontSize: 13, color: INK2, lineHeight: 20 },
});
