import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

// 月度画报(home_posters)管理端读:某年 12 个月,无行的月份补空位(便于网格逐月编辑)。
// 师兄端首页只读当月 active 一张(lib/queries/home.ts useCurrentPoster)。
export type AdminPoster = { month: number; imageUrl: string | null; caption: string | null; isActive: boolean };

export function useAdminPosters(year: number) {
  return useQuery({
    queryKey: ['admin-posters', year],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<AdminPoster[]> => {
      const { data, error } = await supabase
        .from('home_posters')
        .select('month, image_url, caption, is_active')
        .eq('poster_type', 'monthly')
        .eq('year', year);
      if (error) throw error;
      const byMonth = new Map((data ?? []).map((r) => [r.month, r] as const));
      return Array.from({ length: 12 }, (_, i) => {
        const row = byMonth.get(i + 1);
        return {
          month: i + 1,
          imageUrl: row?.image_url ?? null,
          caption: row?.caption ?? null,
          isActive: row?.is_active ?? false,
        };
      });
    },
  });
}

// 法会期(event)/特别日(special)画报(⑦·2026-07-11):起止日期段,命中时替代当月画报(home.ts)。
// 无固定数量(随时新增),管理端做列表而非月度那种固定 12 格。
export type AdminEventPoster = {
  id: string;
  posterType: 'event' | 'special';
  startDate: string;
  endDate: string;
  imageUrl: string | null;
  caption: string | null;
  isActive: boolean;
};

export function useAdminEventPosters(posterType: 'event' | 'special') {
  return useQuery({
    queryKey: ['admin-event-posters', posterType],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<AdminEventPoster[]> => {
      const { data, error } = await supabase
        .from('home_posters')
        .select('id, start_date, end_date, image_url, caption, is_active')
        .eq('poster_type', posterType)
        .order('start_date', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        posterType,
        startDate: r.start_date ?? '',
        endDate: r.end_date ?? '',
        imageUrl: r.image_url,
        caption: r.caption,
        isActive: r.is_active ?? false,
      }));
    },
  });
}
