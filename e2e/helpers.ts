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

// 键盘可达性测试用(测试计划⑥·2026-07-17):真按Tab键顺序移动焦点直到落在目标testID上,
// 不用locator.focus()走捷径——.focus()能强制把焦点怼到任何元素上,连"这个元素压根没被
// 排进Tab顺序(没有tabIndex)"这类真实bug都会被掩盖过去,而这恰恰是键盘可达性测试真正要
// 揪出来的问题(RN-Web的Pressable默认键盘可达性不保证,见文件顶部测试计划⑥注释)。
export async function tabTo(page: Page, testId: string, maxTabs = 25) {
  for (let i = 0; i < maxTabs; i++) {
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
    if (focused === testId) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`Tab导航${maxTabs}次仍未到达 testID="${testId}"(可能没被排进Tab顺序,或压根不是可聚焦元素)`);
}
