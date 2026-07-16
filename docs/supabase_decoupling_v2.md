# Supabase 低耦合 / 可迁出 规范（v2.0）

> 创建：2026-06-16。背景：定栈 = Supabase + Expo/RN（方案A）。PM 要求：用 Supabase 但**控制耦合**，将来**易维护、可迁出**；旧设计按此复查；新设计（`db_alignment_v2.md` 域①-⑩）一律遵此。
> 本规范是 DB/后端 + App 阶段的**架构约束**，与 `db_alignment_v2.md` 配套。
> ✅【PM 批准 2026-06-16·含 §七 复杂逻辑分层】立为架构约束；DB 对齐域①-⑩ + App 一律遵此。

---

## 一、先厘清关键事实（避免过度/错误解耦）
**RLS / SQL 函数 / 触发器 / schema 都是「原生 Postgres」，不是 Supabase 专属——可迁到任何 Postgres（自托管 / RDS / 其他云），RLS 一起迁。**
真正的 Supabase 专属锁定只有 **4 处**：① **Auth**（GoTrue / `auth.users`）② **Storage**（文件托管）③ **Edge Functions**（Deno）④ **客户端 SDK**（`supabase-js` / PostgREST 自动 API）。（+ Realtime，若用）

→ **结论**：解耦重点不是"少用 RLS"（RLS 是可迁的安全资产、守 #193），而是**把这 4 处专属边界抽象掉 + schema 走原生 PG**。这样"换 Postgres 宿主"几乎零成本；"换整套栈"也只重写抽象层。

---

## 二、耦合面 × 解耦手法
| 耦合面 | Supabase 专属? | 锁定度 | 解耦手法（规范）|
|---|---|---|---|
| schema（表/约束/索引）| 否·原生PG | 低 | 标准 SQL；少用 Supabase 专属扩展；`pg_dump` 即可迁 |
| RLS 策略 | 否·原生PG | 低(迁PG)/高(迁非PG) | 保留作安全基线(#193)；**策略简单声明式**(owner/role/cohort 作用域)、**业务逻辑不进 RLS**；每条旁注「抽象访问规则」(迁非PG时照规则在应用层重写) |
| SQL 函数/触发器（进度算法等）| 否·原生PG | 低 | 保留(可迁PG)；但**复杂业务逻辑尽量放应用层 TS**，DB 函数限 数据完整性 + 性能 + 进度算法 |
| **Auth**（auth.users/GoTrue）| **是** | 中 | App 侧 **auth service 包一层**；`profiles` 是用户事实源、`auth.users.id` 仅提供 uuid；换 auth 商=改 service + 重映射 id |
| **Storage**（音频/法本）| **是** | 低-中 | 文件存取走**抽象层**（DB 只存 url/key，不散调 storage SDK）；S3 兼容可换 |
| **Edge Functions**（Deno）| **是** | 中 | Edge **薄、标准 TS、少用专属 API**；能放 App 的逻辑别放 Edge；迁出=搬自有后端 |
| **客户端 SDK**（supabase-js）| **是** | **高** | ⭐ **数据访问层（repository）**：所有 DB 读写过一层 typed repo，**组件里禁止直接散 supabase-js**；换后端=只重写 repo 层 |
| Realtime | 是 | — | v1.0 避免依赖；要用则抽象（轮询/SSE 可替）|

---

## 三、规范条款（新旧设计都遵）
1. **数据访问层（强制·最重要）**：App 所有 DB 访问经一层 `lib/data/*` typed repository（按域：authRepo / vowRepo / studyRepo…）；**禁止在 UI 组件/页面直接写 supabase-js 查询**。换后端 = 重写 repo 层，UI/业务不动。
2. **Auth 抽象**：`lib/auth` 包 Supabase auth；`profiles` 为用户 SoT；业务代码不直接调 `supabase.auth.*`。
3. **Storage 抽象**：`lib/storage` 包文件存取；DB 只存 url/key（已有 download_url 等字段）。
4. **RLS = 安全基线、简单声明式**：守行级隐私红线（#193 / care 师兄不可见 / 答案规则）；策略保持简单（owner=auth.uid() / role / cohort 作用域）；**业务流程逻辑放应用层、不堆进 RLS**；每条 RLS 旁注一句抽象访问规则。
5. **业务逻辑优先应用层 TS**：复杂判定（升学 5 维 / 状态机 / 代行影响）放 App/Edge 可移植 TS；DB 函数/触发器限 数据完整性、性能、进度算法（原生 PG 可迁）。
6. **优先原生 Postgres**：schema 标准 SQL，少用 Supabase 专属，保 `pg_dump`/迁宿主低成本。
7. **Edge Functions 薄而可移植**：标准 TS、最小 Supabase API 面，按"将来能搬自有 Node 后端"写。

---

## 四、迁出 playbook
- **换 Postgres 宿主（最常见·最低成本）**：`pg_dump` schema+data+RLS+函数 → 新 PG；只换 ④客户端连接 + ①②③边界服务（auth/storage/edge）。RLS / 进度算法 / schema 原样迁。
- **换整套栈（如迁 app-layer）**：schema+data 迁 PG；RLS 按 §三-4 注释的「访问规则」在应用层重写；repo 层重写；auth/storage/edge 重接。因有 repo 层 + RLS 规则注释，重写有据、范围可控。

---

## 五、旧设计复查（按本规范审 schema + 131 RLS + 域①-⑤）
- **schema_phase1（51 表）**：✅ 基本原生 PG（表/约束/索引/触发器/`get_current_week_number` 等函数均可迁 PG）。唯一 Supabase 绑定 = `profiles.id REFERENCES auth.users(id)`（标准做法；迁出换 auth 后重映射 id）。**结论：可迁性好，无需大改**。
- **131 条 RLS**：✅ 原生 PG、可迁。**待办（文档纪律，不改策略）**：逐条在 `rls_policies` 旁补一句「抽象访问规则」注释，作迁非 PG 时的重写依据。
- **域①-⑤（已批提案）**：表/字段/RLS 均原生 PG，合规。**新增纪律**：落地时访问一律走 repo 层（§三-1）、RLS 保持简单（§三-4）。
- **App 侧（尚未写代码）**：⭐ **从第一行就立 repo 层 + auth/storage 抽象**——代码还没写、立规范零成本；等散了 supabase-js 再抽就贵。**这是最关键的预防点**。

---

## 七、复杂业务逻辑分层（最优 + 可迁）—— 回应"复杂逻辑也要做到最优"
**原则**：复杂"规则/判定"放**应用层/Edge 可移植 TS**（最优：可单测/可读/可维护/可迁，收割觉学 test/CI）；DB 只留 集合运算/性能/完整性/原生 PG 可迁的；行级隐私放 RLS；最终人工判定放 UI。逐条落点：

| 复杂逻辑 | 最优落点 | 为什么（最优 + 可迁）|
|---|---|---|
| 进度算法 (学期号,学期内周)/休息周/多班（CLAUDE.md§5·实测10/10）| **DB SQL 函数**（原生 PG）| 集合运算 + 高频查询 + 一致性；原生 PG 可迁、不改 |
| 报数/集体回向聚合（087/118·v_weekly/v_event）| **DB 视图 + repo** | 聚合查询，原生 PG 可迁 |
| 圆满判定（091：听≥1+看≥1+答题；盲聋豁免）| **app/Edge TS**（读 study_records 计数判定）| 规则会变（豁免口径）、可单测、轻量 |
| 愿状态机（032/081：断签≥7天/追不回/入行周特判/净土每日）| **Edge cron TS**（每日算，写 vow.current_status）| 规则复杂易变、可单测、可迁；非延迟敏感（每日批）|
| 关怀 5 维滞后快照（107·每日重算）| **Edge cron TS**（读 出勤/功课/听课/答题/观修 算 5 维，写 cohort_lag_snapshot）| 批量、规则化、可单测、可迁 |
| 升学/毕业 5 维评定（017/123）| **app 聚合 5 维（repo/视图）+ 人工判定 UI**；代行(121)影响在聚合时算入 | 数据聚合可迁；判定本就人工（不 auto-gate）|
| 校验：留级次数(090)/专业锁定(079)/内加行过期锁定(#190·122)| **app-layer service 校验**（can_hold_back/can_change_program/can_backfill）+ DB 轻 CHECK/触发器兜底 | 业务规则在可迁 TS、可单测；DB 仅兜底完整性 |
| 代替方案应用（120/121）| **app/Edge TS**（admin 应用、写 proxy_action_records + 影响判定）| 规则化、可迁 |
| 写一致性（转正/代行/补录/建愿 多写原子）| **Edge Function(TS) 或 RPC 事务**包，不在 client 拆多次写 | 原子性 + 可迁（TS 搬自有后端）|

**两点保证**：
1. **可单测 = 质量最优**：复杂规则集中在 app/Edge **service 层**（不散进 UI/RLS/触发器），每条规则有单测（收割觉学 test/CI 模式）；DB 侧（进度算法/聚合）走 schema 验证查询 + 集成测试。
2. **可迁 ≠ 做差**：上表落点中 app/Edge TS 既最优（可测/可读）又可迁（搬自有后端）；DB 侧（进度算法/视图/CHECK）原生 PG 可迁。**两者不冲突，不存在为可迁牺牲最优**。

---

## 六、怎么落（PM 拍）
1. 批准本规范 → 作为 DB/后端 + App 阶段架构约束。
2. 域⑥-⑩ 继续时一律遵 §三 + §七 落点；域⑥ 的 cohort_lag_snapshot（Edge cron TS 算）等照此。
3. RLS「访问规则」注释 + repo 层骨架 + service 层（状态机/5维/校验 TS）骨架，列入 DB/实现阶段待办。
4. **复查 schema §12（跨表 Trigger 与业务逻辑）**：若有复杂业务逻辑（如状态机判定）埋在 DB 触发器，按 §七 迁 Edge/app TS；DB 触发器只留 `updated_at`/audit 自动写/状态字段保护/数据完整性（这些原生 PG 可迁、且本就该在 DB）。

---

## 变更记录
| 日期 | 内容 |
|---|---|
| 2026-06-16 | 创建；Supabase 低耦合/可迁出规范（澄清 RLS=可迁PG非锁定、真锁定在 auth/storage/edge/client；7 条规范 + 迁出 playbook + 旧设计复查）|
| 2026-06-16 | 补 §七 复杂业务逻辑分层（最优+可迁落点矩阵：进度算法/聚合留 DB·状态机/5维/校验/代替走 Edge/app TS·人工判定 UI；保证可单测=最优、可迁≠做差）+ §六-4 复查 §12 触发器 |
