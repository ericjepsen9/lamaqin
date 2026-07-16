# v2.0 测试计划(全面 · 对齐功能清单 104 条)

> ⚠️ **本文件的断言数为历史快照(约 2026-06-24 早期基线)——现值以各测试文件的「期望断言数哨兵」/最近实跑为准(2026-07-08:全 harness 287 = 02:44/03:27/04:23/05:34/06:24/07:54/08:23/09:7/10:20/11:18/12:13)。** 下方 129/38/12/32 等旧数不再维护。
> 目的:把 2.0 **所有功能/逻辑**列全 → 一步一步生成测试。**节奏:每步等 PM 说"开始"**我才生成(测试→本地跑→CI→回报→等下一个"开始")。
> 现状:`supabase/tests/` 已建 11 个测试件(02–12·287 断言·本地 + CI 全绿)。
> ⚠️ 铁律:**测试通过 ≠ 语义对**;客观可断言的(约束/RLS/函数/流程)由测试守,**关键业务语义(尤其进度算法/各专业计数)仍需 PM 人工核**。
> ⚠️ 测的是 **2.0 重建 schema(本仓 migrations)**,身份按 2.0「审批门+旁听/转正」(决策136)。
> **权威全功能源 = `docs/feature_inventory_v2.md`(104 条)**;本计划 §七 对它逐条映射,确保一条不漏。

## 标签
🟢 现 DB 可测(本仓 harness) · 🟡 待 app 代码(jest,Eric/app 线) · 🔵 红线断言 · 🕐 功能本身延后 · ⚪ 废除/不做/纯UI

---

## 0 · 分层 + 步骤序列

| 步骤 | 层 | 测什么 | 现可测 |
|---|---|---|---|
| **1** | 数据完整性/约束 | CHECK/UNIQUE/FK/默认/不可篡改 + 课程三层挂靠 + 老学员 data_source | 🟢 |
| **2** | RLS 全表×角色 | 63 表 × 8 角色 增删改查(2a 身份/课程 · 2b 打卡/思考题 · 2c 修持/传承/关怀/升学/辅助)| 🟢 |
| **3** | DB 函数/触发器 | 进度算法★ / 转正发学号 / 切主班 / 打卡累加 / 座次 / protect / audit / 提醒上限 / 共修设定 | 🟢 |
| **4** | 端到端工作流 | 审批门全程 / 老学员植入 / 旁听转正 / 退班重进 / 暂停 / 补录 / 内加行过期锁定 / 法会愿 / 约修 / 关怀 | 🟢 |
| **5** | 红线横扫 | #193 互看=0 / 密法0痕迹 / 师兄端无状态色 / 匿名计数 | 🟢🔵 |
| **6** | app/Edge 层逻辑 | 见 §六(圆满/状态机/5维/各专业计数/判分/SM-2/推送/报数聚合/时区/Storage/注销/各M屏/分析)| 🟡 待 app |

---

## 1 · 数据完整性 / 约束(步骤1)
- **枚举/默认**:profiles.status 6态·默认 pending、preferred_region、data_source、learning_mode、accessibility ⊆{blind,deaf}、**无 enrollment 列**;class_members.member_role∈{auditor,formal}默认auditor、status 5态;class_admins.role∈{zhumai,aixin};cohorts.timezone NOT NULL、内加行年限>0/≥0、**无 is_gongdehui**;courses **无 is_tantric**;questions.question_type 7型默认open;vows.current_status 7态、status 4态;practices.measurement;proxy.action_type/target_kind;transmissions.source_kind;advancement.decision。
- **唯一**:uniq_class_members_primary(每人≤1主班)、student_id、courses.slug、cohorts.code、self_study_grants(每人1生效)、question_responses 班级答+自学答(cohort NULL)两 partial unique、sm2_cards(user,question)。
- **CHECK 业务**:vows_must_have_terminus、daily/weekly_target 随 period 必填、practice_logs logs_has_value、**no_future_date(补录禁未来)**、held_back_count≥0、current_semester 1..16。
- **不可篡改**:audit_logs 无 UPDATE/DELETE。
- **⭐ 新增·课程三层挂靠完整性(3.1)**:questions/program_week_courses/进度 全挂 `course_lessons`(权威节号轴)、不另起编号;lesson_blocks/lesson_resources 挂 lesson;FK 正确。
- **⭐ 新增·老学员植入(1.5)**:data_source='imported' 直插 profile(绕审批门、status 显式 active)、起修日=真实 start_date——约束/FK 不挡。
- **FK 级联**:删 profile → 级联抽样验。

## 2 · RLS 全表 × 角色(步骤2,可拆 2a/2b/2c)
角色:正式师兄/旁听/本班主麦/本班爱心/admin/待审pending/自学特权/别班师兄。每表×每操作断言谁行谁不行。
- **2a 身份+课程内容**:profiles/class_members/class_admins/system_admins/academies/programs/cohorts/self_study_grants + courses/course_lessons/lesson_resources/lesson_blocks/program_courses/self_study_books·articles·blocks。
- **2b 排表+打卡+思考题**:program_semesters/weeks/week_courses/week_self_study/week_practices/cohort_rest_weeks/user_self_study_programs(INSERT 收紧)/user_self_study_rest_weeks/reminder_presets/user_reminders(仅自己) + study_records(含审核态UPDATE/DELETE + 出勤后台094)/group_sessions/speaking_sessions/program_study_types/self_study_records/weekly_study_summary + questions/question_responses(含自学cohortNULL)/question_references(仅主麦admin)/sm2_cards。
- **2c 修持+传承+代行+关怀+升学+辅助+法义**:practices/contents/guides/templates/cohort_recommended_templates/events/practice_appointments/user_practice_vows/practice_logs + transmissions/program_required_transmissions/user_transmissions + proxy_action_records/exam_grades + care_followups⭐/cohort_announcements/cohort_weekly_practice_summaries/daily_practice_journals/cohort_lag_snapshot⭐ + advancement_records/v_advancement_5dim(security_invoker) + tibetan_calendar+buddhist_days(两表校勘版;原决策137 tibetan_days 已 §400/b 收口)/user_push_tokens/home_banners/feedback/sms_log⭐/audit_logs⭐ + dharma_qa_queries。
- **兼修隔离 + 退班记录不串(2.5/2.6)**:A班记录不入B班视角。

## 3 · DB 函数/触发器(步骤3)
- **进度算法★(最高人工验证)**:get_current_week_number (学期号,学期内周)·基础班start_semester=1/加行=2·**只扣计划外休息周**·多班防御·held_back→0行·p_today 按**班级时区**(时区四层之一);get_week_lessons / get_current_week_lessons。
- handle_new_auth_user(→pending·无enrollment);**promote_member_role**(主麦/admin转正·不可降级·首次发学号只发一次·audit);**switch_primary_cohort**(用户/admin·限已入班·两步·audit;别人/未入班拒);generate_student_id 格式。
- practice_logs_update_vow_progress(增改删→愿累减);practice_logs_calc_session(≥30=1座/不跨记录)。
- profiles_protect_status(锁 status/student_id/...·bypass 仅授权流程);vows_protect_status(锁 current_status·auto愿due锁师兄放管理者);vow_due_date_audit/study_records_audit(管理者改→audit·自己不写);check_user_reminders_limit(>20拒);set_updated_at;update_cosession_settings(只共修字段·非主麦/admin拒)。

## 4 · 端到端工作流(步骤4)
- **审批门全程**:注册→pending(进不了内容)→批active→分班(旁听)→转正formal(发学号)→可自学其他科系。
- **⭐ 老学员植入**:service_role 直插 imported·active·绕门·起修真实日。
- **旁听→转正**:auditor 打卡/答题正常→promote→formal+学号+升学锚定追溯。
- **⭐ 退班重进**:left→重进 记录/auto愿接续;**跨班隔离**。
- **⭐ 暂停**:师兄自助暂停单愿/辅导员代停/**不顺延** due_date。
- **补录**:过去日期即时生效(禁未来);**内加行过期锁定**(过 current_end_date+延长期不可补·年限取 cohort 配)。
- **法会愿**:admin建event→参加(建custom愿挂event_id)→集体回向只出总和。**约修**:发起→加入(挂appointment)→COUNT。
- **关怀**:5维标记落后→爱心写care→师兄全程不可见。
> ✅ **已覆盖(06_workflows·24断言)**:审批门全程(W1)/旁听→转正发学号(W1)/退班重进即时恢复(W2)/跨班隔离(W6)/补录即时生效(W5)/法会回向聚合(W3)/约修(W4)/老学员植入绕门(W7)。
> **关怀不可见**已在 02(师兄/pending=0、主麦/爱心/admin≥1·#193)充分覆盖,06 不重复。**暂停"不顺延"/内加行过期锁定**=app/Edge 层语义(无 DB 机制可断言),归步骤6,不在此造空断言。

## 5 · 红线横扫(步骤5)
- **#193 互看=0**:任何师兄看任何"他人"的 累计/进度/愿/打卡/关怀/快照/成绩/升学/答案 → 0(只见自己;管理者按本班)。
- **密法0痕迹**:全库无 is_tantric 列/无 tantric 表/函数;内容对登录可读无密法 gating。
- **师兄端无状态色**:current_status/cohort_lag_snapshot/care_followups 对师兄一律不可读。
- **不排名/匿名**:#203 在修人数 = 匿名计数;集体回向 = 总和(均不带身份)。

## 6 · app/Edge 层逻辑(步骤6,待 app 代码·jest)
逻辑在 app/Edge TS(规范§七),本仓暂无代码 → 待 app 线/2.0 落地用 jest;现逐条列清(不再笼统):
- **圆满判定**(听≥1+看≥1+答题;盲聋豁免·091/3.2/3.4) · **愿状态机**(断签≥7/追不回/入行特判/净土每日·032/081·延后-27)
- **各专业计数⭐**:净土三选一·当日累计(5.11)/ 入行 周≥3座·周一清零(5.12)/ 学经 遍数·普贤·自选经·抄拜经(5.13)
- **关怀5维计算**(107·Edge cron)· **升学5维聚合+人工判定**(017/123·不auto-gate)· **代行影响**(豁免/替代/认可计入·121)
- **校验**:留级次数 can_hold_back(090)/专业锁 can_change_program(079)/内加行过期锁 can_backfill(#190/122)
- **本地判分**(客观/颂词·082/083)· **SM-2 调度**(106)· **法义 tsvector 检索+护栏**(108/109)
- **模板同步⭐**(模板改可选同步+边界·015/016/5.2)· **报数/集体回向聚合口径⭐**(本班+全平台只看总和7.1 / WhatsApp文本7.4 / 实时统计=升学硬依据118/7.7)
- **四类推送⭐**(A不可关/B可关/C默认开/D自设 + 截止临近/愿被改/新周课/每周回向·062/068/9.1)· **自设提醒**(≤20已在步骤3)
- **时区四层⭐**:班级(步骤3进度)已测;**藏历殊胜日 UTC+8(075)/ 个人打卡手机本地 / UTC存储**(10.4)
- **Storage 抽象⭐**(音频Storage可下载/视频YouTube/URL走DB可迁R2·3.13)· **注销账号 Edge**(删auth.users·1.7)· **OTP 登录**(1.1)
- **各管理端屏 M1-M15**(11.1-11.15·UI;背后 admin 写各表 RLS 已在步骤2、函数在步骤3、审批队列在步骤4)· **报告/分析**(事务-分析分离/跨班分析/口径·12.1/12.2)
- **其它体验**:弱网友好提示+重试(10.2)/ 简繁v1.5+(10.3)/ 殊胜日banner延后-14(10.1)/ 历史档案S15(10.6)/ 配色字体UI(10.5)

---

## 七、全功能覆盖映射(对齐 `feature_inventory_v2.md` 104 条 · 一条不漏可审)
> 每条 → 测试归属步骤 + 标签。⚠️ 功能清单本身待刷新到决策132-136(如 1.4 学号"批准时发"已被决策134"首次转正发"取代,以决策为准)。

**一 注册与身份**
| # | 功能 | 归属 | |
|---|---|---|---|
|1.1|OTP 注册登录|步骤3(建档trigger)/app|🟢🟡|
|1.2|审批门 pending→active + 待审/未通过页|步骤4+2(gate)/页app|🟢🟡|
|1.3|注册完善全部资料|步骤1(字段)/app表单|🟢🟡|
|1.4|学号自动(✏️转正发·决策134)|步骤3 promote|🟢|
|1.5|老学员CSV植入(data_source/绕门)|步骤1+4|🟢|
|1.6|status 六态(suspended/inactive界面延后-25)|步骤1 / 界面🕐|🟢🕐|
|1.7|注销账号(Edge 删 auth.users)|步骤6|🟡|
|1.8|♿ 登记|步骤1|🟢|

**二 学习模式与班级**
| # | 功能 | 归属 | |
|---|---|---|---|
|2.1|双模式 class/self_study/both|步骤1 / app|🟢🟡|
|2.2|learning_mode 切换|app|🟡|
|2.3|入班旁听→转正(不可逆)+通知|步骤4+3 / 通知app|🟢🟡|
|2.4|旁听=正式 except升学·转正追溯|步骤4 / 升学app|🟢🟡|
|2.5|退班重进接续 + 跨班隔离|步骤4+2|🟢|
|2.6|多班兼修 + 主班机制|步骤3 switch + 2 隔离|🟢|
|2.7|班级切换器 S4|app|🟡|
|2.8|成员五状态|步骤1|🟢|
|2.9|暂停(自助/代/不顺延)|步骤4+2|🟢|
|2.10|留级两形态+次数上限|步骤6 can_hold_back / 步骤1 字段|🟡🟢|
|2.11|专业锁定(第2学期)|步骤6 can_change_program|🟡|
|2.12|转功德会|—|⚪废(100)|
|2.13|毕业归档|步骤1(graduated)/app|🟢🟡|

**三 课程与闻思**
| # | 功能 | 归属 | |
|---|---|---|---|
|3.1|课程三层·全挂权威节号|步骤1(挂靠完整性)|🟢|
|3.2|正式课圆满(听+看+答题)|步骤6 圆满|🟡|
|3.3|听课多次|步骤1(无unique)+2|🟢|
|3.4|盲聋豁免|步骤6 / 步骤1 ♿|🟡🟢|
|3.5|批量补录|步骤4|🟢|
|3.6|按进度显示当前课+历史补录|步骤3+4|🟢|
|3.7|学期排表 S5|app / program_weeks 步骤2|🟡🟢|
|3.8|限制性课 18 本|步骤2 / app|🟢🟡|
|3.9|休息周机制|步骤3|🟢|
|3.10|进度算法★|步骤3(最高人工)|🟢|
|3.11|自学全平台浏览+跨科系打卡(NULL)|步骤2+4|🟢|
|3.12|自学科系选择|app|🟡|
|3.13|资料托管/Storage(R2可迁)|步骤6 storage / 步骤1 URL|🟡🟢|
|3.14|课程名/source_text/lesson_resources|步骤2(data)|🟢|

**四 思考题/答题**
| # | 功能 | 归属 | |
|---|---|---|---|
|4.1|题型 7 型|步骤1 enum|🟢|
|4.2|答案显示规则(问答不显/客观显)|步骤2 references / 步骤6 判分显答|🟢🟡|
|4.3|参考答案辅导员可读|步骤2(仅admin/主麦)|🟢🕐(延后-17)|
|4.4|M3 导入思考题|app|🟡|
|4.5|多班答案独立+自学NULL|步骤1+2|🟢|
|4.6|SM-2 启用|步骤6 调度 / 步骤1·2 cards|🟡🟢|

**五 愿与修持**
| # | 功能 | 归属 | |
|---|---|---|---|
|5.1|愿三来源|步骤2+4|🟢|
|5.2|模板挂program/cohort覆盖/同步|步骤6 模板同步|🟡|
|5.3|达标/结愿/超额/本人可见|app / 步骤2 本人可见|🟡🟢|
|5.4|节奏自主(pace_history)|步骤2+app|🟢🟡|
|5.5|custom删/auto不删|步骤2 delete RLS|🟢|
|5.6|修法库选/简单自建|app|🟡|
|5.7|同日累加/严格归属|步骤3|🟢|
|5.8|补录即时/禁未来|步骤1+4|🟢|
|5.9|座次≥30=1|步骤3 calc_session|🟢|
|5.10|内加行4年限时/过期锁定|步骤4 / 步骤6 校验|🟢🟡|
|5.11|净土三选一·当日累计|步骤6 净土计数|🟡|
|5.12|入行周≥3座·周清零|步骤6 入行计数|🟡|
|5.13|学经遍数/普贤/自选经/抄拜经|步骤6 学经计数 / config|🟡|
|5.14|92修法选第几法/本周建议|步骤2 + app|🟢🟡|
|5.15|反思/日记|步骤2(dormant)|🕐延后-23|
|5.16|状态机|步骤6|🟡|
|5.17|宽限due_date权限矩阵|步骤2+3 audit|🟢|
|5.18|代修|—|⚪不做|
|5.19|share_to_collective 恒true|步骤1+2|🟢|

**六 共修/出勤/讲考**
| # | 功能 | 归属 | |
|---|---|---|---|
|6.1|共修场次|步骤2|🟢|
|6.2|出勤后台录入(094)|步骤2|🟢|
|6.3|共修类型|步骤2|🟢|
|6.4|讲考|步骤2|🟢|
|6.5|讲考与升学|—|🕐延后-18|
|6.6|网络共修线下|—|⚪无app流程|

**七 同修/集体**
| # | 功能 | 归属 | |
|---|---|---|---|
|7.1|每周集体回向(只看总和)|步骤2 view + 5 红线|🟢🔵|
|7.2|法会|步骤4|🟢|
|7.3|班级公告|步骤2|🟢|
|7.4|WhatsApp 报数文本|步骤6 报数聚合|🟡|
|7.5|当日在修人数(匿名#203)|步骤5 红线 / 步骤6 计数|🔵🟡|
|7.6|约修|步骤2+4|🕐延后-16|
|7.7|报数实时统计=升学硬依据|步骤6 聚合 / 问题090|🟡|

**八 关怀**
| # | 功能 | 归属 | |
|---|---|---|---|
|8.1|状态机仅管理者/无状态色|步骤5 红线|🔵|
|8.2|关怀名单排序|步骤6 5维|🟡|
|8.3|跟进双入口/爱心权限|步骤2|🟢|
|8.4|care 师兄不可见|步骤5 红线|🔵|

**九 推送与提醒**
| # | 功能 | 归属 | |
|---|---|---|---|
|9.1|四类推送框架|步骤6 推送|🟡|
|9.2|自设提醒≤20 + 预设库|步骤3 limit + 2 presets|🟢|

**十 其他体验**
| # | 功能 | 归属 | |
|---|---|---|---|
|10.1|藏历日历(✏️ **采觉学 UI+数据·137**·~~建 tibetan_days~~→**已改两表 tibetan_calendar+buddhist_days·§400/b**)+殊胜日|步骤2 tibetan_calendar+buddhist_days RLS + 步骤6 觉学月历UI/算今天UTC+8|🟢🟡(双时区 v1.5+)|
|10.2|弱网处理|app|🟡|
|10.3|简繁切换|—|🕐v1.5+|
|10.4|时区四层|步骤3 班级 / 步骤6 藏历UTC+8·个人本地|🟢🟡|
|10.5|配色/字体|—|⚪UI阶段|
|10.6|历史档案 S15|步骤2(graduated) / app|🟢🟡|

**十一 管理端 M1-M15**(屏=UI🟡;背后数据/函数已在步骤2/3/4)
| # | 功能 | 归属 | |
|---|---|---|---|
|11.1|M1 院系/专业/班级|步骤2 admin写 / app|🟢🟡|
|11.2|M2 模板库|步骤2 / app|🟢🟡|
|11.3|M3 课程编辑器|步骤2 / app|🟢🟡|
|11.4|M4 Excel 排表导入|步骤2 program_weeks / app|🟢🟡|
|11.5|M5 师兄管理(多入口)|步骤2+3(promote/switch/宽限)+4 / app|🟢🟡|
|11.6|M6 权限管理(class_admins)|步骤2 / app|🟢🟡|
|11.7|M7 密法白名单|—|⚪废(060)|
|11.8|M8 账号层(status)|步骤2 + 4 / app|🟢🟡|
|11.9|M9 休息周|步骤2+3(进度) / app|🟢🟡|
|11.10|M10 自学师兄管理|步骤2 / app|🟢🟡|
|11.11|M11 提醒语预设|步骤2 / app|🟢🟡|
|11.12|审批队列页|步骤4 / app|🟢🟡|
|11.13|audit_logs 查看|步骤2(admin) / app|🟢🟡|
|11.14|法会管理|步骤4 / app|🟢🟡|
|11.15|可选经典列表|步骤2 / app|🟢🟡|

**十二 报告与分析**
| # | 功能 | 归属 | |
|---|---|---|---|
|12.1|事务/分析分离·跨班分析|步骤6 分析 / 步骤2 RLS|🟡🟢|
|12.2|口径(全部数据/自学单列)|步骤6 分析|🟡|

---

## 进度跟踪
| 步骤 | 状态 | 备注 |
|---|---|---|
| 1 约束 | ✅ **12 断言绿**(03_constraints) | member_role/timezone/年限/补录禁未来/logs_has_value/must_have_terminus/题型/自学特权唯一/status6态/♿/FK/audit不可篡改 |
| 2 RLS 全面 | ✅ **38 核心 + 32 全表 = 70 绿**(02+05) | 05 补:自有数据见己不见他/admin-only师兄不可见(sms_log/audit/system_admins)/管理者本班可见/公共表可读/别班隔离/自学INSERT收紧 |
| 3 函数/触发器 | ✅ **23 断言绿**(04_functions) | **进度算法5用例★** + 转正发学号 + 切主班 + 打卡累加/座次 + protect + 提醒上限 |
| 4 工作流场景 | ✅ **24 断言绿**(06_workflows) | W1 审批门全程 / W2 退班重进即时恢复 / W3 法会回向聚合(只算share) / W4 约修发起+冒名拒+计数 / W5 补录即时生效 / W6 跨班隔离 / W7 老学员植入(imported绕门) |
| 5 红线横扫 | ◐ 部分(分布在 02/05/06 内) | #193互看=0/密法0痕迹/师兄端无状态色(care/snapshot/current_status)/admin-only;待集中汇总成独立层 |
| 6 app 层 | 🔲 待 app | jest;§六已逐条列清 |

> ~~**当前测试件总计 129 断言全绿**(38 核心RLS + 12 约束 + 23 函数 + 32 全表RLS + 24 端到端流程)~~ **[历史快照·见文件顶部]** 现值 **287**(02:44/03:27/04:23/05:34/06:24/07:54/08:23/09:7/10:20/11:18/12:13·含 counting/状态机/报表/发愿链/写RPC/升学视图/波B代行传承写权/波C门槛双层)。本地 + CI 同跑,以哨兵/最近实跑为准。
> ⚠️ **断言惯例(2026-06-18 经实测修正)**:`set_config` 计数在 savepoint 回滚时会被还原,故"被拒"断言一律放 EXCEPTION 处理块、"做动作→观测→回滚"用 plpgsql 变量跨回滚——否则旧写法会把回归静默吞掉(只 WARNING、CI 仍绿)。已用**变异测试**验证:故意破坏 member_role CHECK → harness 退出码 3(CI 变红)。
> 剩:步骤5 红线集中汇总(可选·现已分布覆盖)、步骤6 app层(jest·待 app 代码)。
