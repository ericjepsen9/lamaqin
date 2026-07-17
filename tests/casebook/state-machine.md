# 愿状态机 · 判例清单（草稿 v1，待 PM 审）

> **模块**：愿状态机（判例先行·阶段2 模块2）｜**产出**：2026-07-06｜**状态**：待 PM 审核
> **前置**：延后-27 已由 PM 逐条裁定（DEF-1~5，见 `state-machine-defer27.md` + 记忆）。本清单是那些裁定的「可判对错」落地。
> **状态**（更新）：per-vow 判定引擎已跑绿，见下方施工记录。
>
> **铁律**：测试通过 ≠ 语义正确；★ 项须 PM/教务人工核。带出处；未定/占位如实标。
>
> **裁定回顾（本清单据此写）**：
> - DEF-1：状态机 **3 档** on_track / falling_behind / at_risk（+ completed/paused 生命周期）；will_overdue 是推送不是状态。
> - DEF-3：断签统一 **7 天**；每日型(净土/学经)、每周型(入行) **只有 falling_behind、无 at_risk**；限时累计型(加行内加行/顶礼)才有 at_risk；自选功课不判。
> - DEF-2：at_risk = **按历史实际速度(已修量÷已过天数)推算、到截止日仍差量**（只累计维）。
> - DEF-4：状态机=per-vow 引擎 → 聚合进 5维 task(日常功课)/meditation(观修)维 → 进关怀名单。
> - DEF-5：起修豁免=锚定该愿当前 start_date（未到→不判 na；起 7 天内→强制 on_track）；出勤维=共修出勤率 3 档(只算正式期+记考勤场次)、阈值占位待教务；触发时机 4 条(打卡后/周日cron/改due_date/转正后)。
>
> **⚠️ 实现落点（技术·待 PM 知会）**：判定逻辑拟做成 **DB 函数/视图**（读时算，可 harness 测，与 counting 的 v_daily/v_weekly 同构；CLAUDE.md §8.2「跨表读聚合→视图」）。**形式上偏离决策081「current_status 由 Edge cron TS 算、不埋 DB」**——v1.0 为可测性 + 与 counting 一致先走 DB；Edge cron 落地后可调用/替换本函数（属排期，见文末）。current_status 存储列暂不由本函数写(避免埋触发器)，本函数为「读时判定」单一真源。


> **✅ 引擎已施工跑绿（2026-07-06；SM-5~8 + XJ-10 + 批量已于 2026-07-08 补齐）**：SM-0~4（per-vow 判定）已落成 DB 函数 `get_vow_status(vow, p_today)`（迁移 `20260706000100_vow_status_fn.sql`）+ 测试 `08_state_machine.sql`（**23 断言全绿**；全 harness **287** 绿·带「期望断言数」哨兵）。覆盖：paused不判/起修豁免(未到·窗内)/净土断签7天边界/入行本周4天门槛/加行累计追得上·追不回·断签三落点。SD-1 落地=DB 函数单一真源、带 p_today、Edge cron 后续调用。
> **✅ SM-5~8 已施工（2026-07-06/07·迁移 `20260706000200_care_lag_fn.sql`）**：SM-5/6 聚合进5维 task(日常功课)/meditation(观修)维——由 `practice_dim_lag` 按 `practices.category` 数据驱动分流 worst-of（仅 `source='auto'` 必修·XJ-10 自选排除）；SM-7 出勤维=出勤率占位档；SM-8 flagged=任一可算维 high。整班批量 `get_cohort_care_dims`（迁移 `20260708000000`）。
> **仍待功能落地**：content/听课维 + quiz/答题维（无数据流·恒 na）；Edge cron 落 `cohort_lag_snapshot` 快照（SD-4）；出勤阈值教务定档（延后-5·占位 85/70）；出勤「只算正式期」缺 `formal_since` 列（SD-6）。

---

## 一、per-vow 状态判定（前置：仅 vow.status='active' 才判；paused/completed/custom自选 不判）

### SM-0 前置：非 active 愿不进状态判定
`vow.status != 'active'`（paused/completed/left 等）→ 不参与 current_status 判定（返回 na/跳过）。
（出处：prd §5.9.3@916 前置判断；DEF-4）
- 边界：入行 opt-out 声明放弃的那条 paused 愿，不判、不进关怀。

### SM-1 ★ 净土/学经每日型：断签 ≥ 7 天 = falling_behind；否则 on_track；无 at_risk
每日型愿（净土念佛、学经心经/普贤），连续 7 天（含）没有该愿的打卡记录 → falling_behind；断签 < 7 天 → on_track。**无 at_risk 红档**（无累计终点，追不回不适用）。
（出处：决策049 净土仅断签；DEF-1/DEF-3；断签基准 决策032 行6037）
- 边界：断签天数 = 今天(按班级时区) − 该愿最近一条 log_date；从无记录则从 start_date 起算。
- 边界：恰好断签 7 天 = falling_behind（含等号）；6 天 = on_track。

### SM-2 ★ 入行每周型：本周已过 ≥4 天 且 本周 0 座 = falling_behind；无 at_risk
入行观修（每周 ≥3 座），本自然周（周一起算·PD-17）内已经过去 ≥4 天、且本周座数为 0 → falling_behind；否则 on_track。**无 at_risk**。
（出处：决策050 行5496 特判；DEF-3）
- 边界：本周座数用 Wave 3 的 v_weekly_session_count（周一起算·班级时区）。
- 边界：本周才过 3 天且 0 座 → 仍 on_track（未到 4 天门槛）。

### SM-3 ★ 加行限时累计型：断签 ≥7天 = falling_behind；历史速度追不回 = at_risk（两者可叠加）
限时累计型愿（内加行 6×10万 / 顶礼，有 total_target + current_end_date）：
- 断签 ≥ 7 天 → falling_behind（同 SM-1 口径）。
- **按历史实际速度推算到截止日仍差量 → at_risk**：设 已过天数 = today − start_date，剩余天数 = current_end_date − today，历史日均 = current_count ÷ 已过天数；若 剩余天数 × 历史日均 < (target_count − current_count) → at_risk。
- 两状态可同时成立（既断签又追不回）。
（出处：决策032 行6038 数学追不回；DEF-2 历史速度+只累计维；DEF-3）
- 边界：剩余天数 ≤ 0（已过截止日）且未达标 → at_risk（追不回）。
- 边界：已过天数 = 0（起修当天）→ 不算 at_risk（无历史速度，且落在起修豁免窗，见 SM-4）。
- 边界 ★：历史速度是「占位口径」——PM 已定用历史速度(DEF-2)，但「日均」是否剔除休息周/暂停期，规格未细化，标待核。

### SM-4 ★ 起修豁免：start_date 未到 → 不判(na)；start_date 起 7 天内 → 强制 on_track
豁免锚定该愿**当前** start_date：今天 < start_date → 不进任何落后判定（na）；start_date ≤ 今天 ≤ start_date+6 → 强制 on_track（不管断签/追不回）。
（出处：DEF-5；prd §5.9.4@955 + 决策081 行4406）
- 边界：start_date 可变（师兄提前起修/改节奏，记 pace_history）——豁免锚「当前」start_date，不锚原始。
- 边界：豁免窗内即使 0 打卡也 on_track；第 8 天起才可能 falling_behind。

---

## 二、聚合进 5维 → 关怀名单（DEF-4）

### SM-5 ★ 日常功课维(task_lag)：取该师兄所有「在修修持愿」最落后的一档
task_lag = 该师兄所有 active 修持愿的 per-vow 状态里**最严重的一档**映射：全 on_track → low(绿)；任一 falling_behind → medium(黄)；任一 at_risk → high(红)。
（出处：DEF-4；care.ts 现 worst-of 聚合口径）
- 边界：无在修修持愿 → na。
- 边界 ★（修正现状缺口）：现状 care.ts 的 task 维只覆盖限时累计愿、**漏了净土每日断签**——本判例要求每日型断签(SM-1)也计入 task_lag。

### SM-6 ★ 观修维(meditation_lag)：入行观修愿的状态映射（现状恒 na 的缺口）
meditation_lag = 入行观修愿(per_log·weekly)的 per-vow 状态映射：on_track→low / falling_behind→medium/high。
（出处：DEF-4；db_alignment@198 五维含观修）
- 边界 ★（修正现状缺口）：现状 care.ts 观修维恒 'na' 未接入——本判例要求接入入行观修状态(SM-2)。

### SM-7 出勤维(attendance_lag)：共修出勤率 3 档（阈值占位·待教务）
attendance_lag = 共修出勤率 → 3 档：≥85% low(绿) / ≥70% medium(黄) / <70% high(红)。只算**正式期(formal_since 起)** + 只算**记考勤(tracks_attendance=true)场次**。
（出处：DEF-5；决策180/181 只算 formal + 记考勤；阈值 admin-thresholds.ts 占位）
- 边界 ★：85/70 是**占位测试值·非事实源**（延后-5 待教务定）；测试按此写、代码标占位；教务定稿后改一处 + 更新测试。
- 边界：应出席场次为 0 → na（无可算）。
- 边界：听课(content)/答题(quiz)维本轮不做（无可靠数据流+阈值未定，标 na）。

### SM-8 关怀名单：任一可算维为 high → 进名单(flagged)
师兄的 5 维里任一**可算维**(非 na)为 high → flagged 进关怀名单；辅导员/爱心据此排跟进。
（出处：DEF-4；care.ts flagged 口径）

---

## 三、红线（复述·已有 RLS 测覆盖，状态机不得破）

### SM-9 🔵 师兄端完全看不到状态机/5维/关怀
current_status、cohort_lag_snapshot、care_followups 对师兄一律不可读（管理端 zhumai/aixin/admin 可读）。状态机是管理工具、非师兄成绩单。
（出处：prd §5.9.1@892；RLS 迁移 000060@346 / 000085@96-126；已由 02_rls_tests 行26-27 覆盖）
- 注：撤173 把「师兄端无状态色」降为非否决项(CLAUDE.md §3)，但库 RLS 仍拦——本判例按**现状库仍拦**写；师兄端是否恢复状态色 = 前端可见性决策(治理真空 M2/U5)，不影响本计算层测试。

---

## ⚠️ 待 PM 裁决 / 知会（不阻塞计算层测试）

- **SD-1 实现落点确认**：判定做成 DB 函数/视图（读时算·可测），形式偏离决策081「Edge cron TS」。请 PM 认可「v1.0 走 DB 函数、Edge cron 落地后调用/替换」。
- **✅ SD-2（2026-07-08 PM）**：at_risk 历史日均**不剔除**休息周/暂停期、粗算——简单够用；剔除需休息周表联算、复杂度上升而收益有限。
- **SD-3 出勤维阈值**（SM-7）= 延后-5 教务定；本轮占位 85/70。
- **SD-4 Edge cron 落地排期**：current_status 存储列 + 5维快照的定时重算主体（supabase 无 functions 目录）——何时落地属排期，v1.0 靠 DB 函数读时算顶。
- **✅ SD-5（2026-07-08 PM）**：师兄端**完整显状态色（含掉队）**——撤173 已解除「师兄端无状态色」限制，PM 定师兄可见自己的状态色含掉队提示。⚠️ 就「该师兄本人的状态」而言**覆盖决策035/107「师兄端零呈现」**；需后续做师兄端状态展示 UI（关怀名单仍管理端 only）。
