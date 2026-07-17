import { expect, test } from '@playwright/test';
import { createTestProfile, deleteTestProfile, getSeedIds, withDb } from './db';
import { ADMIN_EMAIL, TEST_PASSWORD } from './global-setup';
import { expectEnabled, loginAs } from './helpers';
import { testIds } from '../lib/testids';

// 出勤/讲考逐人记录 系统性覆盖(2026-07-16·PM"继续完成"剩余测试缺口第三批)。
// attendance/[id].tsx(出勤点名)+ attendance/speaking/[id].tsx(讲考记录)此前0个testID、
// 逐人记录/保存这块核心写路径(study_records)零e2e覆盖——"新建场次"表单本身已有
// idempotency.spec.ts(useCreateSpeakingSession双击去重)覆盖,这里补的是新建后详情页
// 逐人操作。
// ⚠️ 不复用共享E2E班:出勤/讲考记录会写study_records真实数据,可能干扰其它spec对
// 该班出勤率/学员名单的假设——每条测试自建一次性班级+一次性学员+一次性场次,用完删除
// (cohorts删除会级联study_records/group_sessions/speaking_sessions/class_members)。

async function makeThrowawayCohort(): Promise<string> {
  const { rows: [{ id: programId }] } = await withDb((c) => c.query(`SELECT id FROM programs WHERE code='E2E_JX'`));
  const { rows: [{ id: cohortId }] } = await withDb((c) =>
    c.query(
      `INSERT INTO cohorts (program_id, name, code, start_date, timezone, is_active) VALUES ($1,$2,$3,'2026-01-01','Asia/Shanghai',true) RETURNING id`,
      [programId, `E2E出勤一次性班-${Date.now()}`, `E2E_ATT_${Date.now()}`],
    ),
  );
  return cohortId as string;
}

async function addMember(cohortId: string, userId: string) {
  await withDb((c) =>
    c.query(
      `INSERT INTO class_members (cohort_id, user_id, member_role, status, joined_at, is_primary) VALUES ($1,$2,'formal','active','2026-01-01T00:00:00Z',true)`,
      [cohortId, userId],
    ),
  );
}

test.describe('出勤点名(attendance/[id].tsx)', () => {
  test('逐人循环状态 + 批量"全部到课" + 保存 → study_records按人正确落库(present/absent混合)', async ({ page }) => {
    const { lessons } = await getSeedIds();
    const lessonId = lessons[0].id;
    const cohortId = await makeThrowawayCohort();
    const userA = await createTestProfile(`e2e-att-a-${Date.now()}@local.test`, `E2E出勤甲-${Date.now()}`);
    const userB = await createTestProfile(`e2e-att-b-${Date.now()}@local.test`, `E2E出勤乙-${Date.now()}`);
    const userC = await createTestProfile(`e2e-att-c-${Date.now()}@local.test`, `E2E出勤丙-${Date.now()}`);
    await addMember(cohortId, userA);
    await addMember(cohortId, userB);
    await addMember(cohortId, userC);
    const now = new Date().toISOString();
    const { rows: [{ id: sessionId }] } = await withDb((c) =>
      c.query(`INSERT INTO group_sessions (cohort_id, lesson_id, scheduled_at, session_end_at) VALUES ($1,$2,$3,$3) RETURNING id`, [cohortId, lessonId, now]),
    );
    try {
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);
      await page.goto(`/attendance/${sessionId}`, { timeout: 45_000 });

      // 批量"全部到课"→ 三人都到课;再手动把乙从"到课"点一次变"缺席"(cycle: none→present→absent→none)
      await page.getByText('全部到课', { exact: true }).click();
      await page.getByTestId(testIds.attendance.statusToggle(userB)).click();
      await expectEnabled(page.getByTestId(testIds.attendance.saveButton));

      // notify()走window.alert非DOM文本(TESTING.md§4-13)。click()和dialog等待改用page.once+
      // expect.poll(Promise.all这个写法在admin-class-management.spec.ts"调整共修日程"真机CI
      // 复现过90秒超时,证明本身不安全,全项目统一换掉)
      let saveMsg = '';
      page.once('dialog', (d) => { saveMsg = d.message(); void d.accept(); });
      await page.getByTestId(testIds.attendance.saveButton).click();
      await expect.poll(() => saveMsg, { timeout: 15_000 }).toContain('到课 2');
      expect(saveMsg).toContain('缺席 1');

      const { rows } = await withDb((c) => c.query(`SELECT user_id, study_type FROM study_records WHERE cohort_id=$1 AND lesson_id=$2`, [cohortId, lessonId]));
      const byUser = new Map(rows.map((r) => [r.user_id as string, r.study_type as string]));
      expect(byUser.get(userA)).toBe('group_attend');
      expect(byUser.get(userB)).toBe('group_absent');
      expect(byUser.get(userC)).toBe('group_attend');
    } finally {
      await withDb((c) => c.query(`DELETE FROM cohorts WHERE id=$1`, [cohortId]));
      await deleteTestProfile(userA);
      await deleteTestProfile(userB);
      await deleteTestProfile(userC);
    }
  });
});

// 权限边界·写层面(2026-07-17·PM"这两个都要测"·测试计划②场景1):非本班辅导员对其它班
// 出勤的写操作。⚠️调研发现:me.role是全局派生的(class_admins里任意一行有zhumai就算),
// 单纯"是别的班辅导员"这个账号会在【读】这一层先被cohorts_select/group_sessions_select
// 拦下(选班器看不到、深链读不到场次),走不到"保存被拒"这条路径——真正能走到写被拒的,是
// "A班辅导员+同时是B班普通正式学员"这个组合身份(能读到B班场次,写才轮到has_class_role
// 拦)。这不是凑出来的边角案例,是真实调研之后确认唯一可达的攻击面。
test.describe('权限边界:非本班辅导员保存出勤被拒(测试计划②场景1)', () => {
  test('A班辅导员 + B班普通学员的账号 → 能读到B班场次,但保存出勤被RLS拒,看到友好提示', async ({ page }) => {
    const { lessons } = await getSeedIds();
    const lessonId = lessons[0].id;
    const cohortA = await makeThrowawayCohort();
    const cohortB = await makeThrowawayCohort();
    const userXEmail = `e2e-att-crosscohort-${Date.now()}@local.test`;
    const userX = await createTestProfile(userXEmail, `E2E跨班辅导员-${Date.now()}`);
    // ⚠️真机CI实测发现的坑:createTestProfile建的profile默认status='pending'(handle_new_auth_user
    // 触发器建的裸profile),本文件其它测试从没直接登录过这个身份(都是admin登录后替他们操作),
    // 这条是本文件第一条真的要"登录成为这个新建用户"的测试——不激活status会被index.tsx的
    // status!=='active'门挡去/pending,loginAs()等不到/home|/dashboard,15秒超时。跟"任命为爱心"
    // 那次同一个坑:set_config旁路必须在同一个withDb()连接里三条语句连着执行。
    await withDb(async (c) => {
      await c.query(`SELECT set_config('app.allow_protected_write','on',false)`);
      await c.query(`UPDATE profiles SET status='active' WHERE id=$1`, [userX]);
      await c.query(`SELECT set_config('app.allow_protected_write','off',false)`);
    });
    await withDb((c) => c.query(`INSERT INTO class_admins (cohort_id, user_id, role) VALUES ($1,$2,'zhumai')`, [cohortA, userX]));
    await addMember(cohortB, userX); // B班的普通正式学员,不是B班的class_admins
    const now = new Date().toISOString();
    const { rows: [{ id: sessionId }] } = await withDb((c) =>
      c.query(`INSERT INTO group_sessions (cohort_id, lesson_id, scheduled_at, session_end_at) VALUES ($1,$2,$3,$3) RETURNING id`, [cohortB, lessonId, now]),
    );
    try {
      await loginAs(page, userXEmail, TEST_PASSWORD);
      await page.goto(`/attendance/${sessionId}`, { timeout: 45_000 });
      // 是B班成员,读得到场次和名单(cohorts_select/group_sessions_select都放行);
      // canWrite按全局角色算(me.role==='zhumai'),按钮不是禁用状态,点得下去
      await page.getByText('全部到课', { exact: true }).click();
      await expectEnabled(page.getByTestId(testIds.attendance.saveButton));

      let denyMsg = '';
      page.once('dialog', (d) => { denyMsg = d.message(); void d.accept(); });
      await page.getByTestId(testIds.attendance.saveButton).click();
      // study_records_insert要求has_class_role(B班id,'zhumai'),X只在A班是zhumai,B班没有
      // 这一行class_admins记录 → 被拒;前端按42501/permission正则识别,换成友好文案
      await expect.poll(() => denyMsg, { timeout: 15_000 }).toContain('没有该班出勤录入权限');

      const { rows } = await withDb((c) => c.query(`SELECT count(*) FROM study_records WHERE cohort_id=$1 AND lesson_id=$2`, [cohortB, lessonId]));
      expect(Number(rows[0].count)).toBe(0); // 确认真的没写进去,不是报了错但其实成功了
    } finally {
      await withDb((c) => c.query(`DELETE FROM class_admins WHERE cohort_id=$1 AND user_id=$2`, [cohortA, userX]));
      await withDb((c) => c.query(`DELETE FROM cohorts WHERE id IN ($1,$2)`, [cohortA, cohortB]));
      await deleteTestProfile(userX);
    }
  });
});

test.describe('讲考记录(attendance/speaking/[id].tsx):三态 + 等级评价', () => {
  test('主讲(附等级)+ 听讲 + 保存 → study_records与speaking_evaluations正确落库', async ({ page }) => {
    const { lessons } = await getSeedIds();
    const lessonId = lessons[0].id;
    const cohortId = await makeThrowawayCohort();
    const userA = await createTestProfile(`e2e-spk-a-${Date.now()}@local.test`, `E2E讲考甲-${Date.now()}`);
    const userB = await createTestProfile(`e2e-spk-b-${Date.now()}@local.test`, `E2E讲考乙-${Date.now()}`);
    await addMember(cohortId, userA);
    await addMember(cohortId, userB);
    const now = new Date().toISOString();
    const { rows: [{ id: speakingId }] } = await withDb((c) =>
      c.query(`INSERT INTO speaking_sessions (cohort_id, lesson_id, session_end_at) VALUES ($1,$2,$3) RETURNING id`, [cohortId, lessonId, now]),
    );
    try {
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);
      await page.goto(`/attendance/speaking/${speakingId}`, { timeout: 45_000 });

      await page.getByTestId(testIds.speakingDetail.statusChip(userA, 'speaking_present')).click();
      // 只有主讲才会出现等级评价区(isPresenter门控),点"主讲"后才能点到评价chip
      await page.getByTestId(testIds.speakingDetail.gradeChip(userA, 'pass')).click();
      await page.getByTestId(testIds.speakingDetail.statusChip(userB, 'speaking_observe')).click();

      // click()和dialog等待用page.once+expect.poll(Promise.all这套在"调整共修日程"真机CI
      // 复现过90秒超时,证明本身不安全)
      let speakMsg = '';
      page.once('dialog', (d) => { speakMsg = d.message(); void d.accept(); });
      await page.getByTestId(testIds.speakingDetail.saveButton).click();
      await expect.poll(() => speakMsg, { timeout: 15_000 }).toContain('主讲 1');
      expect(speakMsg).toContain('听讲 1');

      const { rows } = await withDb((c) =>
        c.query(`SELECT id, user_id, study_type FROM study_records WHERE cohort_id=$1 AND lesson_id=$2`, [cohortId, lessonId]),
      );
      const byUser = new Map(rows.map((r) => [r.user_id as string, r]));
      expect(byUser.get(userA)?.study_type).toBe('speaking_present');
      expect(byUser.get(userB)?.study_type).toBe('speaking_observe');

      const { rows: grades } = await withDb((c) =>
        c.query(`SELECT grade FROM speaking_evaluations WHERE study_record_id=$1`, [byUser.get(userA)?.id]),
      );
      expect(grades.length).toBe(1);
      expect(grades[0].grade).toBe('pass');
      const { rows: noGrade } = await withDb((c) =>
        c.query(`SELECT grade FROM speaking_evaluations WHERE study_record_id=$1`, [byUser.get(userB)?.id]),
      );
      expect(noGrade.length).toBe(0); // 非主讲不留等级(决策067)
    } finally {
      await withDb((c) => c.query(`DELETE FROM cohorts WHERE id=$1`, [cohortId]));
      await deleteTestProfile(userA);
      await deleteTestProfile(userB);
    }
  });
});

test.describe('讲考记录:挂靠共修场次 + 删场次', () => {
  test('挂靠 → speaking_sessions.group_session_id更新;删场次 → 场次消失,已记录不受影响(FK SET NULL)', async ({ page }) => {
    const { lessons } = await getSeedIds();
    const lessonId = lessons[0].id;
    const cohortId = await makeThrowawayCohort();
    const userA = await createTestProfile(`e2e-spk-link-${Date.now()}@local.test`, `E2E讲考挂靠-${Date.now()}`);
    await addMember(cohortId, userA);
    const now = new Date().toISOString();
    const { rows: [{ id: groupSessionId }] } = await withDb((c) =>
      c.query(`INSERT INTO group_sessions (cohort_id, lesson_id, scheduled_at, session_end_at) VALUES ($1,$2,$3,$3) RETURNING id`, [cohortId, lessonId, now]),
    );
    const { rows: [{ id: speakingId }] } = await withDb((c) =>
      c.query(`INSERT INTO speaking_sessions (cohort_id, lesson_id, session_end_at) VALUES ($1,$2,$3) RETURNING id`, [cohortId, lessonId, now]),
    );
    // 先记一条,证明删场次时它不受影响(study_records.speaking_session_id FK ON DELETE SET NULL)
    const { rows: [{ id: recordId }] } = await withDb((c) =>
      c.query(
        `INSERT INTO study_records (user_id, cohort_id, lesson_id, study_type, speaking_session_id, study_date, is_confirmed)
         VALUES ($1,$2,$3,'speaking_present',$4,'2026-01-01',true) RETURNING id`,
        [userA, cohortId, lessonId, speakingId],
      ),
    );
    try {
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);
      await page.goto(`/attendance/speaking/${speakingId}`, { timeout: 45_000 });

      await expect(page.getByText('独立记录 · 未挂共修(决策080允许)')).toBeVisible();
      await page.getByTestId(testIds.speakingDetail.groupLinkButton).click();
      await page.getByTestId(testIds.speakingDetail.groupPickerRow(groupSessionId)).click();
      // notify('已更新',...)走window.alert,这里不断言其文案(下面DB核对是真依据),
      // 显式接掉避免依赖Playwright默认自动关闭这条隐含行为
      page.once('dialog', (d) => { void d.accept(); });
      await page.getByTestId(testIds.speakingDetail.groupPickerConfirmButton).click();
      await expect(page.getByText('挂靠共修', { exact: false })).toBeVisible({ timeout: 10_000 });

      const { rows: linked } = await withDb((c) => c.query(`SELECT group_session_id FROM speaking_sessions WHERE id=$1`, [speakingId]));
      expect(linked[0].group_session_id).toBe(groupSessionId);

      // confirmAsync('删除该讲考场次?'...)→接受后mutate→router.back()离开页面,不会再弹第二个alert
      page.once('dialog', (d) => { void d.accept(); });
      await page.getByTestId(testIds.speakingDetail.deleteButton).click();
      await page.waitForTimeout(800);

      const { rows: afterDelete } = await withDb((c) => c.query(`SELECT count(*) FROM speaking_sessions WHERE id=$1`, [speakingId]));
      expect(Number(afterDelete[0].count)).toBe(0);
      const { rows: recordAfter } = await withDb((c) => c.query(`SELECT speaking_session_id FROM study_records WHERE id=$1`, [recordId]));
      expect(recordAfter.length).toBe(1);
      expect(recordAfter[0].speaking_session_id).toBeNull();
    } finally {
      await withDb((c) => c.query(`DELETE FROM cohorts WHERE id=$1`, [cohortId]));
      await deleteTestProfile(userA);
    }
  });
});

// 异常输入扩展(2026-07-17·PM"这两个都要测"·测试计划①):非主讲状态下等级评价的UI处理——
// 确认是"条件渲染直接隐藏"(不是禁用可见/不是点了没反应),且切走主讲时已选的等级会被
// setStatus顺手清空,不会遗留一条"非主讲却带等级"的脏状态。
test.describe('讲考记录:非主讲状态下等级评价隐藏 + 切走清空已选等级', () => {
  test('主讲时选等级 → 切成听讲 → 等级chip从DOM消失,保存后没有speaking_evaluations行', async ({ page }) => {
    const { lessons } = await getSeedIds();
    const lessonId = lessons[0].id;
    const cohortId = await makeThrowawayCohort();
    const userA = await createTestProfile(`e2e-spk-gradeclear-${Date.now()}@local.test`, `E2E讲考清空等级-${Date.now()}`);
    await addMember(cohortId, userA);
    const now = new Date().toISOString();
    const { rows: [{ id: speakingId }] } = await withDb((c) =>
      c.query(`INSERT INTO speaking_sessions (cohort_id, lesson_id, session_end_at) VALUES ($1,$2,$3) RETURNING id`, [cohortId, lessonId, now]),
    );
    try {
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);
      await page.goto(`/attendance/speaking/${speakingId}`, { timeout: 45_000 });

      await page.getByTestId(testIds.speakingDetail.statusChip(userA, 'speaking_present')).click();
      await page.getByTestId(testIds.speakingDetail.gradeChip(userA, 'pass')).click();
      await expect(page.getByTestId(testIds.speakingDetail.gradeChip(userA, 'pass'))).toBeVisible();

      // 切成听讲(非主讲):isPresenter门控让整块等级评价从组件树里消失,不是变灰禁用
      await page.getByTestId(testIds.speakingDetail.statusChip(userA, 'speaking_observe')).click();
      await expect(page.getByTestId(testIds.speakingDetail.gradeChip(userA, 'pass'))).not.toBeAttached();

      let clearGradeMsg = '';
      page.once('dialog', (d) => { clearGradeMsg = d.message(); void d.accept(); });
      await page.getByTestId(testIds.speakingDetail.saveButton).click();
      await expect.poll(() => clearGradeMsg, { timeout: 15_000 }).not.toBe('');

      const { rows } = await withDb((c) =>
        c.query(`SELECT id, study_type FROM study_records WHERE cohort_id=$1 AND lesson_id=$2 AND user_id=$3`, [cohortId, lessonId, userA]),
      );
      expect(rows.length).toBe(1);
      expect(rows[0].study_type).toBe('speaking_observe');
      const { rows: grades } = await withDb((c) => c.query(`SELECT count(*) FROM speaking_evaluations WHERE study_record_id=$1`, [rows[0].id]));
      expect(Number(grades[0].count)).toBe(0); // 切走主讲时grade被清成null,不会带着旧等级存进去
    } finally {
      await withDb((c) => c.query(`DELETE FROM cohorts WHERE id=$1`, [cohortId]));
      await deleteTestProfile(userA);
    }
  });
});

// 并发/竞态(2026-07-17·测试计划④场景1):useSaveAttendance是"先查(SELECT已有记录)后写
// (据此分insert/update/delete)"(见lib/mutations/attendance.ts注释),SELECT到写入之间有窗口。
// 这条真的需要两个浏览器上下文几乎同时提交才测得出来(不像下面练习模板那条是任何时序下都
// 确定发生的行为,这条的SELECT在每次点"保存"时才现查,不是页面一打开就查一次——只有两次点
// 保存真的離得够近、都赶在对方INSERT落库前完成自己的SELECT,才会撞上uniq_group_attendance_
// per_lesson这个唯一索引)。真实时序不可控——具体是谁的insert先落库、还是干脆两次提交前后
// 脚错开变成"一个insert+一个update"从而完全不报错,都有可能,这条测试不假设固定结局,只钉住
// 数据完整性这个不管时序如何都必须成立的底线:最终这个学员的出勤记录只能有1行,不会2行
// 并存也不会消失。
test.describe('并发/竞态:两个上下文几乎同时提交同一学员的出勤(测试计划④场景1)', () => {
  test('两个浏览器上下文同时把同一学员标成不同出勤状态并保存 → 不管谁先落库,唯一索引保证最终只有1行,双方都收到明确结果反馈', async ({ page, browser }) => {
    const { lessons } = await getSeedIds();
    const lessonId = lessons[0].id;
    const cohortId = await makeThrowawayCohort();
    const contested = await createTestProfile(`e2e-race-${Date.now()}@local.test`, `E2E并发出勤-${Date.now()}`);
    await addMember(cohortId, contested);
    const now = new Date().toISOString();
    const { rows: [{ id: sessionId }] } = await withDb((c) =>
      c.query(`INSERT INTO group_sessions (cohort_id, lesson_id, scheduled_at, session_end_at) VALUES ($1,$2,$3,$3) RETURNING id`, [cohortId, lessonId, now]),
    );
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    try {
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);
      await loginAs(page2, ADMIN_EMAIL, TEST_PASSWORD);
      await page.goto(`/attendance/${sessionId}`, { timeout: 45_000 });
      await page2.goto(`/attendance/${sessionId}`, { timeout: 45_000 });

      // 两边互不知情,各自把这唯一的学员标成不同状态:page标"到课"(点1次:none→present),
      // page2标"缺席"(点2次:none→present→absent)
      await page.getByTestId(testIds.attendance.statusToggle(contested)).click();
      await page2.getByTestId(testIds.attendance.statusToggle(contested)).click();
      await page2.getByTestId(testIds.attendance.statusToggle(contested)).click();

      let msg1 = '';
      let msg2 = '';
      page.once('dialog', (d) => { msg1 = d.message(); void d.accept(); });
      page2.once('dialog', (d) => { msg2 = d.message(); void d.accept(); });
      // 两个click()真正并发派发(不顺序await),才有机会撞上SELECT-INSERT之间的竞态窗口——
      // 顺序await等于人为拉开间隔,永远测不出真并发下的行为。
      await Promise.all([
        page.getByTestId(testIds.attendance.saveButton).click(),
        page2.getByTestId(testIds.attendance.saveButton).click(),
      ]);
      await expect.poll(() => msg1 !== '' && msg2 !== '', { timeout: 15_000 }).toBe(true);

      const { rows } = await withDb((c) =>
        c.query(`SELECT study_type FROM study_records WHERE cohort_id=$1 AND lesson_id=$2 AND user_id=$3`, [cohortId, lessonId, contested]),
      );
      // 不管两次提交实际交错成什么样(纯insert冲突/一insert一update/反过来),唯一索引保证
      // 这个学员最终只可能有1行落库,不会2行并存(数据损坏)也不会1行都没有(全丢)。
      expect(rows.length).toBe(1);
      console.log(`[并发发现] 两上下文同时提交同一学员出勤:page1弹层="${msg1}" / page2弹层="${msg2}" / 最终study_type=${rows[0].study_type}`);
    } finally {
      await context2.close();
      await withDb((c) => c.query(`DELETE FROM cohorts WHERE id=$1`, [cohortId]));
      await deleteTestProfile(contested);
    }
  });
});
