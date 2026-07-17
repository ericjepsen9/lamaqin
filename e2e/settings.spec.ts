import { expect, test } from '@playwright/test';
import { STUDENT_EMAIL, TEST_PASSWORD } from './global-setup';
import { loginAs } from './helpers';
import { testIds } from '../lib/testids';

// 设置页·通知区(决策188方案A·2026-07-17新增)。真机推送到达情况本沙盒环境无法验证
// (同docs/待回写中枢_2026-07-08.md D10已明确的限制),这里只测能在web e2e环境里确定性
// 验证的部分:Platform.OS==='web'时应该直接标"仅移动端支持"、不尝试调用expo-notifications
// 的原生API(那套API在web上语义完全不同,调用了也测不出真实意义,gate掉才是正确行为)。
test.describe('设置页·通知区(决策188方案A)', () => {
  test('web端:学习提醒状态显示"仅移动端支持",不尝试请求原生推送权限', async ({ page }) => {
    await loginAs(page, STUDENT_EMAIL, TEST_PASSWORD);
    await page.goto('/settings', { timeout: 45_000 });
    await expect(page.getByText('学习提醒', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('仅移动端支持', { exact: true })).toBeVisible();
    // web端不应该出现"开启通知"这个按钮(那是给拒绝过原生权限弹窗的人的重试入口,
    // web端语义上不适用)
    await expect(page.getByTestId(testIds.settings.enableNotificationsButton)).not.toBeVisible();
  });
});

// 字号联动(2026-07-17·PM报"设置字号无作用",诊断该bug是否也在web端复现):
//   lib/font-scale.ts 打补丁改写 RN Text/TextInput 的 render,给 fontSize 乘一个倍率;
//   app/_layout.tsx 用 <Stack key={`fs-${scale}`}/> 强制整树重挂载。这条测试只验证web端——
//   sandbox 里没有Docker/安卓环境,没法本地跑通验证,靠推上CI跑这条测试才能拿到"web端到底
//   有没有生效"这个此前一直靠猜的答案。如果这条也红,说明问题不是"安卓原生猜错内部结构"
//   那么简单,web端同样有份;如果绿,才能确认问题只在原生端。
test.describe('字号联动(2026-07-17诊断:web端是否生效)', () => {
  test('设置页把字号改成"大" → 页面文字实际渲染的fontSize按1.32倍放大', async ({ page }) => {
    await loginAs(page, STUDENT_EMAIL, TEST_PASSWORD);
    await page.goto('/settings', { timeout: 45_000 });

    const readFontSize = async () => {
      const px = await page.getByText('字号', { exact: true }).evaluate((el) => getComputedStyle(el).fontSize);
      return Number.parseFloat(px);
    };

    // 默认"标准"=1.15倍;NavRow标题样式写死fontSize:15,即15*1.15=17.25px。
    await expect.poll(readFontSize, { timeout: 5000 }).toBeCloseTo(17.25, 0);

    await page.getByText('大', { exact: true }).click();
    // 15*1.32=19.8px——若这里读到的还是17.25(或原样15),说明补丁在web端也没生效。
    await expect.poll(readFontSize, { timeout: 5000 }).toBeCloseTo(19.8, 0);

    await page.getByText('小', { exact: true }).click();
    // 15*1.0=15px(小=旧标准,补丁应退回无副作用)。
    await expect.poll(readFontSize, { timeout: 5000 }).toBeCloseTo(15, 0);
  });
});
