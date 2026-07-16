import { expect, type Locator, type Page } from '@playwright/test';

// 登录(密码模式,verify.tsx 默认第一次是密码,决策168一页一操作)。
// ⚠️ 必须等真正跳出 /verify 才能返回:submit 后 session 要先持久化到 localStorage,
// router.replace('/') 才把人送到 /home(学员)或 /dashboard(admin/zhumai/aixin)——
// 调用方若紧接着 page.goto(硬导航/整页刷新)测别的路由,页面会重新从 localStorage 读 session,
// 若这时候还没写完就会看不到会话、被弹回 /login(踩过一次:三条用例连坏,根因都是这个race)。
export async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByTestId('login-email-input').fill(email);
  await page.getByTestId('login-next-button').click();
  await expect(page.getByTestId('verify-code-input')).toBeVisible();
  await page.getByTestId('verify-code-input').fill(password);
  await page.getByTestId('verify-submit-button').click();
  await page.waitForURL(/\/(home|dashboard)/, { timeout: 15_000 });
}

export async function logout(page: Page) {
  await page.evaluate(() => localStorage.clear());
}

// RN-Web 的 Pressable disabled 渲染成 aria-disabled="true"(div,非原生<button>),
// Playwright 的 toBeDisabled() 只认原生 disabled 属性/pointer-events,认不出这个——
// 全项目按钮统一走这条,不要在各条用例里各自猜。
export async function expectDisabled(locator: Locator) {
  await expect(locator).toHaveAttribute('aria-disabled', 'true');
}
export async function expectEnabled(locator: Locator) {
  await expect(locator).not.toHaveAttribute('aria-disabled', 'true');
}
