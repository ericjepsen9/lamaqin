// 集成测试种子：以 postgres 超级用户直连本地栈，绕 RLS + 开 protect 旁路造最小夹具。
// 只造 RLS 攻击测试需要的东西：A/B 两个 active 正式师兄（同 A 班）+ B 的一条打卡 + A 的一条关怀记录。
// 幂等：先按固定 UUID 清理再插入，可反复跑。
import { Client } from 'pg';

import { DB_URL, USER_A, USER_B } from './helpers';

export const COHORT_A = '0c000000-0000-0000-0000-00000000000a'; // 导出:权限边界测试(场景3)要造额外的暂停愿挂到这个班
const PROGRAM = '0b000000-0000-0000-0000-000000000001';
const ACADEMY = '0a000000-0000-0000-0000-000000000001';
export const CARE_WORKER = '33333333-3333-3333-3333-333333333333'; // 爱心(导出:正向路径测试要用她的身份验证"本班合法访问应放行")
export const PRACTICE = '10000000-0000-0000-0000-000000000001'; // 导出:权限边界测试(场景3)造暂停愿要挂靠这个修法
const VOW_A = '12000000-0000-0000-0000-000000000001';
const VOW_B = '12000000-0000-0000-0000-000000000002';

export async function seed(): Promise<void> {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    await c.query('begin');

    // 补表级授权：迁移不自带 anon/authenticated 的 GRANT（依赖环境的 ALTER DEFAULT PRIVILEGES；
    // prod Supabase 托管角色自带、harness 桩 00_pretest_stub 显式设）。本地 CLI 栈建表角色不匹配 →
    // 表来时 authenticated 连表级权限都没有，会 42501 permission denied（不是 RLS）。这里复刻 harness 桩，
    // 让 RLS 成为真正的闸。幂等。
    await c.query('grant usage on schema public to authenticated, anon');
    await c.query('grant select, insert, update, delete on all tables in schema public to authenticated');
    await c.query('grant select on all tables in schema public to anon');
    await c.query('grant usage, select on all sequences in schema public to authenticated, anon');
    await c.query('grant execute on all functions in schema public to authenticated, anon');

    await c.query("select set_config('app.allow_protected_write','on',true)");

    // auth.users（触发 handle_new_auth_user → 建 pending profile）
    await c.query(
      `insert into auth.users(id,email) values
        ($1,'stu1@t'),($2,'stu2@t'),($3,'aixin@t')
       on conflict (id) do nothing`,
      [USER_A, USER_B, CARE_WORKER],
    );

    // 院系/专业/班级
    await c.query(
      `insert into academies(id,name) values ($1,'预科系') on conflict (id) do nothing`,
      [ACADEMY],
    );
    await c.query(
      `insert into programs(id,academy_id,name,code,start_semester) values ($1,$2,'加行','jiaxing',2)
       on conflict (id) do nothing`,
      [PROGRAM, ACADEMY],
    );
    await c.query(
      `insert into cohorts(id,program_id,name,code,start_date,timezone)
       values ($1,$2,'加行A','jiaxing-A','2026-01-01','America/New_York') on conflict (id) do nothing`,
      [COHORT_A, PROGRAM],
    );

    // profiles 转 active
    await c.query(`update profiles set status='active', full_name=email where id = any($1::uuid[])`, [
      [USER_A, USER_B, CARE_WORKER],
    ]);

    // 班级成员：A、B 均为 A 班正式师兄
    await c.query(
      `insert into class_members(cohort_id,user_id,member_role,is_primary) values
        ($1,$2,'formal',true),($1,$3,'formal',true)
       on conflict do nothing`,
      [COHORT_A, USER_A, USER_B],
    );
    // 爱心为 A 班关怀者
    await c.query(
      `insert into class_admins(cohort_id,user_id,role) values ($1,$2,'aixin') on conflict do nothing`,
      [COHORT_A, CARE_WORKER],
    );

    // 修法 + A/B 各一愿 + B 的一条打卡（A 不该看到）
    await c.query(
      `insert into practices(id,name,measurement,unit) values ($1,'顶礼','count','遍') on conflict (id) do nothing`,
      [PRACTICE],
    );
    await c.query(
      `insert into user_practice_vows(id,user_id,source,practice_id,target_period,start_date,cohort_id) values
        ($1,$3,'custom',$5,'lifetime','2026-01-01',$6),
        ($2,$4,'custom',$5,'lifetime','2026-01-01',$6)
       on conflict (id) do nothing`,
      [VOW_A, VOW_B, USER_A, USER_B, PRACTICE, COHORT_A],
    );
    await c.query(
      `insert into practice_logs(user_id,vow_id,count,log_date) values ($1,$2,100,'2026-01-02')
       on conflict do nothing`,
      [USER_B, VOW_B],
    );

    // A 的一条关怀记录（师兄本人及其他师兄都不可见）
    await c.query(
      `insert into care_followups(student_id,cohort_id,care_worker_id,contacted_at,summary)
       values ($1,$2,$3,now(),'电话关怀') on conflict do nothing`,
      [USER_A, COHORT_A, CARE_WORKER],
    );

    await c.query("select set_config('app.allow_protected_write','off',true)");
    await c.query('commit');
  } catch (e) {
    await c.query('rollback');
    throw e;
  } finally {
    await c.end();
  }
}
