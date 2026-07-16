import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// 共修 / 法会 时间轴(决策160/162/164 + 法会场次决策②·PM 2026-06-30)。
//   一条时间轴上混排:① 法会场次(event_sessions,每场一个节点;无场次的老法会降级为"窗口"节点)
//                     ② 本班实修共修(group_sessions,我的在读班),带我的出勤态。
//   法会节点带「我已念 / 全平台共修」(v_event_dedication_totals 只出总和·#193 不具名)。
//   状态按日期算(非 is_active):start≤今≤end=进行中;未到=即将;已过=往期。
//   守:发愿/回向只出总和(#193);无状态色;event_sessions 不记出勤(PM 决定)。
export type CoreviewNode = {
  key: string;
  kind: 'event' | 'coreview';
  status: 'live' | 'upcoming' | 'past';
  date: string;            // YYYY-MM-DD
  time: string | null;     // HH:mm
  sortKey: string;         // YYYY-MM-DDTHH:mm
  badge: string;           // '法会' | '共修'
  title: string;
  sub: string | null;
  sessionTag: string | null;     // 场次名(早课/晚课)
  // 法会
  eventId: string | null;
  dateRange: string | null;      // 窗口节点:'6/20 – 6/26'
  myCount: number | null;        // 我已念(遍)
  platformTotal: number | null;  // 全平台共修(遍)
  mode: 'online' | 'offline' | 'hybrid' | null;
  onlineUrl: string | null;
  location: string | null;
  // 共修
  sessionId: string | null;
  attended: 'present' | 'absent' | null;
};
export type CoreviewTimeline = { upcoming: CoreviewNode[]; past: CoreviewNode[] };

const mmdd = (s: string) => { const [, m, d] = s.split('-'); return `${Number(m)}/${Number(d)}`; };
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

export function useCoreviewTimeline() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ['coreview-timeline', uid ?? 'anon'],
    enabled: !!uid,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<CoreviewTimeline> => {
      if (!uid) return { upcoming: [], past: [] };
      const today = new Date().toLocaleDateString('en-CA');

      // ── 共修:我的在读班的 group_sessions + 我的出勤 ──────────────
      const { data: mems } = await supabase
        .from('class_members')
        .select('cohort_id')
        .eq('user_id', uid)
        .eq('status', 'active');
      const cohortIds = Array.from(new Set(((mems ?? []) as { cohort_id: string | null }[]).map((m) => m.cohort_id).filter((x): x is string => !!x)));

      const coreNodes: CoreviewNode[] = [];
      if (cohortIds.length > 0) {
        const { data: gs } = await supabase
          .from('group_sessions')
          .select('id, scheduled_at, location, cosession_type, course_lessons(title, courses(name))')
          .in('cohort_id', cohortIds)
          .order('scheduled_at', { ascending: false });
        const sessions = (gs ?? []) as unknown as {
          id: string; scheduled_at: string; location: string | null; cosession_type: string;
          course_lessons: { title: string | null; courses: { name: string | null } | null } | null;
        }[];
        const attMap = new Map<string, 'present' | 'absent'>();
        if (sessions.length > 0) {
          const { data: recs } = await supabase
            .from('study_records')
            .select('group_session_id, study_type')
            .eq('user_id', uid)
            .in('study_type', ['group_attend', 'group_absent'])
            .in('group_session_id', sessions.map((s) => s.id));
          for (const r of (recs ?? []) as { group_session_id: string | null; study_type: string }[]) {
            if (r.group_session_id) attMap.set(r.group_session_id, r.study_type === 'group_attend' ? 'present' : 'absent');
          }
        }
        for (const s of sessions) {
          const date = s.scheduled_at.slice(0, 10);
          const time = s.scheduled_at.slice(11, 16);
          const course = s.course_lessons?.courses?.name;
          const lesson = s.course_lessons?.title;
          const sub = [course ? `《${course}》` : '', lesson, s.location].filter(Boolean).join(' · ') || null;
          coreNodes.push({
            key: `gs-${s.id}`, kind: 'coreview', badge: '共修',
            status: date < today ? 'past' : date === today ? 'live' : 'upcoming',
            date, time, sortKey: `${date}T${time}`,
            title: '本班实修共修', sub, sessionTag: null,
            eventId: null, dateRange: null, myCount: null, platformTotal: null, mode: null, onlineUrl: null, location: s.location,
            sessionId: s.id, attended: attMap.get(s.id) ?? null,
          });
        }
      }

      // ── 法会:events(学员视角 RLS=is_active)+ 场次 + 我的发愿 + 全平台 ──
      const { data: evs } = await supabase
        .from('events')
        .select('id, name, start_date, end_date')
        .order('start_date', { ascending: false });
      const events = (evs ?? []) as { id: string; name: string; start_date: string; end_date: string }[];
      const eventIds = events.map((e) => e.id);

      const sessByEvent = new Map<string, { id: string; session_date: string; start_time: string | null; title: string | null; mode: string; online_url: string | null; location: string | null }[]>();
      const myByEvent = new Map<string, number>();
      const totByEvent = new Map<string, number>();
      if (eventIds.length > 0) {
        const { data: es, error: esErr } = await supabase
          .from('event_sessions')
          .select('id, event_id, session_date, start_time, title, mode, online_url, location')
          .in('event_id', eventIds)
          .order('session_date', { ascending: true })
          .order('display_order', { ascending: true });
        if (!esErr) {
          for (const r of (es ?? []) as { id: string; event_id: string; session_date: string; start_time: string | null; title: string | null; mode: string; online_url: string | null; location: string | null }[]) {
            const arr = sessByEvent.get(r.event_id) ?? [];
            arr.push(r); sessByEvent.set(r.event_id, arr);
          }
        }
        const { data: vows } = await supabase
          .from('user_practice_vows')
          .select('event_id, current_count')
          .eq('user_id', uid)
          .in('event_id', eventIds);
        for (const v of (vows ?? []) as { event_id: string | null; current_count: number | null }[]) {
          if (v.event_id) myByEvent.set(v.event_id, (myByEvent.get(v.event_id) ?? 0) + (v.current_count ?? 0));
        }
        const { data: tots } = await supabase
          .from('v_event_dedication_totals')
          .select('event_id, total_count')
          .in('event_id', eventIds);
        for (const t of (tots ?? []) as { event_id: string | null; total_count: number | null }[]) {
          if (t.event_id) totByEvent.set(t.event_id, (totByEvent.get(t.event_id) ?? 0) + Number(t.total_count ?? 0));
        }
      }

      const eventNodes: CoreviewNode[] = [];
      for (const e of events) {
        const my = myByEvent.get(e.id) ?? 0;
        const tot = totByEvent.get(e.id) ?? 0;
        const sess = sessByEvent.get(e.id) ?? [];
        if (sess.length > 0) {
          for (const s of sess) {
            const t = hhmm(s.start_time);
            const modeTxt = s.mode === 'online' ? '线上 Zoom' : s.mode === 'offline' ? (s.location || '线下') : '线上 + 线下';
            eventNodes.push({
              key: `es-${s.id}`, kind: 'event', badge: '法会',
              status: s.session_date < today ? 'past' : s.session_date === today ? 'live' : 'upcoming',
              date: s.session_date, time: t, sortKey: `${s.session_date}T${t ?? '00:00'}`,
              title: e.name, sub: [t, modeTxt].filter(Boolean).join(' · ') || null, sessionTag: s.title,
              eventId: e.id, dateRange: null, myCount: my, platformTotal: tot,
              mode: (s.mode as 'online' | 'offline' | 'hybrid') ?? 'online', onlineUrl: s.online_url, location: s.location,
              sessionId: null, attended: null,
            });
          }
        } else {
          const status: CoreviewNode['status'] = e.end_date < today ? 'past' : e.start_date <= today ? 'live' : 'upcoming';
          eventNodes.push({
            key: `ev-${e.id}`, kind: 'event', badge: '法会', status,
            date: e.start_date, time: null, sortKey: `${e.start_date}T00:00`,
            title: e.name, sub: `${mmdd(e.start_date)} – ${mmdd(e.end_date)} · 各自发愿念修、圆满共同回向`, sessionTag: null,
            eventId: e.id, dateRange: `${mmdd(e.start_date)} – ${mmdd(e.end_date)}`, myCount: my, platformTotal: tot,
            mode: null, onlineUrl: null, location: null, sessionId: null, attended: null,
          });
        }
      }

      const all = [...coreNodes, ...eventNodes];
      const upcoming = all.filter((n) => n.status !== 'past').sort((a, b) => a.sortKey.localeCompare(b.sortKey)); // 最近的在前
      const past = all.filter((n) => n.status === 'past').sort((a, b) => b.sortKey.localeCompare(a.sortKey));     // 最新的在前
      return { upcoming, past };
    },
  });
}
