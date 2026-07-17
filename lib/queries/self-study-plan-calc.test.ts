// 自学模式 · 周计划纯计算测试（阶段2 模块4）。对应 tests/casebook/self-study.md SS-1~4。
import { computeSelfStudyWeekPlan } from './self-study-plan-calc';

describe('computeSelfStudyWeekPlan', () => {
  test('SS-2 起修日未到 → 未开始，不给节次窗口', () => {
    const r = computeSelfStudyWeekPlan({
      startDate: '2026-08-01', today: '2026-07-06',
      weeklyTarget: null, defaultWeeklyLessons: 2, restWeeksPastCount: 0, totalLessons: 100,
    });
    expect(r.started).toBe(false);
    expect(r.weekNumber).toBe(0);
    expect(r.fromSeq).toBe(0);
    expect(r.toSeq).toBe(0);
  });

  test('SS-2 边界：今天==起修日 → 已开始，第1周', () => {
    const r = computeSelfStudyWeekPlan({
      startDate: '2026-07-06', today: '2026-07-06',
      weeklyTarget: null, defaultWeeklyLessons: 2, restWeeksPastCount: 0, totalLessons: 100,
    });
    expect(r.started).toBe(true);
    expect(r.weekNumber).toBe(1);
  });

  test('SS-3 边界：第7天(daysDiff=7) → 进入第2周', () => {
    const r = computeSelfStudyWeekPlan({
      startDate: '2026-07-06', today: '2026-07-13',
      weeklyTarget: null, defaultWeeklyLessons: 2, restWeeksPastCount: 0, totalLessons: 100,
    });
    expect(r.weekNumber).toBe(2);
  });

  test('SS-3 边界：第6天(daysDiff=6) → 仍第1周', () => {
    const r = computeSelfStudyWeekPlan({
      startDate: '2026-07-06', today: '2026-07-12',
      weeklyTarget: null, defaultWeeklyLessons: 2, restWeeksPastCount: 0, totalLessons: 100,
    });
    expect(r.weekNumber).toBe(1);
  });

  test('SS-3★ 休息周顺延：已过1个休息周，本应第2周的日期段仍算第1周', () => {
    const r = computeSelfStudyWeekPlan({
      startDate: '2026-07-06', today: '2026-07-13', // daysDiff=7 → 基础周2
      weeklyTarget: null, defaultWeeklyLessons: 2, restWeeksPastCount: 1, totalLessons: 100,
    });
    expect(r.weekNumber).toBe(1); // 2 - 1 = 1
  });

  test('SS-3 下限钳1：休息周数超过基础周数也不会算出0或负', () => {
    const r = computeSelfStudyWeekPlan({
      startDate: '2026-07-06', today: '2026-07-06', // daysDiff=0 → 基础周1
      weeklyTarget: null, defaultWeeklyLessons: 2, restWeeksPastCount: 5, totalLessons: 100,
    });
    expect(r.weekNumber).toBe(1);
  });

  test('SS-1 节奏：用户自定优先于专业默认，paceSource=custom', () => {
    const r = computeSelfStudyWeekPlan({
      startDate: '2026-07-06', today: '2026-07-06',
      weeklyTarget: 5, defaultWeeklyLessons: 2, restWeeksPastCount: 0, totalLessons: 100,
    });
    expect(r.pace).toBe(5);
    expect(r.paceSource).toBe('custom');
  });

  test('SS-1 节奏：未自定则用专业默认，paceSource=default', () => {
    const r = computeSelfStudyWeekPlan({
      startDate: '2026-07-06', today: '2026-07-06',
      weeklyTarget: null, defaultWeeklyLessons: 3, restWeeksPastCount: 0, totalLessons: 100,
    });
    expect(r.pace).toBe(3);
    expect(r.paceSource).toBe('default');
  });

  test('SS-4 本周节次窗口：第2周·节奏3 → 第4-6节', () => {
    const r = computeSelfStudyWeekPlan({
      startDate: '2026-07-06', today: '2026-07-13', // 第2周
      weeklyTarget: 3, defaultWeeklyLessons: 1, restWeeksPastCount: 0, totalLessons: 100,
    });
    expect(r.weekNumber).toBe(2);
    expect(r.startIdx).toBe(3); // (2-1)*3
    expect(r.fromSeq).toBe(4);
    expect(r.toSeq).toBe(6);
  });

  test('SS-4 边界：总节数为0 → fromSeq=0', () => {
    const r = computeSelfStudyWeekPlan({
      startDate: '2026-07-06', today: '2026-07-06',
      weeklyTarget: 2, defaultWeeklyLessons: 1, restWeeksPastCount: 0, totalLessons: 0,
    });
    expect(r.fromSeq).toBe(0);
    expect(r.toSeq).toBe(0);
  });

  test('SS-4 边界：窗口超出总节数（学到最后不足一个节奏）→ toSeq 钳到总节数', () => {
    const r = computeSelfStudyWeekPlan({
      startDate: '2026-07-06', today: '2026-08-03', // daysDiff=28 → 第5周
      weeklyTarget: 3, defaultWeeklyLessons: 1, restWeeksPastCount: 0, totalLessons: 10,
    });
    expect(r.weekNumber).toBe(5);
    expect(r.startIdx).toBe(12); // (5-1)*3=12，已超总数
    expect(r.fromSeq).toBe(10); // min(13,10)
    expect(r.toSeq).toBe(10);   // min(15,10)
  });

  test('节奏下限钳1：weeklyTarget/default 为0或负也不会导致0节奏', () => {
    const r = computeSelfStudyWeekPlan({
      startDate: '2026-07-06', today: '2026-07-06',
      weeklyTarget: 0, defaultWeeklyLessons: 1, restWeeksPastCount: 0, totalLessons: 100,
    });
    // weeklyTarget=0 时 `?? ` 不会回退(0 不是 null/undefined)，但 Math.max(0,1) 保底为1
    expect(r.pace).toBeGreaterThanOrEqual(1);
  });
});
