# 自学「扩展三表」为何 App 不消费 · 分析记录（2026-06-24）

> 对象：`self_study_categories` / `self_study_article_categories` / `self_study_resources`
> 结论来源：本会话对 `supabase/migrations/` 全套 schema 的精读 + 全仓 grep 引用核查。
> 产权背景：共享库（App 与官网/ETL 线共用同一 Supabase，见 CLAUDE.md §6）。

---

## 一句话结论

这 3 张表是**官网公开「大学演讲」频道**的内容增强层（按学科浏览 + 原视频回放）。我们 App 的自学是**纯文字阅读 + 进度打卡**，不做这两件事，因此**当前设计不消费它们**——全仓 App 代码（`.ts/.tsx`）对这 3 张表**零引用**、零外键依赖。

> ⚠️ 措辞要准：是「**当前 App 设计不消费**」，不是「无用」。将来若给 App 加「按学科浏览演讲库」或「自学内看原视频」，它们正是要消费的数据源。

---

## 1 · 我们 App 用的自学模型（5 张表 · 权威结构）

数据来源：本 repo `supabase/migrations/`（这 5 张是 App 域设计、逐字摘录）。

```
self_study_books（册）
  └─ self_study_articles（篇/场）
       └─ self_study_blocks（正文块 · 纯文字）

self_study_records（进度 · 按「篇」打卡）── 挂 user / cohort / book / article
self_study_grants （自学授权）          ── 挂 user（无班师兄凭此读自学）
```

**内容三层**（`20260618000020_course_content.sql`）：

```sql
CREATE TABLE self_study_books (        -- 册（顶层）
  id            uuid PRIMARY KEY,
  book_number   int UNIQUE,
  title         text NOT NULL UNIQUE,
  author        text DEFAULT '索达吉堪布',
  description   text,
  display_order int DEFAULT 0,
  is_active     boolean DEFAULT true,
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE self_study_articles (     -- 篇/场（中层）
  id             uuid PRIMARY KEY,
  book_id        uuid NOT NULL REFERENCES self_study_books(id) ON DELETE CASCADE,
  article_number int  NOT NULL CHECK (article_number > 0),
  title          text NOT NULL,
  display_order  int DEFAULT 0,
  created_at     timestamptz DEFAULT now(),
  UNIQUE (book_id, article_number),
  UNIQUE (book_id, title)
  -- ⚠️ 注意：没有任何 category / 分类字段，也没有 video / 媒体字段
);

CREATE TABLE self_study_blocks (       -- 正文块（内容层 · 纯文字）
  id            uuid PRIMARY KEY,
  article_id    uuid NOT NULL REFERENCES self_study_articles(id) ON DELETE CASCADE,
  block_order   int  NOT NULL CHECK (block_order >= 0),
  block_type    text NOT NULL CHECK (block_type IN ('title','inline_heading','body','verse','footnote')),
  text          text,
  heading_mark  text,
  heading_level int,
  footnote_ref  int,
  text_layer    text CHECK (text_layer IN ('teaching','commentary','variant')),
  quotes        jsonb,
  author        text DEFAULT '索达吉堪布',
  confidence    text CHECK (confidence IN ('high','low')) DEFAULT 'high',
  source_doc    text,
  created_at    timestamptz DEFAULT now()
);
```

**进度 / 授权**（`20260618000050_study_records.sql` / `20260618000010_identity_and_class.sql`）：

```sql
CREATE TABLE self_study_records (      -- 进度（按「篇」打卡）
  id           uuid PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cohort_id    uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  book_id      uuid NOT NULL REFERENCES self_study_books(id) ON DELETE CASCADE,
  article_id   uuid NOT NULL REFERENCES self_study_articles(id) ON DELETE CASCADE,
  status       text DEFAULT 'reading' CHECK (status IN ('not_started','reading','completed','paused')),
  started_at   date,
  completed_at date,
  notes        text,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  UNIQUE (user_id, cohort_id, article_id)
);

CREATE TABLE self_study_grants (       -- 自学授权（无班师兄读自学的凭据）
  id         uuid PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES profiles(id),
  granted_at timestamptz DEFAULT now(),
  reason     text,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES profiles(id)
);
-- 每人最多一条「生效中」授权：UNIQUE(user_id) WHERE revoked_at IS NULL
```

**要点**：我们的自学完整链路 = 读「册→篇→正文块」的**文字**，按「篇」记进度，靠 grant 控访问。**全程没有「分类」维度，也没有「视频/媒体」维度。**

---

## 2 · 存疑的 3 张表（不在我方 schema · 官网/ETL 线对象）

这 3 张**不在本 repo 任何迁移里**——是官网/ETL 线在共享库里建的。下表「作用 / 行数」依据本会话观察（生产库表清单 + 既往比对查询）；**精确列定义本仓没有，标「待核」，需在 sss-dev 查（见 §5）**。

| 表 | 行数 | 作用 | 挂靠 | App 消费？ |
|---|---|---|---|---|
| `self_study_categories` | 11 | 学科分类标签（宗教学 / 教育学 / …），供官网**按学科浏览** | 独立维表 | ❌ 不消费 |
| `self_study_article_categories` | 174 | **篇 ↔ 分类**多对多映射 | 引用 `self_study_articles` + `self_study_categories` | ❌ 不消费 |
| `self_study_resources` | 388 | 每场演讲的 **YouTube / 音频**链接 | 引用 `self_study_articles` | ✅ **将消费**（大学演讲音视频·见 §6） |

**关系示意**：

```
            self_study_books
                  │
                  ▼
   ┌───────  self_study_articles ───────┐   ← 我们也用的「篇」表（共用）
   │              │                     │
   ▼              ▼                     ▼
self_study_   self_study_blocks   ┌─ self_study_article_categories ┄┄→ self_study_categories
resources     (正文块·我们用)      │   (篇↔分类映射·174·App 不碰)        (学科·11·App 不碰)
(媒体·388·                         └─ ………………………………………………………
 ✅ App 将
 消费音视频)
```

> 推断列定义（**待核**，仅供理解，勿据此建表）：
> - `self_study_categories`：`id` / `name`(学科名) / `display_order?`
> - `self_study_article_categories`：`article_id`→articles / `category_id`→categories
> - `self_study_resources`：`article_id`→articles / `url`或`youtube_id` / `type`(video/audio?)

---

## 3 · 为什么 App 用不到（核心理由）

### 理由一：它们撑的两个功能，App 设计里没有

| 这些表 | 撑的功能 | App 有吗？ |
|---|---|---|
| `categories` + `article_categories` | **按学科浏览**演讲（按宗教学/教育学筛选） | ❌ 没有。App 按 **册→篇** 和 **周排程** 导航，从不按学科找 |
| `resources` | **原视频回放**（每场演讲的 YouTube/音频） | ~~❌ 没有~~ → **✅ 计划加**（2026-06-24 PM 决策：大学演讲需音视频，见 §6） |

### 理由二：结构上就「悬空」

- 我们用的 `self_study_articles` 表**没有 category 字段**——分类完全活在那张我们不读的映射表里。
- 我们的任何表**没有外键**指向这 3 张表。
- 视频/媒体链接在 `resources` 表里；~~App 自学无播放入口~~ → **2026-06-24 决策：大学演讲将加音视频，`self_study_resources` 将被消费（见 §6）**。

### 理由三：全仓 grep 实证「零引用」

```
搜 self_study_categories | self_study_article_categories | self_study_resources
→ 命中文件：仅清理脚本 / 比对脚本 / 本类文档 / seed 脚本
→ App 代码（app/**、lib/** 的 .ts/.tsx）：0 处

搜 self_study（我们真正用的）
→ 命中 App 代码：lib/types/database.ts、app/selfstudy.tsx、app/(student)/home.tsx
```

即：**App 代码只引用 books/articles/blocks/records/grants，从不引用这 3 张。**

---

## 4 · 重要边界（诚实补充）

1. **`self_study_resources` 将被消费**（2026-06-24 决策）：大学演讲要加音视频，UI 与课程学修流一致（`lesson/[id].tsx` `MediaArea` 组件复用）。**`self_study_categories` / `self_study_article_categories` 仍不消费**（App 不做按学科浏览）。
2. **产权归官网/ETL 线**：与 `restricted_audio` / `texts` / `v_public_browse` 同类——共享库里官网线的合法内容对象。按 CLAUDE.md §6，自学/讲记内容由官网/ETL 线主管，App 只消费（且目前只消费文字三层）。
3. **误删可自愈**：`scripts/seed-dev-from-prod.sh` 已把这 3 张列为「从生产库 sss 拷贝的内容表」。我此前从 sss-dev 误删，**只要跑一次该 seed 脚本即可从 prod 灌回**（前提 prod 有 → 生产库表清单显示确实有）。**生产库 sss 切勿动这 3 张。**

---

## 5 · 附：精确结构核查查询（在 sss-dev 控制台只读跑，纳入 §2「待核」）

```sql
-- 三张表的列定义 + 外键
SELECT c.table_name, c.column_name, c.data_type, c.is_nullable
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name IN ('self_study_categories',
                       'self_study_article_categories',
                       'self_study_resources')
ORDER BY c.table_name, c.ordinal_position;

-- 它们向外的外键（确认挂在 articles / categories 上）
SELECT conrelid::regclass AS 表, conname, confrelid::regclass AS 指向
FROM pg_constraint
WHERE contype = 'f'
  AND conrelid::regclass::text IN ('self_study_article_categories','self_study_resources');
```

---

## 6 · 大学演讲音视频（2026-06-24 决策 · 进度记录）

**决策**：大学演讲（`self_study_books`）需要音视频，UI 与课程学修流一致（听/看/读，免答题免考 = restricted 模式）。

**关键发现（代码探查）**：
- `app/lesson/[id].tsx` 的 `MediaArea` 组件已有视频/音频切换 + `YouTubeFacade`，且已内置 `?restricted=1` 模式（免答题步，圆满 = 听闻 + 阅读）——大学演讲学修流与此**完全一致**，可复用。
- `YouTubeFacade`（`components/youtube-facade.tsx`）是**占位 facade**：点击后显示"正在加载…"，`react-native-youtube-iframe` 尚未安装。改动局限一个文件，不挡结构设计。
- `package.json` 无任何音视频库（无 `react-native-youtube-iframe`、无 `expo-av/expo-video`）——播放器接入是课程和自学**共享**的后续任务。
- `app/selfstudy.tsx` 当前整屏为占位 mockup（硬编码进度数据），尚未接真实 DB 查询。

**数据状态（sss-dev 2026-06-24 探活）**：
- `self_study_resources`：**不存在**（REST PGRST205）——本 repo 的 2026-06-23 清理脚本误删，生产库 sss 仍有 ~388 行。
- `self_study_books`(50) / `articles`(196) / `blocks`(25063)：存在且数据齐全。
- 精确列定义仍标「**待核**」（删了 + 归官网线，灌回后控制台查）。

**待办（有序）**：

| # | 事项 | 前置 | 归属 |
|---|---|---|---|
| 1 | **PM 从 prod 灌回 `self_study_resources`（含结构+数据+RLS）** | — | PM（你） |
| 2 | **查 `self_study_resources` 精确列**（见 §5 SQL）→ 和官网线对齐字段契约（YouTube / R2 / video/audio 分类方式） | 1完成 | App Claude + 官网线 |
| 3 | **把大学演讲接进 restricted 学修流**：`selfstudy.tsx` 点"继续"→ `/lesson/[id]?restricted=1`，`MediaArea` 读 `self_study_resources`，`FaBen` 读 `self_study_blocks` | 2完成 | App Claude |
| 4 | **安装真播放器**：`react-native-youtube-iframe`（课程和自学共用，改动局限 `youtube-facade.tsx`） | 3稳定后 | App Claude |

> ⚠️ 灌回是 `DROP` 后重建（非 truncate），`seed-dev-from-prod.sh` 的 truncate 语法跑不动——需 `pg_dump --table` 含结构+数据+RLS 按 FK 顺序（categories 先，resources/article_categories 后）。

---

## 来源（事实依据）

- 我方 5 表结构：`supabase/migrations/20260618000020_course_content.sql`(books/articles/blocks)、`20260618000050_study_records.sql`(records)、`20260618000010_identity_and_class.sql`(grants)。
- 零引用实证：全仓 `grep` 三表名（仅命中脚本/文档，App `.ts/.tsx` 0 处）。
- 排程跟课：`20260618000030_scheduling_and_progress.sql`(`program_week_self_study` / `user_self_study_programs`)。
- 产权 / 协作边界：CLAUDE.md §6、§多 Claude 协作边界。
- 误删自愈：`scripts/seed-dev-from-prod.sh`（DEFAULT_TABLES 含这 3 张，注释标「ETL/官网产出内容」）。
- 状态记录：`docs/sss-dev_对齐说明_2026-06-22.md`「收尾④」。
