import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { addDays, getTibetanDay, type TibetanDay } from '@/lib/tibetan';
import { mergeTibetanCalendarDay, type BuddhistDayRow, type TibetanCalendarRow } from '@/lib/tibetan-map';

// 藏历查询(2026-07-09 修正设计⑥):共享库真实存在的是两表 tibetan_calendar(365行)+
//   buddhist_days(749行)(2026-06-19 定案),不是之前代码查的 tibetan_days(该表设计已于同月
//   被推翻废弃、从未真正建成——之前的"切源"因此一直 404、静默兜底回本地 JSON,详见审计 2026-07-09)。
//   本地 2026 JSON 仍作兜底(离线/该年份未导入时;当前两表同样只覆盖 2026 年,跨年后会一起兜底)。
// 查中心日 ±45 天覆盖月视图+周条。
export function useTibetanLookup(centerDate: string): (date: string) => TibetanDay | undefined {
  const { data } = useQuery({
    queryKey: ['tibetan-calendar', centerDate.slice(0, 7)],
    staleTime: 24 * 3600 * 1000,
    queryFn: async (): Promise<Record<string, TibetanDay>> => {
      const from = addDays(centerDate, -45);
      const to = addDays(centerDate, 45);
      const [{ data: calRows, error: calErr }, { data: dayRows, error: dayErr }] = await Promise.all([
        supabase
          .from('tibetan_calendar')
          .select('gregorian_date, tib_month, tib_day, tib_month_name, tib_day_name, is_leap_day, nong_month_name, nong_day_name')
          .gte('gregorian_date', from)
          .lte('gregorian_date', to),
        supabase
          .from('buddhist_days')
          .select('gregorian_date, day_type, day_name, description')
          .gte('gregorian_date', from)
          .lte('gregorian_date', to),
      ]);
      if (calErr) throw calErr;
      if (dayErr) throw dayErr;

      const daysByDate = new Map<string, BuddhistDayRow[]>();
      for (const d of (dayRows ?? []) as (BuddhistDayRow & { gregorian_date: string })[]) {
        const list = daysByDate.get(d.gregorian_date) ?? [];
        list.push(d);
        daysByDate.set(d.gregorian_date, list);
      }
      const m: Record<string, TibetanDay> = {};
      for (const cal of (calRows ?? []) as TibetanCalendarRow[]) {
        m[cal.gregorian_date] = mergeTibetanCalendarDay(cal, daysByDate.get(cal.gregorian_date) ?? []);
      }
      return m;
    },
  });
  return (date: string) => data?.[date] ?? getTibetanDay(date);
}
