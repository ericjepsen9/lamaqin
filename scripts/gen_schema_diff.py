#!/usr/bin/env python3
# 生成 sss-dev ↔ 分支设计 的「双向比对」诊断 SQL。
# 设计 = 我们实际应用到 sss-dev 的 27 个迁移（排除 4 个 search 迁移，与脚本A口径一致）
#        + 脚本B 的 lesson_blocks.ts。
# v2 修复：按【源码顺序】处理 CREATE/DROP/ALTER（修正同文件内 DROP-then-CREATE 被误判，
#          如 tibetan_calendar_final 先 DROP 再 CREATE tibetan_calendar/buddhist_days）。
# 输出：一段 SQL，PM 在 sss-dev 控制台跑，只返回「差异」（多余/缺失），结果很短。
import re, os, glob

MIGDIR = "/home/user/sss-app/supabase/migrations"
OUT = "/tmp/claude-0/-home-user-sss-app/e0298ae3-b5b5-54c1-becb-79f8b845afe9/scratchpad/sss-dev_一致性比对.sql"

SEARCH = ("search_chunks_phase1", "search_semantic_fix",
          "search_log_intent_capture", "search_log_top_distance")
files = sorted(glob.glob(os.path.join(MIGDIR, "*.sql")))
applied = [f for f in files if not any(s in f for s in SEARCH)]

def strip_line_comments(sql):
    return re.sub(r'--[^\n]*', ' ', sql)

def parse_columns(body):
    items, cur, depth, in_str = [], [], 0, False
    for ch in body:
        if in_str:
            if ch == "'": in_str = False
            cur.append(ch)
        elif ch == "'":
            in_str = True; cur.append(ch)
        elif ch in '([': depth += 1; cur.append(ch)
        elif ch in ')]': depth -= 1; cur.append(ch)
        elif ch == ',' and depth == 0:
            items.append(''.join(cur).strip()); cur = []
        else: cur.append(ch)
    if cur: items.append(''.join(cur).strip())
    cols = []
    for item in items:
        item = re.sub(r'\s+', ' ', item).strip()
        if not item: continue
        w = item.split()
        if not w: continue
        if w[0].upper() in ('PRIMARY','UNIQUE','FOREIGN','CHECK','CONSTRAINT'): continue
        cols.append(w[0])
    return cols

def extract_cols_at(sql_nc, open_pos):
    depth, pos = 0, open_pos
    while pos < len(sql_nc):
        c = sql_nc[pos]
        if c == '(': depth += 1
        elif c == ')':
            depth -= 1
            if depth == 0: break
        pos += 1
    return parse_columns(sql_nc[open_pos + 1:pos])

tables = {}   # name -> set(cols)
views = set()

for f in applied:
    txt = strip_line_comments(open(f, encoding="utf-8").read())
    events = []   # (pos, payload)
    for m in re.finditer(r'\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?(\w+)\s*\(', txt, re.I):
        events.append((m.start(), ('ct', m.group(1), extract_cols_at(txt, m.end() - 1))))
    for m in re.finditer(r'\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?(\w+)', txt, re.I):
        events.append((m.start(), ('dt', m.group(1))))
    for m in re.finditer(r'\bALTER\s+TABLE\s+(?:public\.)?(\w+)(.*?);', txt, re.I | re.S):
        events.append((m.start(), ('alt', m.group(1), m.group(2))))
    for m in re.finditer(r'\bCREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(?:public\.)?(\w+)', txt, re.I):
        events.append((m.start(), ('cv', m.group(1))))
    for m in re.finditer(r'\bDROP\s+VIEW\s+(?:IF\s+EXISTS\s+)?(?:public\.)?(\w+)', txt, re.I):
        events.append((m.start(), ('dv', m.group(1))))
    events.sort(key=lambda e: e[0])   # 源码顺序回放
    for _, ev in events:
        k = ev[0]
        if k == 'ct':
            tables.setdefault(ev[1], set()).update(ev[2])
        elif k == 'dt':
            tables.pop(ev[1], None)
        elif k == 'alt':
            t, body = ev[1], ev[2]
            for cm in re.finditer(r'\bADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)', body, re.I):
                tables.setdefault(t, set()).add(cm.group(1))
            for cm in re.finditer(r'\bDROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?(\w+)', body, re.I):
                if t in tables: tables[t].discard(cm.group(1))
        elif k == 'cv':
            views.add(ev[1])
        elif k == 'dv':
            views.discard(ev[1])

# lesson_blocks.ts 由脚本B加（dharma_qa 的 ts_block 我移到了B，PM 已跑B）→ 计入设计
tables.setdefault('lesson_blocks', set()).add('ts')

tbl_names = sorted(tables.keys())
col_pairs = sorted((t, c) for t, cs in tables.items() for c in cs)

def vals(rows):
    return ",\n  ".join(rows)

tbl_vals = vals(f"('{t}')" for t in tbl_names)
view_vals = vals(f"('{v}')" for v in sorted(views)) if views else "(NULL)"
col_vals = vals(f"('{t}','{c}')" for t, c in col_pairs)

sql = f"""-- ═══════════════════════════════════════════════════════════════════
-- sss-dev ↔ 分支设计 一致性比对 · 2026-06-23 · by Claude（v2 修正源码顺序）
-- 设计口径 = 实际应用到 sss-dev 的 27 迁移（排除4个search迁移，与脚本A一致）+ 脚本B的 lesson_blocks.ts。
-- 用法：Supabase 控制台 SQL Editor → 粘贴 → Run。只返回「差异行」，没差异就返回 0 行（=完全一致）。
-- 看结果：
--   '① 多余表'  = sss-dev 有、设计没有  → 当年手搭/遗留，逐个定去留
--   '② 缺失表'  = 设计有、sss-dev 没有  → 理论上应为空（脚本A该建全了）
--   '③ 多余视图'/'④ 缺失视图' 同理
--   '⑤ 多余列'  = sss-dev 某表多出设计没有的列（仅在双方都有的表上比）
--   '⑥ 缺失列'  = 设计某列 sss-dev 没建（应为空）
-- 注：auth/storage/cron 等系统 schema 不在比对范围；仅比 public。
-- ═══════════════════════════════════════════════════════════════════
WITH expected_tables(t) AS (VALUES
  {tbl_vals}
),
expected_views(v) AS (VALUES
  {view_vals}
),
expected_cols(t,c) AS (VALUES
  {col_vals}
),
sss_tables AS (
  SELECT table_name FROM information_schema.tables
  WHERE table_schema='public' AND table_type='BASE TABLE'
),
sss_views AS (
  SELECT table_name FROM information_schema.views WHERE table_schema='public'
),
sss_cols AS (
  SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public'
)
SELECT '① 多余表(sss-dev有/设计无)' AS 类别, s.table_name AS 对象
  FROM sss_tables s LEFT JOIN expected_tables e ON e.t=s.table_name
  WHERE e.t IS NULL
UNION ALL
SELECT '② 缺失表(设计有/sss-dev无)', e.t
  FROM expected_tables e LEFT JOIN sss_tables s ON s.table_name=e.t
  WHERE s.table_name IS NULL
UNION ALL
SELECT '③ 多余视图', s.table_name
  FROM sss_views s LEFT JOIN expected_views e ON e.v=s.table_name
  WHERE e.v IS NULL
UNION ALL
SELECT '④ 缺失视图', e.v
  FROM expected_views e LEFT JOIN sss_views s ON s.table_name=e.v
  WHERE e.v IS NOT NULL AND s.table_name IS NULL
UNION ALL
SELECT '⑤ 多余列(双方都有的表上)', s.table_name||'.'||s.column_name
  FROM sss_cols s
  JOIN expected_tables et ON et.t=s.table_name          -- 只在"设计也有的表"上比列，避免被①的多余表刷屏
  LEFT JOIN expected_cols e ON e.t=s.table_name AND e.c=s.column_name
  WHERE e.t IS NULL
UNION ALL
SELECT '⑥ 缺失列', e.t||'.'||e.c
  FROM expected_cols e
  JOIN sss_tables st ON st.table_name=e.t
  LEFT JOIN sss_cols s ON s.table_name=e.t AND s.column_name=e.c
  WHERE s.table_name IS NULL
ORDER BY 1,2;
"""

open(OUT, "w", encoding="utf-8").write(sql)
print("OUT:", OUT)
print("纳入迁移数:", len(applied))
print("设计表数:", len(tbl_names))
print("buddhist_days 在设计内:", 'buddhist_days' in tables)
print("tibetan_calendar 在设计内:", 'tibetan_calendar' in tables)
print("tibetan_days 在设计内:", 'tibetan_days' in tables)
print("设计视图数:", len(views), sorted(views))
print("设计列(表,列)对数:", len(col_pairs))
