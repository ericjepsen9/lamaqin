import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { mondayOnOrBefore, sundayOf, type WeeklyReportItem } from '@/lib/queries/report-week-calc';
import { todayInTzOrLocal } from '@/lib/date-tz';

// 报数一键复制(决策064/074a):本班本周(PD-17周界)各修法总量,供 zhumai 生成 WhatsApp 文本。
// zhumai/aixin 对本班 practice_logs 有 RLS 读权(has_class_role),故直查、不需 security definer RPC
// (与 useCohortWeekTotals 的场景不同——那是给【师兄】看全班总和,师兄读不到他人 log 才需越权函数)。
// 只出聚合总量,不带 user_id 展示(#193)。

export type CohortWeeklyReport = {
  weekStart: string;
  weekEnd: string;
  items: WeeklyReportItem[];
  activeMembers: number; // 本周有打卡的不同成员数(同 get_cohort_week_totals 的"在修同学"口径)
};

export function useCohortWeeklyReport(cohortId: string | undefined, timezone: string | null | undefined) {
  const weekStart = mondayOnOrBefore(todayInTzOrLocal(timezone));
  const weekEnd = sundayOf(weekStart);
  return useQuery({
    queryKey: ['cohort-weekly-report', cohortId ?? 'none', weekStart],
    enabled: !!cohortId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<CohortWeeklyReport> => {
      if (!cohortId) return { weekStart, weekEnd, items: [], activeMembers: 0 };

      const { data: members } = await supabase
        .from('class_members')
        .select('user_id')
        .eq('cohort_id', cohortId)
        .eq('status', 'active');
      const activeIds = (members ?? []).map((m) => m.user_id);
      if (activeIds.length === 0) return { weekStart, weekEnd, items: [], activeMembers: 0 };

      const { data: vows } = await supabase
        .from('user_practice_vows')
        .select('id, practice_id')
        .eq('cohort_id', cohortId)
        .in('user_id', activeIds);
      const vowRows = (vows ?? []) as { id: string; practice_id: string }[];
      if (vowRows.length === 0) return { weekStart, weekEnd, items: [], activeMembers: 0 };
      const practiceByVow = new Map(vowRows.map((v) => [v.id, v.practice_id]));

      const { data: logs } = await supabase
        .from('practice_logs')
        .select('vow_id, user_id, count, duration_minutes')
        .in('vow_id', vowRows.map((v) => v.id))
        .gte('log_date', weekStart)
        .lte('log_date', weekEnd);
      const logRows = (logs ?? []) as { vow_id: string; user_id: string; count: number | null; duration_minutes: number | null }[];
      if (logRows.length === 0) return { weekStart, weekEnd, items: [], activeMembers: 0 };

      const practiceIds = [...new Set(vowRows.map((v) => v.practice_id))];
      const { data: practices } = await supabase
        .from('practices')
        .select('id, name, measurement, unit')
        .in('id', practiceIds);
      const practiceInfo = new Map((practices ?? []).map((p) => [p.id, p as { id: string; name: string; measurement: 'count' | 'duration'; unit: string }]));

      const totals = new Map<string, number>(); // practice_id -> 累计
      const loggedUsers = new Set<string>();
      for (const log of logRows) {
        const practiceId = practiceByVow.get(log.vow_id);
        if (!practiceId) continue;
        const info = practiceInfo.get(practiceId);
        const value = info?.measurement === 'duration' ? log.duration_minutes : log.count;
        if (!value) continue;
        totals.set(practiceId, (totals.get(practiceId) ?? 0) + value);
        loggedUsers.add(log.user_id);
      }

      const items: WeeklyReportItem[] = practiceIds
        .filter((pid) => totals.has(pid))
        .map((pid) => {
          const info = practiceInfo.get(pid);
          return { name: info?.name ?? '未知修法', unit: info?.measurement === 'duration' ? '分钟' : (info?.unit ?? '遍'), total: totals.get(pid)! };
        })
        .sort((a, b) => b.total - a.total);

      return { weekStart, weekEnd, items, activeMembers: loggedUsers.size };
    },
  });
}
