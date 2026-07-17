import { expect, test } from '@playwright/test';
import { createManyTestProfiles, deleteManyTestProfiles, withDb } from './db';
import { ADMIN_EMAIL, TEST_PASSWORD } from './global-setup';
import { loginAs } from './helpers';
import { testIds } from '../lib/testids';

// 数据量/规模(2026-07-17·测试计划⑤):这轮系统性e2e测试的fixture几乎都是1-3条数据规模,
// 没测过真实体量。这两条不是找"崩不崩"的bug断言(目前classes/[id].tsx学员名单、quiz/index.tsx
// 题库列表都是普通.map()渲染,没做虚拟滚动/分页,数据层fetchAllPages已在2026-07-11修过
// PostgREST单次封顶截断——这两条测试主要在confirm这个既有修复在真实规模下依然成立),
// 而是**量化现状**:记录真实耗时给PM一个参考数字,没有教务/PM定过的"多少人算太慢"这个
// 硬性门槛,不在这里凭空发明一个。
//
// advancement/index.tsx(报数升学列表)是全站汇总(不按单个班级筛选),不像classes/[id].tsx
// 那样能干净地只影响自建的一次性数据、跟其它并行/前后测试的全局状态解耦——这次先不专门为它
// 造量,只测两处能干净隔离的场景。

test.describe('数据量/规模:200人班级学员名单渲染', () => {
  test('一次性建200人的班级 → 学员名单页正确显示全部200人、不崩溃,如实记录渲染耗时', async ({ page }) => {
    // 全局默认90秒(playwright.config.ts)是给"正常单个流程"留的余量,这条测试自己的fixture
    // 搭建(200个GoTrue Admin API建号,每个都要bcrypt哈希密码,CPU密集)比其它测试重得多——
    // 延长超时只为了不让"建fixture本身偏慢"误判成"渲染卡死",跟下面真正要测的渲染耗时是
    // 两件事,分开看待。
    test.setTimeout(180_000);
    const { rows: [{ id: programId }] } = await withDb((c) => c.query(`SELECT id FROM programs WHERE code='E2E_JX'`));
    const { rows: [{ id: cohortId }] } = await withDb((c) =>
      c.query(
        `INSERT INTO cohorts (program_id, name, code, start_date, timezone, is_active) VALUES ($1,$2,$3,'2026-01-01','Asia/Shanghai',true) RETURNING id`,
        [programId, `E2E规模测试班-${Date.now()}`, `E2E_SCALE_${Date.now()}`],
      ),
    );
    const userIds = await createManyTestProfiles('e2e-scale', 200);
    await withDb((c) =>
      c.query(
        `INSERT INTO class_members (cohort_id, user_id, member_role, status, joined_at, is_primary)
         SELECT $1, u, 'formal', 'active', '2026-01-01T00:00:00Z', true FROM unnest($2::uuid[]) AS u`,
        [cohortId, userIds],
      ),
    );
    try {
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);
      const start = Date.now();
      await page.goto(`/classes/${cohortId}`, { timeout: 60_000 });
      // SectionCard标题里带的是查询结果真实count,不是断言"能看到某个人名"这种弱验证——
      // 标题显示200等于roster查询真的拿到了全部200行、且全部渲染完了每一行的div。
      await expect(page.getByText('学员名单（200）', { exact: false })).toBeVisible({ timeout: 45_000 });
      const elapsedMs = Date.now() - start;
      console.log(`[规模发现] 200人班级详情页:从goto到"学员名单(200)"渲染完成耗时${elapsedMs}ms(未设强制性能门槛,仅供PM参考)`);

      // 标题数字对不代表每一行真的都画出来了(可能查询对、渲染半途卡住)——交叉核对渲染出的
      // 姓名文案数量,不止信标题这一个数字。
      const nameCount = await page.locator('[dir="auto"]').filter({ hasText: 'E2E规模测试-' }).count();
      expect(nameCount).toBeGreaterThanOrEqual(200);
    } finally {
      await withDb((c) => c.query(`DELETE FROM cohorts WHERE id=$1`, [cohortId]));
      await deleteManyTestProfiles(userIds);
    }
  });
});

test.describe('数据量/规模:500题课程题库列表渲染', () => {
  test('一次性建500题的课程(20节×25题)→ 题库页展开单节正确显示该节全部题目、不崩溃,如实记录耗时', async ({ page }) => {
    // 下面几步各自的等待上限加起来可能超过全局默认90秒,同上一条测试的道理,单独放宽。
    test.setTimeout(150_000);
    const suffix = `${Date.now()}`;
    const { rows: [{ id: courseId }] } = await withDb((c) =>
      c.query(`INSERT INTO courses (name, slug, course_type, is_required) VALUES ($1,$2,'formal',true) RETURNING id`,
        [`E2E规模测试课程-${suffix}`, `e2e-scale-${suffix}`]),
    );
    const { rows: lessonRows } = await withDb((c) =>
      c.query(
        `INSERT INTO course_lessons (course_id, lesson_number, title)
         SELECT $1, gs, 'E2E规模测试第' || gs || '课' FROM generate_series(1,20) AS gs RETURNING id`,
        [courseId],
      ),
    );
    await withDb((c) => c.query(`UPDATE courses SET total_lessons=20 WHERE id=$1`, [courseId]));
    const lessonIds = lessonRows.map((r) => r.id as string);
    const firstLessonId = lessonIds[0];
    await withDb((c) =>
      c.query(
        `INSERT INTO questions (lesson_id, question_number, prompt, question_type)
         SELECT lid, gs, 'E2E规模测试题-' || gs, 'open' FROM unnest($1::uuid[]) AS lid CROSS JOIN generate_series(1,25) AS gs`,
        [lessonIds],
      ),
    );
    try {
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);
      const start = Date.now();
      await page.goto('/quiz', { timeout: 60_000 });
      // 全站题库列表(useAdminQuestions不按课程筛选),20个课节分组标题应该都先渲染出来
      // (只是标题,展开前不渲染每节题目列表)
      await expect(page.getByTestId(testIds.quiz.lessonGroupHeader(firstLessonId))).toBeVisible({ timeout: 45_000 });
      const listElapsedMs = Date.now() - start;

      // 展开第1节:这一下才真的把这一节25道题的行渲染进DOM(quiz/index.tsx未展开的节不渲染
      // 具体题目,只有展开/搜索时才渲染——这条测试专门测"展开单节渲染约25题"这一下的耗时,
      // 不是"全部500题同时渲染"这个更极端的场景,那需要全展开或搜到全部,现状下UI没有这个
      // 入口,不去人为造一个不存在的操作)。
      const expandStart = Date.now();
      await page.getByTestId(testIds.quiz.lessonGroupHeader(firstLessonId)).click();
      await expect(page.getByText('E2E规模测试题-25', { exact: true })).toBeVisible({ timeout: 15_000 });
      const expandElapsedMs = Date.now() - expandStart;
      console.log(`[规模发现] 500题课程(20节×25题)题库页:列表首屏(20节标题)耗时${listElapsedMs}ms,展开单节渲染25题耗时${expandElapsedMs}ms(未设强制性能门槛,仅供PM参考)`);

      const { rows: countRows } = await withDb((c) => c.query(`SELECT count(*) FROM questions WHERE lesson_id=ANY($1::uuid[])`, [lessonIds]));
      expect(Number(countRows[0].count)).toBe(500); // 确认500题真的都落库了,不是数据层就已经漏了
    } finally {
      await withDb((c) => c.query(`DELETE FROM courses WHERE id=$1`, [courseId]));
    }
  });
});
