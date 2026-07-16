import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { todayUTC8 } from '@/lib/tibetan';

// 首页画报(home_posters·决策139/⑦):取图优先级 special(特别日) > event(法会期) > monthly(当月)。
//   法会期/特别日命中时【替代】当月画报(非叠加·PM 2026-07-11);均无则首页用暖色渐变兜底。
// "今天"取 todayUTC8()(同藏历"全球同观"一套口径,而非设备本地——此前这里用 new Date() 是漏改的
//   遗留写法,2026-07-11 顺手订正,避免同一函数里两种"今天"定义并存)。
export type HomePoster = { imageUrl: string; caption: string | null };

async function pickActiveRange(type: 'special' | 'event', today: string): Promise<HomePoster | null> {
  // .limit(1) 不用 .maybeSingle():万一管理端配置了两个重叠日期段,后者命中会报错,这里只取一条、不炸首页。
  const { data } = await supabase
    .from('home_posters')
    .select('image_url, caption')
    .eq('poster_type', type)
    .eq('is_active', true)
    .lte('start_date', today)
    .gte('end_date', today)
    .order('start_date', { ascending: false })
    .limit(1);
  const row = data?.[0];
  return row ? { imageUrl: row.image_url, caption: row.caption } : null;
}

export function useCurrentPoster() {
  const today = todayUTC8();
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  return useQuery({
    queryKey: ['home-poster', today],
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<HomePoster | null> => {
      const special = await pickActiveRange('special', today);
      if (special) return special;
      const event = await pickActiveRange('event', today);
      if (event) return event;
      const { data } = await supabase
        .from('home_posters')
        .select('image_url, caption')
        .eq('poster_type', 'monthly')
        .eq('year', year)
        .eq('month', month)
        .eq('is_active', true)
        .maybeSingle();
      return data ? { imageUrl: data.image_url, caption: data.caption } : null;
    },
  });
}
