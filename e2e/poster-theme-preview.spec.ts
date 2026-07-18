import { expect, type Locator, test } from '@playwright/test';
import { ADMIN_EMAIL, TEST_PASSWORD } from './global-setup';
import { loginAs } from './helpers';
import { testIds } from '../lib/testids';

// 画报强调色/透明度 实时预览窗(2026-07-18新增·PM"先做预览窗"):验证预览窗真的随表单联动,
// 不是摆设。走"新增法会期画报"表单(不需要先有种子画报数据),全程不点保存、不写库——
// 只验证 PosterThemePreview 里 tab 栏那层背景色随强调色/透明度输入实时变化。
async function bgRgba(locator: Locator) {
  const css = await locator.evaluate((el) => getComputedStyle(el).backgroundColor);
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(css);
  if (!m) throw new Error(`无法解析背景色:${css}`);
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] !== undefined ? Number(m[4]) : 1 };
}

test.describe('画报强调色实时预览窗', () => {
  test('未设置强调色时预览走默认色;输入色值/切透明度后预览实时同步', async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);
    await page.goto('/poster-calendar', { timeout: 45_000 });

    await page.getByText('法会期画报', { exact: true }).click();
    await page.getByText('＋ 新增法会期画报', { exact: true }).click();

    const previewBg = page.getByTestId(testIds.posterTheme.previewTabBarBg);
    await expect(previewBg).toBeVisible();

    // 默认(未设置强调色):跟 app/(student)/_layout.tsx::DEFAULT_BAR_BG 一致
    const before = await bgRgba(previewBg);
    expect(before).toEqual({ r: 251, g: 244, b: 233, a: 0.72 });

    // 输入色值(藏红 #e07856)→ 预览默认按"中"透明度(0.55)显示,不用另外点透明度控件
    await page.getByTestId(testIds.posterTheme.hexInput).fill('#e07856');
    await expect.poll(async () => bgRgba(previewBg)).toEqual({ r: 224, g: 120, b: 86, a: 0.55 });

    // 切"深"(0.75)→ 预览透明度同步变,颜色不变
    await page.getByText('深', { exact: true }).click();
    await expect.poll(async () => bgRgba(previewBg)).toEqual({ r: 224, g: 120, b: 86, a: 0.75 });

    // 切"浅"(0.35)
    await page.getByText('浅', { exact: true }).click();
    await expect.poll(async () => bgRgba(previewBg)).toEqual({ r: 224, g: 120, b: 86, a: 0.35 });

    // 清空色值(点"默认")→ 预览恢复默认色(不再叠强调色)
    await page.getByText('默认', { exact: true }).click();
    await expect.poll(async () => bgRgba(previewBg)).toEqual({ r: 251, g: 244, b: 233, a: 0.72 });
  });
});
