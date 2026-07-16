# TESTING.md · 测试规范（本仓单一事实源 · 2026-07-03 起）

> 依据：PM 四项定案（2026-07-02/03，基于《2026 测试策略全景》评估报告 + 本仓现状对照）。
> ⚠️ 铁律不变：**测试通过 ≠ 语义正确**；关键业务语义（进度算法、各专业计数等）仍需 PM 人工核。

## 0 · 四项定案（PM 拍板，改动需 PM 重议）
| # | 决策 | 结果 |
|---|---|---|
| 1 | DB 检查层 | **保留自建 harness**（`supabase/tests/`，**375 断言**(2026-07-13 实跑更新;各文件带「期望断言数」哨兵防静默漏跑；以最近实跑/CI 为准)），不迁 pgTAP。例外条件：项目交外部团队维护、或 DB 检查规模翻倍 |
| 2 | 计算层施工顺序 | **判例先行**：中文判例清单 → PM 审 → 转自动检查（全红）→ 施工到全绿。只适用算账类逻辑（计数/状态机/判分/聚合/时区），UI 不适用 |
| 3 | 企业代理/CA | 不适用，划掉 |
| 4 | E2E 起步 | **师兄端 iOS 先行**（Maestro + EAS preview build），管理端 Web Playwright 后移 |

## 1 · 分层地图（谁守什么）
| 层 | 工具 | 位置 | 守什么 |
|---|---|---|---|
| DB 约束/RLS/函数/工作流 | 自建 SQL harness | `supabase/tests/` | 权限矩阵、红线（#193 互看=0 等）、进度算法、愿状态机/关怀5维/账号注销/内容表写权限收紧/每日发心回向书签/观修座次历史/通知中心收件箱/课程圆满(闻思+功课)/圆满课次(选项C)/自建功课target_count下限/留级次数原子触发器/毕业离班级联暂停功课/A3并发写入幂等11处补漏(2026-07-13) —— 375 断言(2026-07-13)，CI 自动跑 |
| JWT/API 集成 | jest（node 环境）+ 本地 Supabase 栈 | `tests/integration/` | 真实登录路径的跨用户攻击负例 + 正向路径(合法自写/合法跨角色读应放行·2026-07-10 补,防"RLS 把谁都拒"式假绿) —— DB harness 用 auth 桩测不到的盲区;`local-stack-tests.yml` CI 自动跑(2026-07-10 接入) |
| 单元/组件 | jest-expo + RNTL | 与源码同目录 `*.test.ts(x)` | 纯函数、Zod schema、store、hooks、组件 |
| 计算层判例 | 判例清单 → jest/DB 断言 | `tests/casebook/`（清单）→ 各层落地 | 各专业计数、愿状态机、关怀 5 维等业务语义 |
| Web E2E | Playwright（本地Docker栈） | `e2e/` | 决策4的Web层提前建了一层轻量确定性回归(2026-07-09):快乐路径5流程+报数复制+边界/连点/胡乱点击,零LLM成本复跑;`local-stack-tests.yml` CI 自动跑(2026-07-10 接入)。`e2e/resilience.spec.ts`(2026-07-13新增)覆盖测试计划A线三条:弱网断网提交(setOffline+window.alert捕获+恢复重试,验证基础设施本来就是对的)、辅导员URL直达admin-only页、学员深链后台的角色兜底闪现(后两条最初写来复现问题,PM当天拍板"全部修复"后已在`app/(admin)/_layout.tsx`落地页面级角色门+加载中角色清空,断言同步改成"验证修复生效"的回归锁定)——22/22绿(3次稳定性验证,指最初复现版本;修复后新断言待下一次真机跑确认)。⚠️ **2026-07-16 系统性补测**(PM"继续完成"剩余测试缺口全清单,共9批):新增10个spec文件(`registration`/`admin-student-management`/`admin-class-management`扩量/`admin-attendance`/`admin-advancement`/`vow-detail`/`admin-scheduling`/`admin-practice-config`/`course-self-study`/`admin-quiz`),测试总数54→74(共15个文件)——补齐此前0个testID/0覆盖的:注册验证码流程、学员审批可逆(拒绝不再是终态)、后台建号、班级详情全部管理操作(添加学员/设辅导员爱心/设休息周/标记结班/成员管理)、出勤/讲考逐人记录(点名/批量/三态/等级评价/挂靠共修)、学期末升学批处理(毕业/留级两形态「留原班重修」「转下一届」/继续旁听)、功课详情管理(调整节奏/补录/放弃自定功课)、排课管理(一句话排课/放假周/移除课节/清空学期/自学读物——`get_week_lessons`数据源本身)、功课模板配置(编辑/停用启用/传承要求清单)、课程详情"加入自学"(决策119)、思考题管理(新建/编辑/删除)。追加批(PM"把剩余的测试内容也加进去")补齐了上述全部4处已知缺口:按班覆盖(bind/unbind,无confirm)+同步发放(provision_cohort_vows RPC,幂等重跑验证)、自选经候选清单(program_optional_practices增删)、从讲记提取思考题(只读消费`lesson_blocks`既有列,不改其schema)、客观题(单选/判断/填空/记忆卡/颂词组句/颂词续接)payload编辑器6种题型payload形状核对——测试总数74→83(仍15个文件,均追加在既有spec内,无新文件)。**这一整批在AI施工的sandbox环境里从未真正执行过**(该环境无Docker、无浏览器内核,只做到`tsc`/`lint`/`jest`/`playwright --list`四道静态门禁,即"能编译、能被发现"≠"跑过验证通过")——按本文件 §4 需在有真实环境的分支连跑 3 次绿才算稳定,这一步还没做,是下一步要靠人工在真实环境完成的事。 |
| iOS E2E | Maestro（后续阶段·仍按决策4排期） | 未建 | 师兄端核心流程 5-10 条,上架冲刺前做 |

## 2 · 测试命令
```bash
npm test                       # jest：单元 + 组件（不需要本地栈）
npm run typecheck              # tsc --noEmit
npm run lint                   # expo lint
bash scripts/supabase-local.sh start   # 起本地栈（需 Docker Desktop 运行；跳过 prod-only 搜索层迁移）
npx supabase status -o env > .env.local.supabase   # 起栈后导出连接信息（集成测试读它；gitignored）
npm run test:integration       # JWT 跨用户攻击测试（前置：上面两步）
bash scripts/supabase-local.sh stop    # 停栈
bash supabase/tests/run.sh     # DB harness（需本地 psql；CI 每次改 supabase/** 自动跑）
npm run e2e                    # Web E2E(Playwright,需本地栈已起+已跑一次迁移);首跑装浏览器: npx playwright install chromium
npm run e2e:ui                 # 同上,交互式UI模式(调试单条用例用)
```
- **本地栈起停一律走 `scripts/supabase-local.sh`**（不要直接 `npx supabase start`）：它临时移开 3 条依赖 `search_ro`/pgvector 的 prod-only 官网搜索层迁移（本地/裸库装不上），起完 trap 还原。
- 集成测试的表级授权由 `tests/integration/seed.ts` 以超级用户补齐（迁移不自带 anon/authenticated 的 GRANT，见 §7 发现②）。
- CI：快路径 = `app-checks.yml`（typecheck + jest 硬门禁；lint 暂告警）；DB 路径 = `db-rls-tests.yml`（裸 postgres）；本地栈路径 = `local-stack-tests.yml`（2026-07-10 补：起 Docker Supabase 栈,跑 JWT 集成测试 + Web E2E,较慢较重、独立不阻断前两路）。

## 3 · testID 命名规范（跨 Web/iOS 通用）
- RN 组件一律用 `testID` 属性（react-native-web 输出为 `data-testid`；iOS 上是 accessibility id，Maestro 直接用）。
- 命名：`<屏>.<元素>[.<动作>]`，小写点分，如 `home.poster`、`practice.vow-card.submit`、`admin-students.list.row`。
- **常量集中在 `lib/testids.ts`**，测试与组件都从这里 import，禁止散落字符串（改一处两边同步）。
- 只给测试会触碰的元素加，不求全量覆盖。

## 4 · AI（Claude）生成测试的纪律（强制）
1. **禁固定等待**：不许 `waitForTimeout`/`setTimeout` 凑时序；等状态、等事件。
2. **禁弱化断言**：断言以规格/判例清单为准。测试红了，先怀疑代码；要改断言 = 先给 PM 说明为什么规格错了。
3. **禁 `.only`/`.skip` 进提交**。
4. **新测试连跑 3 次全绿才算稳定**（flaky 即修，不许带病合入）。
5. **修测试只改 `tests/**` 与 `*.test.*`**；不许为让测试过而改产品代码语义，也不许修 bug 时顺手删测试。
6. SQL 断言沿用 `supabase/tests/TEST-PLAN.md` 已验证的惯例：「被拒」断言放 EXCEPTION 块、跨回滚观测用 plpgsql 变量（防静默吞断言）。
7. 过度 mock = 无效测试：mock 边界只到 Supabase 客户端/网络层，不 mock 被测逻辑本身。
8. **RNTL v14 起 `render`/`rerender`/`unmount`/`act` 均为 async**（对齐 React 19 异步 act）——组件测试必须 `await render(...)`，否则从 Promise 解构会得到 `getByText is not a function`。从 `render()` 返回值取查询函数，别用全局 `screen`（未配 setup 时不绑定）。
9. **Playwright(RN-Web)踩坑**：Pressable 的 `disabled` 渲染成 `aria-disabled="true"`（非原生 `<button disabled>`），`toBeDisabled()`/`toBeEnabled()` 认不出——统一用 `e2e/helpers.ts::expectDisabled/expectEnabled`（查 `aria-disabled` 属性），别在各条用例里各自猜。
10. **连点/双击测试禁用 `Promise.all([locator.click(), locator.click()])`**：对同一元素并发调用会让两套 hover/mousedown/mouseup 指令交错，不代表真实"手速快"而是内部指令错位失真。改用顺序 `await` + 第二下包 `try/catch`（第一下多半已让按钮换态/弹层关闭，第二下点不中属预期，要观察的是最终写了几条库记录）。
11. **`page.goto()`(硬导航)前必须等登录真正落地**：`signInWithPassword` 后 session 要先写入 localStorage，`router.replace('/')` 才把人送到 `/home`/`/dashboard`；调用方若紧跟着硬导航去测别的路由，可能在 session 落盘前就整页刷新、看不到会话、被弹回登录页。`e2e/helpers.ts::loginAs` 已内置 `waitForURL(/\/(home|dashboard)/)`，别在业务测试里跳过这一步自己拼登录序列。
12. **`page.route()` 延迟响应可复现"加载中角色兜底"类闪现问题**：某些页面在关键查询（如当前用户角色）解析完成前会渲染一个默认态（如"未知角色先当admin处理，避免闪烁"），这种过渡态闪现在真实网速下窗口极短、肉眼难截；用 `page.route('**/rest/v1/<table>*', async r => { await sleep(N); await r.continue(); })` 人为拉长这个窗口，就能稳定断言到过渡态的内容，而不必赌真实网络时序。
13. **`window.alert`/`window.confirm` 断言用 `page.once('dialog', d => { msg = d.message(); void d.accept(); })`**：`lib/dialog.ts` 在 web 端用原生 `window.alert`/`window.confirm`（非自定义 Modal），Playwright 默认会自动关闭这类原生弹窗——不注册监听就断言不到内容，也会因为没调用 `accept()`/`dismiss()` 而卡住等待；提前注册好再触发动作。
14. **`context.setOffline()` 测不出依赖 `navigator.connection` 的 UI 反应**：`@react-native-community/netinfo` 的 web 实现里，只要 `navigator.connection`（Network Information API）存在就*只*监听它的 `change` 事件、完全不走 `window.addEventListener('online'/'offline')` 兜底分支；桌面 Chromium 有这个 API，而 Playwright/CDP 的 `context.setOffline()` 只切 `navigator.onLine` + 触发 `online`/`offline` DOM 事件，不触发 `connection.change`——所以像 `components/offline-banner.tsx` 这类依赖 `useIsOnline()` 的 UI，在这套模拟手法下测不出反应，这是模拟工具够不到信号源的方法论局限，不是代码 bug（iOS Safari 没有 `navigator.connection`，走的是 online/offline 分支，不受此限）。但 `context.setOffline()` 对真实网络请求失败（mutation/fetch 报错）的模拟是可靠的，见 `e2e/resilience.spec.ts` 断网提交那条用例。

## 5 · 判例先行流程（计算层专用 · 决策 2）
1. Claude 通读规格（`docs/requirements_master_2026-05-31.md`、`schema_phase1` §12.6.5 等），产出**中文判例清单** `tests/casebook/<模块>.md`——每条一句可判对错的业务话，标注规格出处（决策号）。
2. 规格模糊处单列「**待 PM 裁决**」，不许施工方自行拍板。
3. **PM 审清单**（补充/纠错/拍板）——这是不可省略的验收关口。
4. 清单逐条转自动检查（此刻全红），检查代码内注明对应判例编号。
5. 施工到全绿；PM 在 App 抽查。清单与检查一一对应，漏项可审计。
> 模块顺序：各专业计数（首个）→ 愿状态机 → 关怀 5 维 → 升学聚合 →（按 roadmap 滚动）。

## 6 · 红线与人工核（不变）
- 红线断言（#193 互看=0、密法 0 痕迹、师兄端无状态色、匿名计数）任何时候不许删改弱化——动它先问 PM。
- 每模块判例清单中标 ★ 的条目 = PM 上 App 人工复核项，测试绿不免除。

## 7 · 搭建阶段发现的待办（2026-07-03，需 PM/后续处理）
1. ~~**`supabase/tests/run.sh` 跳过清单已过时**~~ **✅ 已解决（2026-07-08）**：run.sh 与 run.mjs 的 `grep -vE` 跳过清单已同步为 5 条（`search_chunks_phase1`/`search_semantic_fix`/`search_log_top_distance`/`search_log_intent_capture`/`posters_storage_bucket`）；裸 harness 可重跑。
2. **迁移不自带 anon/authenticated 表级 GRANT**：依赖环境的 `ALTER DEFAULT PRIVILEGES`（prod Supabase 托管角色自带；harness 桩显式设）。非 prod bug，但意味着迁移离开该环境不可移植（本地 CLI 栈建表角色不匹配 → 表来时 authenticated 无表级权限）。集成测试 seed 已补授权兜底。**优先级低**：若将来要「一条迁移串到任意 Postgres」需在迁移里显式 grant。
3. **lint 18 处既有 error**（转义字符 / effect 内 setState 等，全在现有 app 代码）：CI 暂设告警不阻断。清理后去掉 `app-checks.yml` 里 lint 步骤的 `continue-on-error` 即转硬门禁。**优先级低**：不影响功能。
