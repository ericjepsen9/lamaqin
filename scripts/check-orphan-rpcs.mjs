#!/usr/bin/env node
// ============================================================
// 孤儿 RPC 检测（三易·易维护护栏）——防"写了没接入"这类反复出现的病。
//   两次实例：care.ts 从未调 get_care_dims（d0c0c58 修）、get_cohort_today_active 建了没接。
//
// 判定：一个函数若【被 GRANT EXECUTE 给 authenticated/public】(=意在给 App 调)，
//   却【App 里没有任何 rpc('name') 调用】且【其它 SQL 里也没被内部引用】(RLS/触发器/别的函数/视图)，
//   即为孤儿——要么接入 UI，要么在下方 WHITELIST 里登记"有意暂不接"的理由。
// 内部使用的 helper（is_class_admin / get_vow_status 等）因被 SQL 内部引用，天然不报。
//
// 用法：node scripts/check-orphan-rpcs.mjs   （CI 硬门禁：发现未登记孤儿 → 退出 1）
// ============================================================
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const MIG = join(ROOT, 'supabase', 'migrations');
const APP_DIRS = ['lib', 'app', 'components'].map((d) => join(ROOT, d));

// 已知"有意暂不接"的孤儿：登记 name → 理由。新孤儿不在此列 → CI 失败。
// get_cohort_today_active 已于 2026-07-11 接入 lib/queries/classes.ts(useCohortTodayActive)，移出白名单。
const WHITELIST = {};

function walk(dir, exts, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) { if (e !== 'node_modules') walk(p, exts, out); }
    else if (exts.some((x) => e.endsWith(x))) out.push(p);
  }
  return out;
}

const migFiles = walk(MIG, ['.sql']);
const appFiles = APP_DIRS.flatMap((d) => walk(d, ['.ts', '.tsx']));
const migText = migFiles.map((f) => readFileSync(f, 'utf8')).join('\n');
const appText = appFiles.map((f) => readFileSync(f, 'utf8')).join('\n');

// 1) 被 GRANT EXECUTE 给 authenticated/public 的函数名（容忍换行/多空格）
const granted = new Set();
// 容忍可选 schema. 前缀（如 public.fn）——只捕获函数名本身。
const grantRe = /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+(?:[a-z_][a-z0-9_]*\.)?([a-z_][a-z0-9_]*)\s*\([^)]*\)\s+TO\s+([^;]+);/gi;
for (let m; (m = grantRe.exec(migText)); ) {
  if (/\b(authenticated|public)\b/i.test(m[2])) granted.add(m[1]);
}

// 2) App 里 rpc('name') 调用
const appCalled = new Set();
const rpcRe = /\brpc\(\s*['"]([a-z_][a-z0-9_]*)['"]/gi;
for (let m; (m = rpcRe.exec(appText)); ) appCalled.add(m[1]);

// 3) SQL 内部引用：name( 出现在【非其自身 CREATE/GRANT/COMMENT】的行 → 被别的函数/策略/视图/触发器用
function usedInternally(name) {
  const callRe = new RegExp(`\\b${name}\\s*\\(`, 'g');
  for (const line of migText.split('\n')) {
    if (!callRe.test(line)) { callRe.lastIndex = 0; continue; }
    callRe.lastIndex = 0;
    if (/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION/i.test(line)) continue; // 自身定义
    if (/GRANT\s+EXECUTE/i.test(line)) continue;                     // 自身授权
    if (/COMMENT\s+ON\s+FUNCTION/i.test(line)) continue;             // 自身注释
    return true;
  }
  return false;
}

const orphans = [...granted].filter((n) => !appCalled.has(n) && !usedInternally(n));
const unlisted = orphans.filter((n) => !(n in WHITELIST));
const listed = orphans.filter((n) => n in WHITELIST);

console.log(`孤儿 RPC 检测：授权给 App 的函数 ${granted.size} 个，App 调用 ${appCalled.size} 个。`);
if (listed.length) {
  console.log(`\n已登记"有意暂不接"（${listed.length}）：`);
  for (const n of listed) console.log(`  · ${n} — ${WHITELIST[n]}`);
}
if (unlisted.length) {
  console.error(`\n❌ 发现未登记孤儿函数 ${unlisted.length} 个（授权给 App 却无 rpc 调用、也无 SQL 内部引用）：`);
  for (const n of unlisted) console.error(`  · ${n}`);
  console.error(`\n处理：① 在 App 里接入 rpc('${unlisted[0]}', …)，或 ② 若有意暂不接，加进本脚本 WHITELIST 并写理由。`);
  process.exit(1);
}
console.log(`\n✅ 无未登记孤儿函数。`);
