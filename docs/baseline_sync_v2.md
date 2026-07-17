# 基线 / 中枢同步清单 · v2.0（决策 103-132 + DB 对齐 §五-十）

> 创建：2026-06-16；更新：2026-06-18（补 126-132 + db_alignment §五-十 的 schema/RLS 回灌项）。用途：v2.0 **觉学对齐（决策103-118）+ 后续逻辑改动（119-132）+ DB/后端对齐方案（`db_alignment_v2.md` 域①-⑩ + §十 RLS）** 改了多处 v1.0 范围、基线规则与表/策略；本清单汇总**待回灌中枢/基线（PRD / requirements_master / principles / schema / rls_policies）**的项，供基线 bump 时照改、不漏。
> ⚠️ **CLAUDE.md**：`docs/` 下 `_2026-05-31` 基线为**中枢单向同步的只读副本**，不在此就地改；本清单是"改中枢"的待办，改完中枢再覆盖同步。schema + RLS 由 App 线主写。
> ⚠️ **DB 落地仍是规则9 门**：本清单是"plan → 回灌"映射；schema/RLS 的实际迁移 SQL 待 PM 批准 DB 实施阶段才写（`db_alignment_v2.md` §七 落地待办）。
> 权威细节回各决策正文（`design_v2_decisions.md` 决策 103-132）+ `db_alignment_v2.md`（域①-⑩ / §十）。

---

## 一、基线文档逐条修订

### principles_2026-05-31
| 位置 | 原 | 改为 | 决策 |
|---|---|---|---|
| §502 内加行限时 | 内加行 4 年圆满（起修日算）+ admin 延 1 年 | **年限改建班（cohort）配置**（默认 4 年）；机制（过期锁定 #190 / 仅 admin 延 / 不跨届）不变 | 122 |
| 藏历时区 | "个人手机本地"（CLAUDE.md 漂移）| 殊胜日藏历 **UTC+8 固定** | 075 |

### requirements_master_2026-05-31
| 位置 | 原 | 改为 | 决策 |
|---|---|---|---|
| §13 报数 | 报数每学期 2 次（节点）| 取消报数节点 → **实时统计累计 = 升学/毕业硬依据**；admin 人工审兜底虚报（不上忏悔/取消资格）| 087/118 |
| §16 留级次数 | admin 人工掌握 | **v1.0 系统校验**（加行 2 / 学经 2 / 净土 1 / 入行 1）| 090 |
| §16 转菩提功德会 | 转功德会条款 | **废除功德会群体**；成员可授**自学特权**（个人）| 100/119 |
| 自学 | （隐含独立）| **需 formal 主修班级 _或_ 自学特权**（super_admin/admin 授权·不升学）| 096/119 |
| 入班 / 选班 | 用户选模式 + 选班入班（默认旁听）| **取消用户选班**；入班全部 **admin 后台分配**（默认旁听）；转正仍 admin/辅导员手动 | 126 |
| 主班 | （隐含可挪）| 入班 admin 分配后，**主班 = 用户（限已入班）+ admin 都可设**；主班≠升学锚定 | 127/131 |
| v1.0 清单 | （原列）| **增**：AI 法义问答(RAG)/藏历/短信/首页 banner/用户反馈/颂词题型/关怀5维/代行记录/考试成绩录入；**删**：功德会 | 105-125 |

### prd_2026-05-31
| 位置 | 原 | 改为 | 决策 |
|---|---|---|---|
| §5.15.3 自学独立 | 自学完全独立无 cohort | 需 formal 主修（096）+ 自学特权例外（119）| 096/119 |
| §14.3 转功德会 | 转功德会 | 废除（成员个人授自学特权）| 100/119 |
| §5.10 / §115 内加行 | 内加行 4 年 + admin 延 1 | **年限建班配置**（默认 4 年）| 122 |
| 考试 | 考试成绩 v1.5+ / 暂无 | **考试线下 + 成绩 v1.0 后台录入**（in-app 在线考试仍 v1.5+）| 125 |
| 入口/邀请 | 旁听缓冲 | 砍邀请码；审批门 + 旁听 + 转正（觉学对齐）| 104 |
| §5.x 题型 | 5 题型 | **7 题型**（+颂词组句/续接，进 SM-2）| 105/106 |
| 升学/毕业 | 人工判定 | 5 维评定（传承/出勤/修量/考试/发心）+ 教学部最终评定 + 锚定最初正式班级 | 123/124/125 |
| 关怀名单 | 状态机两态 | 管理端采觉学 5 维滞后快照（师兄端无状态色不变）| 107 |
| AI | （无）| AI 法义问答 v1.0 **仅 RAG 检索**（LLM 生成后引）；AI 判分/出题永久砍 | 108/109 |
| 社交 | （同修 tab）| 砍社交 feed；维持同修 tab（公告 + 匿名回向）| 111 |
| §4 入口流程 | 注册 → 选模式/选班 | **注册(OTP+完善资料)→ pending 待审 → admin 批准(active)+ 分配班级(默认旁听) → 转正 formal**；〔被拒→rejected→未通过页〕；用户不选班 | 058/059/126/132 |
| §4.4 管理端 | M1-M11（原）| **认领 + 补落点**：M1 建班配年限(122) / M2 代替方案(120) / M3 题型7+传承清单(105/124) / M5 分班+主班+代行+成绩+留级校验(126/127/121/125/090) / M8 自学特权(119) / 11.12 审批队列一站式批准入班(058) | 128-130 |
| 审批门状态 | （隐含）| status 6 态：pending/active/rejected/suspended/inactive/graduated；待审/未通过靠 app 路由页 | 132 |

### schema_phase1_2026-05-31（App 线主写 · DB 阶段落地 · 权威=`db_alignment_v2.md` §五-八）
> 按域汇总（决策 + db_alignment 域号）。**实际迁移 SQL 待 PM 批 DB 实施阶段**（规则9）。

| 域 | 改动 | 决策 / 域 |
|---|---|---|
| ① 身份/班级 | profiles.status **+pending +rejected**（6 态）；**enrollment 废**（"正式"派生 member_role）；class_members **+member_role**(auditor/formal)；cohorts **+内加行年限**(基数/可延)；**+self_study_grants 表**(自学特权)；held_back_count v1.0 系统校验；is_gongdehui 废 | 058/132/119/122/090/100 · 域① |
| ② 修持 | practice_templates **+代替方案**字段(can_substitute/substitute_practice_id/count)；practices.is_tantric 废；current_status 状态机 v1.0 只算 032 两态(Edge cron 写) | 120/060/032 · 域② |
| ③ 思考题 | questions **+question_type(7型)+payload**；question_responses **+answer_payload +is_correct**、cohort_id **改 nullable**(修002)；**+sm2_cards 表** | 105/106/083 · 域③ |
| ④ 跨域新表 | **+proxy_action_records**(代行·polymorphic target)、**+exam_grades**(考试成绩+合格线·v1.0人工) | 121/125 · 域④ |
| ⑤ 传承 | **+transmissions**(master)、**+program_required_transmissions**(必需)、**+user_transmissions**(已得)、**+v_advancement 视图** | 124 · 域⑤ |
| ⑥ 班级运营 | 法会复用 events；**+cohort_lag_snapshot**(关怀5维·Edge cron 写) | 054-057/107 · 域⑥ |
| ⑦ 密法废 | **DROP tantric_access_grants**、**DROP courses.is_tantric / practices.is_tantric**、删密法白名单逻辑 | 060 · 域⑦ |
| ⑧ 辅助 | **藏历采觉学(137)：废 tibetan_calendar+buddhist_days→建 tibetan_days·UTC+8(075)**；push/audit 复用；**+home_banners +feedback +sms_log** | 075/116/137/117 · 域⑧ |
| ⑨ 升学 | **+v_advancement_5dim 视图**(security_invoker)、**+advancement_records 表**；锚定最初班级 helper；人工判定不 auto-gate | 017/123/118/090 · 域⑨ |
| ⑩ 法义问答 | lesson_blocks **+tsvector + GIN**(全文检索)；**+dharma_qa_queries 表**(查询日志·不露姓名) | 108/109 · 域⑩ |

### rls_policies_2026-05-31（App 线主写 · 权威=`db_alignment_v2.md` §十）
| 类 | 回灌项 | 决策 / §十 |
|---|---|---|
| 废 ~9 | helper has_tantric_access/is_tantric_course 废；courses/program_courses/course_lessons/lesson_resources/lesson_blocks/questions 的 is_tantric 跟随简化；tantric_access_grants 整组废 | 060 · §十 10.2 |
| 改 6 | self_register_class_member() 废(126)；switch_primary_cohort() 改"用户(限已入班)+admin"(131)；cohorts_select gate 改"班级成员含旁听可见自己班"(126)；class_members is_primary 写权=用户+admin(131)；**is_formal_student() 改派生 member_role**(域①C1)；profiles_protect_status 去 enrollment 行 | 126/131/132 · §十 10.3 |
| 加 ~13 表组 | self_study_grants/sm2_cards/proxy_action_records/exam_grades/transmissions×3/cohort_lag_snapshot(⭐师兄不可见)/advancement_records/dharma_qa_queries/home_banners/feedback/sms_log 各配 RLS；user_self_study_programs INSERT 收紧 | 119-125 · §十 10.4 |
| 纪律 | 每条策略补"抽象访问规则"注释；待审(pending)靠 app 路由不卡公共表(132)；判分/状态机/5维不进 RLS(走 Edge/app TS) | 解耦规范§三-4 · §十 10.6 |

---

## 二、v1.0 范围变动汇总

**🔀 反向补 / 新增 v1.0**：颂词背诵题型(105/106)、关怀 5 维滞后快照(107)、AI 法义问答 RAG 检索(108/109)、藏历殊胜日(116)、首页法讯 banner(116)、短信通道(116)、用户反馈通道(117)、per-person 代行记录(121)、代替方案模板配(120)、考试成绩后台录入(125)。

**✂️ 砍 / 不做**：积分排行/成就徽章/成就通知(103)、邀请码(104)、AI 评分/AI 出题(108，闭延后-9/13)、社交 feed 发帖/讨论(111)、灌顶记录(112)、内容举报(116)、A/B 实验(117)。

**🔧 改造对齐**：签到→出勤后台录入(103/094)、4 角色映射(103)、自学需 formal + 特权(096/119)、升学人工判定(103/017)、题型 14→7(105)、各专业打卡/座次(104)、留级两形态 + 次数校验(107/090)、内加行年限建班配置(122)、传承结构化清单(124)、考试线下 + 成绩录入(125)、**取消用户选班→admin 分配(126)**、**主班=用户+admin(127/131)**、**管理端 M1-M11 认领+补落点(128-130)**、**审批门 enrollment 废→status 6 态(132/域①)**。

**🕐 维持延后 / v1.5+**：错题本(延后-10)/收藏(延后-12)、笔记高亮 + 法本阅读器 + 25.C 笔记 AI(v1.5+，115)、代行全套统一框架(v1.5+，110/121)、辅导员带话题讨论(v1.5+，111)、in-app 在线考试(v1.5+，125)、双时区显示(v1.5+，116)、AI 生成式法义回答(后引，109)。

---

## 三、觉学域 / 中枢共享文档
- 觉学域（`docs/juexue_v2_design/`）**只读**：对齐结论写 sss 侧（本清单 + `juexue_alignment_v2.md`），不回写觉学；融合实施阶段再据此对齐觉学代码/文档。
- 中枢 `CLAUDE.md`：藏历时区"手机本地"漂移条订正为 **UTC+8**（075）。
- 课名/节数/专业归属（权威《三殊胜_完整学修体系总清单》）：本批未改，不动。

---

## 四、挂起 / 待实施细化
- **教学部** = 升学/毕业判定职责的角色映射（123，实施阶段定具体角色）。
- ✅ **主班 vs 升学锚定**（原 070 待定）→ **已决（131）**：主班=用户(限已入班)+admin 都可设、可挪；升学锚定最初正式班级(123)，**两者解耦、改主班不影响升学**。
- **自学特权用户**关怀/回向口径（119，类原功德会：无强制功课、不进掉队名单、看全平台回向）。
- 后台配置项的具体 UI 与字段（代替数量/合格线/必需传承/限时年限……DB/实施阶段）。
- **问题090** 已闭（118，报数=升学/毕业硬依据）；无其他待外部挂起项。

---

## 变更记录
| 日期 | 内容 |
|---|---|
| 2026-06-16 | 创建；汇总决策 103-125 待回灌中枢/基线清单（觉学对齐 + 后续逻辑改动）|
| 2026-06-18 | 补 126-132（取消选班/主班用户+admin/管理端M1-M11/审批门status 6态）+ db_alignment §五-十 的 schema（按域①-⑩）+ **新增 rls_policies 回灌段**（废9/改6/加13表组/纪律）；070-vs-123 口径已决(131) |
