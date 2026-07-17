#!/usr/bin/env node
// 本地 harness 运行器（Node + pg）——等价 supabase/tests/run.sh，但不依赖 psql/docker exec。
// 用途：本机无 psql 时跑 DB 断言。连本地栈的 postgres（54322），建一次性库 → 桩 + 全迁移 → seed → 断言 → 删库。
// 跑：node supabase/tests/run.mjs        （需先 bash scripts/supabase-local.sh start 起本地栈）
// CI 仍用 run.sh（有 psql）。二者测试文件清单保持一致。
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIG = join(HERE, '..', 'migrations');
const ADMIN = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const TESTDB = process.env.TEST_DB || 'sss_rls_test';
const TESTDB_URL = `postgresql://postgres:postgres@127.0.0.1:54322/${TESTDB}`;
// 跳过 prod-only 平台依赖迁移（隔离库/裸库装不上，测试文件不引用·已核）共 6 条：
//   search_chunks_phase1 / search_semantic_fix / search_log_top_distance 需 search_ro/pgvector；
//   search_log_intent_capture / search_log_retention_cron 需 pg_cron（本栈只能装在 postgres 主库；
//   2026-07-15 三易审计把 pg_cron 那段从前者抽成独立文件后者,两条都要跳,不是从5条变6条漏改）；
//   posters_storage_bucket 依赖 Supabase storage schema（storage.buckets），裸库无。
//   均与计数/RLS 业务逻辑无关。run.sh 的 grep 跳过清单与此 6 条保持一致。
const SKIP = /(search_chunks_phase1|search_semantic_fix|search_log_top_distance|search_log_intent_capture|search_log_retention_cron|posters_storage_bucket)/;
const TEST_FILES = ['02_rls_tests', '03_constraints', '04_functions', '05_rls_full', '06_workflows', '07_counting', '08_state_machine', '09_report_aggregation', '10_provision_vows', '11_write_rpcs', '12_advancement_5dim'];

async function runSql(url, sql, { collectNotices = false } = {}) {
  const c = new pg.Client({ connectionString: url });
  const notices = [];
  if (collectNotices) c.on('notice', (n) => notices.push(n.message));
  await c.connect();
  try {
    await c.query(sql);
    return { ok: true, notices };
  } catch (e) {
    return { ok: false, notices, error: e.message };
  } finally {
    await c.end();
  }
}

async function main() {
  // 1) 重建临时库
  const admin = new pg.Client({ connectionString: ADMIN });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${TESTDB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${TESTDB}`);
  await admin.end();
  console.log(`>>> (re)created ${TESTDB}`);

  // 2) auth 桩（迁移前）
  const stub = readFileSync(join(HERE, '00_pretest_stub.sql'), 'utf8');
  let r = await runSql(TESTDB_URL, stub);
  if (!r.ok) { console.error('桩失败:', r.error); process.exit(2); }

  // 3) 全迁移（按文件名序，跳过平台迁移5条）
  const migs = readdirSync(MIG).filter((f) => f.endsWith('.sql') && !SKIP.test(f)).sort();
  for (const f of migs) {
    const sql = readFileSync(join(MIG, f), 'utf8');
    r = await runSql(TESTDB_URL, sql);
    if (!r.ok) { console.error(`迁移失败 ${f}:`, r.error); process.exit(2); }
  }
  console.log(`>>> applied ${migs.length} migrations (skipped 5 platform migrations)`);

  // 4) seed
  const seed = readFileSync(join(HERE, '01_seed.sql'), 'utf8');
  r = await runSql(TESTDB_URL, seed);
  if (!r.ok) { console.error('seed 失败:', r.error); process.exit(2); }
  console.log('>>> seeded');

  // 5) 测试断言
  let anyFail = false;
  for (const t of TEST_FILES) {
    let sql;
    try { sql = readFileSync(join(HERE, `${t}.sql`), 'utf8'); }
    catch { continue; } // 文件不存在则跳过（如 07 尚未建）
    const res = await runSql(TESTDB_URL, sql, { collectNotices: true });
    const summary = res.notices.filter((n) => n.includes('通过') || n.includes('====')).slice(-1)[0] || '';
    if (res.ok) {
      console.log(`  ✅ ${t}  ${summary}`);
    } else {
      anyFail = true;
      console.log(`  ❌ ${t}  ${summary}  ← ${res.error}`);
    }
  }

  // 6) 清理
  const admin2 = new pg.Client({ connectionString: ADMIN });
  await admin2.connect();
  await admin2.query(`DROP DATABASE IF EXISTS ${TESTDB} WITH (FORCE)`);
  await admin2.end();
  console.log(`>>> dropped ${TESTDB}`);
  process.exit(anyFail ? 3 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
