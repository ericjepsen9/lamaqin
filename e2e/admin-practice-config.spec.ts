import { expect, test } from '@playwright/test';
import { createTestProfile, deleteTestProfile, withDb } from './db';
import { ADMIN_EMAIL, TEST_PASSWORD } from './global-setup';
import { expectDisabled, expectEnabled, loginAs } from './helpers';
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

// 异常输入扩展(2026-07-17·PM"这两个都要测"·测试计划①):每座门槛30分钟大纲底线的前端
// 校验、以及"负数会被静默转null"这个现状(不是bug断言,是记录当前行为——是否要改成显式报错
// 属于PM决定,这里先如实确认现在到底是怎样)。
test.describe('异常输入:每座门槛大纲底线', () => {
  test('填29 → 保存按钮禁用+显示底线提示;填30 → 解除禁用,可正常保存', async ({ page }) => {
    const { rows: [{ id: practiceId }] } = await withDb((c) => c.query(`SELECT id FROM practices LIMIT 1`));
    const tplName = `E2E门槛测试模板-${Date.now()}`;
    try {
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);
      await page.goto('/practice-config', { timeout: 45_000 });
      await page.getByTestId(testIds.practiceConfig.newTemplateButton).click();
      await page.getByTestId(testIds.practiceConfig.practiceChip(practiceId)).click();
      await page.getByTestId(testIds.practiceConfig.nameInput).fill(tplName);

      await page.getByTestId(testIds.practiceConfig.minSessionInput).fill('29');
      await expect(page.getByText('门槛不能低于 30 分钟', { exact: false })).toBeVisible();
      await expectDisabled(page.getByTestId(testIds.practiceConfig.submitButton));

      await page.getByTestId(testIds.practiceConfig.minSessionInput).fill('30');
      await expect(page.getByText('门槛不能低于 30 分钟', { exact: false })).not.toBeVisible();
      await expectEnabled(page.getByTestId(testIds.practiceConfig.submitButton));
      await page.getByTestId(testIds.practiceConfig.submitButton).click();
      await expect(page.getByText(tplName, { exact: true })).toBeVisible({ timeout: 10_000 });

      const { rows } = await withDb((c) => c.query(`SELECT default_min_session_minutes FROM practice_templates WHERE template_name=$1`, [tplName]));
      expect(rows.length).toBe(1);
      expect(rows[0].default_min_session_minutes).toBe(30);
    } finally {
      await withDb((c) => c.query(`DELETE FROM practice_templates WHERE template_name=$1`, [tplName]));
    }
  });
});

test.describe('异常输入:数字框填负数(确认现状——静默转null,不报错)', () => {
  test('每日目标/起修偏移/完成天数填负数 → 前端toNum()静默当成"不设",不阻止保存,DB里对应列是NULL不是负数', async ({ page }) => {
    const { rows: [{ id: practiceId }] } = await withDb((c) => c.query(`SELECT id FROM practices LIMIT 1`));
    const tplName = `E2E负数测试模板-${Date.now()}`;
    try {
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);
      await page.goto('/practice-config', { timeout: 45_000 });
      await page.getByTestId(testIds.practiceConfig.newTemplateButton).click();
      await page.getByTestId(testIds.practiceConfig.practiceChip(practiceId)).click();
      await page.getByTestId(testIds.practiceConfig.nameInput).fill(tplName);

      // 默认周期是until_complete,每日目标非必填——负数在这个周期下不会挡住提交,
      // 这正是要确认的现状(如果周期是"每日",toNum()判空会挡,但那是另一条路径)。
      await page.getByTestId(testIds.practiceConfig.dailyTargetInput).fill('-5');
      await page.getByTestId(testIds.practiceConfig.offsetDaysInput).fill('-10');
      await page.getByTestId(testIds.practiceConfig.durationDaysInput).fill('-20');
      await expectEnabled(page.getByTestId(testIds.practiceConfig.submitButton));
      await page.getByTestId(testIds.practiceConfig.submitButton).click();
      await expect(page.getByText(tplName, { exact: true })).toBeVisible({ timeout: 10_000 });

      const { rows } = await withDb((c) =>
        c.query(`SELECT default_daily_target, starts_offset_days, duration_days FROM practice_templates WHERE template_name=$1`, [tplName]),
      );
      expect(rows.length).toBe(1);
      // 不是-5/-10/-20,是null——toNum()把负数判成非法值,静默转null(="不设"),不是报错拒绝
      // ⚠️真机CI实测踩过的坑:数据库列名是default_daily_target(带前缀),不是daily_target——
      // 跟starts_offset_days/duration_days(不带default_前缀)命名不一致,第一版测试想当然拼错了列名
      expect(rows[0].default_daily_target).toBeNull();
      expect(rows[0].starts_offset_days).toBeNull();
      expect(rows[0].duration_days).toBeNull();
    } finally {
      await withDb((c) => c.query(`DELETE FROM practice_templates WHERE template_name=$1`, [tplName]));
    }
  });
});

// 并发/竞态(2026-07-17·测试计划④场景2):useUpdateTemplate是整行UPDATE(rowFromInput()把
// 表单当前全部字段都打包进payload),没有字段级合并。这条测试目的是确认这条已知设计现状,
// 不是找bug——但值得让PM知道:两个管理员前后脚各改一个不同字段,后保存的会把前一个人刚保存
// 的改动悄悄覆盖回自己模态框打开时的旧值,即使他根本没碰那个字段。不需要真的两个浏览器上下文
// 抢时序才能测出来(这条不像study_records那样有窄窗口的竞态,是任何时序下都必然发生的
// 确定性行为)——用DB直接模拟"另一个管理员在我提交前抢先改了别的字段"即可可靠复现。
test.describe('并发/竞态:整行UPDATE没有字段级合并(测试计划④场景2·确认已知设计,非bug)', () => {
  test('admin甲打开编辑框后,admin乙抢先改了每日目标 → 甲只改名称提交 → 乙刚改的每日目标被甲悄悄覆盖回旧值', async ({ page }) => {
    const programId = await makeThrowawayProgram();
    const { rows: [{ id: practiceId }] } = await withDb((c) => c.query(`SELECT id FROM practices LIMIT 1`));
    const originalName = `E2E并发覆盖测试模板-${Date.now()}`;
    const staleDailyTarget = 100;
    // ⚠️真机CI实测踩过的坑:practice-config/index.tsx列表按当前选中的专业chip过滤
    // (t.appliesToPrograms ?? []).includes(progId)——不选专业progId是null直接显示空列表,
    // appliesToPrograms不填(NULL)也一样匹配不上任何专业(?? []是空数组,恒不包含任何id)。
    // 跟"编辑模板+停用/启用"那条测试一样,必须显式挂上一个专业+选中对应chip才能让卡片出现。
    const { rows: [{ id: templateId }] } = await withDb((c) =>
      c.query(
        `INSERT INTO practice_templates (practice_id, template_name, target_period, default_daily_target, applies_to_programs, is_active)
         VALUES ($1,$2,'lifetime',$3,$4,true) RETURNING id`,
        [practiceId, originalName, staleDailyTarget, [programId]],
      ),
    );
    try {
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);
      await page.goto('/practice-config', { timeout: 45_000 });
      await page.getByTestId(testIds.practiceConfig.programChip(programId)).click();
      await expect(page.getByText(originalName, { exact: true })).toBeVisible({ timeout: 10_000 });
      // admin甲打开编辑框:表单此刻把每日目标灌成100(editingTpl快照)
      await page.getByTestId(testIds.practiceConfig.editButton(templateId)).click();
      await expect(page.getByTestId(testIds.practiceConfig.dailyTargetInput)).toHaveValue(String(staleDailyTarget));

      // 模拟admin乙在甲的编辑框开着的这段时间,已经把每日目标改成999并保存成功了
      // (甲的表单不会自动感知这个外部变化,input里显示的还是100)
      await withDb((c) => c.query(`UPDATE practice_templates SET default_daily_target=999 WHERE id=$1`, [templateId]));

      // 甲全程没碰每日目标这个字段,只改了名称就提交——payload里"每日目标"这一项仍是甲表单
      // 里的旧快照100,不是乙刚存进去的999
      const newName = `${originalName}-甲改的名字`;
      await page.getByTestId(testIds.practiceConfig.nameInput).fill(newName);
      await page.getByTestId(testIds.practiceConfig.submitButton).click();
      await expect(page.getByText(newName, { exact: true })).toBeVisible({ timeout: 10_000 });

      const { rows } = await withDb((c) => c.query(`SELECT template_name, default_daily_target FROM practice_templates WHERE id=$1`, [templateId]));
      expect(rows[0].template_name).toBe(newName); // 甲的改动生效了
      // 确认已知现状:乙的999被甲的旧快照100悄悄覆盖回去,不是保留乙的改动、也不是报错提醒甲
      // "有别人改过"——整行UPDATE没有版本冲突检测,后保存者的全量快照总是赢。
      expect(rows[0].default_daily_target).toBe(staleDailyTarget);
    } finally {
      await withDb((c) => c.query(`DELETE FROM practice_templates WHERE id=$1`, [templateId]));
      await withDb((c) => c.query(`DELETE FROM programs WHERE id=$1`, [programId]));
    }
  });
});
