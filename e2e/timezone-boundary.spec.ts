import { expect, test } from '@playwright/test';
import { withDb } from './db';
import { ADMIN_EMAIL, STUDENT_EMAIL, TEST_PASSWORD } from './global-setup';
import { loginAs } from './helpers';

// 时区边界(2026-07-17·PM"按原计划优先级顺序做"·测试计划③):CLAUDE.md §1时区四层里
// "班级集体按cohort.timezone"和"藏历殊胜日按UTC+8固定"这两层,此前只有纯函数单测
// (cohort-week-calc.test.ts),没有e2e层面验证过真实浏览器/真实登录路径下UI是否真的按
// 对应时区算,而不是按CI runner本地时区/UTC算。
//
// 用page.clock(Playwright 1.61支持)把浏览器时间固定在已知时刻,不依赖"测试真正跑的那一刻
// 现实世界几点几分"——这一点很关键:如果不固定时钟,UTC跟目标时区的"今天"日期只在特定
// UTC时间窗口内才会不一致(比如UTC与America/Los_Angeles一天里约7小时不一致、17小时一致),
// 那样写的测试只有一部分时间能真正测出"用错时区"这类bug,固定时钟才能保证测试次次都有
// 区分力,不是撞运气。

test.describe('班级时区边界:本班当前周数按cohort.timezone算,不是按UTC/本地', () => {
  test('LA时区班,起修日精心构造成"按LA算是第2周、按UTC算会变成第3周" → 断言显示第2周', async ({ page }) => {
    // America/Los_Angeles在7月是夏令时PDT=UTC-7。选UTC 2026-07-17T02:00:00Z这一刻:
    // 此刻LA当地时间是2026-07-16 19:00,即UTC已经跨进7/17,但LA还在7/16——两者"今天"差1天,
    // 是有区分力的时刻。用这个LA"今天"(7/16)减13天,精确落在"第2周"和"第3周"的分界上:
    // daysDiff=13 → floor(13/7)+1=2周;若代码误按UTC(7/17)算,daysDiff=14 → floor(14/7)+1=3周,
    // 两者结果不同,测试才测得出真bug,不是随便选个位移量凑巧都对。
    const FAKE_TIME_UTC = '2026-07-17T02:00:00Z';
    const LA_TODAY_AT_FAKE_TIME = '2026-07-16';
    const startDate = isoDaysAgo(LA_TODAY_AT_FAKE_TIME, 13);

    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const { rows: [{ id: programId }] } = await withDb((c) =>
      c.query(`INSERT INTO programs (name, code, start_semester, weeks_per_semester) VALUES ($1,$2,1,26) RETURNING id`,
        [`E2E时区测试专业-${suffix}`, `E2E_TZ_${suffix}`]),
    );
    const { rows: [{ id: semesterId }] } = await withDb((c) =>
      c.query(`INSERT INTO program_semesters (program_id, semester_number, semester_name, starts_week, ends_week) VALUES ($1,1,'第一学期',1,26) RETURNING id`, [programId]),
    );
    const { rows: [{ id: courseId }] } = await withDb((c) =>
      c.query(`INSERT INTO courses (name, slug, course_type, is_required) VALUES ($1,$2,'formal',true) RETURNING id`,
        [`E2E时区测试课程-${suffix}`, `e2e-tz-${suffix}`]),
    );
    const { rows: [{ id: lessonId }] } = await withDb((c) =>
      c.query(`INSERT INTO course_lessons (course_id, lesson_number, title) VALUES ($1,1,'E2E第1节') RETURNING id`, [courseId]),
    );
    await withDb((c) => c.query(`UPDATE courses SET total_lessons=1 WHERE id=$1`, [courseId]));
    await withDb((c) => c.query(`INSERT INTO program_courses (program_id, course_id, sort_order) VALUES ($1,$2,0)`, [programId, courseId]));
    // 课节排在第2周(不是第1周),让"本周应学"在断言的那一周恰好有内容、不是空态
    const { rows: [{ id: week2Id }] } = await withDb((c) =>
      c.query(`INSERT INTO program_weeks (program_id, semester_id, week_number, offset_days) VALUES ($1,$2,2,7) RETURNING id`, [programId, semesterId]),
    );
    await withDb((c) => c.query(`INSERT INTO program_week_courses (week_id, course_id, lesson_id, display_order) VALUES ($1,$2,$3,0)`, [week2Id, courseId, lessonId]));
    const { rows: [{ id: cohortId }] } = await withDb((c) =>
      c.query(`INSERT INTO cohorts (program_id, name, code, start_date, timezone, is_active) VALUES ($1,$2,$3,$4,'America/Los_Angeles',true) RETURNING id`,
        [programId, `E2E时区测试班-${suffix}`, `E2E_TZ_CO_${suffix}`, startDate]),
    );
    try {
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);
      await page.clock.install({ time: new Date(FAKE_TIME_UTC) });
      await page.goto(`/classes/${cohortId}`, { timeout: 45_000 });

      await expect(page.getByText('本班当前 · 第 2 周', { exact: false })).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText('第 1 学期 · 第 2 周', { exact: false })).toBeVisible();
      // 反向确认:不应该出现"第3周"这个误按UTC算的错误结果
      await expect(page.getByText('本班当前 · 第 3 周', { exact: false })).not.toBeVisible();
      await expect(page.getByText('第 1 节', { exact: false })).toBeVisible(); // 本周应学列表非空态
    } finally {
      // 删除顺序有讲究:cohorts.program_id 是 ON DELETE RESTRICT(见 schema),这个班还在
      // 引用这个专业,必须先删班再删专业——2026-07-17首次真机CI跑就撞过这个FK违例
      // (cohorts_program_id_fkey),之前只当理所当然反过来删,漏了这一步。
      await withDb((c) => c.query(`DELETE FROM cohorts WHERE id=$1`, [cohortId]));
      await withDb((c) => c.query(`DELETE FROM programs WHERE id=$1`, [programId]));
      await withDb((c) => c.query(`DELETE FROM courses WHERE id=$1`, [courseId]));
    }
  });
});

test.describe('藏历殊胜日边界:UTC+8跨天临界点(决策075固定UTC+8,不受浏览器/本地时区影响)', () => {
  test('UTC 15:59 → 藏历页"今日"仍是前一天;UTC 16:01(跨UTC+8零点)→ "今日"变成后一天', async ({ page }) => {
    // 2026-01-02(萨迦班智达圆寂纪念日)→ 2026-01-03(阿弥陀佛节日)是数据库里已确认存在
    // 事件、内容明显不同的相邻两天,用来验证"今日"切换是否真的按UTC+8算,而不是随便挑一天
    // 只看"渲染没崩"这种弱断言。
    await loginAs(page, STUDENT_EMAIL, TEST_PASSWORD);

    // ⚠️2026-07-17首次真机CI跑撞到的坑:日历页对选中日期的介绍文案(标题行+正文句子等)会把
    // 同一个节日名重复渲染在好几处DOM节点里(真机实测resolved to 3 elements),getByText不带
    // .first()会撞Playwright严格模式——这几个断言只关心"这个名字有没有在页面任意位置出现过",
    // 不关心具体是哪一处,统一加.first()/.last()取其一,不逐个精确定位。
    await page.clock.install({ time: new Date('2026-01-02T15:59:00Z') }); // UTC+8本地=1/2 23:59,还没跨天
    await page.goto('/calendar', { timeout: 45_000 });
    await expect(page.getByText('萨迦班智达圆寂纪念日', { exact: false }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('阿弥陀佛节日', { exact: false }).first()).not.toBeVisible();

    await page.clock.install({ time: new Date('2026-01-02T16:01:00Z') }); // UTC+8本地=1/3 00:01,刚跨天
    await page.goto('/calendar', { timeout: 45_000 }); // 重新整页加载,默认selected=today会用新的"今天"
    await expect(page.getByText('阿弥陀佛节日', { exact: false }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('萨迦班智达圆寂纪念日', { exact: false }).first()).not.toBeVisible();
  });
});

// America/Los_Angeles 在选定日期(2026-07-16)是PDT=UTC-7夏令时,固定减13天精确落在周分界上
function isoDaysAgo(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
