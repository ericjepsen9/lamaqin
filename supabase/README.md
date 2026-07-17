# supabase/ · v2.0 重建（决策133）

> sss 生产库**无数据** → 采用**整库重建**（决策133，推翻"不重建"bless）：一份干净的 v2.0 全量
> schema + RLS，**不走增量迁移链、不留漂移**。本目录是 DB 的**操作真源**（CLAUDE.md 规则9）。

## 这是什么
- `migrations/` = 重建 sss 的 SQL，**按域①-⑩ 逐块**写、PM 逐域审（规则9：apply 前 PM 确认）。
- 把 `db_alignment_v2.md` 域①-⑩ + §十 RLS + 决策103-133 的改动**并入**权威 DDL（源：`docs/schema_phase1_2026-05-31.md` / `docs/rls_policies_2026-05-31.md`），**减密法、加 v2.0 新表/字段**。

## 单一事实源 / 防分叉（CLAUDE.md）
- `docs/*_2026-05-31.md` 是**冻结只读基线**（规则7），**不在此就地改**。
- 本目录 SQL 是**操作真源**；中枢 `schema_phase1` / `rls_policies` markdown（设计权威源）**之后**按
  `docs/baseline_sync_v2.md` 清单 bump 补齐 —— 两者经 baseline_sync 对齐，**勿各写各的**。

## 构建顺序（FK / helper 依赖）
| 文件 | 内容 | 状态 |
|---|---|---|
| `20260618000000_prelude.sql` | 扩展 + `set_updated_at` 等共享函数 | ✅ |
| `20260618000010_identity_and_class.sql` | 域① 身份/班级（表 + 身份 helper + RLS + protect trigger + handle_new_auth_user）| ✅ 待审 |
| `20260618000015_audit_and_identity_functions.sql` | audit_logs（提前）+ switch_primary_cohort（131/134）+ promote_member_role（040/134 转正+发号）| ✅ 待审 |
| `20260618000020_course_content.sql` | 课程内容 §6.3（密法废：无 is_tantric）| ✅ 待审 |
| `20260618000030_scheduling_and_progress.sql` | 排表 §6.4 + 进度算法（05-27 verbatim）+ 提醒 | ✅ 待审 |
| `20260618000040_questions.sql` | 域③ 思考题（题型7+payload / SM-2 / 答案规则083）| ✅ 待审 |
| `20260618000050_study_records.sql` | 学修打卡 §6.6（出勤后台录入094/135 / 审核态）| ✅ 待审 |
| `20260618000060_practice.sql` | 域② 修持 §6.7（删is_tantric / 代替方案 / 状态机Edge / 打卡triggers / 回向视图）| ✅ 待审 |
| `20260618000070_transmission.sql` | 域⑤ 传承（master/必需/已得 + 视图 security_invoker）| ✅ 待审 |
| `20260618000080_proxy_exam.sql` | 域④ 代行记录（polymorphic）+ 考试成绩 | ✅ 待审 |
| `20260618000085_care_and_events.sql` | §6.8 班级运营 + 域⑥ 关怀5维快照（⭐师兄不可见）| ✅ 待审 |
| `20260618000090_aux.sql` | §6.10 辅助（藏历/push）+ 域⑧ banner/反馈/短信日志 | ✅ 待审 |
| `20260618000095_advancement.sql` | 域⑨ 升学（v_advancement_5dim security_invoker + 记录）| ✅ 待审 |
| `20260618000098_dharma_qa.sql` | 域⑩ 法义问答（lesson_blocks tsvector + 查询日志）| ✅ 待审 |

> ✅ **12 块 migration 全部写完（域①-⑩ + §6.x 全表）**。
> ✅ **本地 dry-run 验证通过（PostgreSQL 16，2026-06-18）**：12 块按序 apply 0 错误（auth 桩：auth.users/auth.uid()/authenticated 角色）；
>    **63 表全部 RLS-enabled（无裸表）、4 view**（藏历采觉学 tibetan_days·决策137：原 tibetan_calendar+buddhist_days 两表合一）；
>    确认 status 6 态 / enrollment 已删 / **is_tantric 全库 0**（密法0痕迹）/ class_members.member_role 已加 / v_advancement_* = security_invoker / lesson_blocks.ts tsvector 生成列 / 进度算法可调用。
>    ⚠️ 仅 DDL/结构验证（无数据）；**RLS 行为语义、apply 到生产 sss 仍需 PM 过目 + 运维执行**（我够不到 Supabase）。
> 下一步：① PM 审 SQL；② apply 到 sss（运维）；③ 种子数据（§13，需删 is_tantric + 课程清单）单独出；④ 中枢基线 bump（baseline_sync 清单）。

## 增量迁移（v2.0 快照之后 · 2026-06-20 登记，收口决策定稿 §400）
> 上方 12 块 = v2.0 重建**快照**（决策133，设计基线、PM 待审）。以下 = 快照之后、已直接应用到**生产 sss**（部分到 sss-dev）、本次 byte-faithful 拷入真源补登记的增量迁移（源 = 中枢 BICW-NY/sss，各文件顶部有登记 banner 写明源/应用矩阵/依赖）；外加 1 块 App 自出的孤儿收口(`…000005`)。

| 文件 | 内容 | prod | sss-dev |
|---|---|---|---|
| `20260618160000_search_chunks_phase1.sql` | 全站搜索：search_chunks + pgvector + search_ro 角色 + search_semantic RPC（纯官网派生层）| ✅（官网直建） | ❌ 不应用（~2GB、web 专用）|
| `20260619000000_tibetan_calendar_final.sql` | 藏历两表校勘版 tibetan_calendar+buddhist_days（取代决策137 合并表 tibetan_days）+ 365/749 行 | ✅ | ✅（seed 已含）|
| `20260619000005_drop_legacy_tibetan_days.sql` | **App 自出**：删 v2.0 快照建的孤儿合并表 tibetan_days（决策137·从未上 prod）= 重放收口（PM 定 b）| no-op | no-op |
| `20260620000000_drop_buddhist_days_multiplier.sql` | 删 buddhist_days.multiplier | ✅ | ✅ |
| `20260620000010_dharma_assemblies.sql` | 法会表 dharma_assemblies + 解析视图 v_dharma_assembly_dates（空表）| ✅ | ✅ |
| `20260620000020_search_semantic_fix.sql` | search_semantic 过滤召回修复（plpgsql 双分支）| ✅ | ❌（依赖 search_chunks）|
| `20260620170815_add_covers_lessons_and_course_cover_image.sql` | lesson_resources.covers_lessons（**int[] 权威节号**）+ courses.cover_image_url（源侧 sss 出 SQL,App 记账;复用生产版本号）| ✅ tracked | ✅ 两列在场（schema_migrations 行待补·见下）|

> dev 实测一致（2026-06-20 psql）：`tibetan_calendar`(365)+`buddhist_days`(749,**无** multiplier)+`dharma_assemblies`(0)+view 在场；`search_chunks`/`tibetan_days` 均不在 dev。prod 未直查（铁律：开发不连生产），依「已应用」记录 + dev 同形为据。

✅ **重放漂移已收口（PM 定 (b)，2026-06-20，见决策定稿 §400 回执）**：v2.0 快照 `…000090_aux.sql` 建**合并表 `tibetan_days`**（决策137），但该方案**从未应用到生产**——生产/dev 实为**两表**（由 `20260619000000` 建）。**处置 = 新增 `20260619000005_drop_legacy_tibetan_days.sql`**（幂等 `drop table if exists … cascade`；prod/dev = no-op,空白重放清孤儿)。**不改已登记的 `…000090_aux.sql` / `…000100_home_posters.sql`**(迁移制铁律=追加不改;其过期注释留待将来 v2.0 squash 一并清)。
> **验收方式**:不在 dev 跑(两库本无此表=no-op,证不了);真验收 = **空白 scratch 库整链重放**(去 search 两块,prod-only)→ 断言 `public` 仅 `tibetan_calendar`+`buddhist_days`、无 `tibetan_days`。脚本 `supabase/tests/replay_scratch_check.sh`。⚠️ 当前开发机无本地 PG server/docker,executed replay 待 PG16 环境跑;静态证明已具(全链仅 aux 建 `tibetan_days`,`…000005` 之后无任何迁移重建之 → 末态必为两表)。
⚠️ **检索层 prod-only**：search 两块**故意**只在生产、不在 dev（web 派生层）；dev 此层不同形 = 设计、非漂移。
⚠️ **`20260620170815` 的 dev `schema_migrations` 行待补**：dev 两列已在场，但 tracking 行缺（手动 INSERT 撞「绝不手改库」闸 → 留 PM 定）。无害：迁移幂等（add column if not exists），且 dev 该表本就非本文件夹 lineage（仅 3 行)；若日后迁移工具对 dev 运行会自记。

## 还没落（按规范 §七 → Edge / app TS，不进 DB）
愿状态机（032/081）、关怀5维重算（107）、升学5维聚合判定（123）、代替方案应用（120/121）、
校验（留级090/专业锁079/过期锁#190）—— 走 Edge cron TS / app service，**不埋 DB 触发器**。

## §12 过程函数 · 域① 已落（决策134 定口径）
- ✅ `handle_new_auth_user`（注册→建 profile·status 'pending'·无 enrollment）→ 000010
- ✅ `switch_primary_cohort`（决策131/134：用户本人限已入班 + admin；**不保留主麦**）→ 000015
- ✅ `promote_member_role`（决策040/134：本班主麦/admin 转正 auditor→formal + **首次转正发学号**）→ 000015
- ❌ `generate_student_id` 触发器**废**（原挂 profiles.enrollment→formal；发号并入 promote_member_role）
- ❌ `self_register_class_member` **废**（决策126 入班=admin 分配）
> 其余域的 §12 函数（进度算法/打卡派生/状态机等）随对应域文件落；状态机/5维/校验按规范§七走 Edge/app TS、不埋 DB。
