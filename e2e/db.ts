// 测试期间直连本地库核对写入结果(比只看UI状态更硬:UI可能"看起来成功"但没真写库)。
import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';

const DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const SUPABASE_URL = 'http://127.0.0.1:54321';
// 本地 Supabase CLI 默认演示项目的 service_role key(公开、非密钥,每个 `supabase init` 项目
// 默认都一样,同 global-setup.ts 用的那一份),只连本地栈,不碰任何远程项目。
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

export async function withDb<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

// 建一个真实可查的待审批学员(走 GoTrue Admin API,不裸 SQL 插 auth.users——避免漏设 GoTrue
// 内部字段导致"Database error finding user"类问题,同老学员导入那次诊断出的问题同根因)。
// handle_new_auth_user 触发器会自动建 status='pending' 的裸 profile,这里只补真实姓名方便按名字定位。
export async function createTestProfile(email: string, fullName: string): Promise<string> {
  const { data, error } = await adminClient.auth.admin.createUser({ email, password: 'E2E-Test-00000000', email_confirm: true });
  if (error || !data.user) throw new Error(`createTestProfile(${email}) 失败: ${error?.message}`);
  await withDb((c) => c.query(`UPDATE profiles SET full_name=$2 WHERE id=$1`, [data.user!.id, fullName]));
  return data.user.id;
}

// 清理测试建的账号(级联删 profiles 及其下数据)。用 Admin API(不裸删 auth.users)——同上,
// 避免留下不完整的 auth 内部状态。幂等,找不到就算了,不阻断测试清理流程。
export async function deleteTestProfile(userId: string): Promise<void> {
  await adminClient.auth.admin.deleteUser(userId).catch(() => {});
}

// 批量建N个测试账号(2026-07-17·测试计划⑤数据量规模测试用)。GoTrue Admin API没有批量建号
// 接口,仍是逐个createUser,用有限并发(不是200个一拥而上、也不是纯顺序200次)平衡速度与
// 不压垮本地栈单机资源;full_name用一次性批量UPDATE(unnest),不像createTestProfile()那样
// 逐个开一条独立连接。
export async function createManyTestProfiles(prefix: string, count: number): Promise<string[]> {
  const CONCURRENCY = 20;
  const emails = Array.from({ length: count }, (_, i) => `${prefix}-${i}-${Date.now()}@local.test`);
  const ids: string[] = [];
  for (let i = 0; i < emails.length; i += CONCURRENCY) {
    const batch = emails.slice(i, i + CONCURRENCY);
    const batchIds = await Promise.all(batch.map(async (email) => {
      const { data, error } = await adminClient.auth.admin.createUser({ email, password: 'E2E-Test-00000000', email_confirm: true });
      if (error || !data.user) throw new Error(`createManyTestProfiles(${email}) 失败: ${error?.message}`);
      return data.user.id;
    }));
    ids.push(...batchIds);
  }
  const names = ids.map((_, i) => `E2E规模测试-${i}`);
  await withDb((c) => c.query(
    `UPDATE profiles SET full_name = data.full_name FROM unnest($1::uuid[], $2::text[]) AS data(id, full_name) WHERE profiles.id = data.id`,
    [ids, names],
  ));
  return ids;
}

// 批量删(同deleteTestProfile,限并发版)
export async function deleteManyTestProfiles(userIds: string[]): Promise<void> {
  const CONCURRENCY = 20;
  for (let i = 0; i < userIds.length; i += CONCURRENCY) {
    const batch = userIds.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map((id) => adminClient.auth.admin.deleteUser(id).catch(() => {})));
  }
}

export async function getSeedIds() {
  return withDb(async (c) => {
    const { rows: [cohort] } = await c.query(`SELECT id FROM cohorts WHERE code='E2E_CO'`);
    const { rows: [student] } = await c.query(`SELECT id FROM profiles WHERE email='e2e-student@local.test'`);
    const { rows: lessons } = await c.query(
      `SELECT cl.id, cl.lesson_number FROM course_lessons cl JOIN courses co ON co.id=cl.course_id WHERE co.slug='e2e-qianxing' ORDER BY cl.lesson_number`,
    );
    return { cohortId: cohort.id as string, studentId: student.id as string, lessons: lessons as { id: string; lesson_number: number }[] };
  });
}
