# scripts/ — 开发库数据维护

## seed-dev-from-prod.sh — 用生产库内容刷新 sss-dev

把 PROD(`sss`)里的内容数据**只读拷贝**进开发库 `sss-dev`,任何人(PM / Eric)都能重复跑来刷新 dev 数据。

**只迁内容(规则 2026-06-20)**:本脚本只拷 **内容数据**(ETL/官网 产出 + 参考数据),**不碰 App 自管表**。

**迁(内容,FK 依赖顺序)**:
- 讲记:`courses` · `course_lessons` · `lesson_resources` · `lesson_blocks`
- 思考题:`questions`(ETL 抽取)
- 演讲/开示:`self_study_categories` · `self_study_books` · `self_study_articles` · `self_study_article_categories` · `self_study_blocks` · `self_study_resources`
- 藏历/殊胜日:`tibetan_calendar` · `buddhist_days`

**不迁(App 自管)**:修持(`practices`…)、院系/班级/排课(`programs`/`cohorts`/`program_week_*`…)、活动(`events`)、提醒(`reminder_presets`)、以及所有用户数据(`profiles`/`study_records`/`practice_logs`…)。这些由 **App 线掌控**;测试数据从 **tracker** 另行导入。
> `question_references` 也不迁:它外键指向 `profiles`(用户数据),不属纯内容。

### 安全模型(为什么不会写坏生产库)
- **PROD 只读**:脚本只对生产库跑 `pg_dump`(纯 SELECT/COPY TO),并且**强制要求**你给的生产库连接是只读角色 —— 启动时检查 `transaction_read_only=on`,不是就直接 ABORT。
- **目标必须是 dev**:脚本核对目标连接串的 project ref;若指向生产库 ref(`zsqhyrfvgxlooxzpzyjb`)直接 ABORT,绝不往 prod 写。
- **凭证不进仓库**:两个连接串只从环境变量读,脚本里**没有任何密码**。

### 一次性准备

**1. 装工具**(psql / pg_dump):
```bash
brew install libpq && brew link --force libpq   # macOS
```

**2. 在生产库建一个只读角色**(prod 的 SQL editor 跑一次):
```sql
create role sss_ro with login password 'CHOOSE_A_STRONG_PW';
grant connect on database postgres to sss_ro;
grant usage  on schema public to sss_ro;
-- 只授权要拷的内容表(不含 profiles 等用户数据):
grant select on
  public.tibetan_calendar, public.buddhist_days,
  public.courses, public.course_lessons, public.lesson_resources, public.lesson_blocks,
  public.questions,
  public.self_study_categories, public.self_study_books, public.self_study_articles,
  public.self_study_article_categories, public.self_study_blocks, public.self_study_resources
to sss_ro;
alter role sss_ro set default_transaction_read_only = on;   -- 脚本靠这个判定只读;写操作一律被拒
alter role sss_ro bypassrls;                                -- 讲记表是"登录会员才可读"的 RLS,直连角色须 bypassrls 才能 dump
```
> `bypassrls` 只影响**读取时的行可见性**,给不了任何写权限;表级 GRANT 仍生效——本角色**只能读上面列出的内容表**(读不到 profiles/用户数据)、**写不了任何东西**。
> 生产库的 `postgres` 超级用户串**不要**给出去。要拷别的表,把它加进上面的 GRANT 列表即可。

**3. 设两个连接串(环境变量,别写进 `.env`)**:
```bash
export SSS_PROD_RO_URL='postgresql://sss_ro.zsqhyrfvgxlooxzpzyjb:PW@aws-…pooler.supabase.com:5432/postgres'
export SSS_DEV_URL='postgresql://postgres.ubyzyadlzmtgxvbxanbr:PW@aws-1-us-east-2.pooler.supabase.com:5432/postgres'
```
> 必须用 **Session pooler(5432)** 的串——pg_dump 不支持 transaction pooler(6543)。

### 运行
```bash
bash scripts/seed-dev-from-prod.sh
```
跑完会打印 sss-dev 各表行数。可重复跑(每次先清空再重灌)。

### 调整范围
- 改表集合:`TABLES="tibetan_calendar buddhist_days" bash scripts/seed-dev-from-prod.sh`(保持父表在前)。
- ⚠️ 默认 `courses/course_lessons/lesson_blocks` 是**整表全量**(全部 42 部课程、8 万+ 讲记块)。只想要 `前行广释` 某几讲的轻量切片,需要按 lesson_id 过滤的定制查询——找 App Claude 加一个 `--scope` 变体即可。

### 给 Eric 用
1. `git pull`(脚本已在仓库里)。
2. `brew install libpq`。
3. 从安全渠道拿到上面两个连接串(只读 prod 串 + dev 串;**别走明文/git**,用密码管理器或各自在 Supabase 后台生成)。
4. `export` 两个变量 → `bash scripts/seed-dev-from-prod.sh`。

> ⚠️ 此脚本会**清空并重灌**所列内容表(CASCADE)。它是给"刷新 dev 内容"用的——别拿它指向有你手工造、想保留的测试数据的库。

---

## 外部所有表清单(官网/ETL 线所有 · 审计 2026-07-02 收口)

以下表**在生产/开发库里存在、App 代码可能消费,但结构真源不在本仓迁移**(由官网/讲记 ETL 子项目建与维护,CLAUDE.md §6):

| 表 | App 消费 | 说明 |
|---|---|---|
| `self_study_resources` | ✅(大学演讲媒体区) | 每篇演讲的视频/音频链接 |
| `self_study_categories` | ❌ | 11 学科分类(官网频道用) |
| `self_study_article_categories` | ❌ | 文章↔分类多对多 |

规矩:
1. **任何清理脚本不得 DROP 这三张表**(2026-06-23 的清理脚本曾把 `self_study_resources` 当"非设计对象"误删——教训);
2. 改这三张表的结构先与官网线对齐,勿在本仓出迁移;
3. TS 类型由 `scripts/external-tables.cjs` 登记、生成器并入 `database.ts`(App 实测列,官网线加列后同步这里);
4. `check_schema_parity.py` 含 `self_study_resources` 在场检查(缺了=又被误删,报警)。
