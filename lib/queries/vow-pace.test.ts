import { neijiaxingExpiry, vowPace, type PaceInput } from './vow-pace';

// 配速纯函数单测(决策085 节奏自主)。today 注入固定 2026-07-08,全部确定性。
const TODAY = new Date('2026-07-08T00:00:00Z');
const base: PaceInput = {
  dailyTarget: null, weeklyTarget: null, targetPeriod: 'lifetime', targetCount: null,
  endDate: null, measurement: 'count', currentCount: 0, currentSessions: 0,
};

describe('vowPace · 显式目标换算', () => {
  it('只有 dailyTarget=10 → 每周=10×7=70', () => {
    expect(vowPace({ ...base, dailyTarget: 10 }, TODAY)).toEqual({ daily: 10, weekly: 70 });
  });
  it('只有 weeklyTarget=7 → 每日=ceil(7/7)=1', () => {
    expect(vowPace({ ...base, weeklyTarget: 7 }, TODAY)).toEqual({ daily: 1, weekly: 7 });
  });
  it('weeklyTarget=8 非整除 → 每日上取整=2', () => {
    expect(vowPace({ ...base, weeklyTarget: 8 }, TODAY)).toEqual({ daily: 2, weekly: 8 });
  });
  it('两个都设 → 原样返回不换算', () => {
    expect(vowPace({ ...base, dailyTarget: 3, weeklyTarget: 10 }, TODAY)).toEqual({ daily: 3, weekly: 10 });
  });
});

describe('vowPace · 限期愿反算(until_complete)', () => {
  const timed: PaceInput = { ...base, targetPeriod: 'until_complete', targetCount: 100, endDate: '2026-07-15' };
  it('剩70、剩7天 → 每日=10;weeksLeft=1 → 每周=70', () => {
    expect(vowPace({ ...timed, currentCount: 30 }, TODAY)).toEqual({ daily: 10, weekly: 70 });
  });
  it('已圆满(remaining≤0) → 双 null(无需再算)', () => {
    expect(vowPace({ ...timed, currentCount: 100 }, TODAY)).toEqual({ daily: null, weekly: null });
    expect(vowPace({ ...timed, currentCount: 150 }, TODAY)).toEqual({ daily: null, weekly: null });
  });
  it('duration 型看 currentSessions 而非 currentCount', () => {
    // currentCount=100(会误判圆满)但 sessions=30 → 剩70座
    expect(vowPace({ ...timed, measurement: 'duration', currentCount: 100, currentSessions: 30 }, TODAY))
      .toEqual({ daily: 10, weekly: 70 });
  });
  it('今天=截止日 → daysLeft 钳底 1,不除零:剩50 → 每日=50', () => {
    expect(vowPace({ ...timed, endDate: '2026-07-08', currentCount: 50 }, TODAY))
      .toEqual({ daily: 50, weekly: 50 });
  });
  it('剩10天 → weeksLeft=ceil(10/7)=2:剩100 → 每日=10、每周=50', () => {
    expect(vowPace({ ...timed, endDate: '2026-07-18', currentCount: 0 }, TODAY))
      .toEqual({ daily: 10, weekly: 50 });
  });
  it('缺 endDate 或 targetCount → 不反算,双 null', () => {
    expect(vowPace({ ...timed, endDate: null, currentCount: 0 }, TODAY)).toEqual({ daily: null, weekly: null });
    expect(vowPace({ ...timed, targetCount: null, currentCount: 0 }, TODAY)).toEqual({ daily: null, weekly: null });
  });
});

describe('vowPace · 终生无目标', () => {
  it('lifetime 且无任何目标 → 双 null', () => {
    expect(vowPace(base, TODAY)).toEqual({ daily: null, weekly: null });
  });
});

describe('neijiaxingExpiry · 内加行限时到期提示(A4③)', () => {
  it('无 endDate(终生/未设限时) → 三项均为"平静"态', () => {
    expect(neijiaxingExpiry(null, TODAY)).toEqual({ daysLeft: null, expired: false, nearExpiry: false });
  });
  it('剩余远超预警窗口(剩200天,默认90) → 都不提示', () => {
    expect(neijiaxingExpiry('2027-01-24', TODAY, 90)).toEqual({ daysLeft: 200, expired: false, nearExpiry: false });
  });
  it('剩90天(边界=预警窗口本身) → nearExpiry 命中(闭区间)', () => {
    expect(neijiaxingExpiry('2026-10-06', TODAY, 90)).toEqual({ daysLeft: 90, expired: false, nearExpiry: true });
  });
  it('剩1天 → nearExpiry', () => {
    expect(neijiaxingExpiry('2026-07-09', TODAY, 90)).toEqual({ daysLeft: 1, expired: false, nearExpiry: true });
  });
  it('到期当天(daysLeft=0) → 未过期(与DB触发器"到期当天仍放行"边界对齐),但算nearExpiry', () => {
    expect(neijiaxingExpiry('2026-07-08', TODAY, 90)).toEqual({ daysLeft: 0, expired: false, nearExpiry: true });
  });
  it('过期次日(daysLeft=-1) → expired(与DB触发器"过期次日才拦"边界对齐)', () => {
    expect(neijiaxingExpiry('2026-07-07', TODAY, 90)).toEqual({ daysLeft: -1, expired: true, nearExpiry: false });
  });
  it('过期已久 → 仍是 expired,不误判 nearExpiry', () => {
    expect(neijiaxingExpiry('2026-01-01', TODAY, 90)).toEqual({ daysLeft: -188, expired: true, nearExpiry: false });
  });
  it('warningDays 可自定义(占位·待核阈值,非硬编码单一值)', () => {
    expect(neijiaxingExpiry('2026-07-15', TODAY, 7)).toEqual({ daysLeft: 7, expired: false, nearExpiry: true });
    expect(neijiaxingExpiry('2026-07-16', TODAY, 7)).toEqual({ daysLeft: 8, expired: false, nearExpiry: false });
  });
});
