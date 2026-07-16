# 自学模式 · 判例清单（阶段2 模块4）

> **产出**：2026-07-06｜**性质**：算法已建成于 App 层（`lib/queries/self-study-progress.ts` `useSelfStudyPlan`），本清单为其补判例+单元测试（非 DB harness）。规则已在代码中清晰定型，不含待裁决歧义点，故直接转测试。
> **依据**：决策157（2026-06-19）+ CLAUDE.md §5。

## SS-1 有效节奏 = 用户自定优先，否则专业默认
`pace = user_self_study_programs.weekly_target ?? programs.default_weekly_lessons`（至少 1，`Math.max(...,1)` 钳底）。`paceSource` 标记来源（custom/default）供 UI 展示"你的节奏 vs 大纲默认"。
（出处：决策157；`self-study-plan-calc.ts computeSelfStudyWeekPlan`）
- 边界：weekly_target/default 为 0 或负值也不会导致 0 节奏（钳到 1）——虽然 DB CHECK 已挡 ≤0 的值入库，纯函数自身也兜底。

## SS-2 起修日未到 → 未开始（不计入任何周）
`今天 < start_date` → `started=false, weekNumber=0`，不给出任何节次窗口。
（出处：CLAUDE.md §5 决策157「起修日+有效节奏」；代码行215-217）
- 边界：`今天 == start_date` → 已开始，第 1 周。

## SS-3 ★ 第 N 周 = ⌊(今天−起修日)÷7⌋ + 1 − 已过休息周数（下限 1）
按天数差整除 7 得基础周数，减去「起始日至今」已经过去的休息周次数；结果下限钳为 1（不会因休息周抵消到 0 或负）。
（出处：CLAUDE.md §5「本周计划=起修日+有效节奏+休息周顺延」；代码行218）
- 边界：起修当天(daysDiff=0) → 第 1 周。
- 边界：第 7 天(daysDiff=7) → 第 2 周（进入下一周）。
- 边界：休息周顺延——插入 1 个已过的休息周，本应是第 2 周的日期段仍算第 1 周（顺延效果）。
- 边界 ★：「休息周数」只算 `rest_start_date <= 今天` 的记录——未来休息周不提前抵扣。

## SS-4 本周节次窗口 = 专业课节序列的 [(周−1)×节奏, 周×节奏) 切片
本周学第 fromSeq–toSeq 节：`fromSeq = min(startIdx+1, 总节数)`，`toSeq = min(startIdx+节奏, 总节数)`，`startIdx=(周−1)×节奏`。
（出处：代码行219-220/227-228）
- 边界：总节数为 0 → fromSeq=0（无课节可学）。
- 边界：窗口超出总节数（学到最后一周不足一个节奏）→ toSeq 钳到总节数，不越界。

## SS-5 专业课节顺序：program_weeks 排课优先，无排课回落课时号序
课节顺序优先取该专业的 `program_weeks`（按学期号+周号排），若无排课数据，回落到 `program_courses` 关联课程按 `lesson_number` 排序。
（出处：决策157「复用 program_weeks 节序」；代码行146-181）

## SS-6 「今天」跟手机本地时区（个人自学，非班级集体）
自学进度计算的"今天"取用户设备本地日期（`toLocaleDateString('en-CA')` → YYYY-MM-DD），不用服务器/UTC 日期。
（出处：CLAUDE.md §1 时区四层「个人打卡跟手机本地」；代码行10/13）

---

## 🔵 红线（复述·已由既有 RLS 测覆盖，不在本轮重复测）
- 自学资格门槛（正式生 or 系统管理员授予特权，见决策119）→ `user_self_study_programs` INSERT RLS 已测（`05_rls_full.sql` 行90-106）。
- 自学进度只本人可读写、admin 可读写 → 同表 SELECT/UPDATE/DELETE RLS 模式一致，不单独复测。

## ⚠️ 待细化（不阻塞本轮·标注即可）
- **SS-7**：休息周「未来插入」是否允许（比如提前登记下周休息）——现有算法只认「已过的」休息周，未来休息周提前登记后在到达前不生效，符合直觉但未见规格明文，暂按现状测。
