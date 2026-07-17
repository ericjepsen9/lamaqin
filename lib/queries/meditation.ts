import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// 观修座次个人历史(C8·2026-07-10 接线):GuanStep 计时器"累计"此前纯组件内存态,离开页面/
//   刷新即丢失。本汇总只读 meditation_sessions(个人历史),⚠️ 不接入 practice_logs/愿状态机——
//   正式座次/升学统计仍按"修持"页具体愿记录,两套不混(见迁移 20260710000400 头注)。
//   座数(zuo)只算 ≥30 分钟场次(分钟数(min)累计全部,与原组件内存态语义一致)。
// 三易·易维护:30 分钟这条线是本表(个人便利历史,不挂具体愿)自己的口径,同大纲行105那条
//   全局默认值同源但各管各(本表故意不接 practices.min_session_minutes——那是"愿"专属可配置阈值,
//   本表连"哪个愿"都不知道,见头注两套不混)。导出常量供 guan-step.tsx 计时环共用,勿各写一份数字。
export const MEDITATION_SESSION_MIN_MINUTES = 30;
export type MeditationSummary = { sessionCount: number; totalMinutes: number };

export function useMeditationSummary(lessonId: string | undefined) {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ['meditation-summary', uid ?? 'anon', lessonId ?? 'none'],
    enabled: !!uid && !!lessonId,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<MeditationSummary> => {
      if (!uid || !lessonId) return { sessionCount: 0, totalMinutes: 0 };
      const { data, error } = await supabase
        .from('meditation_sessions')
        .select('duration_minutes')
        .eq('user_id', uid)
        .eq('lesson_id', lessonId);
      if (error) throw error;
      const rows = (data ?? []) as { duration_minutes: number }[];
      return {
        sessionCount: rows.filter((r) => r.duration_minutes >= MEDITATION_SESSION_MIN_MINUTES).length,
        totalMinutes: rows.reduce((s, r) => s + r.duration_minutes, 0),
      };
    },
  });
}
