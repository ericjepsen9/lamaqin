import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { todayInTzOrLocal } from '@/lib/date-tz';
import { supabase } from '@/lib/supabase';

// 我的功课(愿)+ 今日计数(决策160/165/167)。读 user_practice_vows(active)+ practices + cohorts。
//   今日数 = practice_logs(log_date=本地今天)按 vow 聚合(count 计数型 / duration_minutes 时长型)。
//   current_count / current_session_count 由 DB 触发器维护(打卡即原子累加·见 20260618000060)。
export type MyVow = {
  vowId: string;
  name: string;
  unit: string;
  measurement: 'count' | 'duration';
  category: string | null;
  source: 'auto' | 'custom';
  cohortId: string | null;
  cohortName: string | null;
  currentCount: number;
  currentSessions: number;
  targetCount: number | null;
  targetPeriod: string;
  dailyTarget: number | null;   // 节奏:每日目标(决策085 自主)
  weeklyTarget: number | null;  // 节奏:每周目标
  startDate: string | null;     // 起修日
  isRequired: boolean;     // is_required_for_promotion(升学硬依据)
  timeLimited: boolean;    // 有 current_end_date(内加行限时等)
  endDate: string | null;
  todayCount: number;
  weekCount: number;       // 本周(周日起)累计计数/时长
  allowedDailyTargets: number[] | null; // 每日目标白名单(PD-9/PD-19);非空=daily_target 只能选其中之一
  dailyTargetLocked: boolean;           // true=daily_target 锁定,本人不可自改(PD-6三选一锁定,如净土)
  status: 'on_track' | 'falling_behind' | 'at_risk' | 'na'; // get_vow_status() 读时算(SD-1单一真源),非存储列
};

// 应完成配速:纯函数抽至 vow-pace.ts(零依赖·jest 直测),此处转发保持既有 import 路径不变。
export { vowPace } from './vow-pace';

// 状态色文案(A3·SD-5 2026-07-08 PM:撤173后师兄可见自己状态色含掉队)。克制:on_track/na 不额外提示
// (维持"没问题不打扰"),只在真的需要关注时才显示——颜色见各消费页自己的 theme 常量。
export const VOW_STATUS_LABEL: Record<MyVow['status'], string | null> = {
  on_track: null,
  falling_behind: '断签提醒 · 已断签一段时间了',
  at_risk: '进度告急 · 按现在速度追不上截止日',
  na: null,
};

const todayLocal = () => new Date().toLocaleDateString('en-CA');
// 本周起始(周日起·本地)YYYY-MM-DD
const weekStartLocal = () => {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return d.toLocaleDateString('en-CA');
};

// 修法选项(加功课选修法用):active practices,按 display_order。
export type PracticeOption = { id: string; name: string; unit: string; measurement: 'count' | 'duration' };
export function usePractices() {
  return useQuery({
    queryKey: ['practices-list'],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<PracticeOption[]> => {
      const { data, error } = await supabase
        .from('practices')
        .select('id, name, unit, measurement, is_active, display_order')
        .eq('is_active', true)
        .order('display_order');
      if (error) throw error;
      return ((data ?? []) as { id: string; name: string; unit: string; measurement: string | null }[])
        .map((p) => ({ id: p.id, name: p.name, unit: p.unit, measurement: (p.measurement as 'count' | 'duration') ?? 'count' }));
    },
  });
}

// 某条愿的打卡历史(决策160 计数历史):读 practice_logs,按日期倒序。补录/打卡后随 my-vows 一并失效刷新。
export type VowLog = { id: string; logDate: string; count: number | null; durationMinutes: number | null; createdAt: string };
export function useVowLogs(vowId: string | undefined) {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ['vow-logs', vowId ?? 'none'],
    enabled: !!uid && !!vowId,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<VowLog[]> => {
      if (!uid || !vowId) return [];
      const { data, error } = await supabase
        .from('practice_logs')
        .select('id, log_date, count, duration_minutes, created_at')
        .eq('user_id', uid)
        .eq('vow_id', vowId)
        .order('log_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(60);
      if (error) throw error;
      return ((data ?? []) as { id: string; log_date: string; count: number | null; duration_minutes: number | null; created_at: string }[])
        .map((l) => ({ id: l.id, logDate: l.log_date, count: l.count, durationMinutes: l.duration_minutes, createdAt: l.created_at }));
    },
  });
}

export function useMyVows() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ['my-vows', uid ?? 'anon'],
    enabled: !!uid,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<MyVow[]> => {
      if (!uid) return [];
      const { data: vrows, error } = await supabase
        .from('user_practice_vows')
        .select('id, source, cohort_id, custom_name, target_count, target_period, daily_target, weekly_target, start_date, current_count, current_session_count, is_required_for_promotion, current_end_date, practices(name, unit, measurement, category, allowed_daily_targets, daily_target_locked), cohorts(name, timezone)')
        .eq('user_id', uid)
        .eq('status', 'active');
      if (error) throw error;
      const rows = (vrows ?? []) as unknown as {
        id: string; source: 'auto' | 'custom'; cohort_id: string | null; custom_name: string | null;
        target_count: number | null; target_period: string; daily_target: number | null; weekly_target: number | null; start_date: string | null;
        current_count: number | null; current_session_count: number | null;
        is_required_for_promotion: boolean | null; current_end_date: string | null;
        practices: { name?: string; unit?: string; measurement?: string; category?: string | null; allowed_daily_targets?: number[] | null; daily_target_locked?: boolean | null } | null;
        cohorts: { name?: string | null; timezone?: string | null } | null;
      }[];
      if (rows.length === 0) return [];

      const today = todayLocal(); // 今日/本周计数是纯个人展示(打了几遍),跟手机本地(CLAUDE.md §1)

      // 状态机(SD-1单一真源·get_vow_status 读时算):师兄本人可见(撤173后SD-5裁定),非管理端专属。
      // p_today 改按所挂班级的时区算(PM 2026-07-15·三易审计跟进):此前这里传的是学员手机本地
      // "今天",辅导员在关怀名单看同一条愿却是按班级时区(care.ts)——跨时区旅行的学员两边会看到
      // 不一样的断签天数/状态,PM 裁定统一按班级时区(班级功课本就是相对班级节奏而言,以此为锚更
      // 说得通,且班级端本来就这么做)。无挂班的自学愿(cohort_id 为空)没有班级时区可用,回退本地。
      const statusResults = await Promise.all(
        rows.map((r) => supabase.rpc('get_vow_status', { p_vow_id: r.id, p_today: todayInTzOrLocal(r.cohorts?.timezone) })),
      );
      const statusMap = new Map<string, MyVow['status']>();
      rows.forEach((r, i) => {
        const s = statusResults[i].data as string | null;
        statusMap.set(r.id, (s ?? 'na') as MyVow['status']);
      });

      // 本周(含今日)计数(按 vow 聚合):一次取本周日志,派生今日 + 本周
      const weekStart = weekStartLocal();
      const todayMap = new Map<string, number>();
      const weekMap = new Map<string, number>();
      const { data: logs } = await supabase
        .from('practice_logs')
        .select('vow_id, count, duration_minutes, log_date')
        .eq('user_id', uid)
        .gte('log_date', weekStart)
        .lte('log_date', today)
        .in('vow_id', rows.map((r) => r.id));
      for (const l of (logs ?? []) as { vow_id: string; count: number | null; duration_minutes: number | null; log_date: string }[]) {
        const n = l.count ?? l.duration_minutes ?? 0;
        weekMap.set(l.vow_id, (weekMap.get(l.vow_id) ?? 0) + n);
        if (l.log_date === today) todayMap.set(l.vow_id, (todayMap.get(l.vow_id) ?? 0) + n);
      }

      return rows
        .map((r) => ({
          vowId: r.id,
          name: r.custom_name ?? r.practices?.name ?? '功课',
          unit: r.practices?.unit ?? '遍',
          measurement: (r.practices?.measurement as 'count' | 'duration') ?? 'count',
          category: r.practices?.category ?? null,
          source: r.source,
          cohortId: r.cohort_id,
          cohortName: r.cohorts?.name ?? null,
          currentCount: r.current_count ?? 0,
          currentSessions: r.current_session_count ?? 0,
          targetCount: r.target_count,
          targetPeriod: r.target_period,
          dailyTarget: r.daily_target,
          weeklyTarget: r.weekly_target,
          startDate: r.start_date,
          isRequired: !!r.is_required_for_promotion,
          timeLimited: !!r.current_end_date,
          endDate: r.current_end_date,
          todayCount: todayMap.get(r.id) ?? 0,
          weekCount: weekMap.get(r.id) ?? 0,
          allowedDailyTargets: r.practices?.allowed_daily_targets ?? null,
          dailyTargetLocked: !!r.practices?.daily_target_locked,
          status: statusMap.get(r.id) ?? 'na',
        }))
        // 计数型在前、时长型(观修)在后;升学硬依据优先
        .sort((a, b) => Number(b.isRequired) - Number(a.isRequired) || a.name.localeCompare(b.name, 'zh'));
    },
  });
}
