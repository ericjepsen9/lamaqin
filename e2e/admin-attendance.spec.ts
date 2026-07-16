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

      // notify()走window.alert非DOM文本(TESTING.md§4-13);click()和dialog等待用Promise.all
      // 并发(顺序await会让click()被自己触发的alert卡死到90秒超时,真机CI实测过的坑)
      const [dialog] = await Promise.all([
        page.waitForEvent('dialog'),
        page.getByTestId(testIds.attendance.saveButton).click(),
      ]);
      expect(dialog.message()).toContain('到课 2');
      expect(dialog.message()).toContain('缺席 1');
      await dialog.accept();

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

      // click()和dialog等待用Promise.all并发(顺序await会让click()被自己触发的alert卡死,真机CI实测过的坑)
      const [dialog] = await Promise.all([
        page.waitForEvent('dialog'),
        page.getByTestId(testIds.speakingDetail.saveButton).click(),
      ]);
      expect(dialog.message()).toContain('主讲 1');
      expect(dialog.message()).toContain('听讲 1');
      await dialog.accept();

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
