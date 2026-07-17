import { AxeBuilder } from '@axe-core/playwright';
import type { AxeResults } from 'axe-core';
import { expect, test } from '@playwright/test';
import { getSeedIds } from './db';
import { STUDENT_EMAIL, TEST_PASSWORD } from './global-setup';
import { loginAs, tabTo } from './helpers';
import { testIds } from '../lib/testids';

// A7无障碍(屏幕阅读器)覆盖率·2026-07-14 PM拍板范围="聚焦核心流程"(非全站扫)。
// 只测盲人/聋人学员真的会自己摸黑操作的几条关键路径:登录/验证码、首页、快速计数打卡、
// 课时详情的听/读/标记完成流程——后台管理页不在本轮范围。
//
// 课时详情额外拆盲(a11y=blind)/聋(a11y=deaf)两个变体扫:lesson/[id].tsx 本身已有真实的
// 盲聋无障碍模式(DR-92,profiles.accessibility_needs,免看免答/免听免答两套UI分支),只扫
// 默认(有视力)变体等于完全没扫到这个功能实际服务的那群人会看到的页面。a11y URL参数是该文件
// 自己注释声明的"仅作测试覆盖"口子,不是新开的后门。
//
// 断言口径(同 resilience.spec.ts A5弱网模拟先例"如实记录不预设"):axe默认规则集里
// serious/moderate/minor 这几档在RN-Web渲染方式下有不少已知噪音(比如纯装饰div被判定缺
// landmark、Modal无role="dialog"这类"最佳实践"而非"确定断障"的规则),这轮还没人工triage过,
// 不能不看内容就假定该fail。只硬挡 impact='critical'(axe这档基本等于"此元素对屏幕阅读器
// 完全不可达/没有可访问名称",误报率低,直接当bug);critical以下打完整清单进console.log,
// 交PM人工过一遍再决定哪些真要修、哪些是RN-Web已知噪音。
function reportAndAssertNoCritical(label: string, results: AxeResults) {
  const byImpact: Record<string, number> = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const v of results.violations) {
    const impact = v.impact ?? 'minor';
    byImpact[impact] = (byImpact[impact] ?? 0) + v.nodes.length;
  }
  console.log(`[A7无障碍扫描·${label}] critical=${byImpact.critical} serious=${byImpact.serious} moderate=${byImpact.moderate} minor=${byImpact.minor}`);
  for (const v of results.violations) {
    console.log(`  - [${v.impact ?? 'minor'}] ${v.id}: ${v.help}(${v.nodes.length}处) ${v.helpUrl}`);
  }
  const critical = results.violations.filter((v) => v.impact === 'critical');
  expect(critical, `${label} 发现 critical 级无障碍问题:${JSON.stringify(critical.map((v) => v.id))}`).toEqual([]);
}

test.describe('A7无障碍扫描(聚焦核心流程·2026-07-14)', () => {
  test('登录页', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByTestId('login-email-input')).toBeVisible();
    reportAndAssertNoCritical('登录页', await new AxeBuilder({ page }).analyze());
  });

  test('验证码页(密码模式,决策168一页一操作)', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-email-input').fill(STUDENT_EMAIL);
    await page.getByTestId('login-next-button').click();
    await expect(page.getByTestId('verify-code-input')).toBeVisible();
    reportAndAssertNoCritical('验证码页', await new AxeBuilder({ page }).analyze());
  });

  test('首页', async ({ page }) => {
    await loginAs(page, STUDENT_EMAIL, TEST_PASSWORD);
    await expect(page.getByTestId('home-quick-count-card')).toBeVisible();
    reportAndAssertNoCritical('首页', await new AxeBuilder({ page }).analyze());
  });

  test('快速计数打卡弹层', async ({ page }) => {
    await loginAs(page, STUDENT_EMAIL, TEST_PASSWORD);
    await page.getByTestId('home-quick-count-card').click();
    await expect(page.getByTestId('qc-record-button')).toBeVisible();
    reportAndAssertNoCritical('快速计数打卡弹层', await new AxeBuilder({ page }).analyze());
  });

  test('课时详情(默认·有视力)', async ({ page }) => {
    const { lessons } = await getSeedIds();
    const lesson1 = lessons.find((l) => l.lesson_number === 1)!;
    await loginAs(page, STUDENT_EMAIL, TEST_PASSWORD);
    await page.goto(`/lesson/${lesson1.id}?step=wensi`, { timeout: 45_000 }); // Metro 冷编译新路由偶尔较慢,放宽超时(非app问题)
    await expect(page.getByTestId('lesson-mark-complete-button')).toBeVisible();
    reportAndAssertNoCritical('课时详情(默认)', await new AxeBuilder({ page }).analyze());
  });

  test('课时详情·标记完成确认弹层(只扫渲染,不点确认·不产生study_records)', async ({ page }) => {
    const { lessons } = await getSeedIds();
    const lesson1 = lessons.find((l) => l.lesson_number === 1)!;
    await loginAs(page, STUDENT_EMAIL, TEST_PASSWORD);
    await page.goto(`/lesson/${lesson1.id}?step=wensi`, { timeout: 45_000 });
    await page.getByTestId('lesson-mark-complete-button').click();
    await expect(page.getByTestId('lesson-mark-confirm-button')).toBeVisible(); // 等确认弹层真正渲染完(slide动画)再扫
    reportAndAssertNoCritical('课时详情·标记完成确认弹层', await new AxeBuilder({ page }).analyze());
  });

  test('课时详情·盲人模式(a11y=blind,免看免答·纯音频)', async ({ page }) => {
    const { lessons } = await getSeedIds();
    const lesson1 = lessons.find((l) => l.lesson_number === 1)!;
    await loginAs(page, STUDENT_EMAIL, TEST_PASSWORD);
    await page.goto(`/lesson/${lesson1.id}?step=wensi&a11y=blind`, { timeout: 45_000 });
    await expect(page.getByTestId('lesson-mark-complete-button')).toBeVisible();
    reportAndAssertNoCritical('课时详情·盲人模式', await new AxeBuilder({ page }).analyze());
  });

  test('课时详情·聋人模式(a11y=deaf,免听免答·看两遍)', async ({ page }) => {
    const { lessons } = await getSeedIds();
    const lesson1 = lessons.find((l) => l.lesson_number === 1)!;
    await loginAs(page, STUDENT_EMAIL, TEST_PASSWORD);
    await page.goto(`/lesson/${lesson1.id}?step=wensi&a11y=deaf`, { timeout: 45_000 });
    await expect(page.getByTestId('lesson-mark-complete-button')).toBeVisible();
    reportAndAssertNoCritical('课时详情·聋人模式', await new AxeBuilder({ page }).analyze());
  });
});

// 键盘可达性(测试计划⑥·2026-07-17,与A7无障碍工作合并,同PM计划文档建议)。
// axe-core扫的是"有没有可访问名称/ARIA标签",不管"这个东西能不能被键盘操作"——两件独立的
// 事,之前完全没测过后者。RN-Web的Pressable底层渲染成普通div,键盘可达性(能被Tab聚焦到、
// 聚焦后Enter/Space能触发onPress)不是白拿的,要实测才知道。
//
// 用tabTo()真按Tab键顺序移动焦点(不用locator.focus()抄近道——那样连"这个元素压根没被排进
// Tab顺序"这类真实bug都会被掩盖),Enter激活,全程不调用一次.click()。
test.describe('键盘可达性(核心路径·2026-07-17)', () => {
  test('登录→首页→打卡:全程只用Tab+Enter,不用鼠标点击,能走完整条核心路径', async ({ page }) => {
    await page.goto('/login');
    await tabTo(page, testIds.login.emailInput);
    await page.keyboard.type(STUDENT_EMAIL);
    await tabTo(page, testIds.login.nextButton);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId(testIds.verify.codeInput)).toBeVisible({ timeout: 10_000 });

    await tabTo(page, testIds.verify.codeInput);
    await page.keyboard.type(TEST_PASSWORD);
    await tabTo(page, testIds.verify.submitButton);
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/(home|dashboard)/, { timeout: 15_000 });

    await expect(page.getByTestId(testIds.home.quickCountCard)).toBeVisible();
    await tabTo(page, testIds.home.quickCountCard);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId(testIds.quickCount.recordButton)).toBeVisible({ timeout: 10_000 });

    // initialVow默认已选中第1个修法,不需要先键盘操作vowChip;直接按数字键"1"
    await tabTo(page, testIds.quickCount.digitKey(1));
    await page.keyboard.press('Enter');
    await tabTo(page, testIds.quickCount.recordButton);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId(testIds.quickCount.savedMark)).toBeVisible({ timeout: 10_000 });
  });
});
