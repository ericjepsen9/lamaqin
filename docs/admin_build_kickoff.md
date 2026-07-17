# 管理端建设 · 新会话接续指令(kickoff)

> 用途:在**新对话**开始建「三殊胜 App 管理端 / 后台」时,把下面〔接续指令〕整段作为第一条消息粘贴,任务即可无缝接上。
> 背景:师兄端已基本完成;本仓所有进度在分支 `claude/focused-hamilton-000nc8`。生成于 2026-06-20。

---

## 接续指令(复制以下整段到新对话)

```
开始建「三殊胜 App(sss-app)管理端 / 后台」。这是延续任务,先读下列再动手:

【先读】
1. docs/admin_design_v2.md —— 管理端完整设计蓝图(14 模块:用途/角色可见域/分区操作/响应式/建设顺序/觉学映射)。本次以它为准。
2. docs/design_v2_decisions.md —— 决策记录,看顶部"工作规则" + 最新决策170-175。重点:
   · 173 = 克制/密法0痕迹/不比较 三红线已撤;仍永久守"不展示他人具名累计/排名"(只本人自视+管理端分析)、关怀 care_followups 师兄不可见。
   · 175 = 迁移工作流 B:需要的迁移可直接写/提交到功能分支(只是文件);真正 apply 到生产库 sss 是单独部署动作(运维做),不自行执行。
3. CLAUDE.md —— 项目铁律(§3 已按 173 更新)。
4. supabase/README.md + supabase/migrations/*.sql —— 真实 schema = 决策133 的 v2.0 整库重建(约 66 表、全 RLS;status 6态/member_role/tibetan_days/exam_grades 均已在)。⚠️ 这套重建尚未 apply 到生产库 sss(sss 无数据)→ 管理端 UI 先用占位数据搭,接真实数据等重建上线。
5. 觉学后台参照(平行实现·React 网页):/tmp/juexue_ui/juexue-ui-package/ui源码/(19 admin + 12 coach 页;响应式机制见 ui规范/styles/desktop.css)。照其结构/交互在 RN 里重做,不拷贝代码。
6. 风格基准:app/(student)/* 与 app/(admin)/dashboard.tsx;暖藏式调色板 INK #2b2218 / INK2 #55463a / INK3 #857360 / SAFFRON #e07856 / SAFFRON_DARK #c55f3d / SAGE #6f9a86 / cream #FBF4E9,标题用 font-serif。

【怎么做】
- 栈:Expo RN + Expo Router + NativeWind;路由放 app/(admin)/;按 profiles.role / class_admins 角色分流,RLS+UI 双拦。
- 响应式手机优先(采觉学"侧栏↔抽屉"、暖藏式):宽屏(≥~900)左侧栏220+表格;手机顶栏汉堡+左抽屉导航+竖向卡片列表(不塞宽表);详情手机 push新屏或底部sheet、宽屏居中弹窗;用 useWindowDimensions 断点。
- 权限:写全局内容(课程/题/模板/法会/藏历/画报)=仅 admin;运营本班(共修/讲考/公告/出勤/关怀)=辅导员/爱心按分工(爱心只读+录出勤+记关怀);严格本班隔离;关怀清单师兄永不可见。
- 从「管理端壳 + 总览 + 学员管理」开建(不卡 DB、最高频),做完渲染 mockup 给 PM 看再继续;后续顺序:课程内容→题库→共修出勤→关怀→报数升学→法会→藏历画报→系统审计。

【协作/交付】
- PM 不写代码、全程中文、看渲染图评审(不读代码):每做一块用 puppeteer 渲染暖藏式 mockup(手机 390 宽 + 宽屏各一张)发 PM。不要 yes man,多方案给取舍,关键业务逻辑要 PM 人工确认。
- 分支 claude/focused-hamilton-000nc8;tsc 通过后提交并推送;commit 末尾带 Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com> 及本会话 Claude-Session 链接;不开 PR 除非 PM 要。
- 每加功能/决策,更新 docs/design_v2_decisions.md(决策176 起)。

先读 admin_design_v2.md,然后从「管理端壳 + 总览 + 学员管理」开始,渲染 mockup 给我看。
```

---

## 接续提示(给 PM / 新会话留意)

- **进度位置**:所有改动在分支 `claude/focused-hamilton-000nc8`;新会话在同一分支继续即可。
- **觉学源码路径** `/tmp/juexue_ui/...` 是上个会话环境的;若新会话环境不同、找不到,先说明再定位(别照记忆臆造)。
- **commit footer 的 `Claude-Session` 链接**用新会话自己的;`Co-Authored-By` 行照旧。
- **建设顺序**(建议):① 管理端壳 + 总览 + 学员管理 → ② 课程内容 → ③ 题库 → ④ 共修·出勤 → ⑤ 关怀 → ⑥ 报数·升学 → ⑦ 法会 → ⑧ 藏历·画报 → ⑨ 系统·审计。
- **DB 现实**:v2.0 重建在 `supabase/migrations/`(未 apply 到 sss、sss 无数据)→ UI 先占位;接真实数据是后续单独阶段(运维 apply 重建 + 灌种子)。
- **永久红线(173 后仍守)**:不展示他人具名累计/排名(仅本人自视 + 管理端分析);关怀 care_followups 对师兄不可见、不推送。
