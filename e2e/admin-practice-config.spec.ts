import { expect, test } from '@playwright/test';
import { createTestProfile, deleteTestProfile, withDb } from './db';
import { ADMIN_EMAIL, TEST_PASSWORD } from './global-setup';
import { loginAs } from './helpers';
import { testIds } from '../lib/testids';

// 功课模板配置(practice-config/index.tsx)剩余交互 系统性覆盖(2026-07-16·PM"继续完成"
// 剩余测试缺口第七批 + "把剩余的测试内容也加进去"追加批)。此前只测过"新建模板"
// (idempotency.spec.ts::双击去重),编辑/停用启用/传承要求清单/按班覆盖/同步发放/自选经候选
// 清单这些都补齐了。不碰共享E2E_JX专业:自建一次性专业,专测这页,用完删专业级联清理。

async function makeThrowawayProgram(): Promise<string> {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const { rows: [{ id: programId }] } = await withDb((c) =>
    c.query(`INSERT INTO programs (name, code, start_semester, weeks_per_semester) VALUES ($1,$2,1,26) RETURNING id`,
      [`E2E功课配置测试专业-${suffix}`, `E2E_PC_${suffix}`]),
  );
  return programId as string;
}

test.describe('编辑模板 + 停用/启用', () => {
  test('编辑模板名称 → practice_templates正确更新;停用(需确认)→启用 → is_active正确切换', async ({ page }) => {
    const programId = await makeThrowawayProgram();
    const { rows: [{ id: practiceId }] } = await withDb((c) => c.query(`SELECT id FROM practices LIMIT 1`));
    const originalName = `E2E测试模板-${Date.now()}`;
    const { rows: [{ id: templateId }] } = await withDb((c) =>
      c.query(
        `INSERT INTO practice_templates (practice_id, template_name, target_period, applies_to_programs, is_active)
         VALUES ($1,$2,'lifetime',$3,true) RETURNING id`,
        [practiceId, originalName, [programId]],
      ),
    );
    try {
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);
      await page.goto('/practice-config', { timeout: 45_000 });
      await page.getByTestId(testIds.practiceConfig.programChip(programId)).click();
      await expect(page.getByText(originalName, { exact: true })).toBeVisible({ timeout: 10_000 });

      const newName = `${originalName}-已编辑`;
      await page.getByTestId(testIds.practiceConfig.editButton(templateId)).click();
      await page.getByTestId(testIds.practiceConfig.nameInput).fill(newName);
      await page.getByTestId(testIds.practiceConfig.submitButton).click();
      await expect(page.getByText(newName, { exact: true })).toBeVisible({ timeout: 10_000 });

      const { rows: afterEdit } = await withDb((c) => c.query(`SELECT template_name FROM practice_templates WHERE id=$1`, [templateId]));
      expect(afterEdit[0].template_name).toBe(newName);

      // 停用:onToggle里有confirmAsync确认框(只在"启用→停用"方向拦)
      page.once('dialog', (d) => { void d.accept(); });
      await page.getByTestId(testIds.practiceConfig.toggleButton(templateId)).click();
      await expect(page.getByText('已停用', { exact: true })).toBeVisible({ timeout: 10_000 });
      const { rows: afterOff } = await withDb((c) => c.query(`SELECT is_active FROM practice_templates WHERE id=$1`, [templateId]));
      expect(afterOff[0].is_active).toBe(false);

      // 启用:反方向无confirm,直接生效
      await page.getByTestId(testIds.practiceConfig.toggleButton(templateId)).click();
      await expect(page.getByText('已停用', { exact: true })).toBeHidden({ timeout: 10_000 });
      const { rows: afterOn } = await withDb((c) => c.query(`SELECT is_active FROM practice_templates WHERE id=$1`, [templateId]));
      expect(afterOn[0].is_active).toBe(true);
    } finally {
      await withDb((c) => c.query(`DELETE FROM practice_templates WHERE id=$1`, [templateId]));
      await withDb((c) => c.query(`DELETE FROM programs WHERE id=$1`, [programId]));
    }
  });
});

test.describe('传承要求清单', () => {
  test('新增传承 → transmissions落库;勾选加入本专业要求清单 → 取消勾选移除', async ({ page }) => {
    const programId = await makeThrowawayProgram();
    const transmissionName = `E2E测试传承-${Date.now()}`;
    try {
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);
      await page.goto('/practice-config', { timeout: 45_000 });
      await page.getByTestId(testIds.practiceConfig.programChip(programId)).click();

      await page.getByTestId(testIds.practiceConfig.newTransmissionButton).click();
      await page.getByTestId(testIds.practiceConfig.transmissionNameInput).fill(transmissionName);
      await page.getByTestId(testIds.practiceConfig.transmissionSaveButton).click();
      await expect(page.getByText(transmissionName, { exact: true })).toBeVisible({ timeout: 10_000 });

      const { rows: created } = await withDb((c) => c.query(`SELECT id, source_kind FROM transmissions WHERE name=$1`, [transmissionName]));
      expect(created.length).toBe(1);
      expect(created[0].source_kind).toBe('course'); // 默认选中"随课程听闻"
      const transmissionId = created[0].id as string;

      await page.getByTestId(testIds.practiceConfig.requiredTransmissionChip(transmissionId)).click();
      await expect.poll(async () => {
        const { rows } = await withDb((c) =>
          c.query(`SELECT count(*) FROM program_required_transmissions WHERE program_id=$1 AND transmission_id=$2`, [programId, transmissionId]));
        return Number(rows[0].count);
      }, { timeout: 10_000 }).toBe(1);

      await page.getByTestId(testIds.practiceConfig.requiredTransmissionChip(transmissionId)).click();
      await expect.poll(async () => {
        const { rows } = await withDb((c) =>
          c.query(`SELECT count(*) FROM program_required_transmissions WHERE program_id=$1 AND transmission_id=$2`, [programId, transmissionId]));
        return Number(rows[0].count);
      }, { timeout: 10_000 }).toBe(0);
    } finally {
      const { rows } = await withDb((c) => c.query(`SELECT id FROM transmissions WHERE name=$1`, [transmissionName]));
      if (rows[0]) {
        await withDb((c) => c.query(`DELETE FROM program_required_transmissions WHERE transmission_id=$1`, [rows[0].id]));
        await withDb((c) => c.query(`DELETE FROM transmissions WHERE id=$1`, [rows[0].id]));
      }
      await withDb((c) => c.query(`DELETE FROM programs WHERE id=$1`, [programId]));
    }
  });
});

test.describe('按班覆盖 + 同步发放', () => {
  test('覆盖(bind)→ cohort_recommended_templates落库;同步发放 → 全班补愿(幂等重跑不重复);取消覆盖(需确认)→ 回落专业默认', async ({ page }) => {
    const programId = await makeThrowawayProgram();
    const { rows: [{ id: cohortId }] } = await withDb((c) =>
      c.query(`INSERT INTO cohorts (program_id, name, code, start_date, timezone, is_active) VALUES ($1,$2,$3,'2026-01-01','Asia/Shanghai',true) RETURNING id`,
        [programId, `E2E按班覆盖测试班-${Date.now()}`, `E2E_BIND_${Date.now()}`]),
    );
    const memberId = await createTestProfile(`e2e-bind-${Date.now()}@local.test`, `E2E按班覆盖测试学员-${Date.now()}`);
    await withDb((c) =>
      c.query(`INSERT INTO class_members (cohort_id, user_id, member_role, status, joined_at, is_primary) VALUES ($1,$2,'formal','active','2026-01-01T00:00:00Z',true)`, [cohortId, memberId]),
    );
    const { rows: [{ id: practiceId }] } = await withDb((c) => c.query(`SELECT id FROM practices LIMIT 1`));
    const { rows: [{ id: templateId }] } = await withDb((c) =>
      c.query(
        `INSERT INTO practice_templates (practice_id, template_name, target_period, applies_to_programs, is_active)
         VALUES ($1,$2,'lifetime',$3,true) RETURNING id`,
        [practiceId, `E2E覆盖测试模板-${Date.now()}`, [programId]],
      ),
    );
    try {
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);
      await page.goto('/practice-config', { timeout: 45_000 });
      await page.getByTestId(testIds.practiceConfig.programChip(programId)).click();
      await page.getByTestId(testIds.practiceConfig.cohortChip(cohortId)).click();
      await expect(page.getByText('＋ 覆盖', { exact: true })).toBeVisible({ timeout: 10_000 });

      // 覆盖:无confirm,直接bind
      await page.getByTestId(testIds.practiceConfig.bindToggleButton(templateId)).click();
      await expect(page.getByText('✓ 覆盖中', { exact: true })).toBeVisible({ timeout: 10_000 });
      const { rows: boundRow } = await withDb((c) => c.query(`SELECT binding FROM cohort_recommended_templates WHERE cohort_id=$1 AND template_id=$2`, [cohortId, templateId]));
      expect(boundRow.length).toBe(1);
      expect(boundRow[0].binding).toBe('auto');

      // 同步发放:全班1个在读学员,此前无愿 → 补1条
      await page.getByTestId(testIds.practiceConfig.provisionButton).click();
      await expect(page.getByText('已补发 1 条新愿', { exact: false })).toBeVisible({ timeout: 10_000 });
      const { rows: vows } = await withDb((c) =>
        c.query(`SELECT id FROM user_practice_vows WHERE user_id=$1 AND cohort_id=$2 AND practice_id=$3 AND source='auto'`, [memberId, cohortId, practiceId]),
      );
      expect(vows.length).toBe(1);

      // 幂等重跑:已发过的不重复,提示变"全班已是最新"
      await page.getByTestId(testIds.practiceConfig.provisionButton).click();
      await expect(page.getByText('全班已是最新', { exact: false })).toBeVisible({ timeout: 10_000 });
      const { rows: vowsAfterRerun } = await withDb((c) =>
        c.query(`SELECT count(*) FROM user_practice_vows WHERE user_id=$1 AND cohort_id=$2 AND practice_id=$3 AND source='auto'`, [memberId, cohortId, practiceId]),
      );
      expect(Number(vowsAfterRerun[0].count)).toBe(1); // 没有变成2条

      // 取消覆盖:有confirmAsync确认框
      page.once('dialog', (d) => { void d.accept(); });
      await page.getByTestId(testIds.practiceConfig.bindToggleButton(templateId)).click();
      await expect(page.getByText('＋ 覆盖', { exact: true })).toBeVisible({ timeout: 10_000 });
      const { rows: afterUnbind } = await withDb((c) => c.query(`SELECT count(*) FROM cohort_recommended_templates WHERE cohort_id=$1 AND template_id=$2`, [cohortId, templateId]));
      expect(Number(afterUnbind[0].count)).toBe(0);
      // 已发放的愿不回收(代码注释明确的设计,取消覆盖只影响以后,不追溯)
      const { rows: vowsAfterUnbind } = await withDb((c) => c.query(`SELECT count(*) FROM user_practice_vows WHERE id=ANY($1)`, [vows.map((v) => v.id)]));
      expect(Number(vowsAfterUnbind[0].count)).toBe(1);
    } finally {
      await withDb((c) => c.query(`DELETE FROM practice_templates WHERE id=$1`, [templateId]));
      await withDb((c) => c.query(`DELETE FROM cohorts WHERE id=$1`, [cohortId]));
      await deleteTestProfile(memberId);
      await withDb((c) => c.query(`DELETE FROM programs WHERE id=$1`, [programId]));
    }
  });
});

test.describe('自选经候选清单', () => {
  test('勾选加入候选清单 → program_optional_practices落库;取消勾选 → 移除', async ({ page }) => {
    const programId = await makeThrowawayProgram();
    const { rows: [{ id: practiceId }] } = await withDb((c) => c.query(`SELECT id FROM practices LIMIT 1`));
    try {
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);
      await page.goto('/practice-config', { timeout: 45_000 });
      await page.getByTestId(testIds.practiceConfig.programChip(programId)).click();

      await page.getByTestId(testIds.practiceConfig.optionalPracticeChip(practiceId)).click();
      await expect.poll(async () => {
        const { rows } = await withDb((c) => c.query(`SELECT count(*) FROM program_optional_practices WHERE program_id=$1 AND practice_id=$2`, [programId, practiceId]));
        return Number(rows[0].count);
      }, { timeout: 10_000 }).toBe(1);

      await page.getByTestId(testIds.practiceConfig.optionalPracticeChip(practiceId)).click();
      await expect.poll(async () => {
        const { rows } = await withDb((c) => c.query(`SELECT count(*) FROM program_optional_practices WHERE program_id=$1 AND practice_id=$2`, [programId, practiceId]));
        return Number(rows[0].count);
      }, { timeout: 10_000 }).toBe(0);
    } finally {
      await withDb((c) => c.query(`DELETE FROM program_optional_practices WHERE program_id=$1`, [programId]));
      await withDb((c) => c.query(`DELETE FROM programs WHERE id=$1`, [programId]));
    }
  });
});
