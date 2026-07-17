import { expect, test } from '@playwright/test';
import { createTestProfile, deleteTestProfile, withDb } from './db';
import { ADMIN_EMAIL, TEST_PASSWORD } from './global-setup';
import { expectDisabled, expectEnabled, loginAs } from './helpers';
import { testIds } from '../lib/testids';

// 学期末升学批处理 系统性覆盖(2026-07-16·PM"继续完成"剩余测试缺口第四批)。
// advancement/[studentId].tsx(升学评定详情)+ advancement/semester-end/[cohortId].tsx
// (学期末一站式工作流)此前0个testID、这块业务最高风险的写路径(毕业/留级/离班留痕+
// class_members状态机+留级次数原子触发器+转下一届四步写入)零e2e覆盖。
// advancement/index.tsx(报数升学列表)是纯读页,没有写操作,不在本批范围内。
// ⚠️ 不复用共享E2E班:毕业/留级会改class_members.status,可能干扰其它spec对该班学员
// 名单/状态的假设——每条测试自建一次性班级+一次性学员,用完通过删cohort级联清理。

async function makeThrowawayCohort(name: string): Promise<string> {
  const { rows: [{ id: programId }] } = await withDb((c) => c.query(`SELECT id FROM programs WHERE code='E2E_JX'`));
  const { rows: [{ id: cohortId }] } = await withDb((c) =>
    c.query(
      `INSERT INTO cohorts (program_id, name, code, start_date, timezone, is_active) VALUES ($1,$2,$3,'2026-01-01','Asia/Shanghai',true) RETURNING id`,
      [programId, name, `E2E_ADV_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`],
    ),
  );
  return cohortId as string;
}

async function addMember(cohortId: string, userId: string, memberRole: 'formal' | 'auditor' = 'formal') {
  await withDb((c) =>
    c.query(
      `INSERT INTO class_members (cohort_id, user_id, member_role, status, joined_at, is_primary) VALUES ($1,$2,$3,'active','2026-01-01T00:00:00Z',true)`,
      [cohortId, userId, memberRole],
    ),
  );
}

test.describe('升学评定详情(advancement/[studentId].tsx)', () => {
  test('录入考试成绩 + 标记毕业 → exam_grades与advancement_records落库,class_members状态变更', async ({ page }) => {
    const cohortId = await makeThrowawayCohort(`E2E升学一次性班-${Date.now()}`);
    const userId = await createTestProfile(`e2e-adv-grad-${Date.now()}@local.test`, `E2E待毕业-${Date.now()}`);
    await addMember(cohortId, userId, 'formal');
    try {
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);
      await page.goto(`/advancement/${userId}`, { timeout: 45_000 });

      // 录入考试成绩:闭卷85分(共修出勤0次<93次门槛,闭卷合格线60分 → 应判合格)
      await page.getByTestId(testIds.advancement.examEntryButton).click();
      await page.getByPlaceholder('如:第一次考试 / 加行结业考').fill('E2E测试考试');
      await page.getByPlaceholder('如:85').fill('85');
      await page.getByTestId(testIds.advancement.examSaveButton).click();
      // handleExam成功只setExamOpen(false)静默关弹层,没有notify()提示——下面DB核对是真依据
      await expect(page.getByText('再录一次', { exact: true })).toBeVisible({ timeout: 10_000 });

      const { rows: grades } = await withDb((c) => c.query(`SELECT score, is_pass, exam_format FROM exam_grades WHERE user_id=$1`, [userId]));
      expect(grades.length).toBe(1);
      // exam_grades.score是numeric列,node-pg按驱动默认把numeric返回成字符串(避免大数精度丢失)
      // 而不是JS number——真机CI实测过的坑,这里要显式转数字再比较,不是"85"==="85"的字符串比较。
      expect(Number(grades[0].score)).toBe(85);
      expect(grades[0].is_pass).toBe(true);
      expect(grades[0].exam_format).toBe('closed');

      // 标记毕业:无前置confirm弹窗(handleConfirm不调用window.alert/confirm),直接判定
      await page.getByTestId(testIds.advancement.graduateButton).click();
      await page.getByPlaceholder('如:五维达标,发心精进,准予毕业').fill('E2E测试:五维达标,准予毕业');
      await page.getByTestId(testIds.advancement.confirmActionButton).click();
      await expect(page.getByText('已毕业', { exact: true })).toBeVisible({ timeout: 10_000 });

      const { rows: records } = await withDb((c) => c.query(`SELECT decision, basis FROM advancement_records WHERE user_id=$1`, [userId]));
      expect(records.length).toBe(1);
      expect(records[0].decision).toBe('graduated');
      const { rows: members } = await withDb((c) => c.query(`SELECT status, graduated_at FROM class_members WHERE cohort_id=$1 AND user_id=$2`, [cohortId, userId]));
      expect(members[0].status).toBe('graduated');
      expect(members[0].graduated_at).not.toBeNull();
    } finally {
      await withDb((c) => c.query(`DELETE FROM cohorts WHERE id=$1`, [cohortId]));
      await deleteTestProfile(userId);
    }
  });
});

test.describe('学期末一站式工作流(advancement/semester-end/[cohortId].tsx)', () => {
  test('正式学员留级(留原班重修)+ 旁听继续 + 标记结班', async ({ page }) => {
    const cohortId = await makeThrowawayCohort(`E2E学期末一次性班-${Date.now()}`);
    const userFormal = await createTestProfile(`e2e-adv-hb-${Date.now()}@local.test`, `E2E正式待留级-${Date.now()}`);
    const userAuditor = await createTestProfile(`e2e-adv-aud-${Date.now()}@local.test`, `E2E旁听待处理-${Date.now()}`);
    await addMember(cohortId, userFormal, 'formal');
    await addMember(cohortId, userAuditor, 'auditor');
    try {
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);
      await page.goto(`/advancement/semester-end/${cohortId}`, { timeout: 45_000 });
      await expect(page.getByText('待处理(2)', { exact: true })).toBeVisible();

      // 正式学员 → 留级 → 留原班重修
      await page.getByTestId(testIds.semesterEnd.processButton(userFormal)).click();
      await page.getByText('留级', { exact: true }).click();
      await page.getByPlaceholder('留级原因').fill('E2E测试:修量未达标,留原班重修');
      await page.getByText('确认留级', { exact: true }).click();
      await expect(page.getByText('待处理(1)', { exact: true })).toBeVisible({ timeout: 10_000 });

      const { rows: formalAfter } = await withDb((c) => c.query(`SELECT status, held_back_count FROM class_members WHERE cohort_id=$1 AND user_id=$2`, [cohortId, userFormal]));
      expect(formalAfter[0].status).toBe('held_back');
      expect(formalAfter[0].held_back_count).toBe(1);
      const { rows: formalRecord } = await withDb((c) => c.query(`SELECT decision, to_cohort_id FROM advancement_records WHERE user_id=$1`, [userFormal]));
      expect(formalRecord[0].decision).toBe('held_back');
      expect(formalRecord[0].to_cohort_id).toBeNull(); // 留原班重修:不转班,to_cohort_id为空

      // 旁听 → 继续旁听(不改状态,只留痕)
      await page.getByTestId(testIds.semesterEnd.processButton(userAuditor)).click();
      await page.getByText('继续旁听', { exact: true }).click();
      await page.getByText('确认', { exact: true }).click();
      await expect(page.getByText('待处理(0)', { exact: true })).toBeVisible({ timeout: 10_000 });

      const { rows: auditorAfter } = await withDb((c) => c.query(`SELECT status FROM class_members WHERE cohort_id=$1 AND user_id=$2`, [cohortId, userAuditor]));
      expect(auditorAfter[0].status).toBe('active'); // 继续旁听不改状态(决策018)
      const { rows: auditorRecord } = await withDb((c) => c.query(`SELECT decision FROM advancement_records WHERE user_id=$1`, [userAuditor]));
      expect(auditorRecord[0].decision).toBe('other');

      // 标记结班(confirmAsync确认框)
      page.once('dialog', (d) => { void d.accept(); });
      await page.getByText('标记结班', { exact: true }).click();
      await page.waitForTimeout(800);
      const { rows: cohortAfter } = await withDb((c) => c.query(`SELECT is_active FROM cohorts WHERE id=$1`, [cohortId]));
      expect(cohortAfter[0].is_active).toBe(false);
    } finally {
      await withDb((c) => c.query(`DELETE FROM cohorts WHERE id=$1`, [cohortId]));
      await deleteTestProfile(userFormal);
      await deleteTestProfile(userAuditor);
    }
  });

  test('正式学员留级(转下一届) → 旧班held_back+撤主班,新班建档+承接留级次数+留痕to_cohort_id', async ({ page }) => {
    const cohortFromId = await makeThrowawayCohort(`E2E转班源班-${Date.now()}`);
    const cohortToName = `E2E转班目标班-${Date.now()}`;
    const cohortToId = await makeThrowawayCohort(cohortToName);
    const userId = await createTestProfile(`e2e-adv-transfer-${Date.now()}@local.test`, `E2E待转班-${Date.now()}`);
    await addMember(cohortFromId, userId, 'formal');
    try {
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);
      await page.goto(`/advancement/semester-end/${cohortFromId}`, { timeout: 45_000 });

      await page.getByTestId(testIds.semesterEnd.processButton(userId)).click();
      await page.getByText('留级', { exact: true }).click();
      await page.getByText('转下一届', { exact: true }).click();
      await page.getByText(cohortToName, { exact: true }).click();
      await page.getByPlaceholder('留级原因').fill('E2E测试:转下一届继续学修');
      await page.getByText('确认留级', { exact: true }).click();
      await expect(page.getByText('待处理(0)', { exact: true })).toBeVisible({ timeout: 10_000 });

      const { rows: fromRow } = await withDb((c) => c.query(`SELECT status, is_primary, held_back_count FROM class_members WHERE cohort_id=$1 AND user_id=$2`, [cohortFromId, userId]));
      expect(fromRow[0].status).toBe('held_back');
      expect(fromRow[0].is_primary).toBe(false);
      expect(fromRow[0].held_back_count).toBe(1);

      const { rows: toRow } = await withDb((c) => c.query(`SELECT status, is_primary, member_role, held_back_count FROM class_members WHERE cohort_id=$1 AND user_id=$2`, [cohortToId, userId]));
      expect(toRow.length).toBe(1);
      expect(toRow[0].status).toBe('active');
      expect(toRow[0].is_primary).toBe(true);
      expect(toRow[0].member_role).toBe('formal');
      expect(toRow[0].held_back_count).toBe(1); // 承接旧班触发器算出的留级次数,不是自己另算

      const { rows: record } = await withDb((c) => c.query(`SELECT decision, from_cohort_id, to_cohort_id FROM advancement_records WHERE user_id=$1`, [userId]));
      expect(record.length).toBe(1);
      expect(record[0].decision).toBe('held_back');
      expect(record[0].from_cohort_id).toBe(cohortFromId);
      expect(record[0].to_cohort_id).toBe(cohortToId);
    } finally {
      await withDb((c) => c.query(`DELETE FROM cohorts WHERE id IN ($1,$2)`, [cohortFromId, cohortToId]));
      await deleteTestProfile(userId);
    }
  });
});

// 异常输入扩展(2026-07-17·PM"这两个都要测"·测试计划①):考试分数-1/101/非数字前端确实
// 挡住(已有校验);小数(如85.5)不挡——这是记录现状,不是bug断言,升学考试成绩是否该限定
// 整数属于PM决定——2026-07-17 PM明确要求:不允许小数,已改前端校验(scoreValid加
// Number.isInteger)+ DB层同口径约束(supabase/migrations/20260717000000_
// exam_score_integer_check.sql)。这条测试从"确认现状"改成"确认修复生效"。
test.describe('异常输入:考试分数边界', () => {
  test('填-1/101/非数字/小数 → 保存按钮禁用;填合法整数85 → 解除禁用,能正常存入', async ({ page }) => {
    const cohortId = await makeThrowawayCohort(`E2E考试边界一次性班-${Date.now()}`);
    const userId = await createTestProfile(`e2e-adv-examedge-${Date.now()}@local.test`, `E2E考试边界-${Date.now()}`);
    await addMember(cohortId, userId, 'formal');
    try {
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);
      await page.goto(`/advancement/${userId}`, { timeout: 45_000 });
      await page.getByTestId(testIds.advancement.examEntryButton).click();
      await page.getByPlaceholder('如:第一次考试 / 加行结业考').fill('E2E边界测试考试');

      for (const bad of ['-1', '101', 'abc', '85.5']) {
        await page.getByTestId(testIds.advancement.examScoreInput).fill(bad);
        await expectDisabled(page.getByTestId(testIds.advancement.examSaveButton));
      }
      await expect(page.getByText('请输入 0-100 之间的整数,不支持小数', { exact: true })).toBeVisible();

      await page.getByTestId(testIds.advancement.examScoreInput).fill('85');
      await expect(page.getByText('请输入 0-100 之间的整数,不支持小数', { exact: true })).not.toBeVisible();
      await expectEnabled(page.getByTestId(testIds.advancement.examSaveButton));
      await page.getByTestId(testIds.advancement.examSaveButton).click();
      await expect(page.getByText('再录一次', { exact: true })).toBeVisible({ timeout: 10_000 });

      const { rows } = await withDb((c) => c.query(`SELECT score FROM exam_grades WHERE user_id=$1`, [userId]));
      expect(rows.length).toBe(1);
      expect(Number(rows[0].score)).toBe(85);
    } finally {
      await withDb((c) => c.query(`DELETE FROM cohorts WHERE id=$1`, [cohortId]));
      await deleteTestProfile(userId);
    }
  });
});
