import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { todayInTz } from '@/lib/date-tz';
import { cohortWeekCalc } from '@/lib/queries/cohort-week-calc';
import { supabase } from '@/lib/supabase';

// 班级（cohort）数据层。学员端班级 tab + 管理端班级管理共用。
// 集体时区按 cohort.timezone（IANA），「今天/本周」据此取（CLAUDE.md §1：禁用 CURRENT_DATE 当今天）。
// 进度算法走 RPC get_current_week_lessons（内部读 class_members 取本班 → 本周节）。
// 周共修的聚合统计（全班念诵总和、出勤率）仍待 PM 定口径；圆满课次已接（选项C·2026-07-12，见 useCohortLessonCompletion）。

const WD = ['日', '一', '二', '三', '四', '五', '六'];

// weekly_cosession_dow(0=日..6=六) + time('HH:MM:SS') → 「每周X HH:MM」。任一为空 → null。
function formatSchedule(dow: number | null, time: string | null): string | null {
  if (dow == null || !time) return null;
  const hhmm = time.slice(0, 5);
  return `每周${WD[dow] ?? '?'} ${hhmm}`;
}

// ── 我的班级（学员端：班级 tab 头部 + 切换 + 主班识别）────────────────
export type MyCohort = {
  cohortId: string;
  cohortName: string;
  code: string;
  programId: string;
  programName: string | null;
  timezone: string | null;
  memberRole: 'auditor' | 'formal';
  isPrimary: boolean;
  status: string;
};

export function useMyCohorts() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ['my-cohorts', uid ?? 'anon'],
    enabled: !!uid,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<MyCohort[]> => {
      if (!uid) return [];
      const { data, error } = await supabase
        .from('class_members')
        .select('cohort_id, member_role, is_primary, status, cohorts(id, name, code, program_id, timezone, programs(name))')
        .eq('user_id', uid);
      if (error) throw error;
      const rows = (data ?? []) as unknown as {
        cohort_id: string; member_role: 'auditor' | 'formal'; is_primary: boolean | null; status: string;
        cohorts: { id: string; name: string; code: string; program_id: string; timezone: string | null; programs: { name?: string } | null } | null;
      }[];
      return rows
        .filter((r) => r.cohorts)
        .map((r) => ({
          cohortId: r.cohort_id,
          cohortName: r.cohorts!.name,
          code: r.cohorts!.code,
          programId: r.cohorts!.program_id,
          programName: r.cohorts!.programs?.name ?? null,
          timezone: r.cohorts!.timezone,
          memberRole: r.member_role,
          isPrimary: r.is_primary ?? false,
          status: r.status,
        }))
        // 主班优先
        .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
    },
  });
}

// ── 本周课时（学员端：本周课程；RPC 内部按本班取）───────────────────
export type WeekLesson = { courseId: string; courseName: string; lessonId: string; lessonNumber: number; lessonTitle: string };

export function useCurrentWeekLessons(programId: string | undefined, timezone?: string | null) {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ['current-week-lessons', uid ?? 'anon', programId ?? 'none'],
    enabled: !!uid && !!programId,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<WeekLesson[]> => {
      if (!uid || !programId) return [];
      const today = todayInTz(timezone);
      const args: Record<string, unknown> = { p_user_id: uid, p_program_id: programId };
      if (today) args.p_today = today;
      // rpc 一律 supabase.rpc(...) 方法调用(勿解构裸函数:丢 this,真机 Safari 报 this.rest 错);返回 Json → 收窄一次。
      type WeekLessonRow = { course_id: string; course_name: string; lesson_id: string; lesson_number: number; lesson_title: string };
      const { data, error } = await supabase.rpc('get_current_week_lessons', args as { p_user_id: string; p_program_id: string; p_today?: string });
      if (error) throw error;
      const rows = (data ?? []) as unknown as WeekLessonRow[];
      return rows.map((r) => ({
        courseId: r.course_id,
        courseName: r.course_name,
        lessonId: r.lesson_id,
        lessonNumber: r.lesson_number,
        lessonTitle: r.lesson_title,
      }));
    },
  });
}

// ── 班级当前周 + 本周节次（管理端班级详情「课程进度」）──────────────
// cohort 级（不针对某个学员）：用 cohort.start_date + program 的 start_semester/weeks_per_semester
//   + cohort_rest_weeks（计划外休息·扣周）算 (学期号, 学期内周)，公式与 get_current_week_number(§12.6.5) 一致；
//   再调 get_week_lessons RPC 取本周节次。集体「今天」按 cohort.timezone（CLAUDE.md §1）。
export type CohortWeekProgress = {
  status: 'ok' | 'not_started' | 'no_start_date';
  calWeek: number;          // 全程第几周（跨学期累计）
  semesterNumber: number;
  weekInSemester: number;
  startDate: string | null;
  lessons: WeekLesson[];
};

export function useCohortCurrentWeek(
  args: { cohortId: string; programId: string; startDate: string | null; timezone: string | null } | undefined,
) {
  return useQuery({
    queryKey: ['cohort-current-week', args?.cohortId ?? 'none', args?.startDate ?? ''],
    enabled: !!args?.cohortId && !!args?.programId,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<CohortWeekProgress> => {
      const a = args!;
      const base: CohortWeekProgress = { status: 'no_start_date', calWeek: 0, semesterNumber: 0, weekInSemester: 0, startDate: a.startDate, lessons: [] };
      if (!a.startDate) return base;

      const today = todayInTz(a.timezone) ?? new Date().toLocaleDateString('en-CA');
      const startT = new Date(a.startDate + 'T00:00:00Z').getTime();
      const todayT = new Date(today + 'T00:00:00Z').getTime();
      const daysDiff = Math.floor((todayT - startT) / 86400000);
      if (daysDiff < 0) return { ...base, status: 'not_started' };

      const { data: prog } = await supabase
        .from('programs')
        .select('start_semester, weeks_per_semester')
        .eq('id', a.programId)
        .single();
      const wps = prog?.weeks_per_semester ?? 26;
      const startSem = prog?.start_semester ?? 1;

      // 计划外休息周（rest_start_date <= 今天）计数 → 扣周（计划内放假周 is_holiday 不在此扣，占编号）
      const { count: restCount } = await supabase
        .from('cohort_rest_weeks')
        .select('id', { count: 'exact', head: true })
        .eq('cohort_id', a.cohortId)
        .lte('rest_start_date', today);

      const { calWeek, semesterNumber, weekInSemester } = cohortWeekCalc({
        daysDiff, restCount: restCount ?? 0, startSemester: startSem, weeksPerSemester: wps,
      });

      // 本周节次(复用进度算法的 get_week_lessons;返回 Json → 收窄一次)
      type Row = { course_id: string; course_name: string; lesson_id: string; lesson_number: number; lesson_title: string };
      const { data } = await supabase.rpc('get_week_lessons', {
        p_program_id: a.programId,
        p_semester_number: semesterNumber,
        p_week_in_semester: weekInSemester,
      });
      const lessons: WeekLesson[] = ((data ?? []) as unknown as Row[]).map((r) => ({
        courseId: r.course_id,
        courseName: r.course_name,
        lessonId: r.lesson_id,
        lessonNumber: r.lesson_number,
        lessonTitle: r.lesson_title,
      }));

      return { status: 'ok', calWeek, semesterNumber, weekInSemester, startDate: a.startDate, lessons };
    },
  });
}

// ── 近期共修安排（学员端：近期安排；管理端可复用）────────────────────
export type UpcomingSession = {
  id: string;
  kind: 'regular' | 'practice';
  lessonId: string;
  lessonTitle: string | null;
  courseName: string | null;
  scheduledAt: string;
  zoomUrl: string | null;
  location: string | null;
};

// 取本班未来（含今天）的共修，按时间升序。zoom 链接：常规走 cosession_zoom_url、实修走 practice_cosession_zoom_url（按 cohort 默认，单场无覆盖字段）。
export function useUpcomingSessions(cohortId: string | undefined, opts?: { regularZoom?: string | null; practiceZoom?: string | null }) {
  return useQuery({
    queryKey: ['upcoming-sessions', cohortId ?? 'none'],
    enabled: !!cohortId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<UpcomingSession[]> => {
      if (!cohortId) return [];
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from('group_sessions')
        .select('id, cosession_type, lesson_id, scheduled_at, location')
        .eq('cohort_id', cohortId)
        .gte('scheduled_at', nowIso)
        .order('scheduled_at')
        .limit(8);
      if (error) throw error;
      const sessions = data ?? [];
      if (sessions.length === 0) return [];

      // 课时标题 + 所属课程名（按 lesson_id 批量取）。
      const lessonIds = Array.from(new Set(sessions.map((s) => s.lesson_id)));
      const lessonInfo = new Map<string, { title: string; courseName: string | null }>();
      if (lessonIds.length > 0) {
        const { data: lessons } = await supabase
          .from('course_lessons')
          .select('id, title, courses(name)')
          .in('id', lessonIds);
        for (const l of (lessons ?? []) as unknown as { id: string; title: string; courses: { name?: string } | null }[]) {
          lessonInfo.set(l.id, { title: l.title, courseName: l.courses?.name ?? null });
        }
      }

      return sessions.map((s) => {
        const info = lessonInfo.get(s.lesson_id);
        return {
          id: s.id,
          kind: s.cosession_type,
          lessonId: s.lesson_id,
          lessonTitle: info?.title ?? null,
          courseName: info?.courseName ?? null,
          scheduledAt: s.scheduled_at,
          zoomUrl: s.cosession_type === 'practice' ? (opts?.practiceZoom ?? null) : (opts?.regularZoom ?? null),
          location: s.location,
        };
      });
    },
  });
}

// ── 班级详情（学员端头部 + 管理端 classes/[id]）─────────────────────
export type CohortDetail = {
  id: string;
  name: string;
  code: string;
  programId: string;
  programName: string | null;
  timezone: string | null;
  startDate: string | null;
  isActive: boolean;
  schedule: string | null;
  practiceSchedule: string | null;
  regularZoom: string | null;
  practiceZoom: string | null;
  // 原始字段（管理端「调整日程」表单回填用；schedule 是它们格式化后的展示串）
  weeklyDow: number | null;
  weeklyTime: string | null;   // 'HH:MM:SS'
  practiceDow: number | null;
  practiceTime: string | null;
  // 学习提醒(决策188方案A)原始字段——管理端「学习提醒」表单回填用
  reminderEnabled: boolean;
  reminderWeekday: number | null;
  reminderTime: string | null; // 'HH:MM:SS'
  reminderMessage: string | null;
  coaches: string[]; // zhumai 辅导员
  coachIds: string[]; // 辅导员 user_id(判断当前登录者是否为本班主麦,放宽"转正"权限用·决策040/134)
  aixin: string[]; // 爱心
  memberCount: number; // active 在读人数
};

export function useCohortDetail(cohortId: string | undefined) {
  return useQuery({
    queryKey: ['cohort-detail', cohortId ?? 'none'],
    enabled: !!cohortId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<CohortDetail | null> => {
      if (!cohortId) return null;
      const { data: cohort, error } = await supabase
        .from('cohorts')
        .select('id, name, code, program_id, timezone, start_date, is_active, weekly_cosession_dow, weekly_cosession_time, cosession_zoom_url, practice_cosession_dow, practice_cosession_time, practice_cosession_zoom_url, reminder_enabled, reminder_weekday, reminder_time, reminder_message, programs(name)')
        .eq('id', cohortId)
        .single();
      if (error) throw error;
      if (!cohort) return null;
      const c = cohort as unknown as {
        id: string; name: string; code: string; program_id: string; timezone: string | null; start_date: string | null; is_active: boolean | null;
        weekly_cosession_dow: number | null; weekly_cosession_time: string | null; cosession_zoom_url: string | null;
        practice_cosession_dow: number | null; practice_cosession_time: string | null; practice_cosession_zoom_url: string | null;
        reminder_enabled: boolean | null; reminder_weekday: number | null; reminder_time: string | null; reminder_message: string | null;
        programs: { name?: string } | null;
      };

      const [{ coaches, coachIds, aixin }, memberCount] = await Promise.all([
        fetchCohortStaff(cohortId),
        fetchActiveMemberCount(cohortId),
      ]);

      return {
        id: c.id,
        name: c.name,
        code: c.code,
        programId: c.program_id,
        programName: c.programs?.name ?? null,
        timezone: c.timezone,
        startDate: c.start_date,
        isActive: c.is_active ?? true,
        schedule: formatSchedule(c.weekly_cosession_dow, c.weekly_cosession_time),
        practiceSchedule: formatSchedule(c.practice_cosession_dow, c.practice_cosession_time),
        regularZoom: c.cosession_zoom_url,
        practiceZoom: c.practice_cosession_zoom_url,
        weeklyDow: c.weekly_cosession_dow,
        weeklyTime: c.weekly_cosession_time,
        practiceDow: c.practice_cosession_dow,
        practiceTime: c.practice_cosession_time,
        reminderEnabled: c.reminder_enabled ?? false,
        reminderWeekday: c.reminder_weekday,
        reminderTime: c.reminder_time,
        reminderMessage: c.reminder_message,
        coaches,
        coachIds,
        aixin,
        memberCount,
      };
    },
  });
}

// class_admins(zhumai/aixin) → profiles.full_name。两步查（不依赖 PostgREST 外键内嵌）。
async function fetchCohortStaff(cohortId: string): Promise<{ coaches: string[]; coachIds: string[]; aixin: string[] }> {
  const { data: admins } = await supabase
    .from('class_admins')
    .select('user_id, role')
    .eq('cohort_id', cohortId);
  const rows = admins ?? [];
  if (rows.length === 0) return { coaches: [], coachIds: [], aixin: [] };
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', rows.map((r) => r.user_id))
    .is('deletion_requested_at', null); // 注销保留期内不再对师兄显示为在任辅导员/爱心(决策078+B1待办收口)
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? '']));
  const coaches: string[] = [];
  const coachIds: string[] = [];
  const aixin: string[] = [];
  for (const r of rows) {
    const nm = nameById.get(r.user_id);
    if (!nm) continue;
    if (r.role === 'zhumai') { coaches.push(nm); coachIds.push(r.user_id); }
    else if (r.role === 'aixin') aixin.push(nm);
  }
  return { coaches, coachIds, aixin };
}

async function fetchActiveMemberCount(cohortId: string): Promise<number> {
  const { count } = await supabase
    .from('class_members')
    .select('user_id', { count: 'exact', head: true })
    .eq('cohort_id', cohortId)
    .eq('status', 'active');
  return count ?? 0;
}

// ── 班级名单（管理端 classes/[id] 名单）──────────────────────────────
export type RosterMember = {
  userId: string;
  name: string;
  dharmaName: string | null;
  memberRole: 'auditor' | 'formal';
  status: string;
};

export function useCohortRoster(cohortId: string | undefined) {
  return useQuery({
    queryKey: ['cohort-roster', cohortId ?? 'none'],
    enabled: !!cohortId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<RosterMember[]> => {
      if (!cohortId) return [];
      // profiles!inner(必须 inner:用 sss-dev 种子账号临时标记注销+还原,实测核对过——不带
      //   !inner 时该行会存活、只把 profiles 置 null;带 !inner 才会把整行剔除,如这里要的效果)。
      const { data, error } = await supabase
        .from('class_members')
        .select('user_id, member_role, status, profiles!inner!class_members_user_id_fkey(full_name, dharma_name)')
        .eq('cohort_id', cohortId)
        .is('profiles.deletion_requested_at', null); // 班级名册:注销保留期内的账号不再列入(决策078+B1待办收口)
      if (error) throw error;
      const rows = (data ?? []) as unknown as {
        user_id: string; member_role: 'auditor' | 'formal'; status: string;
        profiles: { full_name?: string | null; dharma_name?: string | null } | null;
      }[];
      return rows.map((r) => ({
        userId: r.user_id,
        name: r.profiles?.full_name ?? '未命名',
        dharmaName: r.profiles?.dharma_name ?? null,
        memberRole: r.member_role,
        status: r.status,
      }));
    },
  });
}

// ── 可加入本班的师兄（管理端「添加学员」选人）─────────────────────────
// 候选 = 全部 profiles 中【不在本班】的（可按姓名/学号搜索，限量）。admin 读 profiles 不受同班限制。
export type AddableProfile = { id: string; name: string; dharmaName: string | null; studentId: string | null };

export function useAddableProfiles(cohortId: string | undefined, search: string) {
  return useQuery({
    queryKey: ['addable-profiles', cohortId ?? 'none', search.trim()],
    enabled: !!cohortId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<AddableProfile[]> => {
      if (!cohortId) return [];
      const { data: members } = await supabase.from('class_members').select('user_id').eq('cohort_id', cohortId);
      const existing = new Set((members ?? []).map((m) => m.user_id));
      let q = supabase.from('profiles').select('id, full_name, dharma_name, student_id').is('deletion_requested_at', null).order('full_name').limit(60);
      const s = search.trim();
      if (s) q = q.or(`full_name.ilike.%${s}%,student_id.ilike.%${s}%`);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as { id: string; full_name: string | null; dharma_name: string | null; student_id: string | null }[])
        .filter((p) => !existing.has(p.id))
        .map((p) => ({ id: p.id, name: p.full_name ?? '未命名', dharmaName: p.dharma_name, studentId: p.student_id }));
    },
  });
}

// ── 本班休息周列表（管理端「设休息周」）────────────────────────────────
// 计划外休息周（cohort_rest_weeks）：起始日 ≤ 今天的会让进度往后顺延（扣周）。
export type RestWeek = { id: string; restStartDate: string; reason: string | null };

export function useCohortRestWeeks(cohortId: string | undefined) {
  return useQuery({
    queryKey: ['cohort-rest-weeks', cohortId ?? 'none'],
    enabled: !!cohortId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<RestWeek[]> => {
      if (!cohortId) return [];
      const { data, error } = await supabase
        .from('cohort_rest_weeks')
        .select('id, rest_start_date, reason')
        .eq('cohort_id', cohortId)
        .order('rest_start_date', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => ({ id: r.id, restStartDate: r.rest_start_date, reason: r.reason }));
    },
  });
}

// ── 管理端班级列表（按专业分组）──────────────────────────────────────
export type AdminCohort = {
  id: string;
  name: string;
  code: string;
  status: 'active' | 'graduated';
  studentCount: number;
  schedule: string | null;
  timezone: string | null;
  coachName: string | null;
};
export type AdminProgramGroup = { id: string; name: string; cohorts: AdminCohort[] };

export function useAdminCohorts() {
  return useQuery({
    queryKey: ['admin-cohorts'],
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<AdminProgramGroup[]> => {
      const [{ data: programs }, { data: cohorts }] = await Promise.all([
        supabase.from('programs').select('id, name, display_order').order('display_order'),
        supabase.from('cohorts').select('id, program_id, name, code, is_active, end_date, timezone, weekly_cosession_dow, weekly_cosession_time').order('start_date', { ascending: false }),
      ]);
      const cohortList = cohorts ?? [];
      const cohortIds = cohortList.map((c) => c.id);

      // 各班 active 人数 + 主麦辅导员（一次性拉，按 cohort 归并）。
      const countByCohort = new Map<string, number>();
      const coachByCohort = new Map<string, string>();
      if (cohortIds.length > 0) {
        const [{ data: members }, { data: admins }] = await Promise.all([
          supabase.from('class_members').select('cohort_id, status').in('cohort_id', cohortIds),
          supabase.from('class_admins').select('cohort_id, user_id, role').in('cohort_id', cohortIds).eq('role', 'zhumai'),
        ]);
        for (const m of members ?? []) {
          if (m.status === 'active') countByCohort.set(m.cohort_id, (countByCohort.get(m.cohort_id) ?? 0) + 1);
        }
        const adminRows = admins ?? [];
        if (adminRows.length > 0) {
          const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', adminRows.map((a) => a.user_id));
          const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? '']));
          for (const a of adminRows) {
            if (!coachByCohort.has(a.cohort_id)) {
              const nm = nameById.get(a.user_id);
              if (nm) coachByCohort.set(a.cohort_id, nm);
            }
          }
        }
      }

      const byProgram = new Map<string, AdminCohort[]>();
      for (const c of cohortList) {
        const list = byProgram.get(c.program_id) ?? [];
        list.push({
          id: c.id,
          name: c.name,
          code: c.code,
          status: c.is_active === false ? 'graduated' : 'active',
          studentCount: countByCohort.get(c.id) ?? 0,
          schedule: formatSchedule(c.weekly_cosession_dow, c.weekly_cosession_time),
          timezone: c.timezone,
          coachName: coachByCohort.get(c.id) ?? null,
        });
        byProgram.set(c.program_id, list);
      }

      return (programs ?? [])
        .map((p) => ({ id: p.id, name: p.name, cohorts: byProgram.get(p.id) ?? [] }))
        .filter((g) => g.cohorts.length > 0);
    },
  });
}

// ── 班级页「全班本周共修」实时聚合(PM 2026-06-30「3C」)──────────────────────
// 调 get_cohort_week_totals RPC(security definer 越 RLS 读全班、只返回聚合总数,师兄读不到个人·#193)。
//   函数未部署 / 无打卡数据 → 返回 null,UI 不显该行(不挂占位「—」)。圆满课次待教务口径定后再加(§8.4)。
export type CohortWeekTotals = { reciteTotal: number; activeMembers: number };
export function useCohortWeekTotals(cohortId: string | undefined) {
  return useQuery({
    queryKey: ['cohort-week-totals', cohortId ?? 'none'],
    enabled: !!cohortId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<CohortWeekTotals | null> => {
      if (!cohortId) return null;
      const { data, error } = await supabase.rpc('get_cohort_week_totals', { p_cohort_id: cohortId });
      if (error) return null; // 函数未部署 / 出错 → 静默降级,不显该行
      const row = (Array.isArray(data) ? data[0] : null) as { recite_total?: number; active_members?: number } | null;
      if (!row) return null;
      return { reciteTotal: Number(row.recite_total ?? 0), activeMembers: Number(row.active_members ?? 0) };
    },
  });
}

// ── 班级页「当日在修人数」(RA-1·2026-07-06,2026-07-11 接线)──────────────────
// 调 get_cohort_today_active RPC(security definer 越 RLS 读全班、只返回聚合人数,师兄读不到个人·#193)。
//   与 get_cohort_week_totals(本周)是两个不同展示,各测各、都保留(RA-1 casebook)。
//   函数未部署 / 出错 → 返回 null,UI 不显该行,同 weekTotals 降级口径。
export function useCohortTodayActive(cohortId: string | undefined) {
  return useQuery({
    queryKey: ['cohort-today-active', cohortId ?? 'none'],
    enabled: !!cohortId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<number | null> => {
      if (!cohortId) return null;
      const { data, error } = await supabase.rpc('get_cohort_today_active', { p_cohort_id: cohortId });
      if (error) return null;
      const row = (Array.isArray(data) ? data[0] : null) as { active_count?: number } | null;
      if (!row) return null;
      return Number(row.active_count ?? 0);
    },
  });
}

// ── 「本周课程」逐节全班圆满人数(PM 2026-07-12·延后-①之7·选项C)──────────────
// 不新定义"本周"(不做日历周/滚动周口径判断),直接给 useCurrentWeekLessons 已经算出的
// lessonIds 逐节加"全班完成人数"——天然跟同页面"本周课程"清单所指的课一致,不会出现
// 两个"本周"对不上号。调 get_cohort_lesson_completion RPC(security definer 越 RLS 读
// 全班,只返回聚合计数,不出个人·#193)。
export type LessonCompletionCount = { completeCount: number; totalMembers: number };
export function useCohortLessonCompletion(cohortId: string | undefined, lessonIds: string[]) {
  const key = [...lessonIds].sort().join(',');
  return useQuery({
    queryKey: ['cohort-lesson-completion', cohortId ?? 'none', key],
    enabled: !!cohortId && lessonIds.length > 0,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<Map<string, LessonCompletionCount>> => {
      const result = new Map<string, LessonCompletionCount>();
      if (!cohortId || lessonIds.length === 0) return result;
      const { data, error } = await supabase.rpc('get_cohort_lesson_completion', {
        p_cohort_id: cohortId,
        p_lesson_ids: lessonIds,
      });
      if (error) return result; // 函数未部署 / 出错 → 静默降级,不显该行(同 weekTotals 口径)
      for (const r of (data ?? []) as { lesson_id: string; complete_count: number; total_members: number }[]) {
        result.set(r.lesson_id, { completeCount: Number(r.complete_count ?? 0), totalMembers: Number(r.total_members ?? 0) });
      }
      return result;
    },
  });
}

// ── 后台·班级干事(辅导员/爱心)管理(2026-07-02 补「后台不能任命辅导员/爱心」缺口)──
// class_admins 读:各方可见(RLS);写:仅 admin(class_admins_write)。角色派生自此表,任命即生效。
export type CohortAdminRow = { userId: string; role: 'zhumai' | 'aixin'; name: string };

export function useCohortAdmins(cohortId: string | undefined) {
  return useQuery({
    queryKey: ['cohort-admins', cohortId ?? 'none'],
    enabled: !!cohortId,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<CohortAdminRow[]> => {
      if (!cohortId) return [];
      const { data: rows, error } = await supabase
        .from('class_admins')
        .select('user_id, role')
        .eq('cohort_id', cohortId);
      if (error) throw error;
      const ids = (rows ?? []).map((r) => r.user_id);
      if (ids.length === 0) return [];
      const { data: profs } = await supabase.from('profiles').select('id, full_name, dharma_name').in('id', ids).is('deletion_requested_at', null);
      const nameOf = new Map((profs ?? []).map((p) => [p.id, p.full_name || p.dharma_name || '(未填姓名)']));
      return (rows ?? []).map((r) => ({ userId: r.user_id, role: r.role as 'zhumai' | 'aixin', name: nameOf.get(r.user_id) ?? '(未知)' }));
    },
  });
}

// 任命选人:全部 active 档案按名搜索(含本班成员——辅导员常来自本班,与「可加学员」的排除逻辑不同)
export function useActiveProfilesSearch(search: string) {
  return useQuery({
    queryKey: ['active-profiles-search', search.trim()],
    staleTime: 30 * 1000,
    queryFn: async (): Promise<AddableProfile[]> => {
      let q = supabase.from('profiles').select('id, full_name, dharma_name, student_id').eq('status', 'active').is('deletion_requested_at', null).order('full_name').limit(20);
      const t = search.trim();
      if (t) q = q.or(`full_name.ilike.%${t}%,dharma_name.ilike.%${t}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((p) => ({ id: p.id, name: p.full_name || p.dharma_name || '(未填姓名)', dharmaName: p.dharma_name, studentId: p.student_id }));
    },
  });
}
