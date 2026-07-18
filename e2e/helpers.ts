import { differenceInCalendarMonths } from 'date-fns';
import { expect, type Locator, type Page } from '@playwright/test';

import { testIds } from '../lib/testids';

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

// 点开日期字段(AdminDateField/DatePickerModal 共用·2026-07-18 后台日期录入体验审计改造后新用)。
// 日历弹层默认打开"今天所在月"(该字段原本为空时,MonthCalendar 用 startOfMonth(value ?? new Date())),
// 按目标日期跟今天差几个月算翻页次数——不假设固定翻页方向/次数,新旧代码跑到哪天都对。
// scope 传 fieldTestId 本身(AdminDateField 把自己的 testID 转发给 DatePickerModal 当 scopeId)——
// CI 真机跑到:同屏两个日期字段(如法会起止日期)各自的 DatePickerModal 会同时挂载在 DOM 里
// (RN Modal web 端不摘除),不加区分会撞 Playwright 严格模式(2026-07-18 修)。
export async function pickDate(page: Page, fieldTestId: string, targetDate: string) {
  await page.getByTestId(fieldTestId).click();
  const target = new Date(`${targetDate}T00:00:00`);
  const months = differenceInCalendarMonths(target, new Date());
  const navTestId = months >= 0 ? testIds.calendarPicker.nextMonthButton(fieldTestId) : testIds.calendarPicker.prevMonthButton(fieldTestId);
  for (let i = 0; i < Math.abs(months); i++) await page.getByTestId(navTestId).click();
  await page.getByTestId(testIds.calendarPicker.dayCell(targetDate, fieldTestId)).click();
}

// 点开时间字段(AdminTimeField/TimePickerModal 共用·同上审计改造新用)。分钟须为5的倍数
// (TimePickerModal 网格步进定死5分钟),调用方传非5倍数会点不中对应格子、卡在弹层里。
// scope 同 pickDate 那份道理(同屏两个时间字段,如共修起止时间,需要区分)。
export async function pickTime(page: Page, fieldTestId: string, hhmm: string) {
  await page.getByTestId(fieldTestId).click();
  const [h, m] = hhmm.split(':').map(Number);
  await page.getByTestId(testIds.timePicker.hourCell(h, fieldTestId)).click();
  await page.getByTestId(testIds.timePicker.minuteCell(m, fieldTestId)).click();
  await page.getByTestId(testIds.timePicker.confirmButton(fieldTestId)).click();
}
