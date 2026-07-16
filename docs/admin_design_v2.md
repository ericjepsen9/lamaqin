# 三殊胜 App · 管理端(后台)设计整理 v2

> **状态**:设计整理(2026-06-20)· **非代码**,待 PM 逐模块下「建 X」指令再实现。
> **来源**:① 学员端 36 路由功能反推 ② 觉学后台 UI(19 admin + 12 coach 页·响应式机制)③ sss 决策001-174 / RLS / schema 的管理端功能与权限。
> **角色**:师兄 student / 辅导员 zhumai / 爱心 aixin / 系统管理员 admin。
> **政策(决策173·2026-06-20)**:克制 / 密法0痕迹 / 不比较 三红线已撤;**仍永久守**=不展示他人具名累计/排名(只本人自视 + 管理端分析)、关怀 care_followups 师兄不可见。
> **标注**:【基线】= 已在冻结 schema + 生产库 sss;【待DB】= 决策已拍、需 PM 批迁移(不可自行写)。

---

## 0 · 设计原则

1. **同一套响应式 App,角色分流**(目录纪律 §2;`app/(admin)/`)。登录看 `profiles.role`/`class_admins` 决定进哪区、看哪些导航项;RLS + UI 双重拦截。师兄看不到管理入口。
2. **手机优先 + 宽屏自适应**(详见 §2)。觉学是网页(左侧栏→抽屉);sss 是 Expo RN 手机 App——**手机为主、平板/横屏增强**。
3. **暖藏式视觉**(沿用师兄端:cream/saffron/ink/serif),**不用**觉学的紫色玻璃风。
4. **权限两铁律**(RLS 已实测):① 写全局元数据(课程/题/模板/法会/院系/藏历/画报)= **仅 admin**;② 运营本班(共修/讲考/公告/出勤/关怀)= zhumai/aixin 按分工,**本班隔离**(`is_class_admin`/`has_class_role`/`is_class_member`,不存在"任意班有角色即放行")。
5. **只读 vs 事务**:zhumai/aixin 跨班只在"分析层"只读;事务一律本班。

---

## 1 · 信息架构 / 导航(角色过滤)

**一个管理端壳**,左侧导航(宽屏)/ 抽屉(手机),项目按角色显隐。分组:

| 分组 | 导航项 | admin | zhumai | aixin | 范围 |
|---|---|:-:|:-:|:-:|---|
| 概览 | 总览 Dashboard | ✓ | ✓ | ✓ | 各自范围 |
| 人 | 审批队列 | ✓ | – | – | 全平台 |
|  | 学员管理 | ✓ | ✓ | 只读 | 全/本班 |
|  | 班级管理(院系/专业/班级) | ✓ | 本班设定 | – | 全/本班 |
| 内容 | 课程内容 | ✓ | 只读 | – | 全平台 |
|  | 题库 | ✓ | 只读 | – | 全平台 |
|  | 修学预置(模板/愿/代替/自选经) | ✓ | – | – | 全平台 |
| 运营 | 共修·讲考·出勤 | ✓ | ✓ | 录出勤 | 本班 |
|  | 报数·升学·考试 | ✓ 判定 | ✓ 分享/数据 | – | 本班/全 |
|  | 关怀清单(5维 + 跟进) | ✓ | ✓ | ✓ | 本班 |
| 触达 | 公告·通知·推送 | ✓ 平台 | ✓ 本班公告 | – | 全/本班 |
|  | 法会管理 | ✓ | – | – | 全平台 |
|  | 藏历·画报后台 | ✓ | 藏历只读 | – | 全平台 |
| 系统 | 审计·数据分析·预设 | ✓ | 分析只读 | 分析只读 | 全/本班 |
| 底部 | 回学员端 / 主题 / 退出 | ✓ | ✓ | ✓ | — |

> 觉学把 admin 与 coach 拆成两个壳(`/admin` `/coach` 双挂、按路径区分权限)。sss 合并为**一个壳 + 角色过滤导航**(更贴 §2 一套代码);路由可用 `app/(admin)/` 下分组。

---

## 2 · 响应式布局规范(完美兼容手机)

采觉学的"侧栏 ↔ 抽屉"机制,落到 RN(用 `useWindowDimensions` 断点,非 CSS media query):

| 维度 | 手机(宽 < 900) | 平板 / 横屏(宽 ≥ 900) |
|---|---|---|
| **导航** | 顶部栏 + 左上**汉堡** → 滑出**左抽屉**(宽 280 / ≤86vw,半透明遮罩点击关闭);无底 tab | **常驻左侧栏 220**(暖色,active=saffron-pale)+ 主区 |
| **列表** | **竖向卡片**(每条一卡:头像/标题 + 关键字段 + 操作),不强塞宽表 | 表格(多列),列头点击排序 |
| **详情** | **push 新屏**(Expo Router)或**底部 sheet** | **居中弹窗**(Dialog ~720,URL `?id=` 深链) |
| **表单** | 单列、字段堆叠、底部主按钮 | 单列居中(≤640)或两列 |
| **筛选** | 横向滚动 pill 行 + 搜索框 + 计数 | 同左,一行排开 |

通用范式(承觉学,暖藏式化):
- **列表 + 筛选pill + 搜索 + 计数** 是列表页标准头。
- **卡内内联处理**(公告/法会/举报类:卡上直接发布/撤回/处理)vs **弹窗/屏详情**(学员/班级/题库:点开看全貌再改)。
- **软删除/归档**为主,几乎无硬删;破坏性操作一律二次确认。
- **分段按钮**选枚举(角色/严重度/类别/模式)。
- **可展开行**看 JSON(审计/日志,只读)。
- 顶栏在手机上标题与操作**换行两排**。

---

## 3 · 逐模块页面清单

> 每页:用途 · 角色/范围 · 关键分区&操作 · 数据 · 基线/待DB。觉学对应页放在 →。

### 3.1 总览 Dashboard(→ Admin/CoachDashboard)
- **admin 总览**:KPI(用户/活跃/课程/答题准确率)+ 快捷入口(待审高亮)+ 角色分布/题目状态/数据分布 + 最近注册表。
- **zhumai/aixin 总览**:本班 KPI(班数/学员/本周答题/准确率)+ 我的班卡片 + 待审题/待关怀 feed。
- 范围:各自;只读导航。

### 3.2 审批队列(→ 觉学审批散在 Users;sss 独立·决策130)
- 用途:注册 pending → 批准(active·发学号+分班+设主班)/ 拒绝(rejected,终态)。
- 角色:**admin·全平台**。分区:pending 列表 + 单条批准弹窗(选专业/班 + 设主班)。
- 数据:`profiles.status` + `class_members`。**【待DB】**:基线 status 现 **4 态**(pending/rejected 已删),决策058/132 需加回 **6 态** —— 审批队列依赖此迁移。

### 3.3 学员管理(→ AdminUsers + AdminClasses 抽屉 + CoachStudents)
- 用途:花名册 + 学员详情(进度/累计/SM-2/出勤/答题/愿)+ 身份操作。
- 角色:**zhumai 本班 / admin 全平台**(改);**aixin 本班只读**。
- 关键操作:**转正**(旁听→正式·不可逆·`enrollment`→formal 触发发学号)/ **切主班**(本人或 admin·恰一主班)/ **改 status**(active/paused/留级/毕业/left·zhumai 本班 A4)/ **宽限 due_date**(zhumai 仅 auto 愿·内加行限时仅 admin·必写 audit)/ **代行**(admin:替代/追溯认可/豁免·per-person 留痕)/ **无障碍登记**。
- 响应式:手机=学员卡列表 → 点开 push 学员档案屏;宽屏=表格 + 居中详情弹窗(觉学 CoachStudents 那种富弹窗)。
- 数据:`profiles`(enrollment/student_id/status/accessibility_needs)、`class_members`(is_primary/status/held_back_count)。**【待DB】** member_role 改名未落地(基线 = enrollment);留级次数系统校验(090)。

### 3.4 班级管理(→ AdminClasses + ClassNew + CoachClassDashboard)
- **admin**:院系/专业/班级 CRUD(建班**必填 IANA 时区**)、班↔模板绑定、休息周、指派辅导员/爱心(`class_admins`)、Excel 排表导入、归档。
- **zhumai 本班**:仅改本班**共修设定**(星期/时间/Zoom URL)——不能动班名/program;本班全员对比看板(可排序/CSV·觉学 CoachClassDashboard)。
- 数据:academies/programs/cohorts/cohort_recommended_templates/cohort_rest_weeks/class_admins。**【待DB】** 内加行年限建班配置(122)。

### 3.5 课程内容(→ AdminCourses 主从 + CoachCourses 浏览)
- 用途:课程三层(course → 权威节号 → 各讲者讲解)+ 节次 + 法本/讲记挂载 + 思考题入口 + 封面 + 观修媒体/课件 + 自学读物 + 周修法建议;导入(Notion/Excel)。
- 角色:**写仅 admin**;zhumai 只读浏览(可跳去为某节出题)。
- 响应式:宽屏=左课程列 360 + 右编辑;手机=课程列表 → push 编辑屏(章/节折叠)。
- 数据:courses/course_lessons/lesson_resources/questions/self_study_*/program_week_practices。**【待DB】** `courses.course_type`(限制性课·156)。

### 3.6 题库(→ CoachQuestions + New + Generate + Import + Review)
- 用途:**7 题型**(选择/判断/填空/问答/记忆卡/颂词组句 verse/续接 chain)CRUD + 参考答案 + 批量导入(JSON)+(可选)LLM 生成 + 审核队列。
- 角色:**写仅 admin**(出题、审核 approve/reject);zhumai 可出题进待审。
- 关键页:列表(筛选 status/type/搜索 + URL 详情弹窗,view↔edit,raw payload)、新建(类型选择器 + 课程→章→节级联 + 按型 payload 编辑器 + 参考答案)、审核中心(待审表 + QuestionRenderer 预览 + 通过/驳回带理由)。
- 数据:questions(题型 enum)/question_references。规则:仅问答不显参考;客观/卡片/颂词进 SM-2;颂词不计圆满+盲聋豁免;参考答案写仅 admin。

### 3.7 修学预置(→ AdminPractice + CoachClassPractice)
- 用途:修法模板库(starts_offset/duration 偏移)、班级愿模板绑定、代替方案配置、限时愿标记、自选经/抄拜经允许列表、心经目标遍数;改模板可「同步到已建愿」(仅 active+paused 未达标)。
- 角色:**写仅 admin**(program 为根、cohort 可覆盖);班级愿模板 admin 配。
- 数据:practices/practice_templates/cohort_recommended_templates/self_study_books。**【待DB】** 代替方案/限时字段(120/086)。

### 3.8 共修·讲考·出勤(→ CoachClassSessions + 讲考 + 出勤录入)
- **共修排课**(zhumai 本班 + admin):建场次(日期+结束时刻+类型 regular/practice+Zoom)、场次级考勤开关、推送(创建/前30分/开始);列表=即将/历史 tab + 卡片 + 表单弹窗(觉学 CoachClassSessions)。一班一节课一场次。
- **讲考安排 A8**(zhumai 本班 + admin):日期+范围+主讲人 → 推送(主讲定向+全班);记三态(主讲/听讲/缺席)+ 等级评价(选填·**仅管理端可见**);可挂共修场次。
- **出勤录入**(**aixin + zhumai + admin** 本班):**取消 App 签到**,后台直接记谁到了(group_attend/absent);**师兄不可自报**;旁听照记。aixin 唯一写权限。
- 数据:group_sessions/speaking_sessions/study_records(group_*/speaking_*)。

### 3.9 报数·升学·考试(→ 无直接觉学对应;sss 决策017/118/125)
- **报数**(zhumai 分享 + 系统统计):**取消报数节点**改实时累计;A7 生成 WhatsApp **班级总量**文本一键复制(无个人数据)。**报数=升学硬依据**。
- **升学/留级/毕业判定**(教学部/admin·锚定最初正式班级):**人工**,后台给 5 维数据参考(传承/出勤/修量/考试/发心);发心纯主观不入库;无自动门槛。
- **考试成绩录入**(admin·本班):线下考、后台录入、入 A3 第④维。**【待DB】** `exam_grades`(125)。

### 3.10 关怀清单(→ 觉学无;sss 决策032-035/107)⚠️ 师兄端完全无感
- 用途:**5 维滞后快照**(出勤/功课/听课/答题/观修·每日 cron 算)+ care_followups 跟进(双入口:名单 / 学员详情)。
- 角色:**zhumai/aixin 本班 + admin**;**师兄永不可见、不推送、无状态色**(此红线**不受 173 影响**)。
- 关键:aixin 全班**只读**学修 + 可见手机号 + **可记跟进、不能改愿数据**;断签≥7天 falling_behind、追不回 at_risk。
- 数据:care_followups / user_practice_vows.current_status / weekly_study_summary。

### 3.11 公告·通知·推送(→ CoachClassAnnouncements + AdminSystemAnnouncements + AdminNotificationRules)
- **班级公告**(zhumai 本班 + admin):标题+正文+置顶,默认推全班(含旁听);内联表单 + 卡列表。
- **平台公告**(admin):严重度 普通/重要/紧急(紧急绕静默·二次确认);软撤回。
- **推送规则**(admin):四类框架(A 身份不可关 / B 班级活动可关 / C 学修提醒可关 / D 自设);默认提醒时刻配置 + 手动测试。care 明确不推。
- 数据:cohort_announcements / 系统公告 / user_push_tokens / reminder_presets。

### 3.12 法会管理(→ AdminDharmaAssemblies)
- 用途:建法会(名称+类型 text+起止+封面)+ 法会愿模板(修法+目标可选+期限)+ 回向展示(**匿名**总量,密法愿 share_to_collective=false 不进)。
- 角色:**admin·全平台**;内联表单 + 卡列表 + 软删。
- 数据:events(event_type 自由文本)/ user_practice_vows.event_id。

### 3.13 藏历·画报后台(→ AdminCalendar + AdminCalendarYear + AdminPosters)
- **藏历维护**(admin):月历编辑(点格内联编辑当日:农历/藏历/月名/闰/🌺功德/tags/events/节日)+ 年视图概览(完整度/异常告警)+ JSON 导入导出。**藏历数据 2026 已出导入迁移**(`20260620000010`,待部署)。时区 UTC+8。
- **画报后台**(admin):首页 + 藏历画报,按 **月度 / 法会期 / 特别日**;优先级 特别>法会>月;上传(2:3,≤8MB)+ 标题。
- 数据:**【待DB】** 基线仍 tibetan_calendar+buddhist_days 两表、无画报表;决策137/172 拟合并 `tibetan_days`(本次迁移已加 365 行 + tibetan 列)+ 建 posters(月/法会/日)。

### 3.14 系统·审计·数据(→ AdminAudit + AdminLogs + 数据分析 + AdminLlm)
- **审计日志**(仅 admin):查 audit_logs(改师兄记录/宽限/代行/切主班/改态自动留痕);展开看 before/after JSON;禁改禁删。
- **数据分析**(模块12·admin 全平台 / zhumai·aixin 本班分析层只读):跨班只读副本;用于关怀+教学改进;173 后**可做具名/排名分析**(管理端),但师兄端仍不互比。
- **提醒语预设库 M11**(admin + 任意班 zhumai/aixin 可写·全平台读)。
- **(可选)LLM 管理**:若启用 AI 出题/法义问答(108/109)才需;觉学有完整 LLM 控制台可参照。

---

## 4 · 建设顺序(建议)

1. **管理端壳 + 总览 + 学员管理 + 审批队列**(新用户第一跳;但审批依赖 status 6 态【待DB】——可先做学员管理/总览,审批待迁移)。
2. **课程内容 + 题库**(让课程有料、题可出)。
3. **共修·讲考·出勤**(本班运营高频)。
4. **关怀清单**(辅导员/爱心日常)。
5. **报数·升学·考试** + **公告·通知**。
6. **法会** + **藏历·画报后台**(依赖画报表【待DB】)。
7. **系统·审计·数据分析**。

---

## 5 · 落地前置(【待DB】清单·需 PM 批迁移,不可自行写)

> 基线 = 已建生产库 sss(PM bless「不重建」),新增须谨慎走增量迁移。

1. `profiles.status` 4 态 → **6 态**(加 pending/rejected·058/132)——审批队列前置。
2. 身份字段:基线 `enrollment`(formal/informal);决策134 拟改名 member_role —— 命名待定,发号 trigger 现挂 enrollment。
3. **藏历**:`tibetan_days` 合并表 + 2026 数据 + `tibetan` 列(**本次迁移 `20260620000010` 已备**,待部署)。
4. **画报表** `home_posters` / 统一 `posters`(月/法会/日·139/172)。
5. `exam_grades` 考试成绩(125)。
6. 模板扩展:代替方案/限时字段(120/086)、`courses.course_type`(156)、自学默认节奏(157)、自学特权(119)、结构化传承清单(124)。

---

## 6 · 觉学映射速查(sss 页 ← 觉学页)

| sss 模块 | 觉学参照页 |
|---|---|
| 壳/导航/响应式 | AdminShell / CoachShell + desktop.css(≤767 抽屉) |
| 总览 | AdminDashboardPage / CoachDashboardPage |
| 学员管理 | AdminUsersPage / AdminClassesPage(抽屉)/ CoachStudentsPage / CoachClassDashboardPage |
| 班级管理 | AdminClassesPage / ClassNewPage / CoachClassDashboardPage |
| 课程内容 | AdminCoursesPage(主从)/ CoachCoursesPage |
| 题库 | CoachQuestionsPage / New / Generate / Import / AdminReviewPage |
| 修学预置 | AdminPracticePage / CoachClassPracticePage |
| 共修·出勤 | CoachClassSessionsPage |
| 公告 | CoachClassAnnouncementsPage / AdminSystemAnnouncementsPage / AdminNotificationRulesPage |
| 法会 | AdminDharmaAssembliesPage |
| 藏历·画报 | AdminCalendarPage / AdminCalendarYearPage / AdminPostersPage |
| 审计·日志·LLM | AdminAuditPage / AdminLogsPage / AdminLlmPage |
| 举报(如启用) | AdminReportsPage / AdminNoteReportsPage |
