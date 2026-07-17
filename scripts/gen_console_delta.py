#!/usr/bin/env python3
# 生成 sss-dev 控制台增量脚本（幂等）：把 27 个 App 迁移机械改写成可重复粘贴运行。
# v2：增加「补列块」—— 在每张 CREATE TABLE IF NOT EXISTS 后立即注入
#     ALTER TABLE ... ADD COLUMN IF NOT EXISTS，确保手建表缺的新列在索引建立前已加上。
import re, os, glob

MIGDIR = "/home/user/sss-app/supabase/migrations"
OUT_A = "/tmp/claude-0/-home-user-sss-app/e0298ae3-b5b5-54c1-becb-79f8b845afe9/scratchpad/sss-dev_控制台增量_A_主体.sql"
OUT_B = "/tmp/claude-0/-home-user-sss-app/e0298ae3-b5b5-54c1-becb-79f8b845afe9/scratchpad/sss-dev_控制台增量_B_全文检索列.sql"

SEARCH = ("search_chunks_phase1", "search_semantic_fix",
          "search_log_intent_capture", "search_log_top_distance")
files = sorted(glob.glob(os.path.join(MIGDIR, "*.sql")))
files = [f for f in files if not any(s in f for s in SEARCH)]

POL = re.compile(r'^(\s*)CREATE POLICY\s+("(?:[^"]+)"|[A-Za-z0-9_]+)\s+ON\s+([A-Za-z0-9_."]+)')

def xform_line(ln):
    if ln.lstrip().startswith("--"):
        return ln
    # DROP TABLE → 控制台增量「只加不删」：一律注释掉。
    #   sss-dev 的表可能已有数据 + 依赖视图（如 tibetan_calendar←v_dharma_assembly_dates）；
    #   drop 会丢数据 / 撞依赖报错。结构对齐改靠 CREATE TABLE IF NOT EXISTS + 补列。
    if re.match(r'^\s*DROP\s+TABLE\b', ln, re.I):
        return '-- [控制台增量·只加不删，已注释] ' + ln.strip()
    # CREATE TABLE → IF NOT EXISTS
    ln = re.sub(r'^(\s*)CREATE TABLE (?!IF NOT EXISTS)', r'\1CREATE TABLE IF NOT EXISTS ', ln)
    # CREATE [UNIQUE] INDEX → IF NOT EXISTS
    ln = re.sub(r'^(\s*)CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)', r'\1CREATE \2INDEX IF NOT EXISTS ', ln)
    # CREATE VIEW → OR REPLACE
    ln = re.sub(r'^(\s*)CREATE VIEW ', r'\1CREATE OR REPLACE VIEW ', ln)
    # CREATE TRIGGER → OR REPLACE
    ln = re.sub(r'^(\s*)CREATE TRIGGER ', r'\1CREATE OR REPLACE TRIGGER ', ln)
    # ADD COLUMN → IF NOT EXISTS (inline 或独立行)
    ln = re.sub(r'\bADD COLUMN\b(?!\s+IF NOT EXISTS)', 'ADD COLUMN IF NOT EXISTS', ln)
    return ln

# ══ 补列辅助（v2 新增）════════════════════════════════════════════════════════

def _strip_line_comments(sql):
    """Remove -- ... end-of-line comments (preserve newlines)."""
    return re.sub(r'--[^\n]*', ' ', sql)

def parse_create_tables(sql):
    """Return {tname: [(col_name, clean_col_def)]} for every CREATE TABLE block in sql."""
    sql_nc = _strip_line_comments(sql)
    tbl_pat = re.compile(
        r'\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?(\w+)\s*\(',
        re.I
    )
    results = {}
    for m in tbl_pat.finditer(sql_nc):
        tname = m.group(1)
        # depth-count from the opening ( to find the table body
        start = m.end() - 1  # position of the opening (
        depth, pos = 0, start
        while pos < len(sql_nc):
            c = sql_nc[pos]
            if c == '(':
                depth += 1
            elif c == ')':
                depth -= 1
                if depth == 0:
                    break
            pos += 1
        body = sql_nc[start + 1:pos]
        results[tname] = _parse_columns(body)
    return results

def _parse_columns(body):
    """Split body at depth-0 commas; return [(col_name, clean_def)] for column items only."""
    items, cur, depth, in_str = [], [], 0, False
    for ch in body:
        if in_str:
            if ch == "'":
                in_str = False
            cur.append(ch)
        elif ch == "'":
            in_str = True
            cur.append(ch)
        elif ch in '([':
            depth += 1
            cur.append(ch)
        elif ch in ')]':
            depth -= 1
            cur.append(ch)
        elif ch == ',' and depth == 0:
            items.append(''.join(cur).strip())
            cur = []
        else:
            cur.append(ch)
    if cur:
        items.append(''.join(cur).strip())

    cols = []
    for item in items:
        item = re.sub(r'\s+', ' ', item).strip()
        if not item:
            continue
        words = item.split()
        if not words:
            continue
        # Skip table-level constraints (PRIMARY KEY (...), UNIQUE (...), etc.)
        if words[0].upper() in ('PRIMARY', 'UNIQUE', 'FOREIGN', 'CHECK', 'CONSTRAINT'):
            continue
        cols.append((words[0], item))
    return cols

def inject_col_patches(body, tname, cols):
    """Insert ADD COLUMN IF NOT EXISTS patches right after CREATE TABLE IF NOT EXISTS tname (...); in body."""
    if not cols:
        return body
    pat = re.compile(
        r'\bCREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(?:public\.)?'
        + re.escape(tname) + r'\s*\(',
        re.I
    )
    m = pat.search(body)
    if not m:
        return body
    # depth-count from the opening ( to find the closing )
    start = m.end() - 1  # position of (
    depth, pos = 0, start
    while pos < len(body):
        c = body[pos]
        if c == '(':
            depth += 1
        elif c == ')':
            depth -= 1
            if depth == 0:
                break
        pos += 1
    # find ; after the closing )
    semi = body.find(';', pos)
    if semi == -1:
        return body
    insert_at = semi + 1

    patch_lines = [
        f'\n-- ┌─ 补列 {tname}（手建表缺列时补；已有列 IF NOT EXISTS 自动跳过）─┐'
    ]
    for _, col_def in cols:
        patch_lines.append(f'ALTER TABLE {tname} ADD COLUMN IF NOT EXISTS {col_def};')
    patch_lines.append(f'-- └─ 补列结束 {tname} ─┘')
    patch_sql = '\n'.join(patch_lines)
    return body[:insert_at] + patch_sql + '\n' + body[insert_at:]

# ══ 主处理 ═══════════════════════════════════════════════════════════════════

# 预扫：收集所有「后续被 DROP COLUMN 删掉的列」(table, col)，
# 这些列不补——否则会把 PM 故意删掉的列（如 buddhist_days.multiplier）又加回来。
DROPCOL = re.compile(
    r'\bALTER\s+TABLE\s+(?:public\.)?(\w+)\s+DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?(\w+)', re.I
)
dropped_cols = set()
for f in files:
    txt_nc = _strip_line_comments(open(f, encoding="utf-8").read())
    for m in DROPCOL.finditer(txt_nc):
        dropped_cols.add((m.group(1).lower(), m.group(2).lower()))

ts_block = ""
sections = []
pol_creates = 0
pol_drops = 0

for f in files:
    name = os.path.basename(f)
    txt = open(f, encoding="utf-8").read()

    # 解析 CREATE TABLE 列定义（在文件级改写之前，拿原始列定义）
    table_cols = parse_create_tables(txt)

    # ── 文件级剔除 ──
    # R3: auth.users 上的触发器（控制台无权建）
    if "identity_and_class" in name:
        txt = re.sub(r'CREATE TRIGGER on_auth_user_created.*?;',
                     '-- [控制台增量剔除] on_auth_user_created 触发器建在 auth.users 上,'
                     '需 auth 属主权限;由 Supabase Auth Hook 或有权者单独建。',
                     txt, flags=re.S)
    # R2: tibetan/buddhist 大种子（无 ON CONFLICT，且你有 JSON 单独灌）
    if "tibetan_calendar_final" in name:
        txt = re.sub(r'INSERT INTO public\.tibetan_calendar\b.*?;',
                     '-- [控制台增量剔除] tibetan_calendar 种子(366行,无 ON CONFLICT)。用你的 JSON 单独灌。',
                     txt, flags=re.S)
        txt = re.sub(r'INSERT INTO public\.buddhist_days\b.*?;',
                     '-- [控制台增量剔除] buddhist_days 种子(无 ON CONFLICT)。用你的 JSON 单独灌。',
                     txt, flags=re.S)
    # R1: dharma_qa 的 lesson_blocks.ts 重列（14万行，慢）→ 移到脚本 B
    if "dharma_qa" in name:
        m = re.search(r'(ALTER TABLE lesson_blocks\s+ADD COLUMN ts tsvector.*?STORED;\s*\n'
                      r'CREATE INDEX idx_lesson_blocks_ts[^\n]*;)', txt, flags=re.S)
        if m:
            ts_block = m.group(1)
            txt = txt.replace(m.group(1),
                  '-- [控制台增量·移到脚本B] lesson_blocks 全文检索列 ts(14万行,单独慢跑)')

    # ── 行级幂等改写 + 策略 DROP 注入 ──
    out = []
    for ln in txt.split("\n"):
        mp = POL.match(ln)
        if mp and not ln.lstrip().startswith("--"):
            indent, polname, tbl = mp.group(1), mp.group(2), mp.group(3)
            out.append(f"{indent}DROP POLICY IF EXISTS {polname} ON {tbl};")
            pol_drops += 1
            pol_creates += 1
        out.append(xform_line(ln))
    body = "\n".join(out)

    # T7: program_week_practices ADD CONSTRAINT 幂等（先 DROP CONSTRAINT IF EXISTS）
    if "practice" in name and "ADD CONSTRAINT program_week_practices_practice_fkey" in body:
        body = body.replace(
            "ALTER TABLE program_week_practices\n  ADD CONSTRAINT program_week_practices_practice_fkey",
            "ALTER TABLE program_week_practices\n"
            "  DROP CONSTRAINT IF EXISTS program_week_practices_practice_fkey,\n"
            "  DROP CONSTRAINT IF EXISTS program_week_practices_content_fkey;\n"
            "ALTER TABLE program_week_practices\n  ADD CONSTRAINT program_week_practices_practice_fkey")

    # ── 注释掉引用「不补列」的 COMMENT ON COLUMN（v4）──
    #   被 DROP COLUMN 删掉的列（如 buddhist_days.multiplier）我们不补；
    #   但其 COMMENT ON COLUMN 仍引用它 → 列不存在会报错。逐条注释掉（CREATE TABLE 内的列定义不动）。
    for dt, dc in dropped_cols:
        body = re.sub(
            r'(?im)^[ \t]*COMMENT[ \t]+ON[ \t]+COLUMN[ \t]+(?:public\.)?'
            + re.escape(dt) + r'\.' + re.escape(dc) + r'\b[^\n]*$',
            lambda m: '-- [控制台增量·该列不补，已注释] ' + m.group(0).strip(),
            body
        )

    # ── 注入补列块（v2 新增）；排除后续被 DROP COLUMN 删掉的列（v3）──
    for tname, cols in table_cols.items():
        cols_f = [(cn, cd) for (cn, cd) in cols
                  if (tname.lower(), cn.lower()) not in dropped_cols]
        body = inject_col_patches(body, tname, cols_f)

    sections.append(f"\n-- ╔══════════════ {name} ══════════════╗\n{body}")

header_A = """-- ═══════════════════════════════════════════════════════════════════
-- sss-dev 控制台增量脚本 A（主体）· 2026-06-23 · by Claude（v4）
-- 用法：Supabase Dashboard(sss-dev) → SQL Editor → 新建 query → 全部粘贴 → Run。
-- 安全：① 幂等——可重复跑；② 手建表缺的新列（member_role / accessibility_needs 等）
--        在建索引前自动补（ADD COLUMN IF NOT EXISTS）；
--        ③ 只「加」不删：所有 DROP TABLE 已注释（你的表/数据/依赖视图不动）；
--           PM 已删的列（buddhist_days.multiplier）不会被加回；
--        ④ 已剔除：auth 触发器、藏历大种子、全文检索重列（见脚本B）。
-- 跑完：再跑脚本 B（全文检索列，14万行较慢，单独跑）。
--       藏历数据用你的 JSON 单独灌入 tibetan_calendar/buddhist_days。
-- 若中途报错：把报错那一行 + 上面最近的「╔══ 文件名 ══╗」贴回给 Claude。
-- ═══════════════════════════════════════════════════════════════════
SET statement_timeout = '120s';
"""

open(OUT_A, "w", encoding="utf-8").write(header_A + "\n".join(sections) + "\n")

header_B = """-- ═══════════════════════════════════════════════════════════════════
-- sss-dev 控制台增量脚本 B · lesson_blocks 全文检索列（决策108/109 法义问答）
-- 单独跑：这步要对 ~14 万行 lesson_blocks 算 tsvector + 建 GIN 索引，较慢（可能几十秒~几分钟）。
-- 幂等：列/索引已存在则跳过。若 SQL Editor 报超时，把下面两句拆开分别再跑一次即可。
-- 不急用法义问答可暂时不跑，不影响其他功能。
-- ═══════════════════════════════════════════════════════════════════
SET statement_timeout = '900s';

ALTER TABLE lesson_blocks
  ADD COLUMN IF NOT EXISTS ts tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce(text, ''))) STORED;
CREATE INDEX IF NOT EXISTS idx_lesson_blocks_ts ON lesson_blocks USING gin(ts);
"""
open(OUT_B, "w", encoding="utf-8").write(header_B)

print(f"脚本A: {OUT_A}")
print(f"脚本B: {OUT_B}")
print(f"纳入文件数: {len(files)}")
print(f"策略 CREATE/DROP 注入: {pol_creates}/{pol_drops}")
print(f"ts 块已捕获: {'是' if ts_block else '否!!'}")
