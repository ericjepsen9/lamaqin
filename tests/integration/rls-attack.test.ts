// 跨用户攻击（红线保护）· 走真实 PostgREST + JWT 校验路径。
// 为何单列这层：自建 SQL harness 用 auth 桩，测不到「PostgREST 静默过滤 + 真实 JWT 定 auth.uid」——
// RLS 失效的最坏情形是 SELECT 返回 200 空数组、UPDATE 返回 200 但 0 生效（不抛异常），
// 前端 E2E 极易误判为「正常空列表」放过。这里正面打这条缝。
import type { SupabaseClient } from '@supabase/supabase-js';
import { Client } from 'pg';

import { anonClient, clientAs, DB_URL, USER_A, USER_B } from './helpers';
import { CARE_WORKER, COHORT_A, PRACTICE, seed } from './seed';

const VOW_A = '12000000-0000-0000-0000-000000000001';
const VOW_B = '12000000-0000-0000-0000-000000000002';

let a: SupabaseClient; // 师兄 A
let b: SupabaseClient; // 师兄 B
let anon: SupabaseClient;
let care: SupabaseClient; // 爱心(A 班关怀者)

beforeAll(async () => {
  await seed();
  a = await clientAs(USER_A);
  b = await clientAs(USER_B);
  anon = anonClient();
  care = await clientAs(CARE_WORKER);
});

describe('跨用户攻击 · RLS 红线（真实 JWT 路径）', () => {
  // 正向对照：证明 A 的身份真的生效（不是 auth 全坏导致一切皆空 → 攻击测试假绿）
  test('对照：A 能读到自己的愿（≥1 行）', async () => {
    const { data, error } = await a.from('user_practice_vows').select('id').eq('id', VOW_A);
    expect(error).toBeNull();
    expect(data?.length).toBeGreaterThanOrEqual(1);
  });

  test('A 读不到 B 的打卡记录（静默过滤 = 0 行，非报错）', async () => {
    const { data, error } = await a.from('practice_logs').select('*').eq('vow_id', VOW_B);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test('A 读不到 B 的愿（0 行）', async () => {
    const { data, error } = await a.from('user_practice_vows').select('*').eq('id', VOW_B);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test('A 篡改 B 的打卡：UPDATE 0 生效，且 B 侧读值未变', async () => {
    // 冒名改 B 的记录：RLS 使目标 0 行 → 返回空、不抛错
    const { data: updated, error } = await a
      .from('practice_logs')
      .update({ count: 999999 })
      .eq('vow_id', VOW_B)
      .select();
    expect(error).toBeNull();
    expect(updated).toEqual([]);

    // B 自己读，值仍是种子里的 100（证明确实没被改动）
    const { data: bRows } = await b.from('practice_logs').select('count').eq('vow_id', VOW_B);
    expect(bRows?.[0]?.count).toBe(100);
  });

  test('师兄端看不到关怀记录（care_followups）——A 是关怀对象本人也读不到（无状态色红线）', async () => {
    const { data, error } = await a.from('care_followups').select('*');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test('匿名读不到关怀记录', async () => {
    const { data } = await anon.from('care_followups').select('*');
    // anon 要么被拒、要么 0 行；无论如何不得见任何关怀数据
    expect(data == null || data.length === 0).toBe(true);
  });
});

// 正向路径(2026-07-10 补·此前只有攻击负例):上面全是"该拒的场景"，如果 RLS 配置错到
// 把谁都拒了，负例一样会全绿、假装安全。这里正面验证"合法访问真的会放行"，两者缺一都不够。
describe('正向路径 · 合法访问应该放行（非仅负例）', () => {
  test('A 能成功新增自己的打卡（自写合法应放行，用后即删不留痕）', async () => {
    const { data, error } = await a
      .from('practice_logs')
      .insert({ user_id: USER_A, vow_id: VOW_A, count: 3, log_date: '2026-01-03' })
      .select('id')
      .single();
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();

    if (data?.id) {
      const { error: delErr } = await a.from('practice_logs').delete().eq('id', data.id);
      expect(delErr).toBeNull();
    }
  });

  test('爱心（本班关怀者）能读到 A 的关怀记录——证明上面"A/匿名读不到"不是 RLS 把谁都拒', async () => {
    const { data, error } = await care.from('care_followups').select('*').eq('student_id', USER_A);
    expect(error).toBeNull();
    expect(data?.length).toBeGreaterThanOrEqual(1);
  });
});

// 权限边界·写层面(2026-07-17·PM"这两个都要测"·测试计划②场景2):学员本人改自己的
// profiles.status / class_members.status——这两个字段在学员端UI里根本没有可达入口
// (e2e走不到"点击后失败"这条路径),只能走真实JWT直连RLS验证。两种保护机制都是"静默
// no-op"(UPDATE语句本身不报错),不是"报错拒绝"——这不是测试代码的疏漏,是分别核实过
// profiles_protect_status触发器(静默还原)和class_members_update策略(USING筛掉,0行
// 生效)两种不同机制后如实写的断言。
describe('学员篡改自身账户/班级级状态 · RLS红线(真实JWT路径)', () => {
  test('A改自己profiles.status → UPDATE不报错,但触发器静默还原,值未变', async () => {
    const before = await a.from('profiles').select('status').eq('id', USER_A).single();
    expect(before.data?.status).toBe('active');

    const { error } = await a.from('profiles').update({ status: 'rejected' }).eq('id', USER_A);
    expect(error).toBeNull(); // RLS放行改自己的行(profiles_update的USING条件是id=auth.uid())

    const after = await a.from('profiles').select('status').eq('id', USER_A).single();
    expect(after.data?.status).toBe('active'); // profiles_protect_status触发器把status悄悄还原了
  });

  test('A改自己class_members.status → RLS的USING条件筛掉这一行,UPDATE影响0行,值未变', async () => {
    const { data: updated, error } = await a
      .from('class_members')
      .update({ status: 'graduated' })
      .eq('user_id', USER_A)
      .select();
    expect(error).toBeNull();
    expect(updated).toEqual([]); // class_members_update的USING是is_system_admin(),A不满足→0行

    const { data: after } = await a.from('class_members').select('status').eq('user_id', USER_A);
    expect(after?.[0]?.status).toBe('active');
  });
});

// 权限边界·写层面(2026-07-17·测试计划②场景3):已毕业/离班学员补打卡——回归验证
// 2026-07-13修的那个"已毕业/离班学员打卡未真正禁用"问题(supabase/migrations/
// 20260713000200_pause_vows_on_cohort_exit.sql)。真实路径是"愿被暂停",不直接是
// class_members.status——离班时触发器会把该(user,cohort)下的active愿全部置paused,
// practice_logs_insert再查愿的status是不是active。这里造一条paused愿直接验证RLS闸门,
// 不依赖UI(useMyVows已经把非active愿从列表过滤掉,UI层面走不到"点补录按钮"这一步)。
describe('已毕业/离班学员补打卡 · RLS红线(回归验证·2026-07-13修复)', () => {
  test('愿status=paused时,补打卡practice_logs INSERT被RLS拒绝(不是静默成功)', async () => {
    const client = new Client({ connectionString: DB_URL });
    await client.connect();
    let pausedVowId: string | undefined;
    try {
      const { rows } = await client.query(
        `insert into user_practice_vows(user_id, source, practice_id, target_period, start_date, cohort_id, status)
         values ($1, 'custom', $2, 'lifetime', '2026-01-01', $3, 'paused') returning id`,
        [USER_A, PRACTICE, COHORT_A],
      );
      pausedVowId = rows[0].id as string;

      const { error } = await a.from('practice_logs').insert({ user_id: USER_A, vow_id: pausedVowId, count: 5, log_date: '2026-01-05' });
      expect(error).not.toBeNull(); // 应该被RLS拒(42501),不是200成功、也不是静默0行
      expect(error?.code === '42501' || /row-level security|permission|policy/i.test(error?.message ?? '')).toBe(true);

      const { data: afterAttempt } = await a.from('practice_logs').select('id').eq('vow_id', pausedVowId);
      expect(afterAttempt).toEqual([]); // 确认真的没写进去,不是报了错但其实还是插入成功了
    } finally {
      if (pausedVowId) await client.query('delete from user_practice_vows where id=$1', [pausedVowId]);
      await client.end();
    }
  });
});
