// 自学模式·本周计划纯计算（判例先行 tests/casebook/self-study.md SS-1~4·决策157）。
// 零外部依赖，供 self-study-progress.ts 与单元测试共用；不要在此引入 supabase/react-native。

export type SelfStudyWeekCalc = {
  started: boolean;
  weekNumber: number;
  pace: number;
  paceSource: 'custom' | 'default';
  startIdx: number;      // 本周窗口在专业序列里的起始下标(0-based)，供切片 lessons 用
  fromSeq: number;
  toSeq: number;
};

export function computeSelfStudyWeekPlan(params: {
  startDate: string;              // 起修日 YYYY-MM-DD
  today: string;                  // 今天(设备本地) YYYY-MM-DD
  weeklyTarget: number | null;    // 用户自定节奏
  defaultWeeklyLessons: number;   // 专业默认节奏
  restWeeksPastCount: number;     // rest_start_date <= today 的休息周数
  totalLessons: number;           // 专业课节总数
}): SelfStudyWeekCalc {
  const pace = Math.max(params.weeklyTarget ?? params.defaultWeeklyLessons, 1);
  const paceSource: 'custom' | 'default' = params.weeklyTarget != null ? 'custom' : 'default';
  const startT = new Date(params.startDate + 'T00:00:00Z').getTime();
  const todayT = new Date(params.today + 'T00:00:00Z').getTime();
  const daysDiff = Math.floor((todayT - startT) / 86400000);
  if (daysDiff < 0) {
    return { started: false, weekNumber: 0, pace, paceSource, startIdx: 0, fromSeq: 0, toSeq: 0 };
  }
  const weekNumber = Math.max(Math.floor(daysDiff / 7) + 1 - params.restWeeksPastCount, 1);
  const startIdx = (weekNumber - 1) * pace;
  const total = params.totalLessons;
  return {
    started: true,
    weekNumber,
    pace,
    paceSource,
    startIdx,
    fromSeq: total === 0 ? 0 : Math.min(startIdx + 1, total),
    toSeq: Math.min(startIdx + pace, total),
  };
}
