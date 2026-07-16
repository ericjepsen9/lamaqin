import { cohortWeekCalc } from './cohort-week-calc';

// 班级周数纯函数单测——App 侧与 DB get_current_week_number(§12.6.5)同公式,此测钉死 App 副本防漂移。
// 惯例:基础班 start_semester=1、加行=2(05-27 并入基线);wps=每学期周数。

const P = { startSemester: 1, weeksPerSemester: 26 };

describe('cohortWeekCalc · 周界', () => {
  it('起修当天(daysDiff=0) → 第1周', () => {
    expect(cohortWeekCalc({ ...P, daysDiff: 0, restCount: 0 })).toEqual({ calWeek: 1, semesterNumber: 1, weekInSemester: 1 });
  });
  it('第6天仍第1周;第7天进第2周(整周界)', () => {
    expect(cohortWeekCalc({ ...P, daysDiff: 6, restCount: 0 }).calWeek).toBe(1);
    expect(cohortWeekCalc({ ...P, daysDiff: 7, restCount: 0 }).calWeek).toBe(2);
  });
});

describe('cohortWeekCalc · 休息周扣减', () => {
  it('已过 2 个计划外休息周 → 周数-2', () => {
    // 第10周(daysDiff=63→calWeek 10) 扣2 → 第8周
    expect(cohortWeekCalc({ ...P, daysDiff: 63, restCount: 2 }).calWeek).toBe(8);
  });
  it('扣穿钳底 1(开课初休息周多于日历周)', () => {
    expect(cohortWeekCalc({ ...P, daysDiff: 7, restCount: 5 }).calWeek).toBe(1);
  });
});

describe('cohortWeekCalc · 学期换算', () => {
  it('第26周=第1学期末;第27周=第2学期第1周(跨学期边界)', () => {
    expect(cohortWeekCalc({ ...P, daysDiff: 25 * 7, restCount: 0 })).toEqual({ calWeek: 26, semesterNumber: 1, weekInSemester: 26 });
    expect(cohortWeekCalc({ ...P, daysDiff: 26 * 7, restCount: 0 })).toEqual({ calWeek: 27, semesterNumber: 2, weekInSemester: 1 });
  });
  it('加行 start_semester=2:第1周就是第2学期第1周', () => {
    expect(cohortWeekCalc({ startSemester: 2, weeksPerSemester: 26, daysDiff: 0, restCount: 0 }))
      .toEqual({ calWeek: 1, semesterNumber: 2, weekInSemester: 1 });
  });
  // 下面两条数字故意跟 supabase/tests/04_functions.sql 的 ②/③ 断言完全对应(同 daysDiff/
  // restCount/wps/startSemester,只是那边用真实日期算出 daysDiff,这边直传天数)——DB 那份
  // get_current_week_number 和这份 TS 副本是同一公式的双写(见文件头注),没有运行时互相校验,
  // 只能靠两边测试用例故意保持一致的数字充当护栏:改公式漏改一边,至少有一边测试会先报错到
  // 数字对不上,而不是两边一起悄悄改岔却各自测试全绿(2026-07-15·三易审计跟进)。
  it('加行(startSemester=2)第27自然周→跨学期(3,1)(对应04_functions.sql②"加行第27周")', () => {
    expect(cohortWeekCalc({ startSemester: 2, weeksPerSemester: 26, daysDiff: 26 * 7, restCount: 0 }))
      .toEqual({ calWeek: 27, semesterNumber: 3, weekInSemester: 1 });
  });
  it('同上再扣1个休息周→(2,26)(对应04_functions.sql③"休息周:扣1后")', () => {
    expect(cohortWeekCalc({ startSemester: 2, weeksPerSemester: 26, daysDiff: 26 * 7, restCount: 1 }))
      .toEqual({ calWeek: 26, semesterNumber: 2, weekInSemester: 26 });
  });
  it('wps=4 小学期:第5周 → 第2学期第1周;第9周 → 第3学期第1周', () => {
    expect(cohortWeekCalc({ startSemester: 1, weeksPerSemester: 4, daysDiff: 4 * 7, restCount: 0 }))
      .toEqual({ calWeek: 5, semesterNumber: 2, weekInSemester: 1 });
    expect(cohortWeekCalc({ startSemester: 1, weeksPerSemester: 4, daysDiff: 8 * 7, restCount: 0 }))
      .toEqual({ calWeek: 9, semesterNumber: 3, weekInSemester: 1 });
  });
});
