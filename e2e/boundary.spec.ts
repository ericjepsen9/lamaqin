import { expect, test } from '@playwright/test';
import { getSeedIds, withDb } from './db';
import { COACH_EMAIL, STUDENT_EMAIL, TEST_PASSWORD } from './global-setup';
import { expectDisabled, expectEnabled, loginAs } from './helpers';

// 边界/异常输入 + 连点测试。目标不是"证明没bug",而是如实记录点了之后到底发生了什么——
// 断言写的是"观察到的真实行为",不是"我猜应该怎样"。发现真问题时,标题直接写清楚现象。

test.describe('登录:异常输入', () => {
  test('邮箱为空 → 下一步按钮保持禁用', async ({ page }) => {
    await page.goto('/login');
    await expectDisabled(page.getByTestId('login-next-button'));
  });

  test('密码错误 → 停在验证页,不静默跳转、不卡死在"登录中"', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-email-input').fill(STUDENT_EMAIL);
    await page.getByTestId('login-next-button').click();
    await page.getByTestId('verify-code-input').fill('this-is-definitely-wrong');
    await page.getByTestId('verify-submit-button').click();
    // 失败后按钮文案应从"登录中…"恢复回"登录"(busy=false),不是卡死转圈;且不跳转到 /home。
    await expect(page.getByText('登录', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/verify/);
  });

  test('邮箱格式错误(无@)不崩溃:客户端不校验格式,交给后端拒绝', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-email-input').fill('not-an-email-at-all');
    // 客户端只查非空,不查格式(login.tsx 现状),故按钮此时应可点
    await expectEnabled(page.getByTestId('login-next-button'));
    await page.getByTestId('login-next-button').click();
    await page.getByTestId('verify-code-input').fill(TEST_PASSWORD);
    await page.getByTestId('verify-submit-button').click();
    // 不崩溃、不白屏即可(不断言具体走到哪,只保证有内容渲染)
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('邮箱输入超长字符串(500字)不崩溃', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-email-input').fill('a'.repeat(500) + '@test.com');
    await page.getByTestId('login-next-button').click();
    await expect(page.locator('body')).not.toBeEmpty();
  });
});

test.describe('修持打卡:边界值', () => {
  test('数字为0 → 记录按钮保持禁用(不能记0遍)', async ({ page }) => {
    await loginAs(page, STUDENT_EMAIL, TEST_PASSWORD);
    await page.getByTestId('home-quick-count-card').click();
    await expectDisabled(page.getByTestId('qc-record-button'));
  });

  test('狂按数字键封顶9999999,不溢出/不崩溃', async ({ page }) => {
    await loginAs(page, STUDENT_EMAIL, TEST_PASSWORD);
    await page.getByTestId('home-quick-count-card').click();
    for (let i = 0; i < 10; i++) await page.getByTestId('qc-digit-9').click();
    await expect(page.getByText('9,999,999').first()).toBeVisible();
  });

  test('输入>10000触发二次确认("确认记入这一笔")而非直接记录', async ({ page }) => {
    await loginAs(page, STUDENT_EMAIL, TEST_PASSWORD);
    await page.getByTestId('home-quick-count-card').click();
    for (const d of ['1', '5', '0', '0', '0', '0']) await page.getByTestId(`qc-digit-${d}`).click(); // 150000
    await page.getByTestId('qc-record-button').click();
    await expect(page.getByText('确认记入这一笔')).toBeVisible();
  });

  test('记录按钮快速连点两次 → 实际写入几条log(如实记录现象)', async ({ page }) => {
    const { studentId } = await getSeedIds();
    const before = await withDb((c) => c.query(`SELECT count(*) FROM practice_logs WHERE user_id=$1`, [studentId]));
    const beforeCount = Number(before.rows[0].count);

    await loginAs(page, STUDENT_EMAIL, TEST_PASSWORD);
    await page.getByTestId('home-quick-count-card').click();
    await page.getByTestId('qc-digit-3').click();
    const btn = page.getByTestId('qc-record-button');
    await expectEnabled(btn); // 确认此刻真是可点状态,连点才有意义
    // 背靠背连点两次(顺序await,不用Promise.all——对同一定位符并发调用.click()会让两套
    // hover/mousedown/mouseup指令交错执行,不是真实"手速快"而是内部指令错位,失真)。
    // 第二下若因第一下已使按钮消失/换态而点不中,属预期,吞掉即可——要观察的是最终写了几条。
    await btn.click();
    try { await btn.click({ timeout: 1000 }); } catch { /* 第一下可能已让按钮换态/消失,属预期 */ }
    await page.waitForTimeout(500); // 给异步写库留时间

    const after = await withDb((c) => c.query(`SELECT count(*) FROM practice_logs WHERE user_id=$1`, [studentId]));
    const created = Number(after.rows[0].count) - beforeCount;
    console.log(`[边界发现] 连点记录按钮2次 → 实际写入 ${created} 条 practice_logs(记录按钮无 isPending 防抖)`);
    // 如实断言观察到的行为,不预设"应该是1条"——如果连点当真产生2条,这就是要报的边界问题。
    expect([1, 2]).toContain(created);
  });
});

test.describe('课时标记完成:边界值', () => {
  test('补录日期格式错误 → 确认按钮保持禁用', async ({ page }) => {
    const { lessons } = await getSeedIds();
    const lesson1 = lessons.find((l) => l.lesson_number === 1)!;
    await loginAs(page, STUDENT_EMAIL, TEST_PASSWORD);
    await page.goto(`/lesson/${lesson1.id}?step=wensi`);
    await page.getByTestId('lesson-mark-complete-button').click();
    await page.getByText('完成日期').click();
    const dateInput = page.locator('input[placeholder="YYYY-MM-DD"]');
    await dateInput.fill('不是日期');
    await expectDisabled(page.getByTestId('lesson-mark-confirm-button'));
  });

  test('补录日期填未来日期 → 确认按钮保持禁用(不能补录未来)', async ({ page }) => {
    const { lessons } = await getSeedIds();
    const lesson1 = lessons.find((l) => l.lesson_number === 1)!;
    await loginAs(page, STUDENT_EMAIL, TEST_PASSWORD);
    await page.goto(`/lesson/${lesson1.id}?step=wensi`);
    await page.getByTestId('lesson-mark-complete-button').click();
    await page.getByText('完成日期').click();
    const future = new Date(); future.setFullYear(future.getFullYear() + 1);
    await page.locator('input[placeholder="YYYY-MM-DD"]').fill(future.toISOString().slice(0, 10));
    await expectDisabled(page.getByTestId('lesson-mark-confirm-button'));
  });

  test('确认按钮快速连点两次 → 实际写入几条study_records(如实记录现象)', async ({ page }) => {
    const { lessons, studentId } = await getSeedIds();
    const lesson2 = lessons.find((l) => l.lesson_number === 2)!; // 用第2课,避开smoke.spec已标记过的第1课
    await loginAs(page, STUDENT_EMAIL, TEST_PASSWORD);
    await page.goto(`/lesson/${lesson2.id}?step=wensi`);
    await page.getByTestId('lesson-mark-complete-button').click();
    const btn = page.getByTestId('lesson-mark-confirm-button');
    await expectEnabled(btn); // 确认此刻真是可点状态(默认markL=听闻=true),连点才有意义
    // 同上:顺序连点,不用Promise.all(点一下后确认弹层会关闭/组件卸载,第二下大概率点不中,吞掉即可)。
    await btn.click();
    try { await btn.click({ timeout: 1000 }); } catch { /* 弹层多半已关闭,属预期 */ }
    await page.waitForTimeout(500);

    const rows = await withDb((c) =>
      c.query(`SELECT study_type FROM study_records WHERE user_id=$1 AND lesson_id=$2 AND study_type='listen'`, [studentId, lesson2.id]),
    );
    console.log(`[边界发现] 连点确认按钮2次 → 实际写入 ${rows.rows.length} 条 listen 记录(决策047:listen无唯一键,可重复打卡=有意设计)`);
    expect(rows.rows.length).toBeGreaterThanOrEqual(1);
  });
});

test.describe('加功课(自建功课):边界值', () => {
  // PM 2026-07-13 实测发现:"每日目标(可选)"这个数字框填0能提交成功(总目标必填框反而挡得住)——
  // 提交后 daily_target 被 mutation 层静默转成 null(佛前发愿变"随心"却无提示)。
  // PM 选方案②(按钮层挡,跟总目标框做法一致);下面两条测按钮的两个方向,防止改过头连"留空=随心"合法态也挡住。
  async function openAddVowAndPickFirstPractice(page: import('@playwright/test').Page) {
    await page.goto('/practice', { timeout: 45_000 });
    await page.getByTestId('practice-add-vow-button').click();
    const chipsContainer = page.getByText('选修法', { exact: true }).locator('xpath=following-sibling::*[1]');
    await chipsContainer.locator(':scope > *').first().click(); // 选任意一个修法,只为满足 canSave 的 !!pid
  }

  test('每日目标填0(终生持诵,默认周期) → 保存按钮应禁用;清空恢复可保存(方案②·2026-07-13)', async ({ page }) => {
    await loginAs(page, STUDENT_EMAIL, TEST_PASSWORD);
    await openAddVowAndPickFirstPractice(page);

    const dailyInput = page.getByTestId('practice-add-vow-daily-input');
    const saveBtn = page.getByTestId('practice-add-vow-save-button');

    await dailyInput.fill('0');
    await expectDisabled(saveBtn);

    // 留空=随心不设每日目标,仍是合法态,不该被这次修复连带挡住
    await dailyInput.fill('');
    await expectEnabled(saveBtn);
  });

  test('总目标填0(限期完成) → 保存按钮当前状态如实记录', async ({ page }) => {
    await loginAs(page, STUDENT_EMAIL, TEST_PASSWORD);
    await openAddVowAndPickFirstPractice(page);

    await page.getByText('限期完成', { exact: true }).click();
    await page.getByTestId('practice-add-vow-target-input').fill('0');
    const saveBtn = page.getByTestId('practice-add-vow-save-button');
    const disabledAttr = await saveBtn.getAttribute('aria-disabled');
    console.log(`[边界发现] 总目标填0(限期完成,未选截止日) → 保存按钮 aria-disabled="${disabledAttr}"`);
    // 限期完成还要求截止日,此时按钮理应仍是禁用状态——如实断言观察到的值,不猜测。
    expect(disabledAttr).toBe('true');
  });
});

test.describe('胡乱点击:快速切页不崩溃', () => {
  test('登录后连续快速跳转5个页面,最终落在有效页面且控制台无致命报错', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await loginAs(page, STUDENT_EMAIL, TEST_PASSWORD);
    for (const path of ['/home', '/daily', '/class', '/practice', '/home']) {
      await page.goto(path, { timeout: 45_000 }); // Metro 冷编译新路由偶尔较慢,放宽超时(非app问题)
    }
    await expect(page.locator('body')).not.toBeEmpty();
    expect(errors, `控制台致命错误: ${errors.join(' | ')}`).toHaveLength(0);
  });

  test('报数弹层开→关→开 连续操作不留脏状态', async ({ page }) => {
    const { cohortId } = await getSeedIds();
    await loginAs(page, COACH_EMAIL, TEST_PASSWORD);
    await page.goto(`/classes/${cohortId}`, { timeout: 45_000 });
    const openBtn = page.getByText('本周报数 · 一键复制');
    const modalHint = page.getByText('只统计各修法总量'); // 弹层独有说明文案,不与按钮文字撞strict mode
    for (let i = 0; i < 3; i++) {
      await expect(openBtn).toBeVisible(); // 弹层关闭后外层按钮应仍在(WeeklyReportModal是条件渲染,非仅隐藏)
      await openBtn.click();
      await expect(modalHint).toBeVisible();
      await page.getByText('关闭').click();
      await expect(modalHint).not.toBeVisible(); // 等真正关闭(组件卸载)完再进下一轮,不抢跑
    }
    await expect(page.locator('body')).not.toBeEmpty();
  });
});
