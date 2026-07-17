import { differenceInCalendarDays } from 'date-fns';

// 应完成配速纯函数(决策085 节奏自主)。零依赖文件:从 practice.ts 抽出以便 jest 直测
// (practice.ts import supabase,jest 载入会撞 AsyncStorage——同 self-study-plan-calc 先例)。
// today 可注入(测试确定性);生产默认当前时刻。
export type PaceInput = {
  dailyTarget: number | null;
  weeklyTarget: number | null;
  targetPeriod: string;
  targetCount: number | null;
  endDate: string | null;
  measurement: 'count' | 'duration';
  currentCount: number;
  currentSessions: number;
};

// ①班级愿存了 daily/weekly_target → 直接换算;②限期愿 → 剩余量÷剩余天/周 反向算;③终生无目标 → null。
//   终生愿可只设 daily_target(每天定量),则每周=每日×7。限期愿念满后(remaining≤0)返回 null(已圆满)。
export function vowPace(vow: PaceInput, today: Date = new Date()): { daily: number | null; weekly: number | null } {
  if (vow.dailyTarget || vow.weeklyTarget) {
    const daily = vow.dailyTarget ?? Math.ceil((vow.weeklyTarget as number) / 7);
    const weekly = vow.weeklyTarget ?? (vow.dailyTarget as number) * 7;
    return { daily, weekly };
  }
  if (vow.targetPeriod === 'until_complete' && vow.targetCount && vow.endDate) {
    const done = vow.measurement === 'count' ? vow.currentCount : vow.currentSessions;
    const remaining = vow.targetCount - done;
    if (remaining <= 0) return { daily: null, weekly: null };
    const daysLeft = Math.max(1, differenceInCalendarDays(new Date(vow.endDate), today));
    const weeksLeft = Math.max(1, Math.ceil(daysLeft / 7));
    return { daily: Math.ceil(remaining / daysLeft), weekly: Math.ceil(remaining / weeksLeft) };
  }
  return { daily: null, weekly: null };
}

// 内加行限时到期前主动提示(A4③·2026-07-14):此前只有事后报错(过期次日打卡被DB拒绝才弹notify),
// 无倒计时/已过期的主动提示。占位·待核(教务未定"临到期"该提前多久提醒)。
// 单一真源(三易审计 2026-07-15 跟进):此前这个 90 同时写死在这里(默认参数)和调用方
// app/(student)/practice.tsx 里的独立常量,两处不互相依赖、改一处不会带另一处,是真实的
// 重复。改成只在这一处导出,调用方 import 这个常量、不再自己声明一份。
export const NEIJIAXING_EXPIRY_WARNING_DAYS = 90;

// 边界:到期当天(daysLeft=0)算"未过期·剩0天",过期次日(daysLeft=-1)才算 expired——
// 与 DB 侧 logs_block_expired_timelimited() 触发器"到期当天仍放行,过期次日才拦"的边界严格对齐。
export function neijiaxingExpiry(
  endDate: string | null,
  today: Date = new Date(),
  warningDays: number = NEIJIAXING_EXPIRY_WARNING_DAYS,
): { daysLeft: number | null; expired: boolean; nearExpiry: boolean } {
  if (!endDate) return { daysLeft: null, expired: false, nearExpiry: false };
  const daysLeft = differenceInCalendarDays(new Date(endDate), today);
  return { daysLeft, expired: daysLeft < 0, nearExpiry: daysLeft >= 0 && daysLeft <= warningDays };
}
