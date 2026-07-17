# 技术栈选型评估 · 启动简报（v2.0）

> 创建：2026-06-16。用途：**另起一个会话/窗口**做技术栈选型——给定已完成的"最新设计"（sss v2.0），对比候选栈，**选出构建效率最高的技术栈**。本页是那个评估会话的**入口**：先读本页，再按指针读三方材料。
> ⚠️ **中立要求**：本简报只摆事实 + 评估维度，**不预设结论**（不偏向任何一栈）。评估者自行得出带取舍的推荐。

---

## 一、评估目标
给定**最新设计**（功能逻辑已 100% 审定：sss 功能清单 104/104 + 觉学对齐 51/51 + 决策 001-130），评估在**哪套技术栈**上构建它**效率最高**。

"效率"按 `CLAUDE.md §1` 准绳权衡（**非纯运行性能**）：
- **Claude Code 写得顺手 > 库版本绑定**；**代码所有权优先**；**稳定性 > 性能极致**；**TS 友好**；
- 叠加：开发速度 / 上线时间、可复用的已有代码量、可维护性、迁移/改造成本、团队熟悉度。

---

## 二、三方对比对象 + 文档指针

### A. 最新设计（= 要构建的目标 / 需求源）
- `docs/design_v2_decisions.md`（决策 001-130，**权威**）
- `docs/feature_inventory_v2.md`（功能清单 104/104）
- `docs/juexue_alignment_v2.md`（觉学对齐 51/51：砍/改/留/反向补）
- `docs/baseline_sync_v2.md`（v2.0 改了哪些基线/范围）
- 基线 `docs/*_2026-05-31.md`（prd / schema_phase1 / rls_policies / requirements_master / principles / terminology）

### B. sss 原设计技术栈（候选 1）
- `docs/tech_stack.md` + `CLAUDE.md §1`：Expo SDK53+ RN + TS / Expo Router / NativeWind v4 / RN Reusables / Zustand / TanStack Query v5 / RHF+Zod / date-fns(-tz) / Lucide RN / **Supabase**（约 13 核心依赖，目标 ≤30）
- `docs/architecture_decisions.md`
- `docs/schema_phase1_2026-05-31.md`：**Supabase 生产库 `sss` 已建**（全量 schema v2 + RLS，2026-06-01；PM bless "sss=最终生产库、不重建"）
- **现状**：DB/后端（Supabase + RLS）已建；**App（Expo/RN）代码大多未建**（v2.0 是设计阶段）。

### C. 觉学技术栈（候选 2）
- `docs/juexue_v2_design/PROJECT-HANDOFF-REPORT.md`（技术架构 + 51 能力 + 角色模型）
- `docs/juexue_v2_design/audit/04-data-model-overview.md`（~61 model）、`audit/05-api-endpoints.md`（~139 端点）、`decisions/08-merged-design.md`、`deploy-migration-runbook.md`
- 栈：**Fastify / Prisma / PostgreSQL / React / Capacitor** + LLM 网关（多 provider，判分/出题场景已上线）
- **现状**：测试阶段运行中，**~35/51 能力已编码**（约 6 万行）；但业务需按"最新设计"realign（砍/改/反向补，见 `juexue_alignment_v2.md`）。

> 以上栈/规模数字以各自文档为准，评估者请自行核对。

---

## 三、核心权衡（评估时必看）
- **技术栈选型是独立决策**：v2.0 设计 + 觉学对齐都**只对业务/红线、未定栈**（PM 明确）。本次就是定这个栈。
- **复用 vs 重建的核心张力**：
  - **觉学**：app 代码已建 ~35 能力（头部省力），但要把砍/改部分 realign 到最新设计——砍：邀请码/积分排行/成就徽章/社交 feed/AI 判分出题/灌顶；改：签到→后台录入、角色模型、自学需 formal、题型 14→7、升学人工判定、内加行年限建班配置；反向补：颂词题型/法义问答 RAG/关怀 5 维/代行记录…（清单见 `juexue_alignment_v2.md`）。
  - **sss**：**生产库 + RLS 已建**、且 schema 本就是最新设计的源（最干净对齐），但 **App 端（Expo/RN）基本要从头写**。
  - 一句话张力：**"继承觉学已建代码但改业务" vs "sss 干净对齐设计但补 App 代码"**。
- 别忘量：**入口/班级全受控**（注册→审批→admin 分班/设主班→转正，决策058/126/127）、**大量后台数据驱动配置**（代替方案/限时年限/必需传承/题型/合格线，决策120/122/124/105/125）、**管理端十一**（M1-M11）——这些在两套栈上的实现成本各是多少，是效率评估的重点。

---

## 四、⚠️ 仓库访问
- 本仓库 `sss-app` 有：最新设计全部 + sss 栈资料 + **觉学的设计文档**（`docs/juexue_v2_design/`）。
- **觉学的实际代码（~6 万行）不在本仓库**——在觉学自己的 repo。若要做真正的"代码复用效率"评估，需把觉学 repo 加进那个会话（用 `list_repos` / `add_repo` 看能否加）；否则只能基于觉学**设计文档**评估。

---

## 五、怎么在新窗口开始
1. 新开一个 Claude Code 会话（本 repo `sss-app`；若要评觉学代码复用，再挂上觉学 repo）。
2. 第一句对它说：**「读 `docs/tech_stack_eval_brief_v2.md`，按它做技术栈选型评估」**。
3. 让它先读三方材料（§二指针），再按 §一维度 + §三权衡**逐项对比**，产出**带取舍的 2-3 个推荐方案 + 理由**（中立、不预设）。
4. 产物建议：一份评估报告（如 `docs/tech_stack_eval_result_v2.md`）。

---
## 变更记录
| 日期 | 内容 |
|---|---|
| 2026-06-16 | 创建技术栈选型评估启动简报（最新设计 vs sss 原栈 vs 觉学栈）|
