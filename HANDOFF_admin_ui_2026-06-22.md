# 管理后台 UI · 交接文档(2026-06-22)

> 本会话工作分支:**`claude/new-session-75rldp`**(HEAD `78b8030`)。新分支从此分支切出即可继承全部成果。
> 用途:接手者继续完善管理后台 UI / 接数据。事实源优先级见 `CLAUDE.md` 与 `docs/`。

---

## 0 · 一句话现状
10 个确认管理模块已就位、全部 **mock 数据 + UI 成型**;本会话主要做了 **配色规范统一**(去除浅色底黑字)、**补两个模块的表单弹窗**、**修了 3 个详情页崩溃 bug**。**尚未接任何真实数据**。

---

## 1 · 分支地图(重要,别再踩坑)
| 分支 | 内容 | 说明 |
|---|---|---|
| `claude/new-session-75rldp` | **本会话成果(最新)** | 从这里切新分支 |
| `claude/sss-app-admin-backend-w8gicx` | 确认后台 UI 原始来源(三殊胜版) | 已并入本分支 |
| `claude/modest-faraday-55sqny` | **部署预览绑定的分支** | ⚠️ 只有 `_layout`+`dashboard` 脚手架,**没有 10 个模块**;部署网址不反映本分支成果 |

> ⚠️ **PM 反复"看不到变化"的根因高度怀疑在此**:PM 看的若是部署预览(绑定 `modest-faraday`),则永远看不到 `new-session` 上的改动。**建议接手第一件事**:把部署的 Production branch 切到工作分支,或把工作分支合到部署分支——让 PM 浏览器实时所见即所得(避免图片缓存扯皮)。

---

## 2 · 配色规范(已写入 `app/(admin)/_layout.tsx` 顶部,务必全后台遵守)
以 PM 确认参考图(`confirmed-ui/care_list_wide.png` 等)为准:

| 元素 | 底色 | 文字/图标 |
|---|---|---|
| 主操作(实心按钮) | SAFFRON `#e07856` | 白 `#fff` |
| 次级(软药丸) | SAFFRON_LIGHT `#fbe5da` | SAFFRON_DARK `#c55f3d` |
| 正向确认 | SAGE_PALE `#f1f6ec` | SAGE_DARK `#4d6e3d`(+绿边) |
| 中性/取消 | 浅灰 `rgba(43,34,24,.06)` | INK3 `#857360` |
| 头像 | SAFFRON_LIGHT | SAFFRON_DARK 首字(粗) |
| 左栏选中项 | 实心 SAFFRON 胶囊 | 白图标白字 |
| 左栏未选项 | 透明(奶白侧栏) | INK3 暖灰 |
| 信息提示框 | GOLD_PALE `#fbf3e8` | GOLD `#b88956` |
| 开关 Switch | ON=SAFFRON / OFF=INK4 | — |

**🔴 铁律:任何「橙色/浅色/带色」底都禁止配近黑字(INK `#2b2218` / INK2 `#55463a`);实心橙底必白字。** 白底正文用墨色不算违规(那是基底)。
其它 token:INK4 `#b5a99a`、CREAM `#FBF4E9`(侧栏底)、断点 `WIDE=900`。

---

## 3 · 本会话已完成(逐项)
1. **并入确认后台**:从 `sss-app-admin-backend-w8gicx` 整套 `app/(admin)/`(真 `_layout` + 10 模块 + 设计系统)。
2. **删 4 个被否模块**:班级管理/角色管理/排表配置/模板库 + 左栏入口 + 孤立迁移 `cohort_extra_lessons`。
3. **补表单(mock,即时生效)**:
   - 课程内容:`新建课程`/`新建读物` 弹窗。
   - 藏历画报:`画报上传/编辑`、`单日编辑`、`导入年度 JSON` 弹窗。
4. **配色规范落地**:
   - 写入 `_layout.tsx` 规范注释。
   - 全局动作按钮去黑字(白/深橙)。
   - 头像 8 处:金棕字→浅橙底+深橙首字。
   - 开关 ON 统一藏红(原 绿/金/橙 不一)。
   - 4 个信息提示框 INK2→GOLD。
   - 左栏选中项:浅底深字 → **实心橙+白字**(合入的确认分支原本是错的浅底深字)。
   - 左栏未选项文字/图标:INK2→INK3 暖灰。
5. **修 bug**:`advancement/[studentId]`、`care/[studentId]`、`quiz/[questionId]` 的 `useAdminLayout` 引用路径 `../../_layout`(越级到根)→ 改 `../_layout`,原会**白屏崩溃**。
6. 保留迁移:`20260621000010_group_sessions_tracks_attendance.sql`(共修出勤用)。

---

## 4 · 剩余工作(TODO)

### A. UI 配色收尾(小)
- [ ] 品牌「三殊胜」仍近黑(logo 标题),PM 未定是否调浅。
- [ ] 节次序号小圆圈(`quiz/index`、`courses/lesson` 等)仍「浅金底+金字」发闷,PM 未定是否改深橙。
- [ ] 全 10 模块**逐页复核**是否还有"浅色底+近黑字"残留(本会话主要核了 总览/学员/关怀/报数/法会/题库,详情页与 出勤/审计 需再过一遍)。
- 注:筛选页签/标签**非激活态=暖灰**,PM 已拍板「保持现状」,勿改。

### B. 现有模块缺的表单(mock)
- [ ] 法会详情 `events/[eventId]`:「编辑法会信息」仍是 TODO。
- [ ] 核对 `events` 新建法会/新建公告、`quiz/[questionId]` 参考答案录入 等是否为真表单还是占位。

### C. 缺失整模块(handoff 原列 ⛔)
- [ ] **M8 批量植入老学员**(CSV 上传→映射/预览→导入报告)— **高·上线必需**。
- [ ] **M11 提醒语预设**(reminder_presets CRUD,admin+辅导员+爱心可写)— 中。
- [ ] 代行考试(宽限资格+线下成绩录入)— 低。
- [ ] M10 自学师兄管理 — **阻塞**:自学推进是未决产品问题,先走问卷/PM 拍板。

### D. 已删 4 模块的业务"无处安放"(需 PM 决策)
班级管理/角色管理/排表配置/模板库 已删除不重画。但其业务现**无任何 admin 入口**:
- 班级 + **休息周维护**(影响 `get_current_week_number` 进度算法)
- 辅导员/爱心**指派**(写 `class_admins`)
- **专业课表排课 → 自动生成共修场次**
- 修持**模板绑定**(师兄入班自动建愿)
> 休息周/排课影响面大,若仍需要,得想清楚放哪。

### E. 接真实数据(UI 之后的大阶段,尚未开始)
- 替换所有 `MOCK_*` + `MOCK_ROLE` → Supabase 查询 + 真实 role(`profiles.role` + `class_admins`)+ **RLS 双拦**。
- 审批需补 `approve_registration` SECURITY DEFINER RPC + 写 `audit_logs`(客户端无法代写他人审计行)。
- **前置**:数据环境就绪——`EXPO_PUBLIC_SUPABASE_URL/KEY` 指向 sss-dev + 2.0 schema 已应用到 sss-dev(与 Eric 协调)。本沙箱无 DB 凭据,接数据联调需在有 sss-dev 的环境做。
- 我先前写的审批查询 `lib/queries/admin/registrations.ts` 已删(可从 git 历史 commit `4af1d36^` 找回复用)。
- 改 DB(表/字段/RLS)**必须先提示 PM**(铁律)。

---

## 5 · 预览/渲染方法(本会话用法,接手可复用)
本沙箱无设备,用 **web 导出 + 无头浏览器**出图:
```bash
# 1) 构建(改了代码要 --clear 防 Metro 缓存)
EXPO_PUBLIC_PREVIEW=1 EXPO_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co \
EXPO_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key \
npx expo export --platform web --clear
# 2) 起静态服务器(需 try_files:<path> → <path>.html;动态路由 /a/x → a/[id].html)
#    见 scratchpad/serveC.py 思路
# 3) playwright 截图(模块 800+ 宽=侧栏,<900=移动抽屉)
#    /opt/node22/lib/node_modules/playwright (node 绝对路径 require)
```
- 注意:`EXPO_PUBLIC_PREVIEW=1` 时 `app/index.tsx` 跳 `/home`(师兄端);后台直接访问 `/dashboard`、`/care` 等。
- `_layout` 现为 `MOCK_ROLE='zhumai'`,只显辅导员可见菜单;要看全菜单改 `'admin'`。

---

## 6 · 关键红线(勿碰)
- 密法 App 内 0 痕迹;具名互看他人累计=永久否决(#193);关怀 `care_followups` 师兄完全不可见。
- `lesson_blocks` 由官网/ETL 主导,消费前对齐,勿改定义。
- 改 DB 先提示 PM;"测试通过"≠语义正确,关键业务逻辑需 PM 人工验证。

---
*生成:Claude Code 2026-06-22 · 工作分支 claude/new-session-75rldp @ 78b8030*
