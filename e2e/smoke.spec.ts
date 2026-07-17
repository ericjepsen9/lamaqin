import { expect, test } from '@playwright/test';
import { getSeedIds, withDb } from './db';
import { COACH_EMAIL, STUDENT_EMAIL, TEST_PASSWORD } from './global-setup';
import { loginAs } from './helpers';

// 5条核心流程(测试缺口盘点建议清单)+ 报数一键复制,快乐路径回归。
// 对应 lib/testids.ts 埋的 testID;每条断言尽量核对到DB写入,不只信UI状态。

test.describe('① OTP登录 → ② 首页', () => {
  test('学员密码登录成功,落到首页且看到快速计数卡', async ({ page }) => {
    await loginAs(page, STUDENT_EMAIL, TEST_PASSWORD);
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByTestId('home-quick-count-card')).toBeVisible();
  });
});

test.describe('③ 修持打卡', () => {
  test('快速计数记一笔 → practice_logs 真写入', async ({ page }) => {
    const { studentId } = await getSeedIds();
    const before = await withDb((c) => c.query(`SELECT count(*) FROM practice_logs WHERE user_id=$1`, [studentId]));
    const beforeCount = Number(before.rows[0].count);

    await loginAs(page, STUDENT_EMAIL, TEST_PASSWORD);
    await page.getByTestId('home-quick-count-card').click();
    await page.getByTestId('qc-digit-5').click();
    await page.getByTestId('qc-record-button').click();
    await expect(page.getByTestId('qc-saved-mark')).toBeVisible();

    const after = await withDb((c) => c.query(`SELECT count(*), max(count) AS last_count FROM practice_logs WHERE user_id=$1`, [studentId]));
    expect(Number(after.rows[0].count)).toBe(beforeCount + 1);
  });
});

test.describe('④ 班级本周课 → ⑤ 课时学习', () => {
  test('本周课程列表可见,进课时标记完成 → study_records 真写入', async ({ page }) => {
    const { lessons, studentId } = await getSeedIds();
    const lesson1 = lessons.find((l) => l.lesson_number === 1)!;

    await loginAs(page, STUDENT_EMAIL, TEST_PASSWORD);
    await page.goto('/class', { timeout: 45_000 }); // Metro 冷编译新路由偶尔较慢,放宽超时(非app问题)
    await expect(page.getByTestId(`class-week-lesson-${lesson1.id}`)).toBeVisible();
    await page.getByTestId(`class-week-lesson-${lesson1.id}`).click();

    await expect(page.getByTestId('lesson-mark-complete-button')).toBeVisible();
    await page.getByTestId('lesson-mark-complete-button').click();
    await expect(page.getByTestId('lesson-mark-confirm-button')).toBeVisible(); // 等确认弹层真正渲染完(slide动画)再点
    await page.getByTestId('lesson-mark-confirm-button').click();
    await page.waitForTimeout(500); // recordStudy 乐观写(不 await),给异步写库留时间(同 boundary.spec.ts 先例)

    const rows = await withDb((c) =>
      c.query(`SELECT study_type FROM study_records WHERE user_id=$1 AND lesson_id=$2`, [studentId, lesson1.id]),
    );
    expect(rows.rows.map((r) => r.study_type)).toContain('listen');
  });
});

test.describe('⑨ 报数一键复制', () => {
  test('辅导员打开班级详情能看到本周报数按钮,内容含总量+回向文案', async ({ page }) => {
    const { cohortId } = await getSeedIds();
    await loginAs(page, COACH_EMAIL, TEST_PASSWORD);
    await page.goto(`/classes/${cohortId}`, { timeout: 45_000 }); // Metro 冷编译新路由偶尔较慢,放宽超时(非app问题)
    await expect(page.getByText('本周报数 · 一键复制')).toBeVisible();
    await page.getByText('本周报数 · 一键复制').click();
    const modalText = page.locator('text=愿以此功德');
    await expect(modalText).toBeVisible();
    await expect(page.getByText(/共 \d+ 人参与/)).toBeVisible();
  });
});
