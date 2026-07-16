// 班级周数纯函数——与 DB get_current_week_number(schema §12.6.5)同公式的 App 侧实现。
// 零依赖文件:从 classes.ts useCohortCurrentWeek 抽出以便 jest 直测,双写漂移有护栏。
// 输入:daysDiff=班级时区下 今天-起修日 的整天数(调用方算);restCount=已过的计划外休息周数
// (rest_start_date<=今天,调用方查;计划内放假 is_holiday 不扣、占编号)。
export function cohortWeekCalc(input: {
  daysDiff: number;        // ≥0(负数=未开课,调用方先判)
  restCount: number;       // 已过的计划外休息周数
  startSemester: number;   // programs.start_semester(基础班1/加行2…)
  weeksPerSemester: number; // programs.weeks_per_semester
}): { calWeek: number; semesterNumber: number; weekInSemester: number } {
  const calWeek = Math.max(Math.floor(input.daysDiff / 7) + 1 - input.restCount, 1);
  const semesterNumber = input.startSemester + Math.floor((calWeek - 1) / input.weeksPerSemester);
  const weekInSemester = ((calWeek - 1) % input.weeksPerSemester) + 1;
  return { calWeek, semesterNumber, weekInSemester };
}
