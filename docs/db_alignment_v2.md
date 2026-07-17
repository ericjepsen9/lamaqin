# DB / 后端 对齐方案 · v2.0 向 sss 原栈对齐（工作规则9）

> 创建：2026-06-16。背景：PM 定栈 = **sss 原栈（Expo/RN + Supabase）**。本文件把已审定的 v2.0 设计（决策 001-130 + 觉学反向补）**向现有 schema 对齐**。
> **规则9**：真源 = `schema_phase1_2026-05-31`（**生产库 `sss` 已按它建，2026-06-01**）+ 未来 `supabase/migrations/`；**优先复用**；凡改表/加字段/动 RLS **必先经 PM 同意**；**不写代码/迁移**，只给方案（含取舍）。
> 现状：repo 无 `supabase/migrations/`（纯设计阶段）；schema = 51 表（§6.1-§6.10）+ 2 视图 + trigger + RLS。

---

## 零、技术栈决定（依据 `tech_stack_eval_result_v2.md` §10）
- PM 定栈 = **方案 A + 定向收割**：sss 原栈（Supabase + Expo/RN）、**保留已对齐的 RLS 生产库**（51 表 + 131 条 RLS + 进度算法实测 10/10，本就是最新设计的源）、**真原生**；从觉学**定向收割**高价值基建件（LLM 网关 v1.5+ / SM-2 algorithm 纯算法搬 / 答题评分策略 / scheduler 通知 / tsvector 全文检索 / 测试CI 模式），**不继承其代码库**。
- 对本 DB 对齐的两点影响：
  - ① **法义问答 v1.0 = Supabase Postgres `tsvector` 全文检索**（非 pgvector；生成式 LLM v1.5+ 再引网关，决策109）→ 法义问答"加表"从「向量索引」降为「全文检索 + 法本分块」。
  - ② **SM-2 卡表需建**（算法逻辑可搬觉学 `algorithm.ts`，决策106）。
- 安全范式确认：**继续 RLS 中心化**（守 #193/care 隐私红线在 DB 层），不降应用层。

---

## 一、方法
0. **遵 `supabase_decoupling_v2.md`（✅ 已批准·解耦规范）**：§三 7 条（repo 层强制 / auth·storage·edge 抽象 / RLS 简单声明式+访问规则注释 / 业务逻辑优先可迁 TS / 原生 PG）+ §七 复杂逻辑分层落点 —— 本阶段架构约束，所有域遵此。
1. **逐域**（按 schema §6.1-§6.10 表组）过：每个 v2.0 变更 → **复用现有 / 加字段 / 加表 / 改 RLS / 删废**；**优先复用**。
2. **原设计不合理处**单独标「⚠️ 提议修改」，给方案 + 取舍，PM 拍。
3. 每域方案 **PM 同意后**才算定；具体迁移 SQL 由 PM 确认后另行（不在本轮）。
4. ⚠️ 表级具体字段在「逐域详案」时读该域 schema 后给准；本页是**总览/影响地图**，未读到的具体处标「待核」。

---

## 二、影响地图（v2.0 → 现有表组）

| 域 | 现有表组（schema §）| v2.0 主要变更（决策）| 处置 | 冲突/提示 |
|---|---|---|---|---|
| 用户/身份 | §6.1 用户与权限（4）profiles… | 058 pending 回加 / 119 自学特权 / 059 完善资料 / 076 老学员植入 | 改字段 + 加字段 | ⚠️ schema §0.0 删了 'pending'，058 要加回（见 §三-1）|
| 院系/班级 | §6.2 院系结构（3）programs/cohorts/class_members | 126 admin 分班 / 127 admin 设主班 / 003 旁听 / 070 推翻 / 122 内加行年限（cohort 配）| 复用 + 加字段（cohort 内加行基数/可延年限）+ 改 RLS | 主班字段复用；分班/主班 = admin 流程 + RLS |
| 课程内容 | §6.3 课程内容（3）courses/course_lessons/program_courses + lesson_blocks | 091 课程三层（沿用）/ 124 必需传承清单（program 配）| 复用 + 加表/字段（必需传承清单）| lesson_blocks 官网主写，勿改定义 |
| 排表模板 | §6.4 排表模板（5+1）program_weeks/program_week_courses/program_week_practices… | M4 Excel 导入（沿用）/ 进度算法（沿用，05-27 基线）| 复用 | program_weeks 已是「内容序号」非日历 |
| 思考题 | §6.5 思考题（3）questions/question_responses… | 105 题型 7 种（+颂词组句/续接）/ 106 SM-2 / 082/083 答案规则 | 改字段（题型枚举 + payload）+ 加表（SM-2 卡）| 客观/颂词本地判分；问答 submit-only |
| 学修打卡 | §6.6 学修打卡（6）study_records/attendance… | 094 签到→后台录入 / 047 听课多次 / 118 报数实时统计 | 复用 + 改 RLS（出勤后台录入）| 报数节点不需独立表（实时统计）|
| 修持模块 ⭐ | §6.7 修持模块（7）vows/practices/愿模板/practice_logs | 120 代替方案 / 122 限时年限 / 086 限时 / 095 custom / 084 挂愿 / 049-051 计数 / 077 share | 加字段（代替方案/限时配置）+ 复用 | practices.is_tantric → 随密法迁出处理 |
| 班级运营 | §6.8 班级运营（3）events（法会）/cohort_rest_weeks/daily_practice_journals | 054-057 法会愿 / 065-066 共修 / 107 关怀 5 维 / 074 日记延后 | 复用 + 加表（关怀 5 维快照）| 法会愿模型复用 events |
| 密宗访问 | §6.9 密宗访问控制（1）tantric_access_grants | 060 密法迁独立站、本库 0 痕迹 | ✂️ 废表 + practices.is_tantric 废 | ⚠️ 红线（见 §三-2）|
| 辅助内容 | §6.10 辅助内容 tibetan_days/self_study_articles/reminder_presets… | 075 藏历 UTC+8 / **137 藏历采觉学** / 102 提醒语 / 116 banner / 117 反馈 / 116 短信 | **废 tibetan_calendar+buddhist_days→建 tibetan_days(137)** + 加表（banner/反馈/短信）| 殊胜日 UTC+8 |
| 跨域·新增 | —（新表）| 121 代行记录 / 125 考试成绩 / 108 法义问答 RAG | 加表（proxy_action_records / exam_grades+合格线 / content_chunks 检索）| 法义问答 v1.0 仅检索（无 LLM 生成）|
| 升学/毕业 | 跨 §6.1/6.8 | 017/123 5 维评定 / 090 留级次数 / 118 报数依据 / 123 锚定最初班级 | 复用（held_back_count 已有）+ 读 5 维 + 加字段（首班锚定？）| 5 维数据散在各表，判定人工（不 auto-gate）|

---

## 三、⚠️ 原设计冲突 / 不合理（提议修改，待 PM 拍）

> ✅【PM 批准 2026-06-16】#1 pending 加回、#2 密法废 已批准（#2 在域⑦ 执行）；#3 报数节点随 §6.6 逐域核。

1. ✅**已批准** · **profiles.status 缺 'pending'/'rejected'**：schema §0.0（v3.9 场景9）把 'pending' 删了（4 态、DEFAULT 'active'），但**决策058 审批门**要 pending（注册→待审核→admin 批准 active）+ rejected（被拒→未通过页·决策132）。**改动**：status CHECK **加回 'pending' + 'rejected'**（6 态·决策132）、自助注册 → 'pending'（注册触发器建档）；admin 植入（076）/直接建 → 'active'；被拒 → 'rejected'。⚠️ 生产库（06-01 建）无 pending/rejected，需核 + 改。
2. ✅**已批准** · **密宗访问控制 §6.9（tantric_access_grants）+ practices.is_tantric**：决策060 密法迁独立站、本库 0 痕迹。**改动**：**废 §6.9 表 + practices.is_tantric**（红线；归域⑦ 执行）。
3. **报数节点**（待核 schema 是否有 semester_snapshots/报数节点结构）：决策087/118 取消报数节点、实时统计 + 补录。**提议**：不建/废报数节点表，报数=打卡累计实时算（升学硬依据，118）。
4. **其余待逐域核出**（如愿模板代替方案/限时年限的承载方式、题型枚举扩法、关怀状态机 vs 觉学 5 维快照的取舍）。

---

## 四、逐域审顺序（建议）

按依赖 + 重要性：
1. **用户身份 + 班级**（§6.1/6.2）：pending(058)/自学特权(119)/admin 分班(126)/主班(127)/内加行年限(122)。
2. **修持模块**（§6.7 ⭐）：愿/代替方案(120)/限时年限(122)/custom(095)/挂愿(084)/计数(049-051)。
3. **思考题**（§6.5）：题型 7 种(105)/SM-2(106)/答案(083)。
4. **跨域新表**：代行记录(121)/考试成绩(125)。
5. **传承**（§6.3 新）：必需传承清单 + 已得传承(124)。
6. **班级运营**（§6.8）：法会愿(054-057)/关怀 5 维(107)。
7. **密法废**（§6.9）：tantric 表 + is_tantric(060)。
8. **辅助**（§6.10）：藏历 UTC+8(075/116)/banner(116)/反馈(117)/短信(116)/提醒语(102)。
9. **升学/毕业评定**（跨域读）：5 维(123)/留级次数(090)/锚定最初班级。
10. **法义问答 RAG**（新）：content_chunks 检索(108/109)。

> 每域：我读该域现有表定义 → 给「复用/加字段/加表/改 RLS」详案 + 取舍 → PM 拍 → 下一域。

---

## 五、逐域详案

### 域① 身份 + 班级（§6.1 用户与权限 / §6.2 院系结构）✅ 已批准（2026-06-16）
> ✅【PM 全批准 2026-06-16】B1-B3 加字段（member_role / cohorts 内加行年限 / self_study_grants 表）、C1 **enrollment 废** / C2 is_gongdehui 废 / C3 held_back v1.0 系统校验、D1-D3 RLS 方向 —— **全部批准**。
> 落地（迁移 SQL）DB 执行阶段另出，PM 确认后行。

**现有表**：profiles / class_members / class_admins(zhumai/aixin) / system_admins / academies / programs / cohorts。

**A. 复用（不动）**：academies、programs（含 start_semester·05-27）、class_admins、system_admins、cohorts（timezone/共修字段/专业锁定 `can_change_program` 校验）、class_members 核心（status 五态/is_primary 唯一索引/joined_at/held_back_count 字段）。

**B. 加字段（待批）**
- **B1 `class_members.member_role`**（'auditor'/'formal' DEFAULT 'auditor'）—— v2.0 旁听/转正（003/030/040）核心；schema 现无（schema 早于 003）→ **必加**。入班默认 auditor、admin/辅导员转 formal、不可降级。
- **B2 cohorts 内加行年限**：`neijiaxing_lock_years`（基数，默认 4）+ `neijiaxing_ext_years`（可延，默认 1）—— 决策122 建班配置。
- **B3 自学特权（决策119）**：建议独立小表 `self_study_grants`(user_id, granted_by, granted_at, reason, revoked_at) 而非 profiles 布尔——可留痕谁授权/撤销（符合119 audit/双方可见）。

**C. 废 / 改（待批）**
- **C1 `profiles.enrollment` 废**（formal/informal）—— 决策058 身份用 status；"有无正式班"由 `class_members.member_role=formal` 派生、"能否自学"= formal 主修 OR 自学特权。⚠️ 连带改 RLS `is_formal_student`。（保守备选：暂留字段恒不用，不推荐）
- **C2 `cohorts.is_gongdehui` 废 / 恒 false** —— 决策100 废功德会群体；成员走个人自学特权（119）。
- **C3 `held_back_count` v1.0 系统校验** —— 决策090：加行≤2/学经≤2/净土≤1/入行≤1（按 program）；app 层 `can_hold_back()` 拦超额（字段复用，注释"人工掌握"改"系统校验"）。

**D. 改 RLS（待批·方向）**
- **D1 入班=admin 分配(126) / 主班=用户+admin(131)**：class_members INSERT（入班）**仅 admin/学科管理员**写（师兄不能自助入班·126）；**is_primary（主班）写权 = 用户（限自己·已入的班）+ admin**（131·师兄可自助挑主班、admin 也可）。
- **D2 审批门(058/132)**：status≠'active' 用户看不到学修内容（pending→「待审核」页 / rejected→「未通过」页）；**靠 app 路由拦截、公共表不另加 RLS 门**（决策132·避免横切，RLS 兜底可选）。
- **D3 自学特权(119)**：持 self_study_grants 用户跨科系自学读写（无 formal 主修也可，cohort_id=NULL，承001/002）。

**取舍提示**：B1 member_role 是旁听机制硬需求、必加；C1 enrollment 废是把"平台层 formal/informal"收敛到"status + member_role 派生"，更简但要改若干 RLS。

---

### 域② 修持模块（§6.7 ⭐核心 · 7+ 表）✅ 已批准（2026-06-16）
> ✅【PM 全批准 2026-06-16】B1 代替方案加字段、C1 is_tantric 废、C2 状态机 v1.0 只算 032 两态、D1-D3 RLS 分级/锁定/状态机师兄端不可见 —— 全部批准。

**现有表**：practices / practice_contents（92修法）/ practice_guides / practice_templates（=M2 愿模板）/ cohort_recommended_templates（班级↔模板 auto/recommended）/ events（法会）/ practice_appointments（约修）/ user_practice_vows ⭐ / practice_logs / 2 集体回向视图。
> 💡 **结论先行**：§6.7 是 schema 最完整的一块，v2.0 绝大多数修持需求**直接复用**；只 1 处加字段 + 几处口径/RLS。

**A. 复用（不动）**：practices（measurement/unit）、practice_contents（92修法）、practice_guides、cohort_recommended_templates（auto/recommended·012 模板归属）、user_practice_vows 核心（source auto/custom·069/095、target_period·098、share_to_collective·077 恒true、daily/weekly_target、min_session_minutes=30·048、pace_history·051、current_count/session_count·049/050、appointment_id/event_id 标签）、practice_logs（count/duration/session_count·049/050/048/051、is_confirmed·011、log_date 补录·原则6禁未来、#203 当日在修人数·102）、2 集体回向视图（**报数=打卡累计 + v_weekly view 实时算·087/118，无需报数节点表**·§三-3✅）。

**B. 加字段（待批）**
- **B1 practice_templates 代替方案**（决策120）：`can_substitute` / `substitute_practice_id` / `substitute_count`（默认方案；per-person 应用走域④ 代行记录）。
- （内加行限时年限**不在此加**：年限在 cohort·域①B2；vow.current_end_date 由 `cohort.start_date + cohort.neijiaxing_lock_years` 算·决策122；template 复用 target_period/duration 标"限时"即可。）

**C. 废 / 改（待批）**
- **C1 practices.is_tantric 废**（060，域⑦ 执行）+ 连带 vow.share_to_collective 的 is_tantric→auto-false 逻辑作废（恒 true·077）。
- **C2 current_status 状态机口径**：schema 7 态（on_track/slightly_behind/falling_behind/at_risk/will_overdue/completed/paused）vs 决策032 主用 2 态 + 081 完整 reconciliation（延后-27）。**提议 v1.0：枚举字段不动（向后兼容），实际只算 032 的 falling_behind（断签≥7天）/at_risk（数学追不回）+ paused/completed/on_track；slightly_behind/will_overdue 暂不触发（随延后-27）**。**compute 走 Edge cron TS（每日批写 vow.current_status，不埋 DB 触发器·规范§七）；复查 schema §12 若有状态机触发器则迁 Edge TS。**

**D. 改 RLS / app 校验（待批·方向）**
- **D1 current_end_date 改权分级**：内加行限时愿仅 admin 改（073/086）；普通愿辅导员可宽限本班（034）。app 层 + RLS 分权。
- **D2 内加行过期锁定**（#190）：app 层校验内加行限时愿过 current_end_date（含延长期）后不可补；年限取 cohort 配置（122）。
- **D3 current_status 师兄端不可见**（克制·无状态色）：RLS/视图不向师兄端透出 vow.current_status（仅管理端）。

**E. 跨域 hook（备注，详在它域）**：代行记录（121·域④）豁免→愿视为达标 / 替代→按代替量计 / 认可→计入 current_count（愿侧或加 satisfied_by_proxy 标记，域④ 定）；关怀 5 维（107·域⑥）；法会愿（054-057·域⑥）/约修（延后-16·practice_appointments 已建·v1.0 dormant）。

---

### 域③ 思考题 / 题型（§6.5 思考题 · 3 表）✅ 已批准（2026-06-16）
> ✅【PM 全批准 2026-06-16】B1 题型扩7+payload、B2 结构化作答+is_correct、B3 cohort_id 改 nullable（修002冲突）、C1 sm2_cards 表（搬算法）、D1-D3 答案规则/盲聋豁免/本地判分 —— 全部批准。

**现有表**：questions（题目·极薄：prompt/source_hint，**无题型/选项/正确答案**）/ question_responses（answer_text 开放作答 + cohort_id）/ question_references（全局参考答案·admin）。
> ⚠️ **结论先行**：schema 思考题**只支持开放问答**（早于题型扩展）。v2.0 要 **7 题型 + 客观本地判分 + SM-2**（082/105/106/083）→ **本域是实质扩展**，非复用。

**A. 复用**：questions 基础（lesson_id/question_number/prompt）、question_references（参考答案 全局 admin）、question_responses 基础（answer_text/submitted_at）；圆满判定"答思考题"（091）= 有 response。

**B. 加字段（待批）**
- **B1 questions.question_type + payload**（决策082/105）：`question_type`（枚举 single 选择/judge 判断/fill 填空/open 问答/flip 卡片/verse 颂词组句/chain 颂词续接；DEFAULT 'open' 兼容既有题）+ `payload jsonb`（按型存：选项/正确答案/卡片正反/颂词正确序列）。**schema 现只开放问答 → 必扩**。
- **B2 question_responses 结构化作答**：加 `answer_payload jsonb`（客观/颂词题结构化作答）+ `is_correct boolean`（客观/颂词本地判分结果）；问答仍用 answer_text（决策082/083）。
- **B3 question_responses.cohort_id 改 nullable**（⚠️ 原设计冲突）：自学跨科系答题 cohort=NULL（决策002/009），但 schema 现为 NOT NULL；连带 UNIQUE(question_id,user_id,cohort_id) 改 partial/coalesce（保证自学题答案唯一）。

**C. 加表（待批）**
- **C1 sm2_cards**（决策106）：user_id / question_id / ease_factor / interval_days / repetitions / due_date / sm2_status；适用 客观/卡片/颂词（问答不进 SM-2·083）。**算法逻辑搬觉学 `algorithm.ts`（收割·纯算法）**，不抄代码库。

**D. RLS / app（待批·方向）**
- **D1 答案规则（083）**：问答（open）的 question_references **不透师兄端**（仅 admin·061/101）；客观/颂词题 payload 正确答案**提交后显**（对错反馈）。
- **D2 盲聋豁免**（091/106）：思考题（091）+ 颂词背诵（106）盲/聋豁免 → app 层按 profiles.accessibility_needs 跳过。
- **D3 本地判分**（082/108）：客观/颂词题客户端或 Edge 判分（无 LLM）；is_correct 写回。**AI 判分/出题永久砍**（108，无相关表）。

**取舍提示**：B1 题型扩展是本域大头（schema 思考题太薄）；B3 是修一处原设计与决策002 的硬冲突（自学答题 cohort=NULL）；C1 SM-2 表 + 收割算法。

---

### 域④ 跨域新表 · 代行记录 + 考试成绩（schema 无 · 加表）✅ 已批准（2026-06-16）
> ✅【PM 全批准 2026-06-16】proxy_action_records（target **polymorphic**）+ exam_grades（合格线 **v1.0 人工**、配置化 v1.5+）—— 批准。

**C1 `proxy_action_records` · 代行记录（决策121）**
- 字段：id / user_id（师兄）/ action_type（'substitute' 替代 / 'recognize' 追溯认可 / 'exempt' 豁免）/ admin_id（经办）/ **target_kind**（对哪类要求：vow / lesson / transmission / exam / advancement …）+ **target_ref**（uuid 或文本，如 vow_id）/ substitute_practice_id + substitute_count（替代时）/ reason（必填）/ basis（依据，选填）/ created_at。
- RLS：**双方可见**——师兄读 user_id=自己；admin/辅导员读本班（121）。写 audit_logs。
- v1.0 范围：替代/追溯认可/豁免 三类 + 留痕；**不做撤回/调整目标/修正记录**（觉学全套框架 v1.5+·110/121）。
- 衔接：升学/毕业判定（123）读它——豁免=该要求视为达标 / 替代=按代替量计 / 认可=计入累计；代替方案默认值来自 practice_templates（域②B1·120）。

**C2 `exam_grades` · 考试成绩（决策125）**
- 字段：id / user_id / program_id（锚定最初正式班级专业·123）/ exam_name（科目/场次，如"大学演讲第N册"/"加行考试"）/ score（由教务定）/ is_pass（对合格线）/ recorded_by（admin/学科管理员）/ recorded_at / notes。
- **考试线下进行**（无在线考试表·125）；本表只录成绩。
- 合格线：v1.0 **admin/教务人工掌握、录入时 set is_pass**（承017）；结构化合格线配置（exam_definitions:program/exam/pass_line）留 v1.5+ —— **待 PM 选**。
- RLS：师兄读自己成绩；admin/学科管理员录入（125）。衔接：升学 5 维之考试（123）；年龄免考→走 proxy 豁免（C1）。

**取舍（待批）**：① proxy.target 用 **polymorphic（target_kind+ref，覆盖闻思/出勤/考试/升学门槛全部代行场景）** 还是只挂 vow？建议 polymorphic。② 考试合格线 **v1.0 人工（admin set is_pass）** 还是配置化（exam_definitions 表）？建议 v1.0 人工、配置化 v1.5+。

---

### 域⑤ 传承（§6.3 关联 · 决策124 结构化传承清单）✅ 已批准（2026-06-16）
> ✅【PM 全批准 2026-06-16】T1 transmissions master + T2 program_required_transmissions（必需）+ T3 user_transmissions（已得·物化）+ A3 视图（供 admin 查看·不 auto-gate）；灌顶/密法不入（060）。

**加表（待批）**
- **T1 `transmissions`（传承 master）**：id / name / source_kind（'course'/'assembly'；**灌顶/密法不入**·060）/ related_course_id（课程传承挂哪部课，选填）。统一传承名、避免文本乱。
- **T2 `program_required_transmissions`（必需传承清单·program 级后台配·124）**：program_id / transmission_id。admin 配该专业升学必需传承。
- **T3 `user_transmissions`（已得传承·per 师兄）**：user_id / transmission_id / source（'course_listen'/'restricted_check'/'assembly'/'proxy_recognize'）/ obtained_at / recorded_by。归纳师兄已得（听课派生/打勾/法会录入/代行认可121）。
- **视图/查询（A3）**：每师兄 已得(T3) vs 必需(T2) → ✓/✗ 清单，**供 admin 查看/升学审核、不 auto-gate**（124/017 人工判定）。

**废/改**：courses.is_tantric 废（060·域⑦执行，连带密法课程不入传承）。

**取舍（待批）**：① 要不要 `transmissions` master（T1）—— 建议要（统一名/挂课程派生规则）；不要则 T2/T3 用文本名（易乱）。② 已得传承用**表 T3（物化，听课完成时派生写入）** 还是**视图**（实时从 study_records/self_study/法会/proxy 聚合）？建议 **表 T3**（来源异构、聚合复杂，物化更稳）。

---

### 域⑥ 关怀 + 法会（§6.8 班级运营）✅ 已批准（2026-06-16）
> ✅【PM 批准 2026-06-16】法会全复用 events；关怀加 cohort_lag_snapshot（5维·107·**Edge cron TS 每日算**·仅管理端·按规范§七）；日记延后-23 dormant；RLS 师兄端无状态色/care 不可见（克制·#193）。
**现有表**：care_followups（爱心跟进）/ cohort_announcements（班级公告）/ cohort_weekly_practice_summaries（周汇总缓存）/ daily_practice_journals（日记）；+ events（法会·§6.7）+ v_event_dedication_totals（集体回向视图）。

**A. 复用**
- **法会（054-057/086）全复用、无新表**：events（event_type admin 定义·054）+ vow.event_id（参加=加入法会愿·055）+ v_event_dedication_totals（集体回向·057）+ vow.current_end_date 师兄自设（法会愿期限·056）。
- care_followups（跟进·032/033 双入口、044-046 爱心权限）、cohort_announcements（公告·064 默认推全班）、cohort_weekly_practice_summaries（周汇总/WhatsApp 报数文本·064）。
- daily_practice_journals（日记）：**决策074 整功能延后-23** → 表保留、v1.0 dormant。

**B. 加表（待批）**
- **`cohort_lag_snapshot`（觉学 5 维滞后快照·决策107 反向补）**：cohort_id / user_id / attendance_lag / task_lag（日常功课）/ content_lag（听课）/ quiz_lag（答题）/ meditation_lag（观修）/ computed_at。**每日重算覆盖**（computed state、不留历史，与 care_followups 永久留痕解耦）；**仅管理端**（辅导员/爱心看，定位关怀重点）。schema 现无关怀名单/状态快照表 → 加此表承载 107。

**C. RLS（待批·方向）**
- **师兄端无状态色（克制红线）**：cohort_lag_snapshot + vow.current_status + care_followups **师兄端一律不可读**（8.4 隐私红线·关怀不推送）。
- **爱心权限（035/044-046）**：爱心读关怀名单/全班学修记录(只读)/手机号/写 care_followups；**不可改数据/不可宽限**。

**取舍提示**：关怀 5 维（B）是 107 反向补唯一新表；法会全复用 events（schema 早建好）；关怀名单 = cohort_lag_snapshot 有任一维 lag 的师兄，care_followups 挂跟进。

---

### 域⑦ 密法废（§6.9 + 各 is_tantric · 决策060 密法0痕迹）✅ 已批准（2026-06-16）
> ✅【PM 批准 2026-06-16·完整清除·DROP is_tantric】废 tantric_access_grants 表 + DROP practices/courses.is_tantric(+idx) + 废密法逻辑/RLS + 确认本库无密法数据 → **本库 0 痕迹**（红线·原则10/060）。

**密法触点全清（待确认完整性）**
1. **废表**：`tantric_access_grants`（§6.9 密宗白名单）+ idx。
2. **废字段**：`practices.is_tantric`（+ idx_practices_tantric）、`courses.is_tantric`（+ idx_courses_tantric）。
3. **废逻辑**：建愿 is_tantric→share_to_collective=false（恒 true·077）；听课/内容的密法白名单 gating（本库无密法内容）。
4. **废 RLS**：任何 referencing tantric_access_grants / is_tantric 的密法访问策略（**待 §rls_policies 复查**·本库无密法 course → 无需 gating）。
5. **数据**：确认本库无 is_tantric=true 的 course/practice 记录（密法在独立站·060）；生产库若有，迁出/清（独立 DBA·老数据）。

**取舍（待批）**：is_tantric 字段**直接 DROP** 还是**保留恒 false 不用**？建议 **DROP**（0 痕迹·060 红线；留着易被误读为"本库有密法概念"）。

---

### 域⑧ 辅助内容（§6.10 · 4 表 + 新增）✅ 已批准（2026-06-16）
> ✅【PM 批准 2026-06-16】藏历/push/audit 复用（殊胜日 UTC+8·075、push 提前 v1.0·062/068）；加 home_banners（116）/feedback（117+47法本纠错）/sms_log（116·仅critical）；reminder_presets+user_reminders DB 阶段核有无、无则加（102/#188）；RLS 按规范。

**现有表**：tibetan_calendar（藏历396行）/ buddhist_days（殊胜日527行）→ ⭐**决策137 废这两表、改建 tibetan_days(觉学 TibetanDay 模型)** / user_push_tokens（push）/ audit_logs（审计）。

**A. 复用**
- **藏历**：⭐ **采觉学方案（决策137）**——**废 tibetan_calendar + buddhist_days、建 `tibetan_days`（觉学 TibetanDay 模型）**、UI 用觉学月历视图、数据导入觉学；决策075 时区=**殊胜日按 UTC+8 固定**（app 层算"今天"）；116 提前 v1.0、双时区 v1.5+。**有 schema 改动（两表→tibetan_days·已落 000090）**；精确字段实现期对觉学 repo。
- **push**：user_push_tokens 复用；决策062/068 推送四类框架**提前 v1.0**（schema 注"v1.5+"→ v1.0）。
- **audit_logs** 复用（域① audit / 121 代行 / admin 操作写 audit；11.13 查看）。

**B. 加表（待批）**
- **home_banners**（116 首页法讯 banner）：title/image_url/link/start-end/active/order —— 静态展示、非推送（守克制）。
- **feedback**（117 用户反馈，含能力47 法本纠错入口）：user_id/type（bug/建议/法本纠错）/content/created_at/status。
- **sms_log**（116 短信通道·068）：user_id/phone/template/sent_at/status —— **仅 critical 级**（账号/重要法讯），控成本防骚扰。

**C. 待核/加**
- **reminder_presets + user_reminders**（M11 提醒语预设 + 师兄自设提醒·决策102/#188）—— PRD §32 称已加 2 表；**待核 schema/生产库是否已有**，无则加（v1.0）。

**D. RLS（按规范§三-4）**：banner 公开读/admin 写；feedback user 写读自己 + admin 读；sms_log admin/system；reminder_presets 公开读/admin+辅导员爱心写（M11·#188）；user_reminders owner。

**取舍（待批）**：短信用独立 `sms_log` 还是并进统一通知日志？建议独立（v1.0 仅短信一通道、简单）。

---

### 域⑨ 升学 / 毕业评定（跨域读 · 决策017/123/118/090）✅ 已批准（2026-06-16）
> ✅【PM 全批准 2026-06-16】读 5 维复用；v_advancement_5dim（**DB 视图**·可迁PG）；advancement_records（**独立表**·升学留痕）；锚定最初班级=helper；留级校验=app can_hold_back；升学/毕业=**人工标不 auto-gate**；代行算入；RLS 仅管理端。
> **读 + 聚合 + 人工判定**域，几乎不加表（读既有 5 维数据源），判定本就人工（017·不 auto-gate）。

**A. 复用（读既有 5 维·123）**：传承 ← user_transmissions(域⑤T3) vs program_required_transmissions(T2)；出勤率 ← study_records(group_attend/absent)；修量 ← practice_logs 累计(118)/v_weekly；考试 ← exam_grades(域④)；发心 ← **人工·不入数据**(124)；held_back_count(域①)+ class_members.status(graduated)。

**B. 加视图（待批）**：**v_advancement_5dim**（per 师兄 A3 升学评定面板）：聚合 传承(已得/必需)·出勤率·修量·考试 四维（发心人工不入）。DB 视图（原生 PG·§七聚合）或 app repo 聚合。

**C. 加表（待批·取舍）**：**advancement_records**（升学/毕业留痕·017）：user / from_cohort→to_cohort（或 graduated）/ decision / decided_by（教学部/admin）/ basis / date。取舍：独立表（结构化留痕、可查升学史、锚定最初班级也用）vs 复用 audit_logs（轻）。建议**独立表**。

**D. 逻辑落点（§七）**：5维聚合=DB视图/app repo(B)；**锚定最初正式班级(123)**=derive helper（查最早 member_role=formal 的 class_member → 该班 program/起修日 作升学锚）；**留级次数校验(090)**=app service `can_hold_back()`；**升学/毕业判定=人工**（017/123 admin/教学部读面板→手动标 class_members.status，**不 auto-gate**）；代行(121 豁免/替代/认可)在 5维聚合时算入。

**E. RLS**：升学面板/advancement_records 仅管理端（师兄读自己升学结果、不见他人·#193）。

**取舍（待批）**：① v_advancement_5dim 用 **DB 视图**（建议·可迁 PG）还是 app 聚合；② advancement_records **独立表**（建议）还是 audit_logs。

---

### 域⑩ 法义问答 RAG（决策108/109 · v1.0 仅检索）✅ 已批准（2026-06-16）
> ✅【PM 全批准 2026-06-16·含 query 日志】v1.0 仅 tsvector 检索法本（返片段+引用）+ dharma_qa_queries 日志（辅导员洞察·不露姓名）+ 护栏（导向辅导员/密法0痕迹）；LLM 网关 v1.5+ 收割觉学。
> v1.0 = **仅 RAG 检索**（检索法本原文、返回片段+引用，**不接生成式 LLM**·109）；按规范 §零/§七：用 **Supabase Postgres tsvector 全文检索**（非 pgvector；收割觉学 search.ts 思路），LLM 网关 v1.5+ 再引（生成式回答）。

**A. 复用（检索源）**：法本原文已在 lesson_blocks.text（结构化块·§6.3）/ course_lessons.source_text。**密法不入**（060·法本库无密法）。

**B. 加（待批）**
- **tsvector 全文检索**：lesson_blocks（法本块）加 tsvector 列 + GIN 索引（中文分词配置）；检索=查相关块、返回 文本+引用（挂 lesson_id/讲者）。**原生 PG·可迁**。
- **dharma_qa_queries（问答查询日志·可选）**：user_id/query/created_at —— 供辅导员"班级问答洞察"（热门问题聚合·**不露姓名**·108/#193）。

**C. 护栏（app 层·108）**：无命中→导向辅导员；涉个人修行/教派评判→导向辅导员；**密法 0 痕迹**；不替代人工关怀。

**D. v1.5+（收割觉学·规范§收割）**：pgvector + LLM 网关（生成式回答·109，检索结果 LLM 组织+`[n]`引用）。

**RLS**：法本检索 = active 学员可读（非密法）；dharma_qa_queries user 写、admin 洞察聚合不露姓名。

**取舍（待批）**：① v1.0 要不要 dharma_qa_queries 日志（辅导员洞察）—— 建议 **v1.0 加轻量 query log**（洞察有用、不露姓名守#193）。② 中文全文检索配置（tsvector 中文分词/pg_jieba 等）= DB 实现阶段细节。

---

## 六、规范符合性复查（域①-⑦ × 解耦规范）—— 回应"以前的按规范了吗"
> 解耦规范（`supabase_decoupling_v2.md`）在域①-⑤ 批准**之后**才立。本复查逐域核对。**结论：域①-⑦ 实质合规、无返工**；只需补 2 项横切纪律（落地统一加）。

| 域 | §三-4 RLS 简单+注释 | §五/§七 逻辑落点 | §三-6 原生 PG | 结论 |
|---|---|---|---|---|
| ① 身份+班级 | 审批门/分班/主班/特权 RLS 简单 ✓·待注释 | held_back/专业锁定 校验=app service ✓ | ✓ | 合规·补 RLS 注释 |
| ② 修持 | current_end_date 改权/状态机可见 RLS ✓·待注释 | ⚠️ **状态机 compute 应显式 Edge cron TS**（非 DB 触发器·§七）；报数/回向聚合=DB 视图 ✓ | ✓ | 合规·**状态机落点显式化** + RLS 注释 |
| ③ 题型 | 答案规则 RLS ✓·待注释 | 本地判分=client/Edge TS ✓·SM-2 算法=TS ✓ | ✓ | 合规·补 RLS 注释 |
| ④ 代行+考试 | proxy 双方可见/exam RLS ✓·待注释 | 代行影响判定=app 聚合 ✓·多写原子=Edge/RPC 事务 | ✓ | 合规·补 RLS 注释 |
| ⑤ 传承 | 传承可见 RLS ✓·待注释 | 已得派生=app/Edge TS ✓·已得 vs 必需=DB 视图 ✓ | ✓ | 合规·补 RLS 注释 |
| ⑥ 关怀+法会 | 师兄端无状态色 RLS ✓·待注释 | **5维=Edge cron TS**（已按§七 显式）·法会复用 | ✓ | ✓ 已显式合规 |
| ⑦ 密法废 | 废密法 RLS（简化）✓ | 废 auto-false 逻辑 | ✓ | ✓ 合规 |

**需补的 2 项横切纪律（不返工·落地统一加）**：
1. **状态机落点显式化（域②）**：愿状态机 compute 明确走 **Edge cron TS**（每日批，写 vow.current_status），**不埋 DB 触发器**——与域⑥ 5维一致（§七）。**依赖 §六-4 复查 schema §12 触发器**：若现有状态机触发器，迁 Edge TS。
2. **RLS 访问规则注释 + repo 层（§三-1/4·全域）**：所有域 RLS 落地旁注"抽象访问规则"；App 访问一律走 repo 层。Cross-cutting，落地统一加（文档/代码骨架纪律，**零返工**）。

**结论**：域①-⑦ **没有违反规范**（实质合规、原生 PG、逻辑落点对）；规范是过程中才立的，故"状态机显式落点 + RLS 注释/repo 层"需**补登记**，但**不重做任何已批的表/字段/RLS**。

---

## 七、全 10 域批准 + 落地待办（2026-06-16 · DB 对齐方案级完成）
✅ **域①-⑩ 全部批准**，DB/后端对齐**方案级完成**（规则9·未写代码/迁移）。下一步 = DB 迁移 SQL + App repo 层（DB/实现阶段，PM 确认后行）。

**新增表（11 + 1 视图）**：self_study_grants① / sm2_cards③ / proxy_action_records④ / exam_grades④ / transmissions+program_required_transmissions+user_transmissions⑤ / cohort_lag_snapshot⑥ / home_banners+feedback+sms_log⑧ / advancement_records⑨ / dharma_qa_queries⑩ + 视图 v_advancement_5dim⑨；【reminder_presets/user_reminders 待核⑧】。
**加字段**：profiles.status+pending① / class_members.member_role① / cohorts 内加行年限①② / practice_templates 代替方案② / questions.question_type+payload③ / question_responses.answer_payload+is_correct+cohort_id→nullable③ / lesson_blocks tsvector⑩。
**废**：tantric_access_grants 表 + practices/courses.is_tantric + profiles.enrollment + cohorts.is_gongdehui + 密法 RLS（⑦/①）。
**RLS**：审批门/分班主班admin/自学特权① / 状态机师兄不可见·current_end_date分级② / 答案规则③ / 双方可见④ / 传承可见⑤ / 关怀师兄不可见⑥ / 升学面板admin⑨ / 法本检索active⑩；+ **全域访问规则注释**（规范§三-4）。
**逻辑落点（§七）**：状态机/5维=Edge cron TS；校验(留级/锁定/专业)=app service；聚合(进度/报数/5维评定)=DB函数/视图；本地判分=client/Edge TS；派生(传承)=app/Edge；写一致性=Edge/RPC 事务。

**落地待办（DB/实现阶段·PM 确认后行）**：
1. 迁移 SQL（建表/加字段/废/索引）—— 逐域、PM 审。
2. RLS 策略 SQL + 每条「抽象访问规则」注释（规范§三-4）。
3. App **repo 层 + auth/storage 抽象**骨架（规范§三-1/2/3，**代码第一行就立**）。
4. Edge cron TS：状态机 + 关怀5维 + 法本检索（中文 FTS 配置）。
5. 复查 schema §12 触发器，复杂逻辑迁 Edge TS（规范§六-4）。
6. 待核：reminder_presets/user_reminders 有无；生产库 pending/is_tantric 数据清理（DBA）。
7. 基线同步（`baseline_sync_v2` + 本对齐新表/字段）回灌中枢。

---

## 八、完整后端覆盖复查（补 §6.4/§6.6 + 全表矩阵）—— 回应"我要完整的"
> 逐域走了 ①-⑩；§6.4 排表/进度 与 §6.6 学修打卡 当初只在影响地图标"复用"、未详。此处补全 + 出全表覆盖矩阵，确认 schema 全 10 组 ~51 表无遗漏。

### 域⑪ 排表/进度算法/自学/提醒（§6.4 · 10 表）—— 复查（几乎全复用）
- **复用·核心**：program_semesters / program_weeks（(学期号,学期内周)·is_holiday 计划内放假）/ program_week_courses（进度算法输入·M4 导入）/ program_week_self_study / cohort_rest_weeks（只扣计划外·M9）；**进度函数 get_current_week_number / get_current_lesson_number = DB 函数（§七·原生 PG·实测 10/10）**。
- **复用·关联它域**：program_week_practices（周修法建议·M3·域②）/ user_self_study_programs（自学科系/起修日/节奏 → 准入按 096/119 更新·域①）/ user_self_study_rest_weeks。
- ✅ **reminder_presets + user_reminders 在此（5.9/5.10）→ 域⑧"待核"确认存在·复用**（决策102·20 条上限 trigger）。
- **结论**：§6.4 **全复用、无新表**；自学准入口径随域①。

### 域⑫ 学修打卡（§6.6 · 6 表）—— 复查 + 094/067/047/091 落点
- **复用**：study_records（听课/读记/讲考/出勤·**v4.1 已移除 UNIQUE 支持听课多次·047**）/ program_study_types（各班打卡要求·数据驱动 UI）/ self_study_records（限制性课**按文章**打卡）/ weekly_study_summary（周汇总缓存·圆满）/ group_sessions（共修场次·065/066）/ speaking_sessions（讲考场次·067）。
- **改 RLS/录入（待批）**：**094 签到→出勤后台录入**——出勤（study_records group_attend/absent）由 爱心/辅导员/admin **后台录入·直接生效**，**废签到链接/免登录选头像**（094 废022/023/043）；RLS 出勤写权=爱心+辅导员+admin。
- **逻辑落点**：**091 圆满判定**（听≥1+看≥1+答题·盲聋豁免）= app/Edge TS 读 study_records 计数（§七）；067 讲考评价仅管理端。
- **结论**：§6.6 复用为主；唯一改动=094 出勤后台录入（录入方式/RLS·废签到链接）；圆满判定 Edge/app TS。

### 全表覆盖矩阵（10 组 · ~51 表 + 11 新表）
| schema 组 | 表数 | 处置 | 域 |
|---|---|---|---|
| §6.1 用户权限 | 4 | 复用 + member_role/status+pending/self_study_grants · 废 enrollment | ① |
| §6.2 院系结构 | 3 | 复用 + cohorts 内加行年限 · 废 is_gongdehui | ① |
| §6.3 课程内容 | ~8 | 复用 + 传承挂靠 · 废 courses.is_tantric | ③/⑤/⑦ |
| §6.4 排表/进度/自学/提醒 | 10 | **全复用**（进度算法 10/10·reminder 确认） | ⑪ |
| §6.5 思考题 | 3 | 扩 题型7+payload+SM2 · cohort_id nullable | ③ |
| §6.6 学修打卡 | 6 | 复用 + 094 出勤后台录入 · 091 圆满 TS | ⑫ |
| §6.7 修持 ⭐ | 9 | 复用 + 代替方案 · 废 practices.is_tantric | ② |
| §6.8 班级运营 | 4 | 复用 + 关怀 5 维快照 | ⑥ |
| §6.9 密宗访问 | 1 | **废**（060 · 0 痕迹） | ⑦ |
| §6.10 辅助 | 4 | 复用 + banner/feedback/sms | ⑧ |
| 跨域新表 | +11 | proxy_action_records/exam_grades/传承3/cohort_lag_snapshot/advancement_records/dharma_qa_queries/sm2_cards/home_banners/feedback/sms_log/self_study_grants | ③④⑤⑥⑧⑨⑩ |

**完整性结论**：schema **全 10 组 ~51 表 + 11 新表 全部有落点**（复用/加/废各归其位），逐域 ①-⑫ 覆盖、**无遗漏功能区**；§6.4/§6.6 已补详（多复用，唯 094 出勤后台录入 1 处改 RLS/录入）。剩余只是 DB 实现阶段待办（迁移SQL/RLS注释/repo层/Edge cron/§12复查/数据清理）。

---

## 九、schema §12 触发器/函数复查（规范§六-4 落地）—— "业务逻辑现在在哪"
> 现状：**无 app 代码**（repo 仅文档）。业务逻辑分布如下。

**A. DB 侧已埋（schema §12 + 散落）**
| 函数/触发器 | 作用 | §七 评估 |
|---|---|---|
| get_current_week_number / get_week_lessons / get_current_week_lessons | 进度算法（(学期号,学期内周)·休息周·10/10）| ✅ 留 DB（原生 PG·集合运算）|
| set_updated_at + 各 *_updated_at | housekeeping | ✅ 留 DB |
| study_records_audit / vow_due_date_audit | audit 自动写 | ✅ 留 DB |
| practice_logs_update_vow_progress | 打卡 → 愿 current_count 累加 | ⚖️ 可留 DB（原子/perf）·数据派生、原生 PG |
| practice_logs_calc_session | 碎片 → 座次（≥30min=1座·048）| ⚖️ 可留 DB trigger 或迁 Edge TS（座次规则）|
| ~~generate_student_id~~ → **promote_member_role** | 学号"**首次转正时发**"（决策134；原 enrollment-触发器废·改转正发）| ✅ 留 DB（SECURITY DEFINER·数据规则）|
| handle_new_auth_user / on_auth_user_created | 注册 → 建 profile | ⚠️ **auth 耦合点**（规范§三-2 auth 抽象；触发器原生 PG，但绑 auth.users）|
| check_user_reminders_limit | 提醒 20 条上限 | ⚖️ DB 兜底 或 app service |
| **self_register_class_member()** | **自助入班** | 🔴 **撞决策126（入班=admin 分配·取消自助）→ 废/改 admin-only** |
| switch_primary_cohort() | 师兄自助切主班 | ✅ **决策131 恢复有效**：师兄可自助挑主班（限已入班）+ admin 也可；保留（限定到"已入的班"）|
| CHECK 约束（各表）/ RLS（131 条）| 完整性 / 行级隐私(#193) | ✅ 留 DB（RLS 简单+注释·§三-4）|

**B. 只在决策文档、尚未落任何代码**（按§七 将落 Edge cron TS / app service TS）：愿状态机（032/081）、圆满判定（091）、升学 5 维评定（123）、代行影响（121）、留级次数/专业锁定/过期锁定 校验（090/079/#190）、关怀 5 维快照（107）、代替方案应用（120）…… **目前仅写在 design_v2_decisions.md，无实现**。

**C. 复查发现（🔴 2 处 DB 函数与新决策冲突·§六-4 抓到）**
- `self_register_class_member()`：自助入班 → 决策126 取消 → **废/改 admin-only**（并入域① 废/改）。
- `switch_primary_cohort()`：师兄自助切主班 → **决策131 恢复有效**（主班=用户+admin·限已入班）；保留、限定到"已入的班"。〔原标"撞127废"已纠正〕

**结论**：现状业务逻辑 = **DB 侧少量（进度算法/审计/打卡派生/学号/auth/RLS/CHECK）+ 大量只在决策文档、未落代码**。按§七：进度/聚合/审计/完整性留 DB；状态机/5维/校验/判定 落 Edge/app TS（待实现）；**2 处自助函数（126/127 冲突）废/改 admin**。

---

## 十、RLS 完整性复查（131 条策略 × v2.0 决策 + 解耦规范）—— 最后一块未审后端层

> 范围：`rls_policies_2026-05-31.md` 全 131 条策略 + 8 helper + 2 保护 trigger，对照 v2.0 决策（058/059/060/083/119/124/125/126/131 等）+ 解耦规范 §三-4（简单声明式 + 每条补「抽象访问规则」注释）。结论分 **复用 / 改 / 废 / 加** 四类。**规则9：方案级，不写 SQL，待 PM 拍。**
> 总体：131 条 **全是原生 PG、可迁**（解耦规范 §五 已认定），无"为解耦推倒重来"。改动都是**跟随 v2.0 决策**，不是 RLS 本身有错。

### 10.1 审批门字段 —— ✅ 已由 §三-1 + 域① C1 决定（落地项，非待定）

> ⚠️ **自纠（一致性复查 2026-06-17）**：本节初稿误标为"🔴 头号待定 / status vs enrollment 二选一"，还给了"保留 enrollment"备选——**与已批准的 §三-1（status 加回 pending）+ 域① C1（enrollment 废）直接矛盾**。现改正：此事**已决，是落地项不是待定**。

| 维度 | 已批准方向 | 依据 | RLS 落地 |
|---|---|---|---|
| Platform 审批门 | `status` 加回 `pending`（注册→待审）；`enrollment` **废** | §三-1 ✅ / 域① C1 ✅ / 058·059 | status≠'active'（pending）看不到学修内容（域① D2）|
| "是否正式/能否自学" | 由 `class_members.member_role='formal'` **派生**（不再用 enrollment）| 域① C1 ✅ / 003·006 | `is_formal_student()` **改写**（见 10.3-⑥）|
| Class 层旁听/正式 | `class_members.member_role`（auditor/formal）加字段 | 域① B1 ✅ | is_class_member 不分 role（10.3-⑤）|

**落地三件事**（DB 实施期，随域①）：
1. `status` CHECK +`pending` +`rejected`（决策132；自助注册→pending；admin 植入/建→active；被拒→rejected）；`profiles_protect_status` trigger **去掉已废的 enrollment 保护行**（见 10.5 自纠）。
2. **审批门 RLS（域① D2）**：pending 用户只看自己 profile + 待审页；`USING(true)` 公共表（课程/自学读物/排表…）**靠 app 路由挡待审页、不加 RLS 门**（决策132·避免 ~10 表横切，RLS 兜底可选）。
3. `is_formal_student()` 改写 + `cohorts_select` 改 gate（10.3-⑥/③）。

**✅ 审批门口径已全清（决策132，2026-06-18）**：status 6 态（pending/active/rejected/suspended/inactive/graduated）；待审靠 app 路由。无遗留待定。

### 10.2 废（落地决策060 密法0痕迹 / 决策126）—— 共 ~9 处

| 对象 | 现状 | 处置 | 依据 |
|---|---|---|---|
| helper `has_tantric_access()` / `is_tantric_course()` | 2 个 SECURITY DEFINER 函数 | **废**（无密法课，恒空/恒 false）| 060 / 域⑦ |
| `courses_select` | `is_tantric=false OR has_tantric_access(id) OR admin` | **简化** → `USING(true)`（课程全非密法，登录可读）| 060 |
| `program_courses_select` / `course_lessons_select` / `lesson_resources_select` / `lesson_blocks_select` / `questions_select` | 各含 `is_tantric=false OR has_tantric_access()` 跟随 EXISTS-join | **简化** → 去密法分支（lesson_blocks/questions 跟随 lesson 存在性即可；多数可 `USING(true)` 或仅留存在性 join）| 060 |
| `tantric_access_grants_select` / `_write`（整表 2 条）| 密宗白名单表 RLS | **废**（随 DROP TABLE，域⑦）| 060 / 域⑦ |
| 设计原则 §0.1「密宗 RLS 层 404」、§0 头部"密法白名单"注释 | 文档条款 | **删/改注**（红线由"DB过滤"升级为"架构0数据"，决策060）| 060 |

⚠️ **数据前置**：`DROP is_tantric` / 删 grants 前确认生产库 `courses` 无 `is_tantric=true` 行（域⑦ 已挂"数据清理"待办）。

### 10.3 改（口径随决策调整）—— 共 6 处

| # | 策略/函数 | 现状 | 改为 | 依据 |
|---|---|---|---|---|
| ① | `class_members_insert` 注释 + `self_register_class_member()` | 注释写"自助注册走 self_register…SECURITY DEFINER 绕过"；主策略已 admin-only | **删自助路径注释**；**废 `self_register_class_member()` 函数**；主策略 `WITH CHECK(is_system_admin())` **不变** | 126（入班=admin 分配）·§九-C 已挂 |
| ② | `switch_primary_cohort()` 口径 | 注释/函数 = "admin + **任意主麦(C1宽松)**" | 改为 **师兄本人（限自己已入的班）+ admin**；**不保留主麦**（决策134） | 131/134 · 已落 000015 |
| ③ | `cohorts_select` gate | `is_system_admin() OR is_formal_student()`（enrollment）| **改为 `admin OR is_class_member(id)`**——只看自己被分进的班（126 取消自助选班）。⚠️ **决策136修正(2026-06-18)**：原误写为还 `OR is_formal_student()`——它 row-independent、会让任一正式生看到**所有**班级，与本意相悖；**本地场景测抓到、已去掉**（已落 000010 + 测试断严"只看 1 个班"）| 126 取消自助选班 / 003 旁听 / 域①C1 |
| ④ | `class_members_update`（is_primary 写权）| 主策略仅 admin；切主班走 SECURITY DEFINER 函数 | 与 ② 配套：is_primary 切换 = **用户本人（限已入班）+ admin**；status='left' 退班仍仅 admin | 131 / 126 |
| ⑤ | `member_role` 加字段后的 RLS 面 | 现 `is_class_member()` 只看 `status='active'`，不分 role | **基本不动**：旁听生也是 active 成员，照常打卡/答题/发愿（行级权限不分旁听/正式）；旁听/正式之分用于**升学评定（app 层人工判定）**，非 RLS 行级 | 003/006 |
| ⑥ | helper `is_formal_student()` | `enrollment='formal'`（enrollment 即将废·域①C1）| **改写**：`EXISTS(class_members WHERE user_id=auth.uid() AND member_role='formal')`——"是否正式生"从 enrollment 改派生自 member_role | 域①C1 enrollment 废 |

> ✅ **澄清（无需改）**：决策083 客观题 `is_correct` —— 检查083 定"**圆满只看提交、不看对错**"，`is_correct` 仅学习反馈、不入报数/升学（118）。故师兄改自己 `question_responses`（含 is_correct）**无作弊风险**，`question_responses_update`（自己可改）**保持不变**，**不需**加保护 trigger。SM-2 自评质量同理（自有数据）。

### 10.4 加（新表 RLS · 落地域①③④⑤⑥⑧⑨⑩）—— 共 ~13 表组

> 模式沿用既有：**自己**（`user_id=auth.uid()`）/ **本班管理者**（`has_class_role`）/ **admin**（`is_system_admin`）/ **公共**（`USING(true)`）。⭐ = 守红线/原则（师兄不可见）。

| 新表 | SELECT | WRITE | 红线/依据 |
|---|---|---|---|
| `self_study_grants`（自学特权·域①）| 自己看自己的 grant + admin | **仅 admin/super_admin**（授权写 audit）| 119 |
| `user_self_study_programs`（**收紧**）| 现"自己+admin"✅ | INSERT **收紧**：仅"持自学特权 _或_ formal 主修"者可建（应用层 gate 兼 RLS）——现策略 `user_id=auth.uid()` 过宽，人人可自建自学 | 119/096 |
| `sm2_cards`（SM-2 复习·域③）| 自己 + admin | 自己（本地调度，自有数据）| 083 |
| `proxy_action_records`（代行·域④）| 被代行**师兄可见自己的**（透明）+ 本班 zhumai + admin | admin/zhumai（代行=管理动作，写 audit）| 121 |
| `exam_grades`（考试成绩·域④）| 师兄看**自己成绩** + 本班 zhumai + admin | **仅 admin/subject_admin 后台录入**（写 audit）| 125 |
| `transmissions`（传承 master·域⑤）| 全员读 `USING(true)` | admin | 124 |
| `program_required_transmissions`（必需传承·域⑤）| 全员读 | admin（program 级配置）| 124 |
| `user_transmissions`（已得传承·域⑤）| 师兄看自己 + 本班 zhumai + admin | admin/zhumai（发心人工录入·派生听课）| 124 |
| `cohort_lag_snapshot`（关怀5维·域⑥）| ⭐**师兄完全不可见**：仅 zhumai/aixin/admin（同 care_followups）| Edge cron（service_role）写 | 107 / 师兄端无状态色 |
| `advancement_records`（升学记录·域⑨）| 师兄看自己 + 本班 zhumai + admin | admin/教学部（人工判定，不 auto-gate）| 017/123 |
| `dharma_qa_queries`（法义问答日志·域⑩）| 自己看自己 + admin | 自己（提问写）| 108/109 |
| `home_banners`（首页 banner·域⑧）| 全员读（active）| admin | 域⑧ |
| `feedback`（意见反馈·域⑧）| 自己看自己 + admin | 自己（提交）| 域⑧ |
| `sms_log`（短信日志·域⑧）| ⭐仅 admin | service_role | 域⑧ |
| `practice_templates`（代替方案·域②）| 现 `USING(true)`✅ | **确认 admin-only** 写（代替方案配置）| 120 |

### 10.5 复用（无改 · 已合 v2.0 + 解耦规范）—— 大多数

- **守红线/原则的核心策略全部正确、保留**：`care_followups`（⭐师兄完全不可见·#193）、`user_practice_vows` + `vows_protect_status` trigger（⭐current_status 师兄不可见·原则1）、`study_records`（审核态 is_confirmed·主麦可改）、`question_references`（⭐先答才能看·答案规则）、`profiles_protect_status` trigger（保护 status/student_id admin 专属；⚠️ **自纠**：enrollment 废后去掉该保护行·见 10.1）。
- **helper**（is_system_admin / is_class_admin / has_class_role / is_class_member / my_admin_cohorts / my_member_cohorts / update_cosession_settings）+ per-cohort 隔离根 = ✅ 复用；`is_formal_student` **改写**（10.3-⑥）、密法 2 个**废**（10.2）。
- **公共参考表** `USING(true)` 组（academies/programs/排表4表/program_study_types/**tibetan_days(觉学·137)**/self_study_books·articles·blocks/practices·contents·guides）= ✅ 复用（除 10.1-①"待审用户是否该读"待定）。
- `reminder_presets`/`user_reminders`/`user_self_study_rest_weeks`/`practice_appointments`/`events`/`cohort_announcements`/`group_sessions`/`speaking_sessions`/`audit_logs` 等 = ✅ 复用。

### 10.6 解耦规范 §三-4 落地（文档纪律 · 不改策略主体）

- 现 131 条 +（10.4 新增 ~13 组）→ 约 **150 条**，落地时**每条旁补一句「抽象访问规则」**（如 `// 访问规则: owner OR 本班zhumai OR admin`），作迁非 PG 时应用层重写依据（解耦规范 §五 待办）。
- 保持**简单声明式**：判分/状态机/5维/升学判定**不进 RLS**（已在 §七 落 Edge/app TS）；RLS 仅守行级隐私。密法废后 6 处跟随 join 进一步简化（10.2），更贴合"简单"。

### 10.7 数量小结

| 类 | 数量 | 落点 |
|---|---|---|
| 待定 | **0**（原 2 小口径已由决策132 收口：status +rejected；待审靠 app 路由）| ✅ 全清 |
| 废 | ~9（helper2 + select 简化6 + grants表2）| 落地域⑦/060 |
| 改 | 6（注释/函数口径/gate/is_formal_student 改写）| 落地126/131/003/域①C1 |
| 加 | ~13 表组（~50 条策略）| 落地域①③④⑤⑥⑧⑨⑩ |
| 复用 | 其余 ~120 条 | 守红线、无返工 |

**结论**：RLS 层与 v2.0 **高度吻合**（守红线的核心策略全对）。审批门字段**已由 §三-1 + 域① C1 决定**（status 加 pending、enrollment 废、is_formal_student 改派生 member_role），是**落地项不是待定**——初稿误标"待定"已自纠（10.1）。改动都是**跟随决策的增量**（密法废一揽子 + 6 处口径 + 新表配套）；2 个小口径已由**决策132**收口（status +rejected；待审靠 app 路由）。**RLS 层审计全清、无遗留待定**，可在 DB 实施阶段随各域一并落地。

---

## 变更记录
| 日期 | 内容 |
|---|---|
| 2026-06-16 | 创建；DB/后端对齐总览 + 影响地图 + 3 处原设计冲突 + 逐域顺序（规则9，方案级、不写代码）|
| 2026-06-16 | §零 并入技术栈决定（方案A+收割·保留RLS DB）；§三 #1/#2 PM 批准；新增 §五 域① 身份+班级 详案 |
| 2026-06-16 | 域① 全批准（含 enrollment 废）；新增 §五 域② 修持模块 详案（核心 schema 高度复用，1 加字段 + 状态机口径 + RLS 分权）|
| 2026-06-16 | 域② 全批准；新增 §五 域③ 思考题/题型 详案（schema 仅开放问答 → 实质扩展：题型扩7+payload+本地判分+SM-2 表+cohort_id 改nullable 修002冲突）|
| 2026-06-16 | 域③ 全批准；新增 §五 域④ 跨域新表 详案（proxy_action_records 代行121 + exam_grades 考试成绩125）|
| 2026-06-16 | 域④ 全批准（target polymorphic / 合格线 v1.0 人工）；新增 §五 域⑤ 传承 详案（schema 无传承表 → 全新加 T1 master/T2 必需/T3 已得 + A3 视图，决策124）|
| 2026-06-16 | 域⑤ 全批准（master+物化表）；新增 §五 域⑥ 关怀+法会 详案（法会全复用 events；关怀加 cohort_lag_snapshot 5维·107反向补；日记延后-23 dormant；RLS 师兄端无状态色）|
| 2026-06-16 | 解耦规范批准（含§七）并链入 §一-0；域⑥ 按规范批准；新增 §五 域⑦ 密法废 完整清除清单（表/字段/逻辑/RLS/数据·060 0痕迹）|
| 2026-06-16 | 域⑦ 全批准（完整清除·DROP is_tantric）；新增 §五 域⑧ 辅助内容 详案（藏历/push/audit 复用 + 加 banner/feedback/sms_log + reminder 表待核·075 UTC+8/116/117/102）|
| 2026-06-16 | 新增 §六 规范符合性复查（域①-⑦ × 解耦规范）：实质全合规、无返工；补 2 横切纪律（状态机显式 Edge TS + RLS 注释/repo 层，落地统一加）；域⑧ 待批暂停 |
| 2026-06-17 | 新增 §十 RLS 完整性复查（131 条 × v2.0）：分 复用/改/废/加；密法废一揽子 ~9 处；口径改（self_register废/switch_primary改用户+admin/cohorts_select补旁听可见/is_correct 澄清无需保护）；~13 新表 RLS（cohort_lag_snapshot⭐师兄不可见等）|
| 2026-06-18 | 一致性复查自纠 §十：10.1 审批门**误标"待定"已改正**——实为 §三-1（status 加 pending）+ 域①C1（enrollment 废）**已决落地项**；移除矛盾的"保留 enrollment"备选；补 10.3-⑥ is_formal_student 改写（→派生 member_role）；10.5 去 protect-trigger 的 enrollment 保护行；仅留 2 小口径（rejected / 待审挡不挡公共表）待 PM 点 |
| 2026-06-18 | **决策132 收口**：status +rejected（6 态）、待审靠 app 路由不卡公共表；§三-1/域①D2/§十 10.1/10.7 同步更新，审批门口径**全清、0 待定** |
