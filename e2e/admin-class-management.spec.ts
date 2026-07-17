import { expect, test } from '@playwright/test';
import { createTestProfile, deleteTestProfile, getSeedIds, withDb } from './db';
import { ADMIN_EMAIL, COACH_EMAIL, TEST_PASSWORD } from './global-setup';
import { loginAs } from './helpers';
import { testIds } from '../lib/testids';

// 班级详情管理操作 系统性覆盖(2026-07-16·PM"系统性测试包括点击,剩余内容继续补")。
// 此前 classes/[id].tsx 的"管理操作"整块零e2e覆盖,且组件本身0个testID(补在
// lib/testids.ts::classDetail + admin-kit.tsx::SearchBar 新增testID支持)。
// ⚠️ 共享种子谨慎原则:E2E班(getSeedIds().cohortId)被其它多个spec文件复用(smoke/boundary/
// resilience/idempotency),本文件里"添加学员/设辅导员/设休息周/成员管理"都只新增测试自建的
// 数据、不改动种子自带的学员/辅导员本身,用完即删;"标记结班/恢复在读"这个会翻转cohort.
// is_active的操作,风险更高,改用专门新建的一次性班级,不碰共享的E2E班。

test.describe('调整共修日程(2026-07-15新增·本班辅导员也能改自己班的共修设定)', () => {
  test('辅导员(zhumai)能看到"共修设定"入口并成功保存,不是admin专属', async ({ page }) => {
    const { cohortId } = await getSeedIds();
    const newZoom = `https://zoom.example/e2e-${Date.now()}`;
    await loginAs(page, COACH_EMAIL, TEST_PASSWORD);
    await page.goto(`/classes/${cohortId}`, { timeout: 45_000 });

    // 辅导员应该看到独立的"共修设定"区块(不是admin那块"管理操作"里的同名按钮,
    // 那块对非admin不渲染——见 classes/[id].tsx isZhumai && !isAdmin 门控)
    await expect(page.getByText('共修设定')).toBeVisible({ timeout: 10_000 });
    await page.getByText('调整共修日程', { exact: true }).click();
    // ⚠️真机跑CI实测发现的坑:触发按钮本身的文字就是"调整共修日程",跟弹层标题同名——
    // RN Modal在web端不摘除底层DOM,两处同名文字同时在场会撞Playwright严格模式(resolved to
    // 2 elements)。弹层是JSX里后挂载的,.last()按DOM挂载顺序取,不是猜时序。
    await expect(page.getByText('调整共修日程', { exact: true }).last()).toBeVisible();

    await page.getByPlaceholder('https://…').first().fill(newZoom);
    // ⚠️notify()在web端走window.alert(),不是DOM文本,getByText找不到——按TESTING.md§4-13规范接。
    // 2026-07-16曾怀疑Promise.all([waitForEvent('dialog'), click()])在这里不安全(click()触发的
    // 原生alert阻塞渲染进程,顺序await会让click()本身挂起到90秒超时),当时加时间戳诊断两轮都很快,
    // 错误地下结论"CI偶发抖动,不是代码问题"——2026-07-17真机CI又复现同一超时(dialog.accept:
    // Target page ... has been closed),证明当初结论错了,这就是同一个真实的click()/dialog时序
    // 竞争。改用course-self-study.spec.ts"从讲记提取"验证过的稳妥模式:page.once预先注册监听器
    // + expect.poll轮询,不用Promise.all。
    let notifyMsg = '';
    page.once('dialog', (d) => { notifyMsg = d.message(); void d.accept(); });
    await page.getByText('保存', { exact: true }).click();
    await expect.poll(() => notifyMsg, { timeout: 15_000 }).toContain('已更新');

    const { rows } = await withDb((c) => c.query(`SELECT cosession_zoom_url FROM cohorts WHERE id=$1`, [cohortId]));
    expect(rows[0].cosession_zoom_url).toBe(newZoom);
  });
});

test.describe('添加学员', () => {
  test('搜索→勾选→选正式→提交 → class_members真的新增一行(正式)', async ({ page }) => {
    const { cohortId } = await getSeedIds();
    const name = `E2E待加入-${Date.now()}`;
    const userId = await createTestProfile(`e2e-addmember-${Date.now()}@local.test`, name);
    try {
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);
      await page.goto(`/classes/${cohortId}`, { timeout: 45_000 });
      await page.getByTestId(testIds.classDetail.addMembersButton).click();
      await page.getByTestId(testIds.classDetail.addMembersSearchInput).fill(name);
      await page.getByTestId(testIds.classDetail.addMembersRow(userId)).click();
      // ⚠️种子学员本身就是formal、roster列表里已经有一个"正式"徽章,弹层开着时那份DOM还在
      // (RN Modal不会真的把底层内容摘掉)——getByText('正式')会连着roster那个一起命中2处,
      // 触发Playwright严格模式报错。弹层是JSX里最后挂载的,.last()稳定取到弹层内SegmentedControl
      // 这个选项(不是靠猜时序,是靠"弹层在源码里排在roster后面、React按源码顺序挂载DOM"这个
      // 确定性事实)。
      await page.getByText('正式', { exact: true }).last().click(); // SegmentedControl "旁听/正式"
      // notify()走window.alert,不是DOM文本——click()和dialog等待改用page.once+expect.poll
      // (Promise.all等click()和dialog在"调整共修日程"测试里真机CI复现过90秒超时,证明这个
      // 写法本身不安全,不是CI偶发抖动,全项目统一换成这套验证过的稳妥模式)
      let addMemberMsg = '';
      page.once('dialog', (d) => { addMemberMsg = d.message(); void d.accept(); });
      await page.getByTestId(testIds.classDetail.addMembersSubmitButton).click();
      await expect.poll(() => addMemberMsg, { timeout: 15_000 }).toContain('已添加');

      const { rows } = await withDb((c) =>
        c.query(`SELECT member_role, status FROM class_members WHERE cohort_id=$1 AND user_id=$2`, [cohortId, userId]),
      );
      expect(rows.length).toBe(1);
      expect(rows[0].member_role).toBe('formal');
      expect(rows[0].status).toBe('active');
    } finally {
      await withDb((c) => c.query(`DELETE FROM class_members WHERE user_id=$1`, [userId]));
      await deleteTestProfile(userId);
    }
  });
});

test.describe('设辅导员 / 爱心', () => {
  test('任命为爱心 → class_admins新增一行;撤销 → 该行消失', async ({ page }) => {
    const { cohortId } = await getSeedIds();
    const name = `E2E候补爱心-${Date.now()}`;
    const userId = await createTestProfile(`e2e-aixin-${Date.now()}@local.test`, name);
    // ⚠️真机CI实测发现的坑:set_config的旁路是SESSION级(is_local=false),但withDb()每次
    // 调用都开一条新连接、用完即关——分开三次withDb()调用意味着"打开旁路"和"UPDATE"根本不在
    // 同一条连接/会话上,旁路对UPDATE完全不生效,profiles_protect_status触发器会把status悄悄
    // revert回原值(这里是'pending'),profile实际从未变成'active'。必须在同一个withDb()回调
    // 里、用同一个client连续执行三条语句(不能拼成一条多语句字符串——node-pg带参数的查询走
    // extended protocol,一条字符串里塞多条语句+$1会报"cannot insert multiple commands into
    // a prepared statement")。
    await withDb(async (c) => {
      await c.query(`SELECT set_config('app.allow_protected_write','on',false)`);
      await c.query(`UPDATE profiles SET status='active' WHERE id=$1`, [userId]);
      await c.query(`SELECT set_config('app.allow_protected_write','off',false)`);
    });
    // 诊断性断言(2026-07-16二次真机CI跑仍失败,这里先确认"状态真的改成功了"再往下走UI——
    // 如果这条断言炸,说明上面那次UPDATE本身没生效,是DB层问题;如果这条过了但后面UI还卡住,
    // 说明问题在候选搜索/appoint这条链路上的别处,不是status)。
    const { rows: statusCheck } = await withDb((c) => c.query(`SELECT status, deletion_requested_at FROM profiles WHERE id=$1`, [userId]));
    expect(statusCheck[0].status).toBe('active');
    expect(statusCheck[0].deletion_requested_at).toBeNull();
    try {
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);
      await page.goto(`/classes/${cohortId}`, { timeout: 45_000 });
      await page.getByTestId(testIds.classDetail.staffButton).click();
      await page.getByText('任命爱心', { exact: true }).click();
      await page.getByTestId(testIds.classDetail.staffSearchInput).fill(name);
      // 候选是否真的出现在搜索结果里(如果卡在这一步,说明是useActiveProfilesSearch这条链路
      // 的问题,不是status没设对;如果这条过了但后面click/dialog还卡住,才是别处的问题)
      await expect(page.getByTestId(testIds.classDetail.staffAppointButton(userId))).toBeVisible({ timeout: 10_000 });
      // 真机CI两次实测纠正:appoint mutation的onSuccess只invalidateQueries,没调用notify()——
      // 任命成功既没有前置confirm也没有成功后的alert(撤销才有前置confirm)。之前这里臆造了
      // "任命后会弹alert"的断言,实际根本没有dialog,一直等到90秒超时。真实的成功反馈是按钮
      // 文案从"任命为爱心"变成"已任命"(held派生自admins列表重新拉取后的disabled态)。
      await page.getByTestId(testIds.classDetail.staffAppointButton(userId)).click();
      await expect(page.getByTestId(testIds.classDetail.staffAppointButton(userId))).toHaveText('已任命', { timeout: 10_000 });

      const { rows: appointed } = await withDb((c) =>
        c.query(`SELECT role FROM class_admins WHERE cohort_id=$1 AND user_id=$2`, [cohortId, userId]),
      );
      expect(appointed.length).toBe(1);
      expect(appointed[0].role).toBe('aixin');

      page.once('dialog', (d) => { void d.accept(); });
      await page.getByTestId(testIds.classDetail.staffRevokeButton(userId, 'aixin')).click();
      await page.waitForTimeout(800);
      const { rows: revoked } = await withDb((c) =>
        c.query(`SELECT count(*) FROM class_admins WHERE cohort_id=$1 AND user_id=$2`, [cohortId, userId]),
      );
      expect(Number(revoked[0].count)).toBe(0);
    } finally {
      await withDb((c) => c.query(`DELETE FROM class_admins WHERE user_id=$1`, [userId]));
      await deleteTestProfile(userId);
    }
  });
});

test.describe('设休息周', () => {
  test('添加休息周 → cohort_rest_weeks新增一行;删除 → 该行消失', async ({ page }) => {
    const { cohortId } = await getSeedIds();
    const restDate = '2027-03-15'; // 远期日期,避免撞上其它测试依赖"本班当前周"算法的断言
    const reason = `E2E测试休息周-${Date.now()}`;
    try {
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);
      await page.goto(`/classes/${cohortId}`, { timeout: 45_000 });
      await page.getByTestId(testIds.classDetail.restButton).click();
      await page.getByTestId(testIds.classDetail.restDateInput).fill(restDate);
      await page.getByPlaceholder('如:春节假期').fill(reason); // 原因字段(选填),按placeholder定位——ModalField的label是纯文本,不是input,不能.fill()
      // notify()走window.alert,不是DOM文本——添加本身没有前置confirm(删除才有),单次alert。
      // 2026-07-16曾怀疑这里跟"调整共修日程"一样有click()/dialog时序竞争,当时诊断两轮都很快、
      // 错误下结论"CI偶发抖动"——2026-07-17"调整共修日程"真机复现同一类超时,证明那次结论错了,
      // 这里虽还没实测复现,但用的是同一种不安全写法(Promise.all等click()和dialog),预防性
      // 一并换成同一份验证过的稳妥模式:page.once预先注册监听器 + expect.poll轮询。
      let addMsg = '';
      page.once('dialog', (d) => { addMsg = d.message(); void d.accept(); });
      await page.getByTestId(testIds.classDetail.restAddButton).click();
      await expect.poll(() => addMsg, { timeout: 15_000 }).toContain('已添加');

      const { rows } = await withDb((c) =>
        c.query(`SELECT id FROM cohort_rest_weeks WHERE cohort_id=$1 AND rest_start_date=$2`, [cohortId, restDate]),
      );
      expect(rows.length).toBe(1);
      const restWeekId = rows[0].id as string;

      page.once('dialog', (d) => { void d.accept(); });
      await page.getByTestId(testIds.classDetail.restRemoveButton(restWeekId)).click();
      await page.waitForTimeout(800);
      const { rows: after } = await withDb((c) => c.query(`SELECT count(*) FROM cohort_rest_weeks WHERE id=$1`, [restWeekId]));
      expect(Number(after[0].count)).toBe(0);
    } finally {
      await withDb((c) => c.query(`DELETE FROM cohort_rest_weeks WHERE cohort_id=$1 AND rest_start_date=$2`, [cohortId, restDate]));
    }
  });
});

test.describe('标记结班 / 恢复在读', () => {
  // ⚠️ 这个操作会翻转 cohort.is_active,不拿共享的E2E班练手(其它spec文件依赖它一直在读)——
  // 专门开一个一次性班级。
  test('标记结班 → is_active变false;恢复在读 → 变回true', async ({ page }) => {
    const { rows: [{ id: programId }] } = await withDb((c) => c.query(`SELECT id FROM programs WHERE code='E2E_JX'`));
    const cohortCode = `E2E_ENDCLASS_${Date.now()}`;
    const { rows: [{ id: cohortId }] } = await withDb((c) =>
      c.query(
        `INSERT INTO cohorts (program_id, name, code, start_date, timezone, is_active) VALUES ($1,$2,$3,'2026-01-01','Asia/Shanghai',true) RETURNING id`,
        [programId, `E2E一次性班-${Date.now()}`, cohortCode],
      ),
    );
    try {
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);
      await page.goto(`/classes/${cohortId}`, { timeout: 45_000 });
      page.once('dialog', (d) => { void d.accept(); });
      await page.getByTestId(testIds.classDetail.endClassButton).click();
      await page.waitForTimeout(800);
      const { rows: afterEnd } = await withDb((c) => c.query(`SELECT is_active FROM cohorts WHERE id=$1`, [cohortId]));
      expect(afterEnd[0].is_active).toBe(false);

      await page.getByTestId(testIds.classDetail.reopenClassButton).click();
      await page.waitForTimeout(800);
      const { rows: afterReopen } = await withDb((c) => c.query(`SELECT is_active FROM cohorts WHERE id=$1`, [cohortId]));
      expect(afterReopen[0].is_active).toBe(true);
    } finally {
      await withDb((c) => c.query(`DELETE FROM cohorts WHERE id=$1`, [cohortId]));
    }
  });
});

test.describe('学员名单管理(转正/暂停/留级/恢复/移出)', () => {
  test('旁听转正 → member_role变formal', async ({ page }) => {
    const { cohortId } = await getSeedIds();
    const name = `E2E旁听待转正-${Date.now()}`;
    const userId = await createTestProfile(`e2e-promote-${Date.now()}@local.test`, name);
    await withDb((c) =>
      c.query(`INSERT INTO class_members (cohort_id, user_id, member_role, status) VALUES ($1,$2,'auditor','active')`, [cohortId, userId]),
    );
    try {
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);
      await page.goto(`/classes/${cohortId}`, { timeout: 45_000 });
      await page.getByTestId(testIds.classDetail.manageMemberButton(userId)).click();
      // 转正走"确认弹窗(confirm)→接受后mutate→onSuccess再弹一次alert(已转正)"两段式原生对话框;
      // 用一个once只吃得到第一个(confirm),第二个(alert)没注册handler会被Playwright默认自动
      // dismiss(不会卡住,官方文档行为)——这里不追加assert第二个的文本,DB状态检查(下面)才是
      // 真正的验证依据。
      page.once('dialog', (d) => { void d.accept(); });
      await page.getByTestId(testIds.classDetail.memberPromoteButton).click();
      await page.waitForTimeout(800);
      const { rows } = await withDb((c) => c.query(`SELECT member_role FROM class_members WHERE cohort_id=$1 AND user_id=$2`, [cohortId, userId]));
      expect(rows[0].member_role).toBe('formal');
    } finally {
      await withDb((c) => c.query(`DELETE FROM class_members WHERE user_id=$1`, [userId]));
      await deleteTestProfile(userId);
    }
  });

  test('暂停学习 → status变paused;恢复在读 → 变回active;移出本班 → 变left', async ({ page }) => {
    const { cohortId } = await getSeedIds();
    const name = `E2E正式待操作-${Date.now()}`;
    const userId = await createTestProfile(`e2e-memberops-${Date.now()}@local.test`, name);
    await withDb((c) =>
      c.query(`INSERT INTO class_members (cohort_id, user_id, member_role, status) VALUES ($1,$2,'formal','active')`, [cohortId, userId]),
    );
    try {
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);
      await page.goto(`/classes/${cohortId}`, { timeout: 45_000 });

      await page.getByTestId(testIds.classDetail.manageMemberButton(userId)).click();
      page.once('dialog', (d) => { void d.accept(); });
      await page.getByTestId(testIds.classDetail.memberPauseButton).click();
      await page.waitForTimeout(800);
      const { rows: paused } = await withDb((c) => c.query(`SELECT status FROM class_members WHERE cohort_id=$1 AND user_id=$2`, [cohortId, userId]));
      expect(paused[0].status).toBe('paused');

      await page.getByTestId(testIds.classDetail.manageMemberButton(userId)).click();
      page.once('dialog', (d) => { void d.accept(); });
      await page.getByTestId(testIds.classDetail.memberResumeButton).click();
      await page.waitForTimeout(800);
      const { rows: resumed } = await withDb((c) => c.query(`SELECT status FROM class_members WHERE cohort_id=$1 AND user_id=$2`, [cohortId, userId]));
      expect(resumed[0].status).toBe('active');

      await page.getByTestId(testIds.classDetail.manageMemberButton(userId)).click();
      page.once('dialog', (d) => { void d.accept(); });
      await page.getByTestId(testIds.classDetail.memberLeaveButton).click();
      await page.waitForTimeout(800);
      const { rows: left } = await withDb((c) => c.query(`SELECT status FROM class_members WHERE cohort_id=$1 AND user_id=$2`, [cohortId, userId]));
      expect(left[0].status).toBe('left');
    } finally {
      await withDb((c) => c.query(`DELETE FROM class_members WHERE user_id=$1`, [userId]));
      await deleteTestProfile(userId);
    }
  });
});
