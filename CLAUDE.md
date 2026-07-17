# CLAUDE.md · 闻思修 App(子项目①)

> 这是 三殊胜 项目的 **App repo**(学修端,面向已入学师兄)。另一子项目=公开官网+讲记 ETL(独立 Astro repo,各管各)。两者**共用同一 Supabase**(见 §6)。
> 本 repo 单一事实源 = `requirements_master`(其 §0 是冲突裁决层级)。

## 0 · 怎么和我(PM)协作
- 我是 PM+UX,**不写代码**,全程**中文**(除非要求英文)。
- **不要 yes man**:诚实评估;多方案给 **2-3 个选项 + 取舍**;我想法有问题**直接指出**。
- 用**业务语言**沟通。**Claude Code 报"测试通过"≠语义正确**,关键业务逻辑需我人工验证。
- **测试规范/命令/判例先行流程 = 本仓 `TESTING.md`**(App 域;PM 四决策 2026-07-03 定案:保留自建 harness 不迁 pgTAP / 计算层判例先行 / iOS E2E 先行)。
- 拿不准的事实**绝不臆造**(铁律1:一切有依据,没依据就标"待核")。

## 1 · 技术栈(已锁定,勿擅自换库)
Expo (SDK 53+) RN + TypeScript / Expo Router / NativeWind v4 / React Native Reusables / Zustand / TanStack Query v5 / React Hook Form + Zod / date-fns + date-fns-tz / Lucide RN / Supabase。约 13 核心依赖,目标 ≤30。理由见 `docs/tech_stack.md`。
- 准绳:Claude Code 写得顺手 > 库版本绑定;代码所有权优先;稳定性 > 性能极致;TS 友好。
- 组件库走 **RN Reusables**(copy 进 `components/ui/`,可改),**不用 Gluestack**。
- 时区四层:存储 UTC / 班级集体按 `cohort.timezone`(IANA)/ 藏历殊胜日按 UTC+8 固定(决策075,2026-06-13 裁定,推翻此前"手机本地"的过渡结论) / 个人打卡跟手机本地。**禁用 `CURRENT_DATE` 当"今天"**——按对应时区取。

## 2 · 目录纪律(一套代码 + 响应式:师兄端 + 管理端同一 App)
```
app/(student)/   师兄端路由
app/(admin)/     管理端路由
lib/queries/     共享 Supabase 查询
lib/schemas/     共享 Zod schema
lib/types/       共享类型
components/ui/   RN Reusables 组件(可改)
```
- 角色分流:登录看 `profiles.role` 决定进哪区;师兄看不到管理入口 + **RLS 双重拦截**。
- 默认原生 RN;YouTube 用 `react-native-youtube-iframe`;长文先 `ScrollView`。判断:要打字/点按钮/写库=Native,只滚动看长文/视频=可 WebView。

## 3 · 产品总纲(2026-06-20 调整)
- 最高总纲=**三殊胜**(前行发心 / 正行无缘 / 结行回向)。
- 13 原则见 `docs/principles_2026-05-31.md`(参考;与下述已撤条款冲突处,以本节为准)。
- 「功德回向」对师兄**本人**展示其已积累功德。
- ⚠️ **三红线已撤除(PM 决定 2026-06-20·决策173)**:① 原「克制」气质(不排名 / 不比较 / 不推送催促 / 隐藏总累计 / 师兄端无状态色 / 关怀靠人工)② 「密法 App 内 0 痕迹」(原则10)③ 「具名互看他人累计 / 进度=永久否决」(#193)。**状态色 / 对错标色 / 排名比较 / 密法内容 不再受此三条限制**,新功能不再以其为否决项。
  > 同步:本节为中枢只读副本的就地修订;请回规划中枢 `CLAUDE.md` 同源订正后再覆盖同步(防分叉)。

## 4 · 关键业务模型(细节回事实源,勿凭记忆实现)
- **课程三层**:course(经/论/开示,本身无固有节)→ 权威节号轴(上师讲解定义,如《前行》144)→ 各讲者讲解(挂靠)。思考题/进度/考试范围全挂权威节 `lesson_id`,**不另起编号**。
- **四角色**:师兄 student / 辅导员 zhumai / 爱心 aixin / 系统管理员。技术名不改,UI 显示名见 `docs/terminology_2026-05-31.md`。
- **信任师兄**:全面开放补录(填真实过去日期即时生效);没记录默认 0、不臆造。例外=**内加行过期锁定**(4年限时不跨届)。
- **内容与日历解耦**:内容全局固定,"本周第N节"靠算法 + 休息周机制算,不批量改日期。
- 权威细节:`docs/requirements_master_2026-05-31.md`(产品)/ `schema_phase1_2026-05-31.md`(DB)/ `rls_policies_2026-05-31.md`(权限)/ `prd_2026-05-31.md`(屏/字段)。

## 5 · 课程编号 / 进度算法(05-27 已并入基线 2026-06-01)
**05-27 漂移已并入冻结基线 `_2026-05-31`**(2026-06-01 协调式 bump):基础班独立成第5专业、课程编号改 `(学期号, 学期内周)`、`programs.start_semester`、删留级回拨、`get_current_week_number` 输出 (学期号,学期内周) + 多班防御 + U4 休息周(只扣计划外)、`get_week_lessons` 改入参 + 便利函数 `get_current_week_lessons`。**已在测试库实测 10/10 通过**(5 验证用例 + get_week_lessons)。权威源 = `docs/schema_phase1_2026-05-31.md §12.6.5`;`ClaudeCode任务清单_2026-05-27.md` 退为施工记录(历史)。⚠️ **自学进度模型已定(决策157·2026-06-19,解除决策155 挂起)**:大纲给**默认节奏**(`programs.default_weekly_lessons`·管理端配),师兄**可自定**(`user_self_study_programs.weekly_target`);本周计划 = 起修日 + 有效节奏 + 休息周(`user_self_study_rest_weeks`)顺延 → "本周学第 X–Y 节"(app 端算,复用 program_weeks 节序)。**非班级的 program_weeks 周→节映射**(那是班级模式);自学按节奏线性切。自学资格(决策119/096):formal 主修 **或** admin 授予自学特权(`self_study_grants`)。

## 6 · 共享数据库(指针,不复制)
- 与官网子项目**共用同一 Supabase**。schema 权威 = `docs/schema_phase1_2026-05-31.md`(B 多对多 + lesson_blocks + 05-27 进度算法均已并入)。
- **密法 0 痕迹**是跨子项目红线;App 端读写一律走 **RLS**(`docs/rls_policies_2026-05-31.md`)。
- 讲记结构化数据(`lesson_blocks`)由官网/ETL 子项目主导定义,**已并入基线 `_2026-05-31`**(源 `schema定稿_讲记内容模型_2026-05-31`);App 若要消费,先与其对齐,**勿自行改该 schema**。

## 7 · 事实源 & 命名
- 冲突裁决层级见 `docs/requirements_master_2026-05-31.md §0`。非事实源:`architecture_decisions` / `tech_stack` / `project_roadmap`(不可据以裁决)。
- 冻结基线带 `_2026-05-31` 后缀(切基线全族一起 bump);活文件不带。
- 文档写**绝对日期**,不写"今天/上周"。

> ⚠️ `docs/` = 从规划中枢 `sss/Planning/` **单向同步**来的**只读副本**(文档分发方案A,见中枢 `文档分发与同步_清单.md`)。勿在此就地改规则——改回中枢改完再覆盖同步(防分叉)。
> 本 repo 是 **DB schema 主拥有者**:`schema_phase1` 的权威源在中枢、由 App 线维护;官网 repo 只拿只读副本。

## 多 Claude 协作边界(2026-05-31;详见中枢 `CLAUDE.md §5.1/5.2`)
> App 与官网各有一个 Claude,曾因两边同改中枢共享文档把课名写岔。规矩:**一文件一写者,其余只读**。
- **你(App Claude)写 App 域**:`schema_phase1`/`rls_policies`/`requirements_master`/`prd`/`terminology`/`principles`/`ClaudeCode任务清单`/进度算法/App 代码。
- **只读、勿改**:官网域(`官网子项目_设计纲要`/`slug命名表`/`schema定稿_讲记内容模型`/`讲记ETL_Cowork任务指令`/`讲记页排版规范`)+ **课名/节数/专业归属(权威源《三殊胜_完整学修体系总清单》)**;消费讲记数据先对齐,**勿改 `lesson_blocks` 定义**。
- **接力协议**:改中枢共享文档**前**先读 `决策定稿_课程专业数据模型` 落地段;改**后**追加一行(日期+改了啥)。
- **数据库**:表结构+RLS **你主写**;公开视图(`v_public_*`)官网写;一个共享库;**生产库 sss 已从全量 `schema_phase1` v2 + RLS 建成(2026-06-01,不扩测试切片;PM bless「sss=最终生产库、不重建」)**;实时内容进度见 ETL 活清单,勿写死此处。

## 8 · 施工规约(Claude 每会话遵守 · 2026-06-29 立)
> **总则·三易(2026-07-08 PM 立,一切施工遵循;冲突时报 PM 权衡)**:每次落地先问「是否更易维护/易扩展/易迁移」。
> - **易维护**:单一真源(同一逻辑只一处,如状态机只在 DB `get_vow_status`)、魔法数集中并标「占位·待核」、**不留孤儿代码**(函数/导出写了就接入,否则别提交)、改动挂判例/决策出处。
> - **易扩展**:优先**数据驱动**(加内容=加数据行,勿加 `if/else` 或 in-table CHECK 硬编码枚举);判定形状(维度/周期/阈值)尽量配置化,勿写死。
> - **易迁移**:核心业务逻辑放 DB/可移植层;平台专属(pgvector/pg_cron/storage/Edge)隔离成独立迁移、业务代码不引用;时区遵 §1(**禁 `CURRENT_DATE`**);前端一律经 `lib/queries` 查询层,勿散连。
1. **DB 改动**:能用 Supabase MCP `apply_migration`(进 `supabase_migrations` 台账)就别裸 `execute_sql` 改结构;改完跑 `scripts/check_schema_parity.py` 校验"仓库=库"无漂移。**开发只连 dev(sss-dev:ubyzyadlzmtgxvbxanbr),不连生产、不碰 lotusborn-dev**。
2. **逻辑落点**(定一处,别满世界找):数据派生聚合→DB 触发器(原子);连续重算状态→Edge cron;**业务动作(发愿/判定/审批)→应用层显式调用**(失败要可见,**禁在触发器里吞异常**);跨表读聚合→视图(`security_invoker`)。
3. **类型**:`lib/types/database.ts` 由 `scripts/gen-types-from-migrations.cjs` 从迁移生成(决策175),改迁移后重跑;**勿手改输出**——生成器漏(ALTER 加列/视图列)就**补生成器**。
4. **量化门槛**:出勤率/修量/升学等**未经教务定的阈值**,放 `lib/admin-thresholds.ts` 并标「占位·待核」,勿散落各页冒充定论(决策延后-5)。
5. **验证**:关键业务逻辑须 **PM 人工验**(报"测试通过"≠语义正确);Claude 用 REST(以 hf/师兄真身走 RLS)或 MCP **实测写路径,测后还原**;权限以**库里真实 RLS** 为准(勿凭审计文档臆断,如 care 写=本班 zhumai/aixin、非 admin)。
6. **种子数据**:仅 sss-dev(标记 `@seed.bicwny.test` / `SEED_` / `种子·`),**生产绝不灌**;上线前清(清除 SQL 见 `docs/施工记录_功课配置模块_2026-06-28.md`)。
7. **愿/功课归属**(决策012/160):愿挂**专业(program)**(`practice_templates.applies_to_programs`)非单本课程;闻思(听看答)与修(念诵/座次)**两套不混**;愿不挂 `courses`/课时表。
