import { expect, test } from '@playwright/test';
import { withDb } from './db';
import { ADMIN_EMAIL, TEST_PASSWORD } from './global-setup';
import { loginAs } from './helpers';
import { testIds } from '../lib/testids';

// 排课管理(scheduling/index.tsx)系统性覆盖(2026-07-16·PM"继续完成"剩余测试缺口第六批)。
// 此前0个testID、零e2e覆盖——但这页写的program_semesters/program_weeks/program_week_courses
// 正是get_week_lessons(全app"本周应学"链路)的数据源,是本轮补测里数据模型最核心的一页。
// ⚠️ 不碰共享E2E_JX专业的排课(其它多个spec依赖它"第1周"的既有断言):自建一次性专业+
// 一次性课程+课节,专测这页,用完删专业/课程级联清理。

async function makeThrowawayProgram(): Promise<string> {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const { rows: [{ id: programId }] } = await withDb((c) =>
    c.query(`INSERT INTO programs (name, code, start_semester, weeks_per_semester) VALUES ($1,$2,1,26) RETURNING id`,
      [`E2E排课测试专业-${suffix}`, `E2E_SCHED_${suffix}`]),
  );
  return programId as string;
}

async function makeThrowawayCourse(programId: string, lessonCount: number): Promise<string> {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const { rows: [{ id: courseId }] } = await withDb((c) =>
    c.query(`INSERT INTO courses (name, slug, course_type, is_required) VALUES ($1,$2,'formal',true) RETURNING id`,
      [`E2E排课测试课程-${suffix}`, `e2e-sched-${suffix}`]),
  );
  for (let i = 1; i <= lessonCount; i++) {
    await withDb((c) => c.query(`INSERT INTO course_lessons (course_id, lesson_number, title) VALUES ($1,$2,$3)`, [courseId, i, `E2E第${i}节`]));
  }
  // ⚠️真机CI实测发现的坑:courses.total_lessons是独立的手工维护列(不是COUNT(course_lessons)
  // 算出来的),GenerateModal选课后的"共N节"文案、from/to自动填满整门都读这一列——插了
  // course_lessons不等于total_lessons会跟着变,漏了这一步totalLessons就是NULL,选课后
  // "4 节"文案根本不会出现,toN也不会自动填到4(会停在默认值1),后面"4节→2周"的整条断言链
  // 全部基于错误的节数。
  await withDb((c) => c.query(`UPDATE courses SET total_lessons=$1 WHERE id=$2`, [lessonCount, courseId]));
  await withDb((c) => c.query(`INSERT INTO program_courses (program_id, course_id, sort_order) VALUES ($1,$2,0)`, [programId, courseId]));
  return courseId as string;
}

test.describe('一句话排课 + 放假周 + 移除课节 + 清空学期', () => {
  test('生成排课(4节/每周2节→2周)→ program_semesters/weeks/week_courses正确落库;放假周切换;移除单课节;清空学期级联清理', async ({ page }) => {
    const programId = await makeThrowawayProgram();
    const courseId = await makeThrowawayCourse(programId, 4);
    try {
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);
      await page.goto('/scheduling', { timeout: 45_000 });
      await page.getByTestId(testIds.scheduling.programOption(programId)).click();
      await expect(page.getByText('还没有排课', { exact: false })).toBeVisible({ timeout: 10_000 });

      await page.getByTestId(testIds.scheduling.generateButton).click();
      await page.getByTestId(testIds.scheduling.courseOption(courseId)).click();
      await expect(page.getByText('4 节', { exact: false }).first()).toBeVisible(); // 选课后from/to自动填满整门(1–4节)
      await page.getByTestId(`${testIds.scheduling.perWeekStepper}-plus`).click(); // 每周1→2节
      await expect(page.getByText('每周 2 节', { exact: false })).toBeVisible();

      // click()和dialog等待用page.once+expect.poll(Promise.all这套在"调整共修日程"真机CI
      // 复现过90秒超时,证明本身不安全,全项目统一换掉)
      let genMsg = '';
      page.once('dialog', (d) => { genMsg = d.message(); void d.accept(); });
      await page.getByTestId(testIds.scheduling.generateSubmitButton).click();
      await expect.poll(() => genMsg, { timeout: 15_000 }).toContain('4 节');
      expect(genMsg).toContain('第 1–2 周'); // 4节/每周2节=2周,注意是半角"–"(en dash)

      const { rows: semRows } = await withDb((c) => c.query(`SELECT id, semester_number FROM program_semesters WHERE program_id=$1`, [programId]));
      expect(semRows.length).toBe(1);
      const semesterId = semRows[0].id as string;
      expect(semRows[0].semester_number).toBe(1); // program.start_semester=1

      const { rows: weekRows } = await withDb((c) => c.query(`SELECT id, week_number FROM program_weeks WHERE semester_id=$1 ORDER BY week_number`, [semesterId]));
      expect(weekRows.length).toBe(2);
      const week1Id = weekRows[0].id as string;

      const { rows: wcRows } = await withDb((c) => c.query(`SELECT id, week_id FROM program_week_courses WHERE course_id=$1`, [courseId]));
      expect(wcRows.length).toBe(4); // 4节全部排进,每周2节均分到2周
      expect(wcRows.filter((r) => r.week_id === week1Id).length).toBe(2);

      // 放假周切换(直接mutate,无confirm/notify)
      await expect(page.getByText('设为放假', { exact: true }).first()).toBeVisible();
      await page.getByTestId(testIds.scheduling.holidayToggle(week1Id)).click();
      await expect(page.getByText('放假周(点恢复)', { exact: false })).toBeVisible({ timeout: 10_000 });
      const { rows: afterHoliday } = await withDb((c) => c.query(`SELECT is_holiday FROM program_weeks WHERE id=$1`, [week1Id]));
      expect(afterHoliday[0].is_holiday).toBe(true);

      // 移除第1周里的一节课(confirmAsync确认框)
      const week1CourseId = wcRows.find((r) => r.week_id === week1Id)!.id as string;
      page.once('dialog', (d) => { void d.accept(); });
      await page.getByTestId(testIds.scheduling.removeCourseButton(week1CourseId)).click();
      await expect.poll(async () => {
        const { rows } = await withDb((c) => c.query(`SELECT count(*) FROM program_week_courses WHERE id=$1`, [week1CourseId]));
        return Number(rows[0].count);
      }, { timeout: 10_000 }).toBe(0);
      const { rows: remainAfterRemove } = await withDb((c) => c.query(`SELECT count(*) FROM program_week_courses WHERE course_id=$1`, [courseId]));
      expect(Number(remainAfterRemove[0].count)).toBe(3); // 4节移1节剩3

      // 清空整学期(confirmAsync确认框,级联清program_weeks/program_week_courses)
      page.once('dialog', (d) => { void d.accept(); });
      await page.getByTestId(testIds.scheduling.clearSemesterButton(semesterId)).click();
      await expect.poll(async () => {
        const { rows } = await withDb((c) => c.query(`SELECT count(*) FROM program_semesters WHERE id=$1`, [semesterId]));
        return Number(rows[0].count);
      }, { timeout: 10_000 }).toBe(0);
      const { rows: weeksAfterClear } = await withDb((c) => c.query(`SELECT count(*) FROM program_weeks WHERE semester_id=$1`, [semesterId]));
      expect(Number(weeksAfterClear[0].count)).toBe(0);
      const { rows: wcAfterClear } = await withDb((c) => c.query(`SELECT count(*) FROM program_week_courses WHERE course_id=$1`, [courseId]));
      expect(Number(wcAfterClear[0].count)).toBe(0);
    } finally {
      await withDb((c) => c.query(`DELETE FROM programs WHERE id=$1`, [programId]));
      await withDb((c) => c.query(`DELETE FROM courses WHERE id=$1`, [courseId]));
    }
  });
});

test.describe('排自学读物', () => {
  test('排进第1学期第1–2周 → program_week_self_study正确落库(2周都挂该书)', async ({ page }) => {
    const programId = await makeThrowawayProgram();
    const suffix = `${Date.now()}`;
    const { rows: [{ id: bookId }] } = await withDb((c) => c.query(`INSERT INTO self_study_books (title) VALUES ($1) RETURNING id`, [`E2E排课测试读物-${suffix}`]));
    try {
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);
      await page.goto('/scheduling', { timeout: 45_000 });
      await page.getByTestId(testIds.scheduling.programOption(programId)).click();

      await page.getByTestId(testIds.scheduling.selfStudyButton).click();
      await page.getByTestId(testIds.scheduling.selfStudyBookOption(bookId)).click();
      // 占2周(默认1周,点一次周数stepper的+)
      await page.getByTestId(`${testIds.scheduling.selfStudyWeekCountStepper}-plus`).click();
      await expect(page.getByText('2 周', { exact: false })).toBeVisible();

      // click()和dialog等待用page.once+expect.poll(同上,Promise.all这套写法本身不安全)
      let selfStudyMsg = '';
      page.once('dialog', (d) => { selfStudyMsg = d.message(); void d.accept(); });
      await page.getByTestId(testIds.scheduling.selfStudySubmitButton).click();
      await expect.poll(() => selfStudyMsg, { timeout: 15_000 }).toContain('已排自学读物');

      const { rows: semRows } = await withDb((c) => c.query(`SELECT id FROM program_semesters WHERE program_id=$1`, [programId]));
      expect(semRows.length).toBe(1);
      const { rows: weekRows } = await withDb((c) => c.query(`SELECT id FROM program_weeks WHERE semester_id=$1 ORDER BY week_number`, [semRows[0].id]));
      expect(weekRows.length).toBe(2);
      const { rows: ssRows } = await withDb((c) =>
        c.query(`SELECT week_id FROM program_week_self_study WHERE book_id=$1`, [bookId]),
      );
      expect(ssRows.length).toBe(2);
      expect(new Set(ssRows.map((r) => r.week_id))).toEqual(new Set(weekRows.map((r) => r.id)));
    } finally {
      await withDb((c) => c.query(`DELETE FROM programs WHERE id=$1`, [programId]));
      await withDb((c) => c.query(`DELETE FROM self_study_books WHERE id=$1`, [bookId]));
    }
  });
});

// 异常输入扩展(2026-07-17·PM"这两个都要测"·测试计划①):这页数字输入全是Stepper(±按钮),
// 不是自由文本框,天然结构性挡住非法值——这里验证钳制真的生效,不是假设生效。
test.describe('异常输入:排课Stepper边界钳制', () => {
  test('"从第N节到第M节"两个Stepper互相钳制,N>M结构性不可能出现', async ({ page }) => {
    const programId = await makeThrowawayProgram();
    const courseId = await makeThrowawayCourse(programId, 4);
    try {
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);
      await page.goto('/scheduling', { timeout: 45_000 });
      await page.getByTestId(testIds.scheduling.programOption(programId)).click();
      await page.getByTestId(testIds.scheduling.generateButton).click();
      await page.getByTestId(testIds.scheduling.courseOption(courseId)).click();
      // 选课后from/to自动填满整门:第1–4节(共4节)
      await expect(page.getByText('第 1–4 节(共 4 节)', { exact: false })).toBeVisible();

      // 先把toN往下减2次 → 第1–2节(共2节)
      await page.getByTestId(`${testIds.scheduling.toNStepper}-minus`).click();
      await page.getByTestId(`${testIds.scheduling.toNStepper}-minus`).click();
      await expect(page.getByText('第 1–2 节(共 2 节)', { exact: false })).toBeVisible();

      // 再把fromN往上加3次,试图超过toN(2)——fromN自身的Stepper上限是total(4),但父组件
      // 的Math.min(v, toN)会把它钳在2,不会出现fromN(3或4)>toN(2)这种非法状态
      await page.getByTestId(`${testIds.scheduling.fromNStepper}-plus`).click();
      await page.getByTestId(`${testIds.scheduling.fromNStepper}-plus`).click();
      await page.getByTestId(`${testIds.scheduling.fromNStepper}-plus`).click();
      await expect(page.getByText('第 2–2 节(共 1 节)', { exact: false })).toBeVisible();
    } finally {
      await withDb((c) => c.query(`DELETE FROM programs WHERE id=$1`, [programId]));
      await withDb((c) => c.query(`DELETE FROM courses WHERE id=$1`, [courseId]));
    }
  });

  test('每周节数Stepper减到底停在1,到不了0', async ({ page }) => {
    const programId = await makeThrowawayProgram();
    const courseId = await makeThrowawayCourse(programId, 2);
    try {
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);
      await page.goto('/scheduling', { timeout: 45_000 });
      await page.getByTestId(testIds.scheduling.programOption(programId)).click();
      await page.getByTestId(testIds.scheduling.generateButton).click();
      await page.getByTestId(testIds.scheduling.courseOption(courseId)).click();
      // 默认每周1节,连点3次"-"(min=1兜底,不会变成0/-1/-2)
      for (let i = 0; i < 3; i++) await page.getByTestId(`${testIds.scheduling.perWeekStepper}-minus`).click();
      await expect(page.getByText('每周 1 节', { exact: false })).toBeVisible();
    } finally {
      await withDb((c) => c.query(`DELETE FROM programs WHERE id=$1`, [programId]));
      await withDb((c) => c.query(`DELETE FROM courses WHERE id=$1`, [courseId]));
    }
  });

  test('自学占用周数Stepper加到底封顶52,到不了200', async ({ page }) => {
    const programId = await makeThrowawayProgram();
    const { rows: [{ id: bookId }] } = await withDb((c) =>
      c.query(`INSERT INTO self_study_books (title) VALUES ($1) RETURNING id`, [`E2E周数边界测试读物-${Date.now()}`]),
    );
    try {
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);
      await page.goto('/scheduling', { timeout: 45_000 });
      await page.getByTestId(testIds.scheduling.programOption(programId)).click();
      await page.getByTestId(testIds.scheduling.selfStudyButton).click();
      await page.getByTestId(testIds.scheduling.selfStudyBookOption(bookId)).click();
      // 默认1周,连点60次"+"(远超52上限,验证真封顶而不是恰好点够52下就不多点了)
      for (let i = 0; i < 60; i++) await page.getByTestId(`${testIds.scheduling.selfStudyWeekCountStepper}-plus`).click();
      await expect(page.getByText('52 周', { exact: false })).toBeVisible();
    } finally {
      await withDb((c) => c.query(`DELETE FROM programs WHERE id=$1`, [programId]));
      await withDb((c) => c.query(`DELETE FROM self_study_books WHERE id=$1`, [bookId]));
    }
  });
});
