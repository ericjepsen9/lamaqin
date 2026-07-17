import { expect, test } from '@playwright/test';
import { createTestProfile, deleteTestProfile, withDb } from './db';
import { TEST_PASSWORD } from './global-setup';
import { testIds } from '../lib/testids';

// 强制改密码闸门(profiles.must_change_password=true → /set-password?forced=1)回归测试。
//
// 2026-07-17·PM报告"登录流程无限循环卡在重设密码页面,也不能返回、跳过"——真根因:
// set-password.tsx 提交成功后只写了DB,没同步更新 useCurrentUser() 的 React Query 缓存;
// proceed() 跳回入口闸门(index.tsx)时,闸门这一次渲染读到的还是缓存里旧值
// (mustChangePassword:true),立刻把人 redirect 回 /set-password?forced=1——forced 模式
// 又没有跳过按钮,于是真死循环(这条此前完全零e2e覆盖:唯一相关测试
// admin-student-management.spec.ts 只断言"创建时 must_change_password=true 被正确写入",
// 从没模拟过"这个学员真的登录、走完这一页"这一步,所以死循环漏到了PM手动测才发现)。
//
// 这里不能用 helpers.ts 的 loginAs()(它断言登录后落在 /home 或 /dashboard,但这个场景
// 应该先落在 /set-password),手动走完登录两步。

test.describe('强制改密码闸门:回归"无限循环卡在重设密码页面"(2026-07-17修)', () => {
  test('must_change_password=true 学员登录 → 落在强制改密码页 → 提交新密码 → 真正放行、不再被弹回', async ({ page }) => {
    const email = `e2e-mustchange-${Date.now()}@local.test`;
    const name = `E2E强制改密-${Date.now()}`;
    const userId = await createTestProfile(email, name);
    // status 是 profiles_protect_status 触发器保护字段,需同连接 set_config 旁路(2026-07-16
    // 已踩过的坑,见 admin-attendance.spec.ts);must_change_password 不在保护字段清单里,
    // 普通 UPDATE 即可。
    await withDb(async (c) => {
      await c.query(`SELECT set_config('app.allow_protected_write','on',false)`);
      await c.query(`UPDATE profiles SET status='active' WHERE id=$1`, [userId]);
      await c.query(`SELECT set_config('app.allow_protected_write','off',false)`);
    });
    await withDb((c) => c.query(`UPDATE profiles SET must_change_password=true WHERE id=$1`, [userId]));

    try {
      await page.goto('/login');
      await page.getByTestId('login-email-input').fill(email);
      await page.getByTestId('login-next-button').click();
      await expect(page.getByTestId('verify-code-input')).toBeVisible();
      await page.getByTestId('verify-code-input').fill(TEST_PASSWORD);
      await page.getByTestId('verify-submit-button').click();

      // 强制闸门:必须落在 /set-password?forced=1,不能直接进 /home
      await page.waitForURL(/\/set-password/, { timeout: 15_000 });
      await expect(page.getByText('请先设置你自己的密码', { exact: false })).toBeVisible();
      // forced 模式没有"先跳过"这个按钮,只有"退出登录"逃生口
      await expect(page.getByText('先跳过', { exact: false })).not.toBeVisible();
      await expect(page.getByTestId(testIds.setPassword.signOutButton)).toBeVisible();

      const newPwd = 'E2E-New-Pwd-00000000';
      await page.getByTestId(testIds.setPassword.pwdInput).fill(newPwd);
      await page.getByTestId(testIds.setPassword.pwd2Input).fill(newPwd);
      await page.getByTestId(testIds.setPassword.submitButton).click();

      // 核心回归断言:这里此前会被弹回 /set-password?forced=1(死循环),现在应该真正放行到 /home。
      await page.waitForURL(/\/home/, { timeout: 15_000 });

      // 硬刷新重新整页加载(不带任何客户端缓存)独立验证:DB 层真的写回了 false,
      // 不是只在客户端缓存"看起来"过了关——否则下次登录会重新触发这条闸门。
      await page.reload();
      await page.waitForURL(/\/home/, { timeout: 15_000 });

      const { rows } = await withDb((c) => c.query(`SELECT must_change_password FROM profiles WHERE id=$1`, [userId]));
      expect(rows[0].must_change_password).toBe(false);
    } finally {
      await deleteTestProfile(userId);
    }
  });
});
