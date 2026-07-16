# 三殊胜 App · 技术栈决定

> **日期**:2026-05-21
> **状态**:技术栈一次性锁定(新决定 #161-169)
> **撤回**:PRD §10/§11 的 Gluestack v2 决定
> **下游待办**:Phase 0 setup / 应用到 PRD
> **关联文档**:[JUEXUE_TOKENS.md](./JUEXUE_TOKENS.md) — 后期 design tokens customize 完整参考

---

## 一句话总结

```
Expo + React Native + TypeScript
  + NativeWind v4 + React Native Reusables
  + Zustand
  + TanStack Query v5
  + React Hook Form + Zod
  + Expo Router
  + date-fns + date-fns-tz
  + Lucide React Native
  + Supabase
  + GitHub + Claude Code
```

约 13 个核心依赖,满足 PRD §11 验收"≤ 30"。

---

## ⭐ 决策准绳(为什么这么选)

按重要性:
1. **Claude Code 写代码顺不顺手** — 用户非程序员,主力靠 AI 编程
2. **代码所有权 > 库版本绑定** — 避免被库的大版本升级折磨
3. **稳定性 > 性能极致** — 91 师兄规模不在意微秒级
4. **TypeScript 友好** — 类型让 AI 写错的概率小
5. **生态风格一致** — 函数式贯穿(Zustand / Zod / date-fns)

---

## 完整栈

```
Frontend
├─ Expo (SDK 53+) + React Native + TypeScript
├─ Expo Router                路由
├─ NativeWind v4              样式(Tailwind for RN)
├─ React Native Reusables     组件库(shadcn 哲学,copy-paste 进仓库)
├─ Lucide React Native        图标(1500+ stroke 风格)
├─ Zustand                    全局状态
├─ TanStack Query v5          数据查询 + 缓存
├─ React Hook Form + Zod      表单 + 验证
├─ date-fns + date-fns-tz     日期 + 时区
│
Backend
├─ Supabase                   PostgreSQL + Auth + RLS + Storage + Realtime
│
DevOps
├─ GitHub                     代码 + Actions
└─ Claude Code                AI 编程助手
```

---

## 决定 #161 · UI 组件库:React Native Reusables

撤回 PRD §10/§11 的 Gluestack v2 决定。

**关键理由**:
- AI 训练数据丰富(shadcn 是 2024+ 行业标准,远多于 Gluestack)
- 代码所有权:组件 copy 进项目,完全可控
- Gluestack 两年三大版本(v1→v2→v3),稳定性差
- 基于稳定的 NativeWind v4

**落地方式**:
```bash
npx react-native-reusables@latest add button card input label ...
```
组件代码进 `components/ui/`,可任意修改。

---

## 决定 #162 v2 · 四层时区策略

### 四层

| 层 | 时区 | 用在哪 |
|---|---|---|
| 存储层 | UTC | Supabase `timestamptz` 默认 |
| 班级集体 | `cohort.timezone`(IANA) | 共修、讲考、班级日历、休息周 |
| 藏历殊胜日 | 固定 UTC+8 | `buddhist_days` banner |
| 个人打卡 | 手机当地时间 | 修持日志、思考题、反思笔记 |

### Schema 改动

```sql
ALTER TABLE cohorts
  ADD COLUMN city text NOT NULL DEFAULT 'New York',
  ADD COLUMN timezone text NOT NULL DEFAULT 'America/New_York';
```

### 班级城市预设(M9 admin 创建班级时选)

8 个常用 + "其他":纽约 / 旧金山 / 洛杉矶 / 多伦多 / 北京 / 上海 / 香港 / 台北

### 关键规则

- IANA timezone(`America/New_York` 等),自动处理夏令时
- 改 city / timezone **不影响历史 UTC 数据**(只改显示视角)
- 师兄 profile **不存** timezone(用 `Intl.DateTimeFormat().resolvedOptions().timeZone` 跟手机走)
- 跨时区飞行可能"一天打 2 次"或"漏 1 天" — 物理客观,不强行修正

### 典型场景

- **NYC 班共修**(中国师兄看):班按 `America/New_York` 显示 NYC 时间 + 北京时间标注
- **莲师日**(藏历):全 App 师兄按 UTC+8 那天看到 banner(NYC 师兄会从本地前一天中午看到)
- **个人打卡**:在哪打卡按哪里的"今天"

---

## 决定 #163 · 状态管理:Zustand

**关键理由**:
- 4KB 极简,API 直观
- Claude Code 训练数据极多
- App 全局状态扁平(用户、当前班级、modal 开关、未保存草稿),无需 Jotai 原子化

**典型用法**:
```typescript
const useUserStore = create((set) => ({
  user: null,
  currentCohortId: null,
  setUser: (user) => set({ user }),
  setCurrentCohort: (id) => set({ currentCohortId: id }),
}));
```

---

## 决定 #164 · 表单 + 验证:React Hook Form + Zod

**关键理由**:
- 行业标准,RN Reusables 文档默认用这套
- Zod schema 可前后端复用(Supabase Edge Functions 也用 Zod)
- 类型推断好,Claude Code 写得对

---

## 决定 #165 · 数据查询:TanStack Query v5

**关键理由**:
- Supabase 官方推荐组合
- 自动缓存 + 重试 + 后台刷新
- 弱网友好

---

## 决定 #166 · 路由:Expo Router

**关键理由**:
- Expo 默认,文件即路由(类似 Next.js)
- 跟 repo 结构匹配
- Claude Code 写起来直观

---

## 决定 #167 · 日期 + 时区:date-fns + date-fns-tz

**关键理由**:
- TypeScript 一流
- 函数式风格跟其他六件套一致
- date-fns-tz 专门处理 IANA 时区

**典型用法**:
```typescript
// 显示 NYC 班共修
formatInTimeZone(utcDate, cohort.timezone, 'yyyy-MM-dd HH:mm');

// 个人打卡(手机本地)
format(new Date(), 'yyyy-MM-dd');

// 藏历(固定 UTC+8)
formatInTimeZone(utcDate, 'Asia/Shanghai', 'yyyy-MM-dd');

// 算师兄本周第几课
const days = differenceInDays(today, cohort.start_date);
const week = Math.floor((days - restCount * 7) / 7) + 1;
```

---

## 决定 #168 · 图标:Lucide React Native

**关键理由**:
- 1500+ stroke 风格图标
- RN Reusables 默认配对
- 跟觉学风格(细线 clean)匹配,不像 Material 那种圆润感

---

## 决定 #169 · Design tokens 策略:默认起步 + 后期 customize

**策略**:
- **Phase 0 setup**:用 RN Reusables 默认 **Blue 主题**(开箱即用 semantic tokens)
- **后期 customize**:Phase 0 末尾或 Phase 1 中,改 `global.css` 7 个 HSL 值匹配觉学精确色

**关键理由**:
- RN Reusables 默认主题已自带完整 semantic tokens(`primary/secondary/accent/muted/destructive/background/foreground/border` + 暗色模式)
- 不阻塞 setup 节奏 — 30 分钟跑起来,30 分钟改色,各自独立
- 觉学精确 tokens 完整提取在 [`JUEXUE_TOKENS.md`](./JUEXUE_TOKENS.md) 备用

**觉学 tokens 简要预览**(完整见 JUEXUE_TOKENS.md):
- 7 色:primary(蓝)/ purple(紫)/ accent(金)/ success(绿)/ error(红)/ pink(粉)/ ink(墨)
- 7 渐变 token(原型高频使用,需 `expo-linear-gradient`)
- 阴影 2 档 + 3D 凸起按钮 4 变体
- 字体 3-4 族(Noto Serif/Sans SC + Noto Serif Tibetan + 可选 Ma Shan Zheng 书法)

**Customize 时机**:
- v1.0:Phase 0 末尾 30 分钟落地觉学精确色
- 后续随师父审稿调整(5 秒改一个 HSL 值)

---

## ⚠️ 影响的 PRD 章节(待统一更新)

| 文件 | 影响 |
|---|---|
| PRD §2.2 多班并行规则 | 加"班级有 city + timezone" |
| PRD §5.13 殊胜日时区 | 修订(藏历 UTC+8 / 班级 IANA / 个人手机) |
| PRD §10 Phase 0 表 | "GlueStack" → "RN Reusables" |
| PRD §11 Phase 0 执行清单 | 全面重写六件套 |
| PRD §11 验收清单 | 更新组件库检查 |
| schema cohorts 表 | 加 `city` + `timezone` 字段 |
| 所有算法用 `today` 的地方 | 明确时区来源(班级 vs 个人) |

按工作流:**不立刻动 PRD,等下游决定也收敛后一起改**。

---

## 🚫 撤回的旧决定

- PRD §10 表:"Phase 0 = GlueStack + 字体 + tokens"
- PRD §11 步骤 4:"装 GlueStack UI v2 + NativeWind"
- PRD §11 验收:"GlueStack 组件可导入"

替换为对应 RN Reusables 内容。

---

## 📝 下一步

1. ~~**design tokens 落地**~~ — ✅ 已处理(决定 #169 + JUEXUE_TOKENS.md)
2. **写 Phase 0 setup 草稿** — 具体装什么命令、什么顺序、验收清单
3. **应用到 PRD** — 把所有决定更新到主文件(PRD §2.2 / §5.13 / §10 / §11 + schema)
4. **同步到 Notion / GitHub** — 作为项目归档

---

🙏 一切吉祥。
