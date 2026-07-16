import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DetailHeader, EmptyState, SCREEN_BG, SearchBar } from '@/components/ui/admin-kit';
import { Text } from '@/components/ui/text';
import { useCourseDetail, type CourseLessonItem } from '@/lib/queries/courses';
import { GOLD_DARK as GOLD, GOLD_PALE, INK, INK2, INK3, INK4, SAFFRON, SAFFRON_DARK, SAGE_DARK } from '@/lib/theme';
import { useAdminLayout } from '../_layout';
import { bookTitle } from '@/lib/utils';

const WIDE = 900;

function LessonRow({ lesson, onPress }: { lesson: CourseLessonItem; onPress: () => void }) {
  return (
    <Pressable style={styles.lessonRow} onPress={onPress}>
      <View style={styles.lessonNumBox}>
        <Text className="font-serif" style={styles.lessonNum}>{lesson.lessonNumber}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.lessonTitle}>{lesson.title}</Text>
        {lesson.resourceCount > 0 ? (
          <Text style={styles.lessonMeta}>{lesson.resourceCount} 位讲者 · 有资源</Text>
        ) : (
          <Text style={[styles.lessonMeta, { color: SAFFRON_DARK }]}>暂无讲解资源</Text>
        )}
      </View>
      <Text style={styles.lessonArrow}>›</Text>
    </Pressable>
  );
}

export default function CourseDetail() {
  const { courseId } = useLocalSearchParams<{ courseId: string }>();
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE;
  const router = useRouter();
  const { setTitle } = useAdminLayout();
  const [search, setSearch] = useState('');

  const { data: course, isLoading, isError } = useCourseDetail(courseId);

  const name = course?.name ?? '课程';
  useEffect(() => { setTitle(name); }, [setTitle, name]);

  const allLessons = course?.lessons ?? [];
  const lessons = useMemo(
    () => allLessons.filter((l) => !search || l.title.includes(search) || String(l.lessonNumber).includes(search)),
    [allLessons, search],
  );
  const withResources = allLessons.filter((l) => l.resourceCount > 0).length;
  const missingResources = allLessons.length - withResources;

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <DetailHeader title={name} onBack={() => router.back()} backLabel="课程内容" />

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={SAFFRON} /></View>
      ) : isError ? (
        <View style={styles.center}><Text style={{ color: INK3 }}>加载失败,请检查网络后重试(不代表课程不存在)</Text></View>
      ) : !course ? (
        <View style={styles.center}><Text style={{ color: INK3 }}>课程不存在</Text></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* 课程信息卡 */}
          <View style={styles.infoCard}>
            <View style={styles.infoCardHeader}>
              <Text className="font-serif" style={styles.courseTitle}>{bookTitle(course.name)}</Text>
            </View>
            {course.author ? <Text style={styles.courseAuthor}>{course.author}</Text> : null}
            {course.description ? <Text style={styles.courseDesc}>{course.description}</Text> : null}
            <View style={styles.courseStats}>
              <View style={styles.statItem}>
                <Text className="font-serif" style={styles.statNum}>{course.totalLessons ?? allLessons.length}</Text>
                <Text style={styles.statLabel}>权威节数</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text className="font-serif" style={[styles.statNum, { color: GOLD }]}>{withResources}</Text>
                <Text style={styles.statLabel}>有资源</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text className="font-serif" style={[styles.statNum, { color: missingResources > 0 ? SAFFRON_DARK : SAGE_DARK }]}>{missingResources}</Text>
                <Text style={styles.statLabel}>待补充</Text>
              </View>
            </View>
          </View>

          {/* 节次列表 */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text className="font-serif" style={styles.sectionTitle}>节次列表（{allLessons.length}）</Text>
            </View>

            <SearchBar value={search} onChangeText={setSearch} placeholder="搜索节次标题或节号…" style={styles.searchBar} />

            {allLessons.length === 0 ? (
              <EmptyState>暂无节次数据</EmptyState>
            ) : (
              <View style={isWide ? styles.lessonGridWide : undefined}>
                {lessons.map(l => (
                  <LessonRow
                    key={l.id}
                    lesson={l}
                    onPress={() => router.push(`/(admin)/course-content/lesson/${l.id}` as never)}
                  />
                ))}
              </View>
            )}

            {allLessons.length > 0 && lessons.length === 0 && (
              <EmptyState>没有符合条件的节次</EmptyState>
            )}
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
  infoCardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  courseTitle: { flex: 1, fontSize: 20, fontWeight: '700', color: INK },
  courseAuthor: { fontSize: 12, color: INK3 },
  courseDesc: { fontSize: 13, color: INK2, lineHeight: 20 },
  courseStats: { flexDirection: 'row', alignItems: 'center', paddingTop: 6 },
  statItem: { flex: 1, alignItems: 'center', gap: 3 },
  statNum: { fontSize: 24, fontWeight: '700', color: INK },
  statLabel: { fontSize: 10, color: INK3 },
  statDivider: { width: 1, height: 28, backgroundColor: 'rgba(43,34,24,0.08)' },

  section: { backgroundColor: '#fff', borderRadius: 18, padding: 18, gap: 12, borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: INK },

  searchBar: { padding: 0 },

  lessonGridWide: { flexDirection: 'row', flexWrap: 'wrap' },

  lessonRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderColor: 'rgba(43,34,24,0.06)' },
  lessonNumBox: { width: 36, height: 36, borderRadius: 10, backgroundColor: GOLD_PALE, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: GOLD + '33' },
  lessonNum: { fontSize: 14, fontWeight: '700', color: GOLD },
  lessonTitle: { fontSize: 14, fontWeight: '600', color: INK },
  lessonMeta: { fontSize: 11, color: INK3, marginTop: 2 },
  lessonArrow: { fontSize: 20, color: INK4 },
});
