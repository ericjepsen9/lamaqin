import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// 大学演讲（自学读物体系）。官网/ETL 线产出数据，App 只读消费（勿改 schema）。
// 数据层级：self_study_books（演讲合集）→ self_study_articles（单篇演讲）
//           → self_study_blocks（正文结构化块）+ self_study_resources（YouTube 视频）
//           分类：self_study_categories（学科）↔ self_study_article_categories（多对多）
// 学修流：听闻（看视频）+ 阅读（读正文），免答题、不计考试（同 lesson restricted 模式）。

// (旧「dx 封面按标题精确匹配」随 D-15 列表改版撤除:书=章节的行式列表不再放单篇封面,
//   hero 用金色生成书封;bookcovers.json 的 dx 类仍在,将来若做书封再接。)

// YouTube watch/shorts/live/embed/youtu.be → videoId。
export function youtubeIdFromUrl(url: string): string | null {
  if (!url) return null;
  const m =
    url.match(/[?&]v=([^&]+)/) ||
    url.match(/youtu\.be\/([^?&/]+)/) ||
    url.match(/\/embed\/([^?&/]+)/) ||
    url.match(/\/shorts\/([^?&/]+)/) ||
    url.match(/\/live\/([^?&/]+)/);
  return m ? m[1] : null;
}

// ── 自学读物书目（管理端 courses 的「自学读物」tab + book/[bookId]）────
// 书目列表带篇数；详情带每篇正文块计数（hasBlocks=有内容/待补充）。
export type SelfStudyBookItem = {
  id: string;
  bookNumber: number | null;
  title: string;
  author: string | null;
  articleCount: number;
  isActive: boolean;
};

export function useSelfStudyBooks() {
  return useQuery({
    queryKey: ['self-study-books'],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<SelfStudyBookItem[]> => {
      const { data: books, error } = await supabase
        .from('self_study_books')
        .select('id, book_number, title, author, is_active')
        .order('display_order');
      if (error) throw error;
      const list = books ?? [];
      if (list.length === 0) return [];

      // 各书篇数（一次拉全部 article 的 book_id 再计数）。
      const { data: articles } = await supabase.from('self_study_articles').select('book_id');
      const countByBook = new Map<string, number>();
      for (const a of articles ?? []) countByBook.set(a.book_id, (countByBook.get(a.book_id) ?? 0) + 1);

      return list.map((b) => ({
        id: b.id,
        bookNumber: b.book_number,
        title: b.title,
        author: b.author,
        articleCount: countByBook.get(b.id) ?? 0,
        isActive: b.is_active ?? true,
      }));
    },
  });
}

export type SelfStudyArticleItem = { id: string; articleNumber: number; title: string; blockCount: number };
export type SelfStudyBookDetail = {
  id: string;
  bookNumber: number | null;
  title: string;
  author: string | null;
  description: string | null;
  isActive: boolean;
  articles: SelfStudyArticleItem[];
};

export function useSelfStudyBookDetail(bookId: string | undefined) {
  return useQuery({
    queryKey: ['self-study-book-detail', bookId],
    enabled: !!bookId,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<SelfStudyBookDetail | null> => {
      if (!bookId) return null;
      const [{ data: book, error: bookErr }, { data: articles }] = await Promise.all([
        supabase
          .from('self_study_books')
          .select('id, book_number, title, author, description, is_active')
          .eq('id', bookId)
          .single(),
        supabase
          .from('self_study_articles')
          .select('id, article_number, title')
          .eq('book_id', bookId)
          .order('display_order'),
      ]);
      if (bookErr) throw bookErr;
      if (!book) return null;

      // 每篇正文块计数。
      const articleIds = (articles ?? []).map((a) => a.id);
      const countByArticle = new Map<string, number>();
      if (articleIds.length > 0) {
        const { data: blocks } = await supabase.from('self_study_blocks').select('article_id').in('article_id', articleIds);
        for (const bl of blocks ?? []) countByArticle.set(bl.article_id, (countByArticle.get(bl.article_id) ?? 0) + 1);
      }

      return {
        id: book.id,
        bookNumber: book.book_number,
        title: book.title,
        author: book.author,
        description: book.description,
        isActive: book.is_active ?? true,
        articles: (articles ?? []).map((a) => ({
          id: a.id,
          articleNumber: a.article_number,
          title: a.title,
          blockCount: countByArticle.get(a.id) ?? 0,
        })),
      };
    },
  });
}

// ── 圆满判定线(D-15·B口径):纯函数抽至 speech-complete.ts(零依赖·jest 直测),转发保持 import 路径不变。
export { speechCompleteDerive } from './speech-complete';

// ── 大学演讲全库(列表页 + 翻页序·D-15 改版)──────────────────────────────
// 书=章节、文章=行;两组:预科大纲内(第1-18册·大纲「第2-7学期每学期3册」)/ 更多演讲(19-50册)。
// 本人进度 = 两张记录表(班级 self_study_records / 个人 personal_self_study_records)按篇合并:
//   任一行 completed 即圆满;watched/read 任一行有即算(个人语义,与决策183 路由无关,只看本人足迹)。
// select('*'):列 additive(watched_at/read_at 新加),用 * 避免迁移未跑时 400,字段可选读。
export type SpeechArticleRow = {
  id: string;
  title: string;
  articleNumber: number | null;
  bookId: string;
  hasVideo: boolean;
  watched: boolean;
  read: boolean;
  status: 'completed' | 'reading' | null;
};
export type SpeechLibraryBook = {
  id: string;
  bookNumber: number | null;
  title: string;
  author: string | null;
  articles: SpeechArticleRow[];
  doneCount: number;
};
export type SpeechLibrary = {
  books: SpeechLibraryBook[];
  core: SpeechLibraryBook[];   // 大纲内 第1-18册
  extra: SpeechLibraryBook[];  // 更多演讲 第19-50册
  flat: SpeechArticleRow[];    // 跨册线性序(上一篇/下一篇)
  totalArticles: number;
  completedCount: number;
  readingCount: number;
  continueTarget: (SpeechArticleRow & { bookTitle: string; bookNumber: number | null }) | null;
};

type MyRecordRow = { article_id?: string; status?: string | null; watched_at?: string | null; read_at?: string | null };

export function useSpeechLibrary() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ['speech-library', uid ?? 'anon'],
    staleTime: 60 * 1000,
    queryFn: async (): Promise<SpeechLibrary> => {
      // 5 条查询合并进一个 Promise.all(2026-07-17 修"每次进入都转圈,感觉慢"):此前"本人进度"
      // 那 2 条故意等前 3 条(books/articles/resources)先跑完才发,但它们互不依赖对方结果
      // (uid 在 queryFn 一开始就已知,不是从前 3 条查询里派生的),纯属多余的串行等待,
      // 白白多等一轮网络往返。未登录时用本地空结果占位,不发多余请求。
      const [{ data: books, error: bErr }, { data: articles, error: aErr }, { data: res }, clsRes, perRes] = await Promise.all([
        supabase.from('self_study_books').select('id, book_number, title, author, display_order').order('display_order'),
        supabase.from('self_study_articles').select('id, title, article_number, book_id, display_order').order('display_order'),
        supabase.from('self_study_resources').select('article_id'),
        uid ? supabase.from('self_study_records').select('*').eq('user_id', uid) : Promise.resolve({ data: [] as MyRecordRow[] }),
        uid ? supabase.from('personal_self_study_records').select('*').eq('user_id', uid) : Promise.resolve({ data: [] as MyRecordRow[] }),
      ]);
      if (bErr) throw bErr;
      if (aErr) throw aErr;

      const mine: MyRecordRow[] = [...(clsRes.data ?? []), ...(perRes.data ?? [])] as MyRecordRow[];
      const prog = new Map<string, { completed: boolean; watched: boolean; read: boolean; reading: boolean }>();
      for (const r of mine) {
        if (!r.article_id) continue;
        const p = prog.get(r.article_id) ?? { completed: false, watched: false, read: false, reading: false };
        if (r.status === 'completed') p.completed = true;
        if (r.status === 'reading') p.reading = true;
        if (r.watched_at) p.watched = true;
        if (r.read_at) p.read = true;
        prog.set(r.article_id, p);
      }

      const withVideo = new Set((res ?? []).map((r) => r.article_id));
      const byBook = new Map<string, SpeechArticleRow[]>();
      for (const a of articles ?? []) {
        const p = prog.get(a.id);
        const row: SpeechArticleRow = {
          id: a.id,
          title: a.title,
          articleNumber: a.article_number,
          bookId: a.book_id,
          hasVideo: withVideo.has(a.id),
          watched: p?.watched ?? false,
          read: p?.read ?? false,
          status: p?.completed ? 'completed' : p?.reading || p?.watched || p?.read ? 'reading' : null,
        };
        const list = byBook.get(a.book_id) ?? [];
        list.push(row);
        byBook.set(a.book_id, list);
      }

      const bookList: SpeechLibraryBook[] = (books ?? []).map((b) => {
        const arts = byBook.get(b.id) ?? [];
        return {
          id: b.id,
          bookNumber: b.book_number,
          title: b.title,
          author: b.author,
          articles: arts,
          doneCount: arts.filter((a) => a.status === 'completed').length,
        };
      });
      // 18 非拍脑袋:大学演讲预科系共用18册、班级师兄必读(限制性)——第19册起(《走近藏传佛教》等)
      // 不属预科18本、只算额外参考(出处 docs/schema_phase1_2026-05-31.md 该表 ★性质★ 注释,
      // 三易审计 2026-07-15 补citation)。这是内容/学制事实,不是待定阈值,不进 admin-thresholds.ts。
      const core = bookList.filter((b) => b.bookNumber != null && b.bookNumber <= 18);
      const extra = bookList.filter((b) => !(b.bookNumber != null && b.bookNumber <= 18));
      const flat = bookList.flatMap((b) => b.articles);
      const completedCount = flat.filter((a) => a.status === 'completed').length;
      const readingCount = flat.filter((a) => a.status === 'reading').length;
      const cont = flat.find((a) => a.status !== 'completed') ?? null;
      const contBook = cont ? bookList.find((b) => b.id === cont.bookId) : null;

      return {
        books: bookList,
        core,
        extra,
        flat,
        totalArticles: flat.length,
        completedCount,
        readingCount,
        continueTarget: cont && contBook ? { ...cont, bookTitle: contBook.title, bookNumber: contBook.bookNumber } : null,
      };
    },
  });
}

// ── 单篇演讲详情（标题 + 正文块 + 视频）──────────────────────────────
export type SpeechBlock = {
  id: string;
  blockOrder: number;
  blockType: string;
  text: string | null;
  headingMark: string | null;
  headingLevel: number | null;
};

export type SpeechResource = {
  id: string;
  kind: string; // video / audio
  url: string;
  videoId: string | null;
  label: string | null;
  sortOrder: number | null;
};

export type SpeechDetail = {
  id: string;
  title: string;
  articleNumber: number | null;
  bookId: string;
  bookTitle: string | null;
  blocks: SpeechBlock[];
  resources: SpeechResource[];
};

export function useSpeechDetail(articleId: string | undefined) {
  return useQuery({
    queryKey: ['speech-detail', articleId],
    enabled: !!articleId,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<SpeechDetail | null> => {
      if (!articleId) return null;
      const [articleRes, { data: blocks }, { data: resources }] = await Promise.all([
        supabase
          .from('self_study_articles')
          .select('id, title, article_number, book_id, self_study_books(title)')
          .eq('id', articleId)
          .single(),
        supabase
          .from('self_study_blocks')
          .select('id, block_order, block_type, text, heading_mark, heading_level')
          .eq('article_id', articleId)
          .order('block_order'),
        supabase
          .from('self_study_resources')
          .select('id, kind, url, label, sort_order')
          .eq('article_id', articleId)
          .order('sort_order'),
      ]);
      const article = articleRes.data as unknown as {
        id: string; title: string; article_number: number | null; book_id: string;
        self_study_books: { title?: string } | null;
      } | null;
      if (!article) return null;

      return {
        id: article.id,
        title: article.title,
        articleNumber: article.article_number,
        bookId: article.book_id,
        bookTitle: article.self_study_books?.title ?? null,
        blocks: (blocks ?? []).map((b) => ({
          id: b.id,
          blockOrder: b.block_order,
          blockType: b.block_type,
          text: b.text,
          headingMark: b.heading_mark,
          headingLevel: b.heading_level,
        })),
        resources: (resources ?? []).map((r) => ({
          id: r.id,
          kind: r.kind,
          url: r.url,
          videoId: youtubeIdFromUrl(r.url),
          label: r.label,
          sortOrder: r.sort_order,
        })),
      };
    },
  });
}
