// 考试合格线(大纲原文,PM 2026-07-12 拍板"根据成绩自动判断"):
//   共修出勤总次数达到93次 → 30分合格;达不到93次(含自学学员)→ 开卷72分/闭卷60分合格。
// 明确不做(见 supabase/migrations/20260712000100_exam_format.sql 头注):60岁免考、
//   "达不到93次可改考2次每次30分"替代路径——都不在这条纯函数的判断范围内。
// 纯函数,不碰数据库,便于单测(同 downloads-hash.ts/query-persist-allowlist.ts 先例)。
export type ExamFormat = 'open' | 'closed';

export function examPassLine(attendanceCount: number, examFormat: ExamFormat): number {
  if (attendanceCount >= 93) return 30;
  return examFormat === 'open' ? 72 : 60;
}

export function isExamPass(score: number, attendanceCount: number, examFormat: ExamFormat): boolean {
  return score >= examPassLine(attendanceCount, examFormat);
}
