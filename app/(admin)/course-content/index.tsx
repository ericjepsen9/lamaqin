import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Badge,
  Card,
  EmptyState,
  FilterChips,
  SCREEN_BG,
  Table,
  TableRow,
  type TableColumn,
} from '@/components/ui/admin-kit';
import { Text } from '@/components/ui/text';
import { useCourses, type CourseListItem } from '@/lib/queries/courses';
import { useSelfStudyBooks, type SelfStudyBookItem } from '@/lib/queries/self_study';
import { GOLD_DARK as GOLD, GOLD_PALE, INK, INK2, INK3, SAFFRON, SAFFRON_DARK } from '@/lib/theme';
import { useAdminLayout } from '../_layout';
import { bookTitle } from '@/lib/utils';

const WIDE = 900;

// 内容编辑(决策·2026-07-11 PM 拍板):App 端维持只读,编辑完全由官网/ETL 线做(决策177/179)。
// 此前审计 P1(2026-07-02)先藏起来的新建/编辑按钮+表单,现在是确定不做,不是"待定后再开"——
// 死代码按三易·易维护"不留孤儿代码"直接删,不再留 CONTENT_EDIT_UI 开关占位。

type Tab = 'courses' | 'books';

const COURSE_COLUMNS: TableColumn[] = [
  { label: '课程', flex: 3 },
  { label: '造论 / 讲解', flex: 2 },
  { label: '节数', flex: 1 },
  { label: '类型', flex: 1 },
  { label: '', flex: 1 },
];
const BOOK_COLUMNS: TableColumn[] = [
  { label: '序', flex: 0.5 },
  { label: '书名', flex: 3 },
  { label: '作者', flex: 1.5 },
  { label: '篇数', flex: 1 },
  { label: '状态', flex: 1 },
  { label: '', flex: 1 },
];

function CourseCard({ course, onPress }: { course: CourseListItem; onPress: () => void }) {
  return (
    <Card onPress={onPress} style={styles.cardBody}>
      <View style={styles.cardRow1}>
        <Text className="font-serif" style={styles.cardTitle}>{bookTitle(course.name)}</Text>
        {!course.isRequired && <Badge tone="gold">选修</Badge>}
      </View>
      {course.author ? <Text style={styles.cardAuthor}>{course.author}</Text> : null}
      {course.description ? <Text style={styles.cardDesc} numberOfLines={2}>{course.description}</Text> : null}
      <View style={styles.cardFooter}>
        <Text style={styles.cardLessons}>{course.totalLessons ?? 0} 节</Text>
        <Text style={styles.cardArrow}>查看节次 →</Text>
      </View>
    </Card>
  );
}

function CourseRow({ course, onPress, last }: { course: CourseListItem; onPress: () => void; last?: boolean }) {
  return (
    <TableRow onPress={onPress} last={last}>
      <Text className="font-serif" style={[styles.tableCell, { flex: 3, color: INK }]}>{bookTitle(course.name)}</Text>
      <Text style={[styles.tableCell, { flex: 2 }]}>{course.author ?? '—'}</Text>
      <Text style={[styles.tableCell, { flex: 1, textAlign: 'center', color: GOLD, fontWeight: '600' }]}>{course.totalLessons ?? 0}</Text>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Badge tone={course.isRequired ? 'sage' : 'gold'}>{course.isRequired ? '必修' : '选修'}</Badge>
      </View>
      <Text style={[styles.tableCell, { flex: 1, textAlign: 'right', color: SAFFRON_DARK }]}>查看 →</Text>
    </TableRow>
  );
}

function BookCard({ book, onPress }: { book: SelfStudyBookItem; onPress: () => void }) {
  return (
    <Card onPress={onPress} style={[styles.cardBody, !book.isActive && { opacity: 0.5 }]}>
      <View style={styles.cardRow1}>
        <View style={styles.bookNumCircle}>
          <Text className="font-serif" style={styles.bookNumText}>{book.bookNumber ?? '—'}</Text>
        </View>
        <Text className="font-serif" style={[styles.cardTitle, { flex: 1 }]}>{bookTitle(book.title)}</Text>
        {!book.isActive && <Badge tone="neutral">停用</Badge>}
      </View>
      {book.author ? <Text style={styles.cardAuthor}>{book.author}</Text> : null}
      <View style={styles.cardFooter}>
        <Text style={styles.cardLessons}>{book.articleCount} 篇文章</Text>
        <Text style={styles.cardArrow}>查看文章 →</Text>
      </View>
    </Card>
  );
}

function BookRow({ book, onPress, last }: { book: SelfStudyBookItem; onPress: () => void; last?: boolean }) {
  return (
    <TableRow onPress={onPress} last={last}>
      <Text className="font-serif" style={[styles.tableCell, { flex: 0.5, color: GOLD, fontWeight: '600', textAlign: 'center' }]}>{book.bookNumber ?? '—'}</Text>
      <Text className="font-serif" style={[styles.tableCell, { flex: 3, color: INK }]}>{bookTitle(book.title)}</Text>
      <Text style={[styles.tableCell, { flex: 1.5 }]}>{book.author ?? '—'}</Text>
      <Text style={[styles.tableCell, { flex: 1, textAlign: 'center' }]}>{book.articleCount} 篇</Text>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Badge tone={book.isActive ? 'sage' : 'neutral'}>{book.isActive ? '启用' : '停用'}</Badge>
      </View>
      <Text style={[styles.tableCell, { flex: 1, textAlign: 'right', color: SAFFRON_DARK }]}>查看 →</Text>
    </TableRow>
  );
}

export default function CoursesIndex() {
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE;
  const router = useRouter();
  const { setTitle } = useAdminLayout();
  const [tab, setTab] = useState<Tab>('courses');

  const { data: courses = [], isLoading: coursesLoading, error: coursesError } = useCourses();
  const { data: books = [], isLoading: booksLoading, error: booksError } = useSelfStudyBooks();

  useEffect(() => { setTitle('课程内容'); }, [setTitle]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'courses', label: `班级课程（${courses.length}）` },
    { key: 'books', label: `自学读物（${books.length}）` },
  ];

  const loading = tab === 'courses' ? coursesLoading : booksLoading;
  const error = tab === 'courses' ? coursesError : booksError;

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <FilterChips items={tabs} value={tab} onChange={setTab} />

        {loading ? (
          <View style={styles.center}><ActivityIndicator color={SAFFRON} /></View>
        ) : error ? (
          <EmptyState>加载失败，请稍后重试</EmptyState>
        ) : tab === 'courses' ? (
          <View style={{ gap: 10 }}>
            {courses.length === 0 ? (
              <EmptyState>暂无课程</EmptyState>
            ) : isWide ? (
              <Table columns={COURSE_COLUMNS}>
                {courses.map((c, i) => (
                  <CourseRow key={c.id} course={c} last={i === courses.length - 1} onPress={() => router.push(`/(admin)/course-content/${c.id}` as never)} />
                ))}
              </Table>
            ) : (
              <View style={{ gap: 10 }}>
                {courses.map(c => (
                  <CourseCard key={c.id} course={c} onPress={() => router.push(`/(admin)/course-content/${c.id}` as never)} />
                ))}
              </View>
            )}
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {books.length === 0 ? (
              <EmptyState>暂无自学读物</EmptyState>
            ) : isWide ? (
              <Table columns={BOOK_COLUMNS}>
                {books.map((b, i) => (
                  <BookRow key={b.id} book={b} last={i === books.length - 1} onPress={() => router.push(`/(admin)/course-content/book/${b.id}` as never)} />
                ))}
              </Table>
            ) : (
              <View style={{ gap: 10 }}>
                {books.map(b => (
                  <BookCard key={b.id} book={b} onPress={() => router.push(`/(admin)/course-content/book/${b.id}` as never)} />
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SCREEN_BG },
  scroll: { padding: 20, gap: 16, paddingBottom: 40 },
  center: { paddingVertical: 48, alignItems: 'center' },

  // 卡片内距（卡基座来自 kit）
  cardBody: { padding: 16, gap: 6 },
  cardRow1: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: INK },
  cardAuthor: { fontSize: 11, color: INK3 },
  cardDesc: { fontSize: 12, color: INK2, lineHeight: 18 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  cardLessons: { fontSize: 12, color: GOLD, fontWeight: '600' },
  cardArrow: { fontSize: 11, color: SAFFRON_DARK },

  bookNumCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: GOLD_PALE, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: GOLD + '44' },
  bookNumText: { fontSize: 12, fontWeight: '700', color: GOLD },

  tableCell: { fontSize: 13, color: INK2 },
});
