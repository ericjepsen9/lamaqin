import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { youtubeIdFromUrl } from './self_study';

// 课程三层（CLAUDE.md §4）= courses(讲记) → course_lessons(权威节号轴) → lesson_resources(各讲者音视频/下载) + lesson_blocks(讲记结构化正文)。
// 思考题/进度/考试范围全挂权威节 lesson_id。本层只读消费；写库（完成度 study_records 等）属复杂业务逻辑，另立。
// 媒体/封面/讲记块由运营+ETL 线维护（决策177/179），App 只读。

// ── 课程列表（全部课程 /catalog + 管理端课程内容 tab）──────────────────
// 「已加入」= 我的 active 班级所属专业的 program_courses ∩ 本课（决策126）；无班级/查询失败时全部按未加入（浏览也算·决策149）。
export type CourseListItem = {
  id: string;
  name: string;
  slug: string | null;
  author: string | null;
  description: string | null;
  totalLessons: number | null;
  courseType: string | null;
  isRequired: boolean;
  joined: boolean;
  coverImageUrl: string | null; // 有值→用真实封面图;无→UI 兜底(hash 配色书封,决策160)
  programs: { name: string; displayOrder: number }[]; // 所属专业(分类分组用;一课可挂多专业)
};

export function useCourses() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ['courses', uid ?? 'anon'],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<CourseListItem[]> => {
      const { data, error } = await supabase
        .from('courses')
        .select('id, name, slug, author, description, total_lessons, course_type, is_required, cover_image_url, program_courses(programs(name, display_order))')
        .order('name');
      if (error) throw error;

      // 我的专业已选课集合（用于「已加入」判定）。失败/无班级 → 空集，全部按未加入。
      const joinedSet = await fetchJoinedCourseIds(uid);

      type Row = {
        id: string; name: string; slug: string | null; author: string | null; description: string | null;
        total_lessons: number | null; course_type: string | null; is_required: boolean | null; cover_image_url: string | null;
        program_courses: { programs: { name: string; display_order: number } | null }[] | null;
      };
      return ((data ?? []) as unknown as Row[]).map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        author: c.author,
        description: c.description,
        totalLessons: c.total_lessons,
        courseType: c.course_type,
        isRequired: c.is_required ?? false,
        joined: joinedSet.has(c.id),
        coverImageUrl: c.cover_image_url,
        programs: (c.program_courses ?? [])
          .map((pc) => pc.programs)
          .filter((p): p is { name: string; display_order: number } => !!p)
          .map((p) => ({ name: p.name, displayOrder: p.display_order })),
      }));
    },
  });
}

// 我的 active 班级 → program_id → program_courses.course_id 集合。任何一步失败/无数据都回落空集（不抛）。
async function fetchJoinedCourseIds(uid: string | undefined): Promise<Set<string>> {
  if (!uid) return new Set();
  try {
    const { data: members } = await supabase
      .from('class_members')
      .select('cohort_id, cohorts(program_id)')
      .eq('user_id', uid)
      .eq('status', 'active');
    const programIds = Array.from(
      new Set(
        ((members ?? []) as unknown as { cohorts: { program_id?: string } | null }[])
          .map((m) => m.cohorts?.program_id)
          .filter((p): p is string => !!p),
      ),
    );
    if (programIds.length === 0) return new Set();
    const { data: links } = await supabase
      .from('program_courses')
      .select('course_id')
      .in('program_id', programIds);
    return new Set((links ?? []).map((l) => l.course_id));
  } catch {
    return new Set();
  }
}

// ── 课程详情（管理端 courses/[courseId] + 学员端 course/[id]）──────────
export type CourseChapter = { id: string; title: string; displayOrder: number | null };
export type CourseLessonItem = {
  id: string;
  lessonNumber: number;
  title: string;
  chapterId: string | null;
  displayOrder: number | null;
  resourceCount: number;
};
export type CourseDetail = {
  id: string;
  name: string;
  author: string | null;
  description: string | null;
  totalLessons: number | null;
  courseType: string | null;
  isRequired: boolean;
  coverImageUrl: string | null;
  coverAccentColor: string | null; // 封面强调色(hex)·scripts/backfill_cover_accent_color.py 离线提取;NULL=无封面/未提取→UI 维持默认渐变
  chapters: CourseChapter[];
  lessons: CourseLessonItem[];
};

export function useCourseDetail(courseId: string | undefined) {
  return useQuery({
    queryKey: ['course-detail', courseId],
    enabled: !!courseId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<CourseDetail | null> => {
      if (!courseId) return null;
      const [{ data: course, error: courseErr }, { data: chapters }, { data: lessons }] = await Promise.all([
        supabase
          .from('courses')
          .select('id, name, author, description, total_lessons, course_type, is_required, cover_image_url, cover_accent_color')
          .eq('id', courseId)
          .single(),
        supabase
          .from('course_chapters')
          .select('id, title, display_order')
          .eq('course_id', courseId)
          .order('display_order'),
        supabase
          .from('course_lessons')
          .select('id, lesson_number, title, chapter_id, display_order')
          .eq('course_id', courseId)
          .order('lesson_number'),
      ]);
      if (courseErr) throw courseErr;
      if (!course) return null;

      // 每节讲解资源数（一次拉全本课的 lesson_resources 再按节计数）。
      const lessonIds = (lessons ?? []).map((l) => l.id);
      const countByLesson = new Map<string, number>();
      if (lessonIds.length > 0) {
        const { data: res } = await supabase
          .from('lesson_resources')
          .select('lesson_id')
          .in('lesson_id', lessonIds);
        for (const r of res ?? []) countByLesson.set(r.lesson_id, (countByLesson.get(r.lesson_id) ?? 0) + 1);
      }

      return {
        id: course.id,
        name: course.name,
        author: course.author,
        description: course.description,
        totalLessons: course.total_lessons,
        courseType: course.course_type,
        isRequired: course.is_required ?? false,
        coverImageUrl: course.cover_image_url,
        coverAccentColor: course.cover_accent_color,
        chapters: (chapters ?? []).map((c) => ({ id: c.id, title: c.title, displayOrder: c.display_order })),
        lessons: (lessons ?? []).map((l) => ({
          id: l.id,
          lessonNumber: l.lesson_number,
          title: l.title,
          chapterId: l.chapter_id,
          displayOrder: l.display_order,
          resourceCount: countByLesson.get(l.id) ?? 0,
        })),
      };
    },
  });
}

// ── 节次详情（管理端 courses/lesson/[lessonId] + 学员端 lesson/[id] 闻思流）──
export type LessonResource = {
  id: string;
  speakerName: string;
  videoUrl: string | null;
  videoId: string | null; // 从 videoUrl 提取的 YouTube ID(内嵌播放 + 按讲者统计用)
  audioUrl: string | null;
  downloadUrl: string | null;
  notes: string | null;
  sortOrder: number | null;
  coversLessons: number[] | null; // 合讲:该资源额外覆盖的权威节号(int[])
  slideImageUrls: string[] | null; // 观修课件逐页图片(决策161);空=退回 downloadUrl 下载按钮
};
export type LessonBlock = {
  id: string;
  lessonResourceId: string | null; // 讲者归属:NULL=讲者中立(顶礼/思考题等共享);非NULL=某讲者(上师/辅导法师)自己的讲记 → 闻思/法师辅导按此分流
  blockOrder: number;
  blockType: string; // title/homage/kepan/inline_heading/body/verse/aspiration/dedication/footnote…
  text: string | null;
  kepanMark: string | null;
  kepanTitle: string | null;
  kepanLevel: number | null; // 科判层级(缩进用)
  kepanSplit: string | null; // 科判分支(如「分二:一、…;二、…」)
  headingMark: string | null;
  headingLevel: number | null;
};
export type LessonDetail = {
  id: string;
  lessonNumber: number;
  title: string;
  courseId: string;
  courseName: string | null;
  courseType: string | null;
  sourceText: string | null;
  resources: LessonResource[];
  blocks: LessonBlock[];
  questionCount: number;
};

export function useLessonDetail(lessonId: string | undefined) {
  return useQuery({
    queryKey: ['lesson-detail', lessonId],
    enabled: !!lessonId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<LessonDetail | null> => {
      if (!lessonId) return null;
      // Step 1: fetch lesson first — need lesson_number for covers_lessons lookup
      const lessonRes = await supabase
        .from('course_lessons')
        .select('id, lesson_number, title, source_text, course_id, courses(name, course_type)')
        .eq('id', lessonId)
        .single();
      if (lessonRes.error) throw lessonRes.error;
      const lesson = lessonRes.data as unknown as {
        id: string; lesson_number: number; title: string; source_text: string | null;
        course_id: string; courses: { name?: string; course_type?: string | null } | null;
      } | null;
      if (!lesson) return null;

      // Step 2: parallel — resources include 合讲 rows via covers_lessons @> {lesson_number}
      const [{ data: resources }, { data: blocks }, { count }] = await Promise.all([
        supabase
          .from('lesson_resources')
          .select('id, speaker_name, video_url, audio_url, download_url, notes, sort_order, covers_lessons, slide_image_urls')
          .or(`lesson_id.eq.${lessonId},covers_lessons.cs.{${lesson.lesson_number}}`)
          .order('sort_order'),
        supabase
          .from('lesson_blocks')
          .select('id, lesson_resource_id, block_order, block_type, text, kepan_mark, kepan_title, kepan_level, kepan_split, heading_mark, heading_level')
          .eq('lesson_id', lessonId)
          .order('block_order'),
        supabase
          .from('questions')
          .select('id', { count: 'exact', head: true })
          .eq('lesson_id', lessonId),
      ]);

      return {
        id: lesson.id,
        lessonNumber: lesson.lesson_number,
        title: lesson.title,
        courseId: lesson.course_id,
        courseName: lesson.courses?.name ?? null,
        courseType: lesson.courses?.course_type ?? null,
        sourceText: lesson.source_text,
        resources: (resources ?? []).map((r) => ({
          id: r.id,
          speakerName: r.speaker_name,
          videoUrl: r.video_url,
          videoId: youtubeIdFromUrl(r.video_url ?? ''),
          audioUrl: r.audio_url,
          downloadUrl: r.download_url,
          notes: r.notes,
          sortOrder: r.sort_order,
          coversLessons: (r as unknown as { covers_lessons: number[] | null }).covers_lessons ?? null,
          slideImageUrls: (r as unknown as { slide_image_urls: string[] | null }).slide_image_urls ?? null,
        })),
        blocks: (blocks ?? []).map((b) => {
          const bb = b as unknown as { kepan_level: number | null; kepan_split: string | null; lesson_resource_id: string | null };
          return {
            id: b.id,
            lessonResourceId: bb.lesson_resource_id ?? null,
            blockOrder: b.block_order,
            blockType: b.block_type,
            text: b.text,
            kepanMark: b.kepan_mark,
            kepanTitle: b.kepan_title,
            kepanLevel: bb.kepan_level,
            kepanSplit: bb.kepan_split,
            headingMark: b.heading_mark,
            headingLevel: b.heading_level,
          };
        }),
        questionCount: count ?? 0,
      };
    },
  });
}

// ── 课程排课（共 N 周 + 每节属第几周）────────────────────────────────────────
// 「周」是排课结构(program_week_courses 把每节排到某周),非实时进度;查表即可。
//   共 N 周 = 该课覆盖的不同 week_number 数;每节的周 = 该节所在 program_weeks.week_number。
// 一课可入多专业(各自周表)→ 选定一个专业:优先本人在读且含本课的专业,否则取覆盖最多的。
//   无排课数据(program_week_courses 未录) → totalWeeks=0、lessonWeek 空,UI 优雅降级(不显周)。
export type CourseSchedule = { totalWeeks: number; lessonWeek: Record<string, number> };
export function useCourseSchedule(courseId: string | undefined) {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ['course-schedule', uid ?? 'anon', courseId ?? ''],
    enabled: !!courseId,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<CourseSchedule> => {
      if (!courseId) return { totalWeeks: 0, lessonWeek: {} };
      const { data } = await supabase
        .from('program_week_courses')
        .select('lesson_id, program_weeks!inner(week_number, program_id)')
        .eq('course_id', courseId);
      const rows = (data ?? []) as unknown as { lesson_id: string | null; program_weeks: { week_number: number; program_id: string } | null }[];
      if (rows.length === 0) return { totalWeeks: 0, lessonWeek: {} };

      // 选定专业:本人在读且含本课的优先
      let target: string | null = null;
      if (uid) {
        const { data: members } = await supabase
          .from('class_members').select('cohorts(program_id)').eq('user_id', uid).eq('status', 'active');
        const myProgs = new Set(
          ((members ?? []) as unknown as { cohorts: { program_id?: string } | null }[])
            .map((m) => m.cohorts?.program_id).filter((p): p is string => !!p),
        );
        target = rows.find((r) => r.program_weeks && myProgs.has(r.program_weeks.program_id))?.program_weeks?.program_id ?? null;
      }
      if (!target) {
        const cnt = new Map<string, number>();
        for (const r of rows) { const p = r.program_weeks?.program_id; if (p) cnt.set(p, (cnt.get(p) ?? 0) + 1); }
        target = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      }

      const scoped = rows.filter((r) => r.program_weeks?.program_id === target);
      const weeks = new Set<number>();
      const lessonWeek: Record<string, number> = {};
      for (const r of scoped) {
        if (!r.program_weeks) continue;
        weeks.add(r.program_weeks.week_number);
        if (r.lesson_id) lessonWeek[r.lesson_id] = r.program_weeks.week_number;
      }
      return { totalWeeks: weeks.size, lessonWeek };
    },
  });
}

// ── 我已学(本课学过的节 id 集合:听/读)──────────────────────────────────────
// 本课范围内、本人学过(listen/read_notes)的不同节。班级 study_records + 个人 personal_study_records 合并去重。
//   返回 Set<lesson_id>:卡片用 .size 显「已学」、本周列表用 .has(id) 逐课标已学/未学。
export function useMyCourseStudiedLessons(courseId: string | undefined) {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ['my-course-studied', uid ?? 'anon', courseId ?? ''],
    enabled: !!uid && !!courseId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<Set<string>> => {
      const set = new Set<string>();
      if (!uid || !courseId) return set;
      const [cls, personal] = await Promise.all([
        supabase
          .from('study_records')
          .select('lesson_id, course_lessons!inner(course_id)')
          .eq('user_id', uid)
          .eq('course_lessons.course_id', courseId)
          .in('study_type', ['listen', 'read_notes']),
        supabase
          .from('personal_study_records')
          .select('lesson_id, course_lessons!inner(course_id)')
          .eq('user_id', uid)
          .eq('course_lessons.course_id', courseId),
      ]);
      for (const r of (cls.data ?? []) as unknown as { lesson_id: string }[]) set.add(r.lesson_id);
      for (const r of (personal.data ?? []) as unknown as { lesson_id: string }[]) set.add(r.lesson_id);
      return set;
    },
  });
}

// ── 我每节的「圆满达标」态(毕业相关·决策:已学≠达标)────────────────────────
// 单一真源(三易·易维护):圆满判定规则在 DB 视图 v_lesson_completion(20260712000200/
// 20260712000300),不在 TS 里重算。⚠️ 2026-07-12 订正:这里原有一份本地 isLessonComplete()
// 复刻同一规则,核对 tests/casebook/counting.md HQ-8("盲=听2遍免看免答=圆满,聋=看2遍
// 免听免答=圆满")才发现它的盲聋分支只判断"听/看过没有"的布尔值,比判例定义偏松——已改
// 直接查视图(同时修正这个偏差),不再本地重算。
export type LessonStatus = 'complete' | 'partial';
export type CourseLessonStatus = { status: Map<string, LessonStatus>; completeCount: number };

type LessonCompletionRow = { lesson_id: string; is_complete: boolean; touched: boolean };

export function useMyCourseLessonStatus(courseId: string | undefined) {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ['my-course-status', uid ?? 'anon', courseId ?? ''],
    enabled: !!uid && !!courseId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<CourseLessonStatus> => {
      const status = new Map<string, LessonStatus>();
      if (!uid || !courseId) return { status, completeCount: 0 };
      const { data, error } = await supabase
        .from('v_lesson_completion')
        .select('lesson_id, is_complete, touched')
        .eq('user_id', uid).eq('course_id', courseId);
      if (error) throw error;
      let completeCount = 0;
      for (const r of (data ?? []) as unknown as LessonCompletionRow[]) {
        if (!r.touched) continue; // 未学:不入 Map(UI 当未学)
        status.set(r.lesson_id, r.is_complete ? 'complete' : 'partial');
        if (r.is_complete) completeCount++;
      }
      return { status, completeCount };
    },
  });
}

// ── 按节次列表批量取完成态(班级页"本周课程"·D3 尾巴·2026-07-11)────────────
// 与 useMyCourseLessonStatus 同一判定(v_lesson_completion),但按 lessonId 列表直接查、不预设
// 单一 courseId——"本周课程"理论上可能横跨 2 门课(书衔接周),按课查会漏判另一门课的节。
export function useLessonStatusMap(lessonIds: string[]) {
  const { session } = useAuth();
  const uid = session?.user.id;
  const key = [...lessonIds].sort().join(',');
  return useQuery({
    queryKey: ['lesson-status-map', uid ?? 'anon', key],
    enabled: !!uid && lessonIds.length > 0,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<Map<string, LessonStatus>> => {
      const status = new Map<string, LessonStatus>();
      if (!uid || lessonIds.length === 0) return status;
      const { data, error } = await supabase
        .from('v_lesson_completion')
        .select('lesson_id, is_complete, touched')
        .eq('user_id', uid).in('lesson_id', lessonIds);
      if (error) throw error;
      for (const r of (data ?? []) as unknown as LessonCompletionRow[]) {
        if (!r.touched) continue; // 未学:不入 Map(同 useMyCourseLessonStatus 口径)
        status.set(r.lesson_id, r.is_complete ? 'complete' : 'partial');
      }
      return status;
    },
  });
}

// ── 整本课圆满(= 该课全部课时圆满,决策091):课程详情页"本书圆满"标 ──────────
export type CourseCompletion = { isComplete: boolean; lessonsComplete: number; lessonsTotal: number };
export function useMyCourseCompletion(courseId: string | undefined) {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ['my-course-completion', uid ?? 'anon', courseId ?? ''],
    enabled: !!uid && !!courseId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<CourseCompletion | null> => {
      if (!uid || !courseId) return null;
      const { data, error } = await supabase
        .from('v_course_completion')
        .select('is_complete, lessons_complete, lessons_total')
        .eq('user_id', uid).eq('course_id', courseId).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as unknown as { is_complete: boolean; lessons_complete: number; lessons_total: number };
      return { isComplete: !!row.is_complete, lessonsComplete: row.lessons_complete, lessonsTotal: row.lessons_total };
    },
  });
}

// ── 本课对本人的「班级上下文」(programId + timezone)──────────────────────────
// 取本人 active 班里、其专业含本课的那个(主班优先)→ programId + timezone,供「本周课」查当前周用。
// 返回 null = 本人无班 / 本课不在任何在读班专业内(浏览态)→ 本周课降级。
export type CourseProgramContext = { programId: string; timezone: string | null };
export function useCourseProgramContext(courseId: string | undefined) {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ['course-program-ctx', uid ?? 'anon', courseId ?? ''],
    enabled: !!uid && !!courseId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<CourseProgramContext | null> => {
      if (!uid || !courseId) return null;
      const { data: members } = await supabase
        .from('class_members')
        .select('is_primary, cohorts(program_id, timezone)')
        .eq('user_id', uid)
        .eq('status', 'active');
      const rows = ((members ?? []) as unknown as { is_primary: boolean | null; cohorts: { program_id?: string; timezone?: string | null } | null }[])
        .filter((r) => r.cohorts?.program_id)
        .sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
      if (rows.length === 0) return null;
      const progIds = rows.map((r) => r.cohorts!.program_id!);
      const { data: links } = await supabase
        .from('program_courses').select('program_id').eq('course_id', courseId).in('program_id', progIds);
      const ok = new Set((links ?? []).map((l) => l.program_id));
      const chosen = rows.find((r) => ok.has(r.cohorts!.program_id!));
      if (!chosen) return null;
      return { programId: chosen.cohorts!.program_id!, timezone: chosen.cohorts!.timezone ?? null };
    },
  });
}

// ── 节次思考题（学员端 lesson/[id] 答题步）────────────────────────────────
// 节次思考题（学员端 lesson/[id] 答题步）。
// question_type 7 型(决策082/105):open/single/judge/fill/flip/verse/chain。
// payload 存题型专属数据（options/answer/tokens/…）；open 型 payload=null。
export type LessonQuestion = {
  id: string;
  questionNumber: number;
  questionType: 'open' | 'single' | 'judge' | 'fill' | 'flip' | 'verse' | 'chain';
  prompt: string;
  sourceHint: string | null;
  payload: Record<string, unknown> | null;
};

export function useLessonQuestions(lessonId: string | undefined) {
  return useQuery({
    queryKey: ['lesson-questions', lessonId],
    enabled: !!lessonId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<LessonQuestion[]> => {
      if (!lessonId) return [];
      const { data, error } = await supabase
        .from('questions')
        .select('id, question_number, question_type, prompt, source_hint, payload')
        .eq('lesson_id', lessonId)
        .order('display_order')
        .order('question_number');
      if (error) throw error;
      return (data ?? []).map((q) => ({
        id: q.id,
        questionNumber: q.question_number,
        questionType: q.question_type,
        prompt: q.prompt,
        sourceHint: q.source_hint,
        payload: (q.payload as Record<string, unknown> | null) ?? null,
      }));
    },
  });
}

// ── 续播位置(决策149·C7 2026-07-12 补完:表建了 3 周从未接线)──────────────
// 只记「阅读法本(闻思步)」滚动位置,不记音视频/其它步(user_lesson_progress
// 一课一行,做不到分步骤各存一份;闻思步是"继续阅读"的主场景,决策149原注释
// 措辞亦是"继续阅读")。
export type LessonProgress = { lastPosition: number; lastMedia: 'video' | 'audio' | 'text' | null };

export function useLessonProgress(lessonId: string | undefined) {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ['lesson-progress', uid ?? 'anon', lessonId],
    enabled: !!lessonId && !!uid,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<LessonProgress | null> => {
      if (!lessonId || !uid) return null;
      const { data, error } = await supabase
        .from('user_lesson_progress')
        .select('last_position, last_media')
        .eq('user_id', uid)
        .eq('lesson_id', lessonId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const media = data.last_media;
      return {
        lastPosition: data.last_position ?? 0,
        lastMedia: media === 'video' || media === 'audio' || media === 'text' ? media : null,
      };
    },
  });
}
