// 管理端「滞后 / 达标」启发式阈值。

// 注:ATTENDANCE(出勤健康色分档·2026-07-12 移除)——大纲本身没有出勤率百分比口径(只有
//   "共修出勤总次数≥93次"这个绝对数,且那是用来分考试档位、不是健康度色标),85/70 无业务依据;
//   PM 裁决(2026-07-12·选项B):升学评定页(advancement 两文件)不再着色,只显示原始数字。
//   DB 侧关怀名单 `attendance_dim_lag`(20260706000200_care_lag_fn.sql)另有一份同口径硬编码
//   85/70,是不同消费方(关怀名单 SM-7 出勤维,非本次讨论范围),该函数自身已标占位待教务
//   (延后-5),本次移除不影响它,教务定稿时那边仍需单独处理。
// 注:PRACTICE_TARGET(修量完成比·2026-07-12 移除)——大纲给的是绝对数(如观修276座/138小时、
//   内加行各10万),没有"接近达标"这种比例概念;改用 count>=target 直接判(advancement 两文件
//   inline 判断)。EXAM(考试分档·2026-07-12 移除)——合格线已按大纲真实规则(出勤次数+开卷/
//   闭卷分档)算,见 lib/exam-pass-line.ts,不再是这里的占位死数字。
// 注:PRACTICE_PACE / Lag3 / attendanceLag / paceLag 已删(2026-07-08)——原供 care.ts 在线算出勤/配速档,
//     care.ts 已改调 DB 状态机(get_care_dims·d0c0c58),这些成为零引用死代码,按「不留孤儿」清除。

// 账号注销保留期(天,占位·待PM/教务核实实际天数——决策078+B1·2026-07-10)。
// ⚠️ 三写提醒:同一个数字还硬编码在
// supabase/migrations/20260710000000_account_deletion.sql:26 的列注释里、
// supabase/functions/purge-deleted-accounts/index.ts:21 的 RETENTION_DAYS 常量里。
// 改天数时这三处要一起改,暂未做成单一真源(如配置表)——量小、改动频率低,先占位。
// (2026-07-16 三易审计跟进:此前 828cb71 补三写提醒时漏了迁移文件那一处,本次补齐。)
export const ACCOUNT_DELETION_RETENTION_DAYS = 30;

// 思考题题干/参考答案字符数上限(占位·待核——2026-07-17 PM决定"要加个上限",没给具体数字,
// 这里按"正常思考题+详细参考答案够用、但挡住整篇文档误粘"估一个宽松值,不是教务定的口径)。
// ⚠️ 双写提醒:同一个数字还硬编码在 supabase/migrations/20260717000100_quiz_text_length_check.sql
// 的两条CHECK约束里,改这个数要一起改那边。
export const QUIZ_TEXT_MAX_LENGTH = 5000;
