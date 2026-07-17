import { expect, test } from '@playwright/test';
import { createTestProfile, deleteTestProfile, withDb } from './db';
import { ADMIN_EMAIL, TEST_PASSWORD } from './global-setup';
import { loginAs } from './helpers';
import { testIds } from '../lib/testids';

// 学员审批与创建 系统性覆盖(2026-07-16·PM"系统性测试包括点击")。
// 此前 /students 这整个路由零e2e覆盖(包括"批准入学"这个最基础的按钮)。这批重点覆盖
// 2026-07-15当天新做的两件事:①拒绝改可逆(student-actions.tsx) ②后台直接创建学员账号
// (admin-create-student Edge Function)。
//
// ⚠️ 视口用 Desktop Chrome 默认1280宽,≥900触发宽屏 Master-Detail 布局(见 students/index.tsx
// 的 WIDE 断点)——选中学员是点左栏卡片,不是导航到 /students/[id] 这个独立路由(那是窄屏才走)。
//
// ⚠️ "创建学员账号"这条测试依赖 admin-create-student 这个 Edge Function 在本地栈里真的被
// serve 起来。`supabase start` 默认会起 edge-runtime 容器自动 serve supabase/functions/ 下的
// 函数(标准CLI行为,不需要额外部署步骤,这点跟"部署到 sss-dev 需要 Eric 手动 deploy+设密钥"
// 是两件不同的事——本地栈是自包含的)。但这一点本会话没法用真实 Docker 验证,如果这条测试报
// "network error"/连不上函数一类的错,先确认本地栈的 edge-runtime 容器是否真的起来了
// (npx supabase status 应该能看到 Edge Functions 那一行),这属于环境问题,不是产品代码bug。

test.describe('学员审批:批准/拒绝/拒绝后重新批准(2026-07-15·拒绝不再是终态)', () => {
  test('待审批学员 → 批准 → 状态变为在读', async ({ page }) => {
    const email = `e2e-approve-${Date.now()}@local.test`;
    const name = `E2E待审批甲-${Date.now()}`;
    const userId = await createTestProfile(email, name);
    try {
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);
      await page.goto('/students', { timeout: 45_000 });
      await page.getByText(name, { exact: true }).first().click();
      await expect(page.getByTestId(testIds.students.approveButton)).toBeVisible({ timeout: 10_000 });
      await page.getByTestId(testIds.students.approveButton).click();
      await page.waitForTimeout(800);
      const { rows } = await withDb((c) => c.query(`SELECT status FROM profiles WHERE id=$1`, [userId]));
      expect(rows[0].status).toBe('active');
    } finally {
      await deleteTestProfile(userId);
    }
  });

  test('待审批学员 → 拒绝(需二次确认) → 状态变为未通过', async ({ page }) => {
    const email = `e2e-reject-${Date.now()}@local.test`;
    const name = `E2E待审批乙-${Date.now()}`;
    const userId = await createTestProfile(email, name);
    try {
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);
      await page.goto('/students', { timeout: 45_000 });
      await page.getByText(name, { exact: true }).first().click();
      await expect(page.getByTestId(testIds.students.rejectButton)).toBeVisible({ timeout: 10_000 });
      page.once('dialog', (d) => { void d.accept(); });
      await page.getByTestId(testIds.students.rejectButton).click();
      await page.waitForTimeout(800);
      const { rows } = await withDb((c) => c.query(`SELECT status FROM profiles WHERE id=$1`, [userId]));
      expect(rows[0].status).toBe('rejected');
    } finally {
      await deleteTestProfile(userId);
    }
  });

  test('⭐已拒绝学员 → 仍能点"批准入学"重新放行(2026-07-15修:拒绝不再是终态,回归锁定)', async ({ page }) => {
    const email = `e2e-reapprove-${Date.now()}@local.test`;
    const name = `E2E已拒绝丙-${Date.now()}`;
    const userId = await createTestProfile(email, name);
    // ⚠️真机CI实测发现的坑:set_config的旁路是SESSION级(is_local=false),但withDb()每次调用
    // 都开一条新连接、用完即关——分开三次withDb()调用意味着"打开旁路"和"UPDATE"根本不在同一条
    // 连接/会话上,旁路对UPDATE完全不生效,profiles_protect_status触发器会把status悄悄revert回
    // 原值('pending'),profile实际从未变成'rejected'——这正是本文件这条测试之前真机跑会失败的
    // 根因(不是app代码bug,是这条测试自己的DB操作没生效)。必须在同一个withDb()回调里、用同一个
    // client连续执行三条语句。
    await withDb(async (c) => {
      await c.query(`SELECT set_config('app.allow_protected_write','on',false)`);
      await c.query(`UPDATE profiles SET status='rejected' WHERE id=$1`, [userId]);
      await c.query(`SELECT set_config('app.allow_protected_write','off',false)`);
    });
    try {
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);
      await page.goto('/students', { timeout: 45_000 });
      await page.getByText(name, { exact: true }).first().click();
      // 拒绝按钮此时不应该出现(isPending gate,rejected已不是pending)
      await expect(page.getByTestId(testIds.students.rejectButton)).not.toBeVisible({ timeout: 10_000 });
      // 批准按钮应该仍然可见可点(这是今天改动的核心断言)
      const approveBtn = page.getByTestId(testIds.students.approveButton);
      await expect(approveBtn).toBeVisible();
      await approveBtn.click();
      await page.waitForTimeout(800);
      const { rows } = await withDb((c) => c.query(`SELECT status FROM profiles WHERE id=$1`, [userId]));
      expect(rows[0].status).toBe('active');
    } finally {
      await deleteTestProfile(userId);
    }
  });
});

test.describe('后台创建学员账号(2026-07-15新功能,免手机端注册)', () => {
  test('填表提交 → 新账号直接是在读状态,首次登录需强制改密码', async ({ page }) => {
    const email = `e2e-admincreate-${Date.now()}@local.test`;
    const name = `E2E后台创建-${Date.now()}`;
    let createdUserId: string | null = null;
    try {
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);
      await page.goto('/students', { timeout: 45_000 });
      await page.getByTestId(testIds.students.createButton).click();
      await page.getByTestId(testIds.students.createEmailInput).fill(email);
      await page.getByTestId(testIds.students.createPasswordInput).fill('E2E-Test-00000000');
      await page.getByTestId(testIds.students.createNameInput).fill(name);
      await page.getByTestId(testIds.students.createSubmitButton).click();
      await expect(page.getByTestId(testIds.students.createEmailInput)).not.toBeVisible({ timeout: 15_000 });

      const { rows } = await withDb((c) =>
        c.query(`SELECT id, status, data_source, must_change_password FROM profiles WHERE email=$1`, [email]),
      );
      expect(rows.length).toBe(1);
      createdUserId = rows[0].id;
      expect(rows[0].status).toBe('active');
      expect(rows[0].data_source).toBe('admin_created');
      expect(rows[0].must_change_password).toBe(true);
    } finally {
      if (createdUserId) await deleteTestProfile(createdUserId);
    }
  });

  test('重复邮箱 → 显示友好错误,不崩溃(Edge Function走真实GoTrue Admin API,不是老学员导入那种裸SQL插入,应给出干净错误)', async ({ page }) => {
    const email = `e2e-admincreate-dup-${Date.now()}@local.test`;
    const name1 = `E2E重复甲-${Date.now()}`;
    const name2 = `E2E重复乙-${Date.now()}`;
    let firstUserId: string | null = null;
    try {
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);
      await page.goto('/students', { timeout: 45_000 });

      await page.getByTestId(testIds.students.createButton).click();
      await page.getByTestId(testIds.students.createEmailInput).fill(email);
      await page.getByTestId(testIds.students.createPasswordInput).fill('E2E-Test-00000000');
      await page.getByTestId(testIds.students.createNameInput).fill(name1);
      await page.getByTestId(testIds.students.createSubmitButton).click();
      await expect(page.getByTestId(testIds.students.createEmailInput)).not.toBeVisible({ timeout: 15_000 });
      const { rows } = await withDb((c) => c.query(`SELECT id FROM profiles WHERE email=$1`, [email]));
      firstUserId = rows[0].id;

      // 第二次用同一个邮箱创建 → 应该报错,不是静默成功/崩溃
      await page.getByTestId(testIds.students.createButton).click();
      await page.getByTestId(testIds.students.createEmailInput).fill(email);
      await page.getByTestId(testIds.students.createPasswordInput).fill('E2E-Test-00000000');
      await page.getByTestId(testIds.students.createNameInput).fill(name2);
      await page.getByTestId(testIds.students.createSubmitButton).click();
      // 弹层应该还开着(没有静默成功关闭)
      await page.waitForTimeout(2000);
      await expect(page.getByTestId(testIds.students.createEmailInput)).toBeVisible();
      const { rows: rows2 } = await withDb((c) => c.query(`SELECT count(*) FROM profiles WHERE email=$1`, [email]));
      expect(Number(rows2[0].count)).toBe(1); // 没有因为重复提交多建出第二条
    } finally {
      if (firstUserId) await deleteTestProfile(firstUserId);
    }
  });
});
