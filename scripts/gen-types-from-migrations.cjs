// 从 supabase/migrations/*.sql 生成 lib/types/database.ts(无需 Supabase CLI / 库访问)。
// 用法:node scripts/gen-types-from-migrations.cjs
// 解析 CREATE TABLE + ALTER TABLE ADD COLUMN + CREATE VIEW;列类型→TS,含 NOT NULL / 数组 / 行内 CHECK IN 枚举。
// ⚠️ 近似类型(迁移=操作真源·决策175);视图列宽松、无 FK Relationships(嵌套 select 不强类型)。
//    日后有 CLI/库访问时,可用官方 `supabase gen types typescript --project-id <ref>` 覆盖以求精确。
//    改迁移后重跑本脚本即可。
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', 'supabase', 'migrations');
const OUT = path.join(__dirname, '..', 'lib', 'types', 'database.ts');

const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
let sql = files.map((f) => fs.readFileSync(path.join(DIR, f), 'utf8')).join('\n');
sql = sql.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n'); // 去行注释

function tsType(rawType, colExpr) {
  let t = rawType.toLowerCase().replace(/\(.*\)/, '');
  const arr = t.endsWith('[]');
  t = t.replace(/\[\]$/, '');
  let base;
  if (/^(uuid|text|citext|varchar|char|name|inet|bpchar)/.test(t)) base = 'string';
  else if (/^(int|int2|int4|int8|integer|bigint|smallint|serial|bigserial|numeric|decimal|real|double|float|money)/.test(t)) base = 'number';
  else if (/^bool/.test(t)) base = 'boolean';
  else if (/^(timestamp|timestamptz|date|time|timetz|interval)/.test(t)) base = 'string';
  else if (/^(jsonb|json)/.test(t)) base = 'Json';
  else if (/^tsvector/.test(t)) base = 'string';
  else base = 'unknown';
  const m = colExpr.match(/check\s*\(\s*[a-z_]+\s+in\s*\(([^)]+)\)/i);
  if (m && base === 'string') {
    const vals = m[1].match(/'([^']*)'/g);
    if (vals && vals.length) base = vals.join(' | ');
  }
  return arr ? `(${base})[]` : base;
}

function splitCols(body) {
  const parts = [];
  let depth = 0, cur = '', inStr = false;
  for (const ch of body) {
    if (ch === "'") inStr = !inStr;
    if (!inStr && ch === '(') depth++;
    if (!inStr && ch === ')') depth--;
    if (!inStr && ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

const SKIP = /^\s*(primary\s+key|unique|check|constraint|foreign\s+key|exclude|like)\b/i;
const tables = {};

const SCHEMA_PREFIX = '(?:[a-z_][a-z0-9_]*\\.)?'; // 可选 schema 前缀(如 "public."),迁移里 create/alter 常带常不带,两种都要认

const reCreate = new RegExp(`CREATE TABLE (?:IF NOT EXISTS )?${SCHEMA_PREFIX}([a-z_][a-z0-9_]*)\\s*\\(([\\s\\S]*?)\\n\\)\\s*;`, 'gi');
let mt;
while ((mt = reCreate.exec(sql))) {
  const cols = {};
  for (const part of splitCols(mt[2])) {
    const line = part.trim();
    if (!line || SKIP.test(line)) continue;
    const cm = line.match(/^"?([a-z_][a-z0-9_]*)"?\s+([a-z0-9_]+(?:\s*\([^)]*\))?(?:\[\])?)/i);
    if (!cm) continue;
    const notNull = /\bnot\s+null\b/i.test(line) || /\bprimary\s+key\b/i.test(line);
    let ts = tsType(cm[2], line);
    if (!notNull) ts += ' | null';
    cols[cm[1]] = ts;
  }
  tables[mt[1]] = cols;
}

// 一条 ALTER 语句可含多个 ADD COLUMN(逗号分隔)——先截整条语句,再扫全部 ADD COLUMN
// (2026-07-02 修:原来只吃第一个,read_at/default_target_count 曾漏)。
const reAlterStmt = new RegExp(`ALTER TABLE (?:IF EXISTS )?${SCHEMA_PREFIX}([a-z_][a-z0-9_]*)([^;]*);`, 'gi');
const reAddCol = /ADD COLUMN (?:IF NOT EXISTS )?"?([a-z_][a-z0-9_]*)"?\s+([a-z0-9_]+(?:\[\])?)/gi;
let ma;
while ((ma = reAlterStmt.exec(sql))) {
  const [, name, body] = ma;
  if (!tables[name]) continue;
  let mc;
  reAddCol.lastIndex = 0;
  while ((mc = reAddCol.exec(body))) {
    const [, col, type] = mc;
    if (!tables[name][col]) tables[name][col] = tsType(type, '') + ' | null';
  }
}

// ALTER TABLE ... DROP COLUMN(列后来被撤,别让它继续赖在生成结果里)
const reDrop = new RegExp(`ALTER TABLE (?:IF EXISTS )?${SCHEMA_PREFIX}([a-z_][a-z0-9_]*)\\s+DROP COLUMN (?:IF EXISTS )?"?([a-z_][a-z0-9_]*)"?`, 'gi');
let md;
while ((md = reDrop.exec(sql))) {
  const [, name, col] = md;
  if (tables[name]) delete tables[name][col];
}

const views = {};
const reView = new RegExp(`CREATE (?:OR REPLACE )?VIEW ${SCHEMA_PREFIX}([a-z_][a-z0-9_]*)`, 'gi');
let mv;
while ((mv = reView.exec(sql))) views[mv[1]] = true;
const reDropView = new RegExp(`DROP VIEW (?:IF EXISTS )?${SCHEMA_PREFIX}([a-z_][a-z0-9_]*)`, 'gi');
let mdv;
while ((mdv = reDropView.exec(sql))) delete views[mdv[1]];

// ── Functions(消 rpc 类型旁路·审计 2026-07-02):解析 CREATE FUNCTION 签名 → Args/Returns ──
// 近似:标量映射 string/number/boolean,jsonb/record/table/setof/行类型 → Json;DEFAULT → 可选参。
// RETURNS trigger 的内部函数跳过(前端不 rpc 调用)。同名重复定义(OR REPLACE/换签名)后者覆盖。
function tsScalar(t) {
  t = t.toLowerCase().trim().replace(/\(.*\)/, '');
  if (t.endsWith('[]')) return `(${tsScalar(t.slice(0, -2))})[]`;
  if (/^(uuid|text|citext|varchar|char|name|date|timestamptz|timestamp|time|interval|inet)/.test(t)) return 'string';
  if (/^(int|int2|int4|int8|integer|bigint|smallint|numeric|decimal|real|double|float)/.test(t)) return 'number';
  if (/^bool/.test(t)) return 'boolean';
  if (/^(jsonb|json)/.test(t)) return 'Json';
  return 'Json';
}
const fns = {};
// 返回类型只捕获紧跟 RETURNS 的那一个词(或 "setof 词"),不含后面的 LANGUAGE/SECURITY/STABLE
// 等修饰关键字——旧版 [a-z0-9_ ]* 连着空格一起捕获,会把这些关键字也吞进 ret,导致下面
// `ret === 'trigger'` 精确比较必然为假(2026-07-13发现:trigger 函数从未被真正跳过,
// profiles_protect_status/vows_protect_status 等一直被误当可调用 RPC 生成进类型文件)。
const reFn = new RegExp(`CREATE (?:OR REPLACE )?FUNCTION ${SCHEMA_PREFIX}([a-z_][a-z0-9_]*)\\s*\\(([\\s\\S]*?)\\)\\s*RETURNS\\s+(setof\\s+[a-z_][a-z0-9_]*|[a-z_][a-z0-9_]*)`, 'gi');
const reDropFn = new RegExp(`DROP FUNCTION (?:IF EXISTS )?${SCHEMA_PREFIX}([a-z_][a-z0-9_]*)`, 'gi');
// CREATE/DROP 按源文件里的实际出现顺序统一应用,不是"所有CREATE先处理完、再处理所有DROP"
// 分两轮跑(2026-07-13发现:改函数参数列表的标准写法——同一条迁移里先DROP旧签名再CREATE
// 新签名——在旧的两轮分开跑法下,DROP永远后处理、把刚落地的新CREATE又删掉,函数从生成的
// 类型文件里彻底消失;record_study 补 p_client_token 参数时炸出这个)。
const fnEvents = [];
let mf;
while ((mf = reFn.exec(sql))) fnEvents.push({ index: mf.index, type: 'create', match: mf });
while ((mf = reDropFn.exec(sql))) fnEvents.push({ index: mf.index, type: 'drop', match: mf });
fnEvents.sort((a, b) => a.index - b.index);
for (const ev of fnEvents) {
  if (ev.type === 'drop') { delete fns[ev.match[1]]; continue; }
  const [, name, paramsRaw, retRaw] = ev.match;
  const ret = retRaw.trim().toLowerCase();
  if (ret === 'trigger') continue;
  const args = {};
  for (const part of splitCols(paramsRaw)) {
    const p = part.trim();
    if (!p) continue;
    const pm = p.match(/^(?:in\s+|out\s+|inout\s+)?"?([a-z_][a-z0-9_]*)"?\s+([a-z0-9_]+(?:\s*\([^)]*\))?(?:\[\])?)/i);
    if (!pm) continue;
    const optional = /\bdefault\b/i.test(p);
    args[pm[1]] = { type: tsScalar(pm[2]), optional };
  }
  const retTs = /^(setof|table|record)\b/.test(ret) ? 'Json' : tsScalar(ret) === 'unknown' ? 'Json' : tsScalar(ret);
  fns[name] = { args, ret: retTs };
}

// ── 外部所有表(官网/ETL 线,结构真源不在本仓迁移;scripts/external-tables.cjs 登记)──
const external = require('./external-tables.cjs');
for (const [name, cols] of Object.entries(external)) {
  if (!tables[name]) tables[name] = { ...cols };
}

const emitCols = (cols, opt) => Object.entries(cols).map(([k, v]) => `          ${k}${opt ? '?' : ''}: ${v};`).join('\n');
const emitTable = (name, cols) => `      ${name}: {
        Row: {
${emitCols(cols, false)}
        };
        Insert: {
${emitCols(cols, true)}
        };
        Update: {
${emitCols(cols, true)}
        };
        Relationships: [];
      };`;

const tableBlocks = Object.entries(tables).sort().map(([n, c]) => emitTable(n, c)).join('\n');
const viewBlocks = Object.keys(views).sort().map((v) => `      ${v}: {
        Row: { [key: string]: Json | string | number | boolean | null };
        Relationships: [];
      };`).join('\n');
const fnBlocks = Object.entries(fns).sort().map(([n, f]) => {
  // 参数一律加 | null(2026-07-15 生成器补漏,三易审计发现):Postgres 函数参数本来就能传
  // NULL,不需要 DEFAULT 才行——DEFAULT 只影响"能不能不传这个参数"(optional?),跟"这个
  // 参数能不能是 null"是两件独立的事,此前误把两者绑在一起,导致没写 DEFAULT 的必填参数
  // 被生成成不接受 null,实际调用方传 null 是完全合法的 SQL,却在编译期被 TS 挡下来。
  const args = Object.entries(f.args).map(([k, a]) => `          ${k}${a.optional ? '?' : ''}: ${a.type} | null;`).join('\n');
  return `      ${n}: {
        Args: {
${args || '          [key: string]: never;'}
        };
        Returns: ${f.ret};
      };`;
}).join('\n');

const content = `// ⚠️ 自动生成 —— 由 scripts/gen-types-from-migrations.cjs 从 supabase/migrations/*.sql 解析(决策175)。
// 近似类型:覆盖全部表的列名 + 大致 TS 类型(含 NOT NULL / 数组 / 行内 CHECK 枚举);视图列宽松。
// 有库访问时可用官方 \`supabase gen types typescript --project-id ubyzyadlzmtgxvbxanbr\` 覆盖以求精确。
// 勿手改本文件——改迁移后重跑生成器。
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
${tableBlocks}
    };
    Views: {
${viewBlocks}
    };
    Functions: {
${fnBlocks}
    };
    Enums: { [key: string]: never };
    CompositeTypes: { [key: string]: never };
  };
};
`;

fs.writeFileSync(OUT, content);
console.log('tables:', Object.keys(tables).length, '| views:', Object.keys(views).length, '| functions:', Object.keys(fns).length, '→', path.relative(process.cwd(), OUT));
