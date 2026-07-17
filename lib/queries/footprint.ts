import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// 本人学修足迹(决策183 规则2「本人可见」+ 功德回向对本人展示·CLAUDE.md §3 / 决策014/145)。
// 聚合【本人】全部听读完成,班级 + 个人两侧都算(对有班/无班用户都完整):
//   课程节听读:study_records(班级·决策135)+ personal_study_records(个人·决策183)
//   大学演讲圆满:self_study_records(班级)+ personal_self_study_records(个人·决策183)
// 全 RLS 限本人(owner-only / user_id=auth.uid());绝不显他人(#193)。
// listen/read 可重复打卡(决策047)→ 计「次」;大学演讲=圆满态 → 计「篇」。

export type FootprintKind = 'listen' | 'read_notes' | 'speech';

export type FootprintItem = {
  key: string;
  kind: FootprintKind;
  title: string; // 课名 / 篇名
  context: string; // 课程名 / 书名
  date: string; // YYYY-MM-DD
  scope: 'class' | 'self'; // 班级 / 个人(自学·课外浏览)
};

export type StudyFootprint = {
  listenCount: number; // 听课次数(班级 + 个人)
  readCount: number; // 读讲记次数(班级 + 个人)
  speechCount: number; // 大学演讲圆满篇数(班级 + 个人)
  recent: FootprintItem[]; // 最近合并(按日期倒序)
};

type LessonEmbed = { lesson_number?: number | null; title?: string | null; courses?: { name?: string | null } | null } | null;
type ArticleEmbed = { title?: string | null; self_study_books?: { title?: string | null } | null } | null;

function lessonTitle(l: LessonEmbed): { title: string; context: string } {
  const num = l?.lesson_number != null ? `第${l.lesson_number}节` : '';
  return { title: l?.title ? `${num ? `${num} · ` : ''}${l.title}` : num || '课时', context: l?.courses?.name ?? '课程' };
}
function articleTitle(a: ArticleEmbed): { title: string; context: string } {
  return { title: a?.title ?? '演讲', context: a?.self_study_books?.title ? `《${a.self_study_books.title}》` : '大学演讲' };
}

export function useMyStudyFootprint(recentLimit = 8) {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ['my-footprint', uid ?? 'anon'],
    enabled: !!uid,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<StudyFootprint> => {
      if (!uid) return { listenCount: 0, readCount: 0, speechCount: 0, recent: [] };

      const [classLesson, selfLesson, classSpeech, selfSpeech] = await Promise.all([
        supabase
          .from('study_records')
          .select('id, lesson_id, study_type, study_date, created_at, course_lessons(lesson_number, title, courses(name))')
          .eq('user_id', uid)
          .in('study_type', ['listen', 'read_notes'])
          .order('study_date', { ascending: false }),
        supabase
          .from('personal_study_records')
          .select('id, lesson_id, study_type, study_date, created_at, course_lessons(lesson_number, title, courses(name))')
          .eq('user_id', uid)
          .order('study_date', { ascending: false }),
        supabase
          .from('self_study_records')
          .select('id, article_id, status, completed_at, created_at, self_study_articles(title, self_study_books(title))')
          .eq('user_id', uid)
          .eq('status', 'completed')
          .order('completed_at', { ascending: false }),
        supabase
          .from('personal_self_study_records')
          .select('id, article_id, status, completed_at, created_at, self_study_articles(title, self_study_books(title))')
          .eq('user_id', uid)
          .eq('status', 'completed')
          .order('completed_at', { ascending: false }),
      ]);

      const lessonRaw = [
        ...((classLesson.data ?? []) as unknown as { id: string; lesson_id: string; study_type: string; study_date: string; created_at: string | null; course_lessons: LessonEmbed }[]).map(
          (r) => ({ ...r, scope: 'class' as const }),
        ),
        ...((selfLesson.data ?? []) as unknown as { id: string; lesson_id: string; study_type: string; study_date: string; created_at: string | null; course_lessons: LessonEmbed }[]).map(
          (r) => ({ ...r, scope: 'self' as const }),
        ),
      ];
      const speechRaw = [
        ...((classSpeech.data ?? []) as unknown as { id: string; article_id: string; completed_at: string | null; created_at: string | null; self_study_articles: ArticleEmbed }[]).map(
          (r) => ({ ...r, scope: 'class' as const }),
        ),
        ...((selfSpeech.data ?? []) as unknown as { id: string; article_id: string; completed_at: string | null; created_at: string | null; self_study_articles: ArticleEmbed }[]).map(
          (r) => ({ ...r, scope: 'self' as const }),
        ),
      ];

      // 多班扇出去重(PM 2026-06-26):一次学修扇到 N 班=N 条 → 本人足迹只算一次。
      //   ⚠️ 去重键按【学修事件 created_at】而非 study_date:扇出的 N 条同一次 insert 共享 created_at(合并),
      //   但同一天的【两次真实学修】created_at 不同(各保留)→ "第1课学了2次"如实显示 2 次(决策047 可重复打卡)。
      //   (created_at 兜底用 id,极端 null 时不误并。)大学演讲是圆满态(每篇一条)→ 按 article 去重。
      const lessonSeen = new Set<string>();
      const lessonRows = lessonRaw.filter((r) => {
        const k = `${r.lesson_id}|${r.study_type}|${r.created_at ?? r.id}`;
        if (lessonSeen.has(k)) return false;
        lessonSeen.add(k);
        return true;
      });
      const speechSeen = new Set<string>();
      const speechRows = speechRaw.filter((r) => {
        if (speechSeen.has(r.article_id)) return false;
        speechSeen.add(r.article_id);
        return true;
      });

      const listenCount = lessonRows.filter((r) => r.study_type === 'listen').length;
      const readCount = lessonRows.filter((r) => r.study_type === 'read_notes').length;
      const speechCount = speechRows.length;

      const items: FootprintItem[] = [
        ...lessonRows.map((r) => {
          const t = lessonTitle(r.course_lessons);
          return {
            key: `${r.scope}-lesson-${r.id}`,
            kind: (r.study_type === 'listen' ? 'listen' : 'read_notes') as FootprintKind,
            title: t.title,
            context: t.context,
            date: r.study_date,
            scope: r.scope,
          };
        }),
        ...speechRows.map((r) => {
          const t = articleTitle(r.self_study_articles);
          return {
            key: `${r.scope}-speech-${r.id}`,
            kind: 'speech' as FootprintKind,
            title: t.title,
            context: t.context,
            date: (r.completed_at ?? r.created_at ?? '').slice(0, 10),
            scope: r.scope,
          };
        }),
      ];
      items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

      return { listenCount, readCount, speechCount, recent: items.slice(0, recentLimit) };
    },
  });
}
