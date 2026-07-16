# 后端审计 + 架构评估 + 完善计划（2026-06-22）

> 本文 = 一次性合并:① 后端「设计 vs 实现」缺口审计 ② 整体架构评估(可扩展/可维护/可迁移)③ 后端完善计划 + 待办清单。
> 纯审计/规划文档,**不改任何代码**。权威细节回 `design_v2_decisions.md` / `baseline_sync_v2.md` / `db_alignment_v2.md` / `supabase_decoupling_v2.md`。
> 方法:设计源 = 决策日志 + `baseline_sync §五`(域①-⑩ DB 要求)+ `db_alignment §七`(落地待办);实现 = `supabase/migrations/`(main 权威 69表/28函数/5视图/20触发器 + `focused-hamilton` 另 6 条)。已逐项对迁移核实。
> ⚠️ 边界:本审计到「表/视图/Edge 目录 + 关键项」级别;28 函数/20 触发器**未逐个比对**其决策(更深一层,见计划 P4)。

---

## Part 1 · 缺口审计

### A. 已设计、后端【未实现】

#### 🔴 A1 — Edge 计算层【整层缺失】(最大缺口)
`supabase/functions/` **目录不存在**。而 `supabase_decoupling_v2 §七` + `db_alignment §七` 明确把"算"的逻辑放 Edge cron TS / app service。全部未实现:

| 该算的 | 设计落点 | 现状 |
|---|---|---|
| 愿**状态机** `vow.current_status`(每日 cron·断签≥7天/追不回) | Edge cron TS(032/081) | 字段在、无人算 |
| **关怀5维 / `cohort_lag_snapshot`**(每日重算·出勤/功课/听课/答题/观修) | Edge cron TS(107) | 表空壳、无填充 |
| **出勤率 / weekly 汇总**填充(`weekly_study_summary`·`cohort_weekly_practice_summaries`) | Edge/DB视图(087/118) | 空壳 |
| **本地判分** `is_correct`(客观/颂词题·无 LLM) | client/Edge TS(082/108) | 字段在、未接 |
| **闻思圆满判定**(091:听≥1+看≥1+答题;盲聋豁免) | app/Edge TS 读 study_records | 未实现 |
| 法义问答**中文 FTS 检索**(RAG·无生成式) | Edge + PG tsvector(108/109) | tsvector 列在(main)、检索未配 |

> 后果:出勤率、关怀名单、愿状态、判分、圆满 —— **结构都在,"算"的一层一行没写**。这是为什么 `attendance_lag`/`current_status` 现在全是默认值。

#### 🟠 A2 — `user_lesson_progress` + `course_chapters` 仅在 focused-hamilton 分支
闻思进度(听/看/答遍数·圆满核心)和课程分章 —— 设计要的,**实现了但只在功能分支,权威线 main 没有**。属分支分叉遗留(见 B3)。

#### 🟠 A3 — 决策180/181(旁听口径)未实现
旁听照记/只算 formal/从转正起算 + 5维按 formal+tracks 过滤 + admin 标 member_role。依赖 A1 的聚合层一起做。

#### 🟡 A4 — app service 层 + 横切纪律未落
`db_alignment §七`/`decoupling §三` 要的:留级校验 `can_hold_back()`(090)、升学锚定最初正式班 helper(123)、写一致性 Edge/RPC 事务(转正/代行/补录原子)、RLS 每条补"抽象访问规则"注释 —— 均未落。

### B. 已实现、但【不按设计】(conformance 偏差)

| # | 偏差 | 严重度 | 出处 |
|---|---|---|---|
| B1 | `cohort_extra_lessons` 迁移引用 `lessons`(应 `course_lessons`)+ `profiles.role`(无此列,应 `system_admins`/`is_system_admin()`)→ **跑不起来** | 🔴 会失败 | admin 分支迁移 |
| B2 | `v_advancement_5dim.attendance_count` = 裸 `count(group_attend)`,未按 041/180/181 过滤 tracks_attendance + formal + 从转正起算 | 🟠 数据错 | advancement 迁移 |
| B3 | 迁移**三线分叉**(main / focused-hamilton / admin),无单一事实源;`tibetan_days_2026_seed`(我分支)给 main 已 `drop_legacy_tibetan_days` 删掉的表灌种子 → 合并即冲突 | 🟠 治理 | 跨分支 |
| B4 | **sss-dev 实际库 ≠ 迁移**(缺 16 表:transmissions×3/exam_grades/cohort_lag_snapshot/advancement_records/dharma_qa/home_*/feedback/sms_log/tibetan_days/course_chapters/user_lesson_progress…)—— 迁移没整套应用到 sss-dev | 🟠 部署 | sss-dev |
| B5 | **App 架构偏差**:`verify.tsx` 直接调 `supabase.auth.*`(违 `decoupling §三-2`);无 `lib/data/` 强制 repo 层(数据访问散在 `lib/queries/`,可接受但非规范点名模式)。规范称 repo+auth 抽象是"**最关键预防点**(§52),现在改零成本、散了再抽就贵" | 🟡 趋势 | app 代码 |

### C. 【按设计做对了】的(占多数)
- v2.0 schema **69 表**齐全:域①-⑩ 表层(身份/班级/修持/7型题+payload/传承×3/考试/代行/关怀/升学/法义问答/sm2_cards/home_banners/feedback/sms_log)✅
- **进度算法** `get_current_week_number`/`get_current_lesson_number` DB 函数(实测 10/10)✅
- 注册触发器 `handle_new_auth_user`、各表 RLS、search tsvector(main)✅

**一句话:** 骨架(表/列/RLS)基本按设计搭好;但「计算/业务逻辑层」几乎整层没写,加上迁移分了三条线没合。**能存数据,但还不会"算"。**

---

## Part 2 · 架构评估(可扩展 / 可维护 / 可迁移)

> 结论先行:**设计层面 = 优**(三轴都认真设计过);**执行层面 = 中**(三个风险在侵蚀,但都可控、现在修便宜)。

### 可扩展性 —— 优 ✅
- lookup 驱动:programs/practices/`question_type`+`payload`(jsonb)/courses↔program_courses 多对多/权威节轴 course_lessons + 讲者挂 lesson_resources。
- 内容/日历/画报 = **数据非代码**(藏历、posters、内加行年限按 cohort 配)。
- "存储 vs 计算"分层:规则变 → 改 Edge TS、不动 schema(前提是 A1 建起来)。
- 小风险:`question_type` 是 CHECK 枚举(加第 8 型要迁移);但 payload jsonb 给了缓冲。

### 可迁移性 —— 设计优、执行有漏 ⚠️
- ✅ 设计极扎实(`supabase_decoupling_v2`):认清 RLS/SQL/函数/schema 都是**原生 PG 可迁**;真锁定只 4 处(Auth/Storage/Edge/客户端 SDK),各有抽象手法;迁出 playbook 完整(`pg_dump` + 重接 4 边界)。
- ✅ schema/RLS 实现确实原生 PG,唯一绑定 `profiles.id→auth.users`(标准)。
- ⚠️ **但"最关键预防点"(repo 层 + auth 抽象,§52)已开始漂**:`verify.tsx` 直调 `supabase.auth.*`、无 lib/data repo 层。规范明说"代码还没写时立规范零成本、散了再抽就贵"——**现在是修这点的最佳窗口**。

### 可维护性 —— 设计优、现状被三事拖累 ⚠️
- ✅ 设计意图好:复杂规则放**可单测 TS service 层**(§七)、RLS 简单声明式 + 注释、收割觉学 test/CI。
- ⚠️ 现状拖累:
  1. **迁移三线分叉、无单一事实源**(B3)—— 维护性头号问题:决策号会撞、藏历冲突。
  2. **Edge 计算层未建**(A1)—— 可维护性的基石(可单测 service 层)还不存在。
  3. **sss-dev 漂移**(B4)—— "哪个是真的"含糊。
  4. 决策日志大且曾自相矛盾(如旁听翻烧饼,正在清)。

### 总评
> **架构思路在水准之上**(三轴都有意识地设计)。**真正威胁不在设计,在"执行没收口"** —— 三条迁移线没合 + 计算层空缺 + repo/auth 抽象开始漂。**这三件不补,会逐步侵蚀掉本来不错的可扩展/可维护/可迁移。好在都还早、修起来便宜。**

---

## Part 3 · 后端完善计划(分阶段·按依赖排)

> **集成策略(PM 定 2026-06-22):所有活在 `focused-hamilton` 做完 → 最后整体同步 main。** 全程"Claude 在分支写迁移/Edge/app(决策175);应用 sss-dev + 最终合 main = Eric/运维单独部署"。
> **执行进度**:✅ **P0 已完成**(commit `9237d4f`,2026-06-22)。下一步 P1 = Eric 应用到 sss-dev。

### P0 · 三线合一到 focused-hamilton(地基)✅ 已完成
- ✅ `merge origin/main`:带入 search/新藏历(tibetan_calendar_final + drop_legacy)/dharma_assemblies/课程封面/search_log + 配置(expo patch + dev-client/updates/ngrok)。冲突仅 `preview_deploy.md` 一处,git 自动并好(两边不同段落)。
- ✅ 删 `tibetan_days_2026_seed`(被 main 新藏历模型取代;师兄端日历暂仍读本地 JSON,切 DB 留 P3)。
- ✅ admin 两条:`group_sessions_tracks_attendance`(原样)+ `cohort_extra_lessons`(修 B1:`course_lessons`+`is_system_admin()`/`has_class_role`;时间戳改 0621000200 避碰)。
- ✅ 重生成 `database.ts`(66 表/5 视图);`npm install` 同步依赖;验 tsc 0 + web export 0。
- ⏳ 决策号 176-181 回灌中枢核(P5 同步时一并)。
- ⚠️ SQL **顺序 apply 测试**留 P1(本环境无 PG;结构复查无跨依赖冲突)。

### P1 · 应用到 sss-dev(补 B4 的 16 表)🟠
- 把合并后的迁移线整套应用到 sss-dev(Eric/运维)。之后 sss-dev = 迁移。
- 验:重跑结构审计,16 缺表归零。

### P2 · 建 Edge 计算层(补 A1·功能核心)🔴
新建 `supabase/functions/`(薄、标准 TS、可单测,守 §七):
1. `vow-status-cron` —— 愿状态机(每日)
2. `care-lag-cron` —— 关怀5维 + `cohort_lag_snapshot`(每日),**出勤率按 041+180+181**(formal + tracks_attendance + 从转正起算)
3. `weekly-summary-cron` —— weekly/cohort 汇总
4. 圆满判定(091)+ 本地判分(is_correct)—— app/Edge TS
5. 法义问答 FTS 配置(中文 tsvector)
- 每个配单测(收割觉学 test/CI 模式)。

### P3 · 接 180/181 + app service 层(补 A3/A4)🟠
- `v_advancement_5dim` 改:`JOIN group_sessions WHERE tracks_attendance` + `study_date >= formal_since`(修 B2);加 `formal_since`(audit_logs 或 class_members 列)。
- admin 各屏加 `member_role` 身份标识。
- `can_hold_back()` 留级校验、升学锚定 helper、写一致性 Edge/RPC 事务。
- 清理决策日志"旁听不记考勤"过期行(决策180 列的 9 行号)。

### P4 · App 架构补课(补 B5·可迁移基石)🟡 越早越省
> 与 P0-P3 并行,且**应在大规模接数据之前**做(§52:现在零成本)。
- 立 `lib/data/*` typed repo(或正式化 lib/queries 为 repo);UI/页面禁止直接散 supabase。
- `verify.tsx` 的 `supabase.auth.*` 收进 `lib/auth` 包装。
- RLS 每条补"抽象访问规则"注释 + 28 函数/20 触发器逐个对决策做深层 conformance(本审计未覆盖)。

### 依赖图
```
P0(合并迁移)──→ P1(应用 sss-dev) ──→ P2(Edge 计算层) ──→ P3(180/181+service)
P4(repo/auth 抽象)── 并行,尽早 ──┘
```

---

## 附录 · 待办清单(给后端/admin 线照做)

- [ ] **P0-1** 定 main 为权威线;replay 我分支 5 条非冲突迁移
- [ ] **P0-2** 丢 `tibetan_days_2026_seed`;按新藏历模型重种(若需)
- [ ] **P0-3** 修 `cohort_extra_lessons`:`lessons`→`course_lessons`、`profiles.role`→`is_system_admin()`
- [ ] **P0-4** 决策号 176-181 回灌中枢核号
- [ ] **P1** 合并迁移整套应用 sss-dev,重审 16 缺表归零
- [ ] **P2-1** `supabase/functions/vow-status-cron`(状态机)
- [ ] **P2-2** `care-lag-cron`(5维+lag,出勤率按 041+180+181)
- [ ] **P2-3** `weekly-summary-cron`
- [ ] **P2-4** 判分 is_correct + 圆满判定 091
- [ ] **P2-5** 法义问答中文 FTS 配置
- [ ] **P3-1** `v_advancement_5dim` 按 formal+tracks+formal_since 过滤(修 B2)
- [ ] **P3-2** 加 `formal_since` 来源
- [ ] **P3-3** admin 各屏 member_role 标识
- [ ] **P3-4** `can_hold_back()` / 升学锚定 helper / 写一致性事务
- [ ] **P3-5** 清理决策日志旁听过期行(450/2341/3202/5908/6236/6261/6265/6477/6518)
- [ ] **P4-1** 立 `lib/data` repo 层 + `verify.tsx` auth 收进 lib/auth
- [ ] **P4-2** RLS 抽象访问规则注释 + 28 函数/20 触发器深层 conformance 复查
