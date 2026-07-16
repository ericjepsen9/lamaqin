# 报数 / 集体回向聚合 · 判例清单（草稿 v1，待 PM 审）

> **模块**：报数/集体回向聚合（判例先行·阶段2 模块3）｜**产出**：2026-07-06｜**状态**：待 PM 审核
> **性质**：本模块聚合视图/函数**已建**（v1.0），本清单=为已建代码补判例+测试（验证口径正确 + 隐私红线不破）。测出不符即回报 PM。
> **铁律**：测试通过 ≠ 语义正确；🔵=隐私红线。带出处。

## 三个聚合口径（各不相同，勿混）

| 对象 | 是什么 | 过滤 | 受众/机制 |
|---|---|---|---|
| `get_cohort_week_totals(cohort)` | 班级页「全班本周共修」实时(3C·决策173后) | 全班 active 成员**全部**打卡(不按 share 过滤) | 师兄可见·**SECURITY DEFINER 越 RLS·只出总数** |
| `v_weekly_dedication_totals` | 每周集体回向总和 | 仅 `share_to_collective=true` | 普通视图(受 RLS) |
| `v_event_dedication_totals` | 法会集体回向总和 | 仅 `share_to_collective=true` + event_id | 普通视图（已由 06_workflows W3 测） |

## 判例

### RP-1 全班本周念诵总和 = 本周全班 active 成员打卡 count 之和
`get_cohort_week_totals(cohort).recite_total` = 本周(班级时区周一起算)该班所有 active 成员 `practice_logs.count` 之和。
（出处：get_cohort_week_totals 20260701000010 行12/16；本周口径同 PD-17）

### RP-2 在修人数 = 本周有打卡的不同 active 成员数（匿名计数·#203）
`active_members` = 本周有念诵打卡的**去重** active 成员数；是**匿名人数**（不带身份、不排名）。
（出处：同上 行13；requirements_master #203 匿名计数）

### RP-3 🔵 隐私红线：SECURITY DEFINER 越 RLS，但只吐聚合、绝不漏个人行
`get_cohort_week_totals` 虽以 SECURITY DEFINER 越过逐用户 RLS 读全班，但**只返回聚合**（总和/计数/周起始），返回签名里**没有 user_id / 任何个人明细列**。师兄调用它能看到全班总和，但拿不到任何一个人的具体打卡。
（出处：函数注释 行6-9「只返回聚合、师兄拿不到个人行」；决策173 撤红线但仍守 #193 只出总数）
- ★ 人工核：这是越 RLS 的函数，语义安全靠「只 SELECT 聚合」保证——PM/审计须确认它永不加个人明细列。

### RP-4 集体回向只算「愿意共享」的愿（share_to_collective=true）
`v_weekly_dedication_totals` / `v_event_dedication_totals` 只聚合 `share_to_collective=true` 的愿；share=false 的愿**不进**集体回向总和。
（出处：两视图 WHERE share_to_collective=true，20260618000060 行279-292；HQ-7）

### RP-5 集体回向只出总和 + 参与人数，不出个人身份
回向视图输出 `total_count / participant_count`（参与人数=去重计数），**不列出**任何 user_id/姓名/个人量。
（出处：两视图 SELECT 只有 SUM + COUNT DISTINCT，无 user 明细）

### RP-6 「全班念诵」与「集体回向」口径不同：前者不按 share 过滤
`get_cohort_week_totals`（班级页全班念诵）统计全班**全部**打卡、**不**按 share_to_collective 过滤；`v_weekly_dedication_totals`（集体回向）**只**算 share=true。两者是不同功能、不同口径，勿混。
（出处：get_cohort_week_totals 无 share 过滤 vs v_weekly WHERE share=true）

### RP-7 本周边界 = 班级时区周一起算（同 PD-17）
两处「本周」= `date_trunc('week', 班级时区今天)`（ISO 周一起）；get_cohort_week_totals 用 `now() AT TIME ZONE cohort.timezone`。
（出处：get_cohort_week_totals 行；PD-17）

### RP-8 ✅ 已施工：#203 当日在修人数 = 本班今天有打卡的去重成员数（匿名·班级时区判"今天"）
`get_cohort_today_active(cohort).active_count` = 本班 active 成员里，**今天**（班级时区）有过打卡的去重人数；同一人今天多条打卡只计 1；不是今天的打卡不计入。与 RP-1/2（本周）是两个独立展示，各测各（RA-1 裁定：当日+本周都要）。
（出处：决策102 2026-06-15 v1.0 保留 #203；迁移 20260707000000_cohort_today_active；RA-1 裁定 2026-07-06）

---

## PM 确认结果（2026-07-06 逐条讨论）
- **✅ RA-1 已裁 = C（当日+本周都要）**：补了 `get_cohort_today_active`（当日·首页人气）+ 保留 `get_cohort_week_totals`（本周·班级页3C）。已施工+测试（RP-8）。
- **RA-2 圆满课次 · 暂不做**：圆满规则本身清楚（大纲行82-91+requirements_master@100-102：正式课=听+看+答，限制性=听+看），只是"自动判定"prd明确v1.5+。函数注释「圆满口径未定」是訛误（其实是定义已定、自动判定未做）——待回中枢订正措辞。本轮不测。
- **RA-3 v_weekly_dedication_totals 受 RLS 限制 · 搁置**：它是普通视图，师兄读它只得自己的数据；师兄端要看全班集体回向总和须走 SECURITY DEFINER 函数（如 get_cohort_week_totals/get_cohort_today_active 模式）。回头再议。
