// 跨用户攻击（红线保护）· 走真实 PostgREST + JWT 校验路径。
// 为何单列这层：自建 SQL harness 用 auth 桩，测不到「PostgREST 静默过滤 + 真实 JWT 定 auth.uid」——
// RLS 失效的最坏情形是 SELECT 返回 200 空数组、UPDATE 返回 200 但 0 生效（不抛异常），
// 前端 E2E 极易误判为「正常空列表」放过。这里正面打这条缝。
import type { SupabaseClient } from '@supabase/supabase-js';

import { anonClient, clientAs, USER_A, USER_B } from './helpers';
import { CARE_WORKER, seed } from './seed';

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
