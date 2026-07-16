import { expect, test } from '@playwright/test';
import { getSeedIds, withDb } from './db';
import { COACH_EMAIL, STUDENT_EMAIL, TEST_PASSWORD } from './global-setup';
import { expectEnabled, loginAs } from './helpers';

// 弱网模拟(A5)+ 权限UI层越权/菜单闪现(A2/A10)——见
// docs/测试计划_技术功能与业务语义两线_2026-07-13.md 里"已确认高优先级问题"第2/4条与A5行。
// A5这条是"如实记录",基础设施本来就是对的,验证结果=确认良好,断言不预设。
// A2/A10这两条 2026-07-13 最初写的是"复现问题"(读代码确认过、真机点击再验证一次),
// PM当天下午拍板"全部修复"后已在 app/(admin)/_layout.tsx 落地修复——这两条断言已跟着
// 改成"验证修复生效"的回归锁定,不再是复现问题本身(旧版断言在此提交后会变红,是预期的,
// 说明bug真的被修了,不是测试写错)。

test.describe('弱网模拟:断网(A5)', () => {
  test('打卡提交中途断网 → 不卡死、window.alert明确提示失败,恢复网络后可重试成功', async ({ page, context }) => {
    const { studentId } = await getSeedIds();
    await loginAs(page, STUDENT_EMAIL, TEST_PASSWORD);
    await page.getByTestId('home-quick-count-card').click();
    await page.getByTestId('qc-digit-7').click();

    let alertMessage = '';
    page.once('dialog', (d) => { alertMessage = d.message(); void d.accept(); });

    await context.setOffline(true);
    const btn = page.getByTestId('qc-record-button');
    await btn.click();

    // useRecordPracticeLog 开了 retry:2(指数退避),真正失败前有几次重试,给够时间等最终提示弹出,
    // 而不是刚点完就断言——那样只会测到"还在重试中"的中间态。
    await expect.poll(() => alertMessage, { timeout: 15_000 }).toContain('记录失败');
    console.log(`[弱网发现] 断网提交 → window.alert 弹出:"${alertMessage}"`);

    // busy 状态应已在 finally 里复位,按钮回到可再点状态,不是卡在"记录中…"转不出来
    // (RN-Web 未禁用时直接不带 aria-disabled 属性,值是 null 不是 "false"——沿用 helpers.ts::expectEnabled)
    await expect(btn).not.toHaveText(/记录中…/);
    await expectEnabled(btn);

    // 恢复网络后可正常重试成功(同一笔:clientToken未清空,按钮数字仍是7,不会被计成两笔)
    const before = await withDb((c) => c.query(`SELECT count(*) FROM practice_logs WHERE user_id=$1`, [studentId]));
    await context.setOffline(false);
    await btn.click();
    await expect(page.getByTestId('qc-saved-mark')).toBeVisible({ timeout: 10_000 });
    const after = await withDb((c) => c.query(`SELECT count(*) FROM practice_logs WHERE user_id=$1`, [studentId]));
    expect(Number(after.rows[0].count) - Number(before.rows[0].count)).toBe(1);
  });

  // OfflineBanner(lib/network-status.ts::useIsOnline)没纳入这里做自动化断言:排查发现
  // @react-native-community/netinfo 的 web 实现里,只要 navigator.connection 存在就*只*听
  // connection.addEventListener('change',...),完全不走 window.addEventListener('online'/'offline')
  // 那条兜底分支——而 Playwright/CDP 的 context.setOffline() 只切 navigator.onLine + 触发
  // window online/offline 事件(已用 page.evaluate 探测确认:navigator.onLine 确实 true→false→true),
  // 不会触发 Network Information API 的 connection.change。桌面 Chromium 有 navigator.connection,
  // 这里探测到 hasConnection=true,所以断网提示条在这套模拟手法下必然测不出反应——这是
  // "模拟工具够不到这个信号源"的方法论局限,不是 App 代码的 bug(iOS Safari 没有 navigator.connection,
  // 会自动走 online/offline 兜底分支,反而不受此限;真要验证提示条本身,需要真机飞行模式测试)。
});

test.describe('权限UI层:辅导员URL直达 + 菜单闪现(A2/A10)', () => {
  test('辅导员(zhumai)账号 URL 直达系统审计页 → 应被弹回总览(2026-07-13已修,回归锁定)', async ({ page }) => {
    await loginAs(page, COACH_EMAIL, TEST_PASSWORD);
    await page.goto('/audit', { timeout: 45_000 });

    // 修复前:唯一角色门是侧栏"按角色隐藏导航项",页面内部零角色判断,辅导员改URL能直达页面壳
    // (RLS仍挡真实数据,但壳本不该露)。修复后:app/(admin)/_layout.tsx 新增页面级角色门,
    // 复用同一份 NAV_ITEMS.roles(/audit 只许 admin),辅导员应被弹回 /dashboard,看不到页面壳。
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
    await expect(page.getByText('系统审计日志仅 admin 可见')).not.toBeVisible();
  });

  test('学员深链后台/dashboard → me解析完成前不再闪现管理菜单(2026-07-13已修,回归锁定)', async ({ page }) => {
    await loginAs(page, STUDENT_EMAIL, TEST_PASSWORD);

    // 制造可观测的"me还没解析完"窗口:延迟 profiles 请求响应——跟当初测出闪现问题时同一手法,
    // 现在用来验证修复(app/(admin)/_layout.tsx 加载中默认角色从'admin'改成''空值:
    // NAV_ITEMS.filter(i => i.roles.includes(''))在这个窗口内不会命中任何一项)。
    await page.route('**/rest/v1/profiles*', async (route) => {
      await new Promise((r) => setTimeout(r, 4_000));
      await route.continue();
    });

    await page.goto('/dashboard', { timeout: 45_000 });
    // 确认此刻真在"me还没解析完"的窗口内(还没被下面的角色门弹走),这个断言才有意义。
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText('系统审计', { exact: true })).not.toBeVisible();

    // me 最终解析完(profiles 请求的延迟结束后),角色门生效,弹回首页——外层的永久角色门不受影响。
    await page.waitForURL(/\/home/, { timeout: 15_000 });
  });
});

test.describe('课时"标记完成"弹层:闻思打卡幂等(A3最高优先级项)', () => {
  // study.ts::useRecordStudy 的 client_token 幂等——两条断言测两个相反方向,缺一都不算真的修对:
  //   ①同一次confirm被双击/重试 → 只落1行(这才是要修的bug);
  //   ②重新开一次弹层再confirm(比如盲生"听2遍"这种合法的第2次)→ 应该落成2行,不能被误伤当重复挡掉
  //    (这条是2026-07-13施工过程中先写错、又自己发现改掉的那个坑——按studyType+resourceId+
  //    studyDate算凭证、且凭证在整个页面访问期间不换新,会让"过会儿再开一次弹层确认第2遍"被
  //    误判成第1次的重试,第2遍就这样被悄悄吞掉——比没做幂等更糟)。
  test('确认按钮双击 → study_records 只落1行(client_token生效)', async ({ page }) => {
    const { studentId, cohortId, lessons } = await getSeedIds();
    const lesson1 = lessons.find((l) => l.lesson_number === 1)!;
    await loginAs(page, STUDENT_EMAIL, TEST_PASSWORD);
    await page.goto(`/lesson/${lesson1.id}?step=wensi`);
    await page.getByTestId('lesson-mark-complete-button').click();

    const confirmBtn = page.getByTestId('lesson-mark-confirm-button');
    await expectEnabled(confirmBtn); // 默认needListen=true,markL已勾选,此刻应可点
    await confirmBtn.click();
    // 第二下:弹层可能已经关了点不中,属预期(同boundary.spec.ts连点用例的一贯写法)——
    // 要看的是最终库里落了几行,不是这一下点没点中。
    try { await confirmBtn.click({ timeout: 1000 }); } catch { /* 弹层已关,点不中属预期 */ }
    await page.waitForTimeout(800); // 给异步RPC写库留时间(fire-and-forget,不能await页面动作)

    const rows = await withDb((c) => c.query(
      `SELECT client_token FROM study_records WHERE user_id=$1 AND cohort_id=$2 AND lesson_id=$3 AND study_type='listen'`,
      [studentId, cohortId, lesson1.id],
    ));
    console.log(`[幂等验证] 确认按钮双击 → study_records 实际落 ${rows.rows.length} 行,client_token=${JSON.stringify(rows.rows.map((r) => r.client_token))}`);
    expect(rows.rows.length).toBe(1);
    await withDb((c) => c.query(`DELETE FROM study_records WHERE user_id=$1 AND cohort_id=$2 AND lesson_id=$3 AND study_type='listen'`, [studentId, cohortId, lesson1.id]));
  });

  test('开弹层confirm一次、关掉、重新开弹层再confirm一次 → 落2行(合法的第2次不能被误伤当重复)', async ({ page }) => {
    const { studentId, cohortId, lessons } = await getSeedIds();
    const lesson1 = lessons.find((l) => l.lesson_number === 1)!;
    await loginAs(page, STUDENT_EMAIL, TEST_PASSWORD);
    await page.goto(`/lesson/${lesson1.id}?step=wensi`);

    for (let i = 0; i < 2; i++) {
      await page.getByTestId('lesson-mark-complete-button').click();
      await page.getByTestId('lesson-mark-confirm-button').click();
      await page.waitForTimeout(500);
    }

    const rows = await withDb((c) => c.query(
      `SELECT client_token FROM study_records WHERE user_id=$1 AND cohort_id=$2 AND lesson_id=$3 AND study_type='listen'`,
      [studentId, cohortId, lesson1.id],
    ));
    console.log(`[幂等验证] 两次独立开弹层confirm → study_records 实际落 ${rows.rows.length} 行,client_token=${JSON.stringify(rows.rows.map((r) => r.client_token))}`);
    expect(rows.rows.length).toBe(2);
    expect(rows.rows[0].client_token).not.toBe(rows.rows[1]?.client_token);
    await withDb((c) => c.query(`DELETE FROM study_records WHERE user_id=$1 AND cohort_id=$2 AND lesson_id=$3 AND study_type='listen'`, [studentId, cohortId, lesson1.id]));
  });
});
