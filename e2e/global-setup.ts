// E2E 全套跑前置:清旧种子 → 重建最小真实内容(专业/课程/课时/班级/学员/辅导员/愿/本周打卡)。
// 只跑一次(playwright globalSetup),后续每条 spec 复用同一份种子,不需要每条测试各自建数据。
// 只连本地 Docker Supabase 栈(127.0.0.1),不会碰任何远程/生产项目。
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';

const SUPABASE_URL = 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

export const STUDENT_EMAIL = 'e2e-student@local.test';
export const COACH_EMAIL = 'e2e-coach@local.test';
export const ADMIN_EMAIL = 'e2e-admin@local.test';
export const TEST_PASSWORD = 'E2E-Test-00000000';

// YYYY-MM-DD → 本周一(PD-17 周界:周一起算),与 lib/queries/report-week-calc.ts::mondayOnOrBefore 同公式。
// ⚠️ 2026-07-12 订正:此前直接对 new Date() 调 getDay()/setDate()/toISOString(),按 CI runner
//   的本地(UTC)时钟算"今天",与下方 cohort.timezone 硬编码的 'Asia/Shanghai' 不一致——UTC
//   16:00-24:00 这段(上海已跨入下一天)算出的"周一"会晚了一整周,导致 program_weeks 排的
//   第1周课时在这段时间跑测试会被判定成"不是本周"(CI 实测复现:e2e/smoke.spec.ts 的
//   class-week-lesson 断言超时找不到元素)。现改成先按 Asia/Shanghai 解出"今天"日期串(同
//   lib/date-tz.ts::todayInTz 的做法),再对这个日期串做纯日历回溯,与 report-week-calc.ts::
//   mondayOnOrBefore 的两段式(先转时区、再回溯周一)同源,不再受 runner 本地时区影响。
function mondayOf(d: Date): string {
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(d); // YYYY-MM-DD
  const m = new Date(`${todayStr}T00:00:00`);
  const dow = m.getDay();
  const diff = dow === 0 ? 6 : dow - 1;
  m.setDate(m.getDate() - diff);
  return m.toLocaleDateString('en-CA');
}

async function main() {
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const pg = new Client({ connectionString: DB_URL });
  await pg.connect();

  // 0) 本地栈基础设施防御:supabase db reset 后偶尔漏配 authenticated/anon 默认GRANT
  //    (托管Supabase自动配,本地CLI这次没跟上·2026-07-09已发现),幂等补一次不影响正常栈。
  await pg.query(`
    GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, anon, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated, anon, service_role;
  `);

  // 1) 清旧内容种子(幂等):只删班/专业(级联清 class_members/class_admins/vows/logs/study_records)。
  //    ⚠️ 不删 auth 用户——本地GoTrue对"仍有/曾有关联数据"的用户 admin.deleteUser 会报
  //    "Database error deleting user"(疑GoTrue内部状态,即便public schema外键已查无引用也会炸)。
  //    改用「用户是稳定夹具、只重置其数据」的模式:用户存在则复用同一账号,只重建内容——
  //    这样每轮测试的邮箱/密码不变,也彻底绕开了 deleteUser 的可靠性问题。
  await pg.query(`DELETE FROM cohorts WHERE code = 'E2E_CO'`);
  await pg.query(`DELETE FROM programs WHERE code = 'E2E_JX'`);
  // courses 不是 program 的级联子表(programs↔courses 是 program_courses 多对多junction,
  // 删program只删junction行、不删courses本身——课程内容可跨专业复用),需单独清。
  await pg.query(`DELETE FROM courses WHERE slug = 'e2e-qianxing'`);

  // 2) 学员 + 辅导员:已存在则复用,不存在才建(真实 auth 用户,真实密码登录)。
  async function ensureUser(email: string, name: string): Promise<string> {
    const { data: list, error: listErr } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listErr) throw new Error(`listUsers 失败: ${listErr.message}`);
    const existing = list?.users.find((u) => u.email === email);
    if (existing) return existing.id;
    const { data, error } = await sb.auth.admin.createUser({
      email, password: TEST_PASSWORD, email_confirm: true, user_metadata: { full_name: name },
    });
    if (error || !data.user) throw new Error(`createUser ${email} 失败: ${error?.message}`);
    return data.user.id;
  }
  const studentId = await ensureUser(STUDENT_EMAIL, 'E2E·学员');
  const coachId = await ensureUser(COACH_EMAIL, 'E2E·辅导员');
  const adminId = await ensureUser(ADMIN_EMAIL, 'E2E·系统管理员');

  // profiles.status 受 profiles_protect_status 触发器锁(见迁移20260618000010),
  // service-role 直写会被静默revert回pending,需同harness一样用 allow_protected_write 旁路。
  await pg.query(`SELECT set_config('app.allow_protected_write', 'on', false)`);
  await pg.query(`UPDATE profiles SET status='active', full_name=$2 WHERE id=$1`, [studentId, 'E2E·学员']);
  await pg.query(`UPDATE profiles SET status='active', full_name=$2 WHERE id=$1`, [coachId, 'E2E·辅导员']);
  await pg.query(`UPDATE profiles SET status='active', full_name=$2 WHERE id=$1`, [adminId, 'E2E·系统管理员']);
  await pg.query(`SELECT set_config('app.allow_protected_write', 'off', false)`);
  // 角色判定=system_admins表存在性(lib/queries/profile.ts),幂等(ON CONFLICT):管理端"创建活动"
  // 这类admin-only表单此前没有任何e2e能测到(种子里从未有admin角色用户),2026-07-14补。
  await pg.query(`INSERT INTO system_admins(user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [adminId]);

  // 3) 建最小内容:1专业+1学期+1课程+2课时+本周排课+1班+1条本周计数型愿
  const monday = mondayOf(new Date());
  const { rows: [{ id: programId }] } = await pg.query(
    `INSERT INTO programs (name, code, start_semester, weeks_per_semester) VALUES ('E2E·加行','E2E_JX',1,26) RETURNING id`,
  );
  const { rows: [{ id: semesterId }] } = await pg.query(
    `INSERT INTO program_semesters (program_id, semester_number, semester_name, starts_week, ends_week) VALUES ($1,1,'第一学期',1,26) RETURNING id`,
    [programId],
  );
  const { rows: [{ id: courseId }] } = await pg.query(
    `INSERT INTO courses (name, slug, course_type, is_required) VALUES ('E2E·前行引导文','e2e-qianxing','formal',true) RETURNING id`,
  );
  const { rows: [{ id: lesson1Id }] } = await pg.query(
    `INSERT INTO course_lessons (course_id, lesson_number, title) VALUES ($1,1,'暇满难得') RETURNING id`, [courseId],
  );
  await pg.query(`INSERT INTO course_lessons (course_id, lesson_number, title) VALUES ($1,2,'寿命无常')`, [courseId]);
  await pg.query(`INSERT INTO program_courses (program_id, course_id, sort_order) VALUES ($1,$2,0)`, [programId, courseId]);
  const { rows: [{ id: weekId }] } = await pg.query(
    `INSERT INTO program_weeks (program_id, semester_id, week_number, offset_days) VALUES ($1,$2,1,0) RETURNING id`,
    [programId, semesterId],
  );
  await pg.query(
    `INSERT INTO program_week_courses (week_id, course_id, lesson_id, display_order)
     SELECT $1, $2, id, row_number() OVER (ORDER BY lesson_number) - 1 FROM course_lessons WHERE course_id = $2`,
    [weekId, courseId],
  );
  const { rows: [{ id: cohortId }] } = await pg.query(
    `INSERT INTO cohorts (program_id, name, code, start_date, timezone, is_active) VALUES ($1,'E2E班','E2E_CO',$2,'Asia/Shanghai',true) RETURNING id`,
    [programId, monday],
  );
  await pg.query(
    `INSERT INTO class_members (cohort_id, user_id, member_role, status, joined_at, is_primary) VALUES ($1,$2,'formal','active',$3,true)`,
    [cohortId, studentId, `${monday}T09:00:00Z`],
  );
  await pg.query(`INSERT INTO class_admins (cohort_id, user_id, role) VALUES ($1,$2,'zhumai')`, [cohortId, coachId]);

  const { rows: [{ id: practiceId }] } = await pg.query(`SELECT id FROM practices WHERE measurement='count' LIMIT 1`);
  const { rows: [{ id: vowId }] } = await pg.query(
    `INSERT INTO user_practice_vows (user_id, source, cohort_id, practice_id, target_period, daily_target, start_date, status, is_required_for_promotion, share_to_collective)
     VALUES ($1,'auto',$2,$3,'lifetime',108,$4,'active',true,true) RETURNING id`,
    [studentId, cohortId, practiceId, monday],
  );
  await pg.query(`INSERT INTO practice_logs (user_id, vow_id, count, log_date, is_confirmed) VALUES ($1,$2,108,$3,true)`, [studentId, vowId, monday]);

  await pg.end();
  console.log(`[e2e-setup] ready: student=${studentId} coach=${coachId} cohort=${cohortId} lesson1=${lesson1Id} monday=${monday}`);

  // Metro/Expo web 首次编译慢(CI runner 更明显:2026-07-10 实测 CI 上第一条真实导航吃满 60s
  // 测试超时,同一 runner 后续每条测试都在 3-8s 内完成——差距就是"整个 vendor/框架包第一次编译"
  // 这一次性成本)。这里在计时的测试正式开跑前,主动把这次编译成本转嫁到 globalSetup(无固定
  // per-test超时约束)身上;Playwright 官方不保证 webServer 一定先于 globalSetup 就绪,所以带
  // 轮询重试、能容忍暂时连不上,不会让 globalSetup 因为服务器还没起来直接报错崩掉。
  //
  // ⚠️ 第一版(纯 fetch(url))试过、CI 实测证明不够:fetch 只拿到 Metro 直接返回的 HTML 外壳,
  // 不会触发浏览器真正会请求的那份 JS bundle 编译——预热"成功"(200)之后,第一条真实测试仍吃了
  // 72s(比 fetch 版之前的"卡满60s报错"好一点,但离 90s 超时也没多少余量,治标不治本)。改用真实
  // headless 浏览器整页加载(和实际测试走一样的路径),才会真的把 bundle 编译这一步移出计时窗口。
  //
  // ⚠️ 2026-07-17补第二个路由:admin-class-management.spec.ts"调整共修日程"这条测试反复在
  // 真机CI里间歇性卡到90秒超时(Promise.all等dialog那步,已排查过不是测试代码本身的问题),
  // 而/classes/[id]这条路由此前完全没被预热过——排查发现全套件里只有admin-class-management/
  // boundary/smoke三个文件会导航到这条路由,字母序上admin-class-management排最前,"调整共修
  // 日程"又是该文件第一条测试,大概率是全套件里第一次真正命中这条路由,要现付一次性的bundle
  // 冷编译成本。这里不需要真的登录:Metro按URL提供/编译对应路由的bundle这一步发生在浏览器
  // 执行到"未登录跳转/login"这段JS逻辑之前,拿种子建好的E2E班cohortId直接访问、不管会不会被
  // 重定向,冷编译成本一样能转嫁到这里。加完这一条后,同一晚(2026-07-17)admin-quiz.spec.ts
  // 的"新建问答题"这条测试又踩到同一类症状的第二次(这次表现不是dialog超时,是"UI显示成功但
  // 直连DB查不到刚建的行"——具体机制没能100%确定,但/quiz/new同样此前从未被预热、且admin-quiz
  // 是全套件里唯一会导航到这条路由的文件,跟/classes/[id]那次是同一类"全套件第一次命中未预热
  // 路由"的怀疑)。与其每次一个个补,这里一次性把已知会被多个测试用到的静态(不需要动态ID)
  // admin路由都预热一遍,降低今晚(PM离线安排"尽可能多跑几轮")后续再撞见同类间歇性问题的概率
  // ——多预热几条路由的增量成本很小(每条约1-2秒,观测自/classes/[id]那次的日志),风险很低
  // (未登录时这些页面正常走 <Redirect> 组件,不是报错,不会卡住)。
  await warmUpWebServer([
    'http://127.0.0.1:8082/login',
    `http://127.0.0.1:8082/classes/${cohortId}`,
    'http://127.0.0.1:8082/dashboard',
    'http://127.0.0.1:8082/quiz/new',
    'http://127.0.0.1:8082/practice-config',
    'http://127.0.0.1:8082/scheduling',
    'http://127.0.0.1:8082/students',
    'http://127.0.0.1:8082/reminder-presets',
    'http://127.0.0.1:8082/events',
  ]);
}

async function warmUpWebServer(urls: string[], maxWaitMs = 100_000): Promise<void> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const url of urls) {
      const deadline = Date.now() + maxWaitMs;
      let warmed = false;
      while (Date.now() < deadline) {
        try {
          await page.goto(url, { waitUntil: 'load', timeout: Math.max(deadline - Date.now(), 5_000) });
          console.log(`[e2e-setup] webServer 已预热(真实浏览器完整加载 ${url})`);
          warmed = true;
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 2000)); // 服务器还没起来/编译还没完,继续等
        }
      }
      if (!warmed) console.log(`[e2e-setup] webServer 预热超时(${maxWaitMs}ms 内未加载成功:${url}),交给测试自己的超时兜底`);
    }
  } finally {
    await browser.close();
  }
}

export default main;
