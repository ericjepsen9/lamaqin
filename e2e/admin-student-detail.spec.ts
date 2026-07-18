import { expect, type Page, test } from '@playwright/test';
import { createTestProfile, deleteTestProfile, getSeedIds, withDb } from './db';
import { ADMIN_EMAIL, TEST_PASSWORD } from './global-setup';
import { loginAs, pickDate } from './helpers';
import { testIds } from '../lib/testids';

// 学员详情页(app/(admin)/students/[id].tsx + StudentAdminActions/StudentTransmissions)系统性
// 覆盖(2026-07-18·后台全面测试方案批①)。此前"管理操作"里除批准/拒绝/旁听转正外全部零测试
// (切主班/设宽限-暂停-纠错/代行),传承记录/无障碍学修/撤回注销这几块更是连"零测试"都算不上——
// 它们只存在于独立路由 /students/[id],宽屏(默认1280px≥900)走的是 /students 内嵌 Master-Detail
// 面板,根本不渲染这几块(见 students/index.tsx::StudentDetailPanel 与 students/[id].tsx 的差异)。
// 按PM 2026-07-18决定"两条路径都测":共用组件(管理操作)走宽屏面板测(现有测试也是这么测的,
// 保持一致);独立路由才有的区块(传承/无障碍/撤回注销)显式设窄视口触发。

const WIDE_VIEWPORT = { width: 1280, height: 900 };
const NARROW_VIEWPORT = { width: 700, height: 900 };

// profiles.status 受 profiles_protect_status_trigger 保护(非 admin/未开旁路时 UPDATE 被静默还原,
// 见 supabase/migrations/20260618000010_identity_and_class.sql)。set_config 是 SESSION 级
// (is_local=false),必须跟 UPDATE 在同一个 withDb() 回调、同一条连接里才生效(同
// admin-student-management.spec.ts 已有先例·2026-07-16 真机踩过一次)。
async function activateProfile(userId: string): Promise<void> {
  await withDb(async (c) => {
    await c.query(`SELECT set_config('app.allow_protected_write','on',false)`);
    await c.query(`UPDATE profiles SET status='active' WHERE id=$1`, [userId]);
    await c.query(`SELECT set_config('app.allow_protected_write','off',false)`);
  });
}

async function requestAccountDeletion(userId: string): Promise<void> {
  await withDb(async (c) => {
    await c.query(`SELECT set_config('app.allow_protected_write','on',false)`);
    await c.query(`UPDATE profiles SET status='active', deletion_requested_at=now() WHERE id=$1`, [userId]);
    await c.query(`SELECT set_config('app.allow_protected_write','off',false)`);
  });
}

async function makeSecondCohort(seedCohortId: string): Promise<string> {
  const { rows: [{ id }] } = await withDb((c) =>
    c.query(
      `INSERT INTO cohorts (program_id, name, code, start_date, timezone)
       SELECT program_id, 'E2E第二班-临时', $2, start_date, timezone FROM cohorts WHERE id=$1
       RETURNING id`,
      [seedCohortId, `E2E_CO2_${Date.now()}`],
    ),
  );
  return id as string;
}

// 未锁定的自动功课夹具(测设宽限/暂停恢复/座次门槛)。不复用现存 practices 行——
// 2026-07-17 回填迁移可能已把存量 practices 锁了目标白名单,自建一条保证行为确定。
async function makeAutoVow(userId: string, cohortId: string): Promise<string> {
  const { rows: [{ id: practiceId }] } = await withDb((c) =>
    c.query(`INSERT INTO practices (name, measurement, category, unit) VALUES ($1,'count','meditation','遍') RETURNING id`, [`E2E测试自动功课-${Date.now()}`]),
  );
  const { rows: [{ id: vowId }] } = await withDb((c) =>
    c.query(
      `INSERT INTO user_practice_vows (user_id, source, cohort_id, practice_id, target_period, start_date, status, current_end_date, min_session_minutes, is_required_for_promotion, share_to_collective)
       VALUES ($1,'auto',$2,$3,'lifetime','2026-01-01','active','2026-12-31',30,true,true) RETURNING id`,
      [userId, cohortId, practiceId],
    ),
  );
  return vowId as string;
}

// 每日目标锁定+白名单的自动功课夹具(测每日目标纠错,PD-6/R1)。
async function makeLockedAutoVow(userId: string, cohortId: string): Promise<string> {
  const { rows: [{ id: practiceId }] } = await withDb((c) =>
    c.query(
      `INSERT INTO practices (name, measurement, category, unit, allowed_daily_targets, daily_target_locked)
       VALUES ($1,'count','meditation','遍','{100,200,300}',true) RETURNING id`,
      [`E2E测试锁定功课-${Date.now()}`],
    ),
  );
  const { rows: [{ id: vowId }] } = await withDb((c) =>
    c.query(
      `INSERT INTO user_practice_vows (user_id, source, cohort_id, practice_id, target_period, start_date, status, current_end_date, daily_target, is_required_for_promotion, share_to_collective)
       VALUES ($1,'auto',$2,$3,'lifetime','2026-01-01','active','2026-12-31',100,true,true) RETURNING id`,
      [userId, cohortId, practiceId],
    ),
  );
  return vowId as string;
}

async function makeTransmissionOption(): Promise<string> {
  const { rows: [{ id }] } = await withDb((c) =>
    c.query(`INSERT INTO transmissions (name, source_kind) VALUES ($1,'course') RETURNING id`, [`E2E测试传承-${Date.now()}`]),
  );
  return id as string;
}

// 宽屏(默认1280,≥900 触发 Master-Detail):点学员卡片选中,在同一页嵌入侧栏,不导航。
async function openWidePanel(page: Page, name: string) {
  await page.setViewportSize(WIDE_VIEWPORT);
  await page.goto('/students', { timeout: 45_000 });
  await page.getByText(name, { exact: true }).first().click();
}

// 窄屏(<900):点学员卡片会真正导航到独立路由 /students/[id]。
async function openStandaloneRoute(page: Page, name: string) {
  await page.setViewportSize(NARROW_VIEWPORT);
  await page.goto('/students', { timeout: 45_000 });
  await page.getByText(name, { exact: true }).first().click();
  await page.waitForURL(/\/students\/[^/]+$/, { timeout: 15_000 });
}

test.describe('学员详情页:页面跳转正确性(宽屏嵌入面板 vs 窄屏独立路由)', () => {
  test('宽屏点学员 → 同页嵌入侧栏,URL不变,不渲染独立路由专属区块;窄屏点学员 → 真正导航到 /students/[id],能看到专属区块', async ({ page }) => {
    const email = `e2e-detailnav-${Date.now()}@local.test`;
    const name = `E2E导航测试-${Date.now()}`;
    const userId = await createTestProfile(email, name);
    try {
      await activateProfile(userId);
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);

      await openWidePanel(page, name);
      await expect(page.getByText('管理操作', { exact: true })).toBeVisible({ timeout: 10_000 });
      expect(page.url()).not.toMatch(/\/students\/[^/?]+$/);
      await expect(page.getByText('传承记录', { exact: true })).not.toBeVisible();

      await openStandaloneRoute(page, name);
      expect(page.url()).toMatch(/\/students\/[^/?]+$/);
      await expect(page.getByText('传承记录', { exact: true })).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText('无障碍学修', { exact: true })).toBeVisible();
    } finally {
      await deleteTestProfile(userId);
    }
  });
});

test.describe('管理操作:切主班', () => {
  test('学员已入2个班 → 切主班 → class_members.is_primary 正确转移', async ({ page }) => {
    const { cohortId: seedCohortId } = await getSeedIds();
    const email = `e2e-switchcohort-${Date.now()}@local.test`;
    const name = `E2E切主班-${Date.now()}`;
    const userId = await createTestProfile(email, name);
    const cohort2Id = await makeSecondCohort(seedCohortId);
    try {
      await activateProfile(userId);
      await withDb((c) => c.query(
        `INSERT INTO class_members (cohort_id, user_id, member_role, is_primary) VALUES ($1,$2,'formal',true), ($3,$2,'formal',false)`,
        [seedCohortId, userId, cohort2Id],
      ));
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);

      await openWidePanel(page, name);
      await page.getByTestId(testIds.students.switchCohortButton).click();
      await page.getByTestId(testIds.students.switchCohortOption(cohort2Id)).click();
      await page.waitForTimeout(800);

      const { rows } = await withDb((c) => c.query(`SELECT cohort_id, is_primary FROM class_members WHERE user_id=$1 ORDER BY cohort_id`, [userId]));
      const primary = rows.find((r) => r.is_primary);
      expect(primary.cohort_id).toBe(cohort2Id);
    } finally {
      await deleteTestProfile(userId);
      await withDb((c) => c.query(`DELETE FROM cohorts WHERE id=$1`, [cohort2Id]));
    }
  });
});

test.describe('管理操作:设宽限 / 暂停-恢复 / 座次门槛 / 每日目标纠错', () => {
  test('延长截止日 → current_end_date 更新;暂停→恢复 → status 正确切换;座次门槛 → min_session_minutes 更新', async ({ page }) => {
    const { cohortId } = await getSeedIds();
    const email = `e2e-grace-${Date.now()}@local.test`;
    const name = `E2E设宽限-${Date.now()}`;
    const userId = await createTestProfile(email, name);
    const vowId = await makeAutoVow(userId, cohortId);
    try {
      await activateProfile(userId);
      await withDb((c) => c.query(`INSERT INTO class_members (cohort_id, user_id, member_role) VALUES ($1,$2,'formal')`, [cohortId, userId]));
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);

      await openWidePanel(page, name);
      await page.getByTestId(testIds.students.graceButton).click();
      await page.getByTestId(testIds.students.graceVowRow(vowId)).click();

      await pickDate(page, testIds.students.graceDateInput, '2027-06-30');
      await page.getByTestId(testIds.students.graceExtendButton).click();
      await page.waitForTimeout(800);

      let row = await withDb((c) => c.query(`SELECT current_end_date, status, min_session_minutes FROM user_practice_vows WHERE id=$1`, [vowId]));
      expect(String(row.rows[0].current_end_date)).toContain('2027-06-30');

      // 座次门槛改成 45 分钟
      await page.getByTestId(testIds.students.graceMinSessionInput).fill('45');
      await page.getByTestId(testIds.students.graceMinSessionButton).click();
      await page.waitForTimeout(800);
      row = await withDb((c) => c.query(`SELECT min_session_minutes FROM user_practice_vows WHERE id=$1`, [vowId]));
      expect(row.rows[0].min_session_minutes).toBe(45);

      // 暂停 → 恢复
      await page.getByTestId(testIds.students.gracePauseToggle(vowId)).click();
      await page.waitForTimeout(600);
      row = await withDb((c) => c.query(`SELECT status FROM user_practice_vows WHERE id=$1`, [vowId]));
      expect(row.rows[0].status).toBe('paused');

      await page.getByTestId(testIds.students.gracePauseToggle(vowId)).click();
      await page.waitForTimeout(600);
      row = await withDb((c) => c.query(`SELECT status FROM user_practice_vows WHERE id=$1`, [vowId]));
      expect(row.rows[0].status).toBe('active');
    } finally {
      await deleteTestProfile(userId);
    }
  });

  test('锁定修法每日目标纠错(PD-6):选白名单内新值 → daily_target 更新 + 留审计', async ({ page }) => {
    const { cohortId } = await getSeedIds();
    const email = `e2e-dailytarget-${Date.now()}@local.test`;
    const name = `E2E纠错目标-${Date.now()}`;
    const userId = await createTestProfile(email, name);
    const vowId = await makeLockedAutoVow(userId, cohortId);
    try {
      await activateProfile(userId);
      await withDb((c) => c.query(`INSERT INTO class_members (cohort_id, user_id, member_role) VALUES ($1,$2,'formal')`, [cohortId, userId]));
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);

      await openWidePanel(page, name);
      await page.getByTestId(testIds.students.graceButton).click();
      await page.getByTestId(testIds.students.graceVowRow(vowId)).click();
      await expect(page.getByTestId(testIds.students.graceDailyTargetChip(200))).toBeVisible({ timeout: 10_000 });
      await page.getByTestId(testIds.students.graceDailyTargetChip(200)).click();
      await page.getByTestId(testIds.students.graceDailyTargetButton).click();
      await page.waitForTimeout(800);

      const row = await withDb((c) => c.query(`SELECT daily_target FROM user_practice_vows WHERE id=$1`, [vowId]));
      expect(row.rows[0].daily_target).toBe(200);
      const audit = await withDb((c) => c.query(`SELECT count(*) FROM audit_logs WHERE action='vow_daily_target_change' AND target_id=$1`, [vowId]));
      expect(Number(audit.rows[0].count)).toBeGreaterThan(0);
    } finally {
      await deleteTestProfile(userId);
    }
  });
});

test.describe('管理操作:代行(替代/追溯认可/豁免)', () => {
  test('豁免·挂靠功课 → proxy_action_records 落库(target_kind=vow)', async ({ page }) => {
    const { cohortId } = await getSeedIds();
    const email = `e2e-proxy1-${Date.now()}@local.test`;
    const name = `E2E代行豁免-${Date.now()}`;
    const userId = await createTestProfile(email, name);
    const vowId = await makeAutoVow(userId, cohortId);
    try {
      await activateProfile(userId);
      await withDb((c) => c.query(`INSERT INTO class_members (cohort_id, user_id, member_role) VALUES ($1,$2,'formal')`, [cohortId, userId]));
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);

      await openWidePanel(page, name);
      await page.getByTestId(testIds.students.proxyButton).click();
      await page.getByTestId(testIds.students.proxyTypeChip('exempt')).click();
      await page.getByTestId(testIds.students.proxyKindChip('vow')).click();
      await page.getByTestId(testIds.students.proxyVowRow(vowId)).click();
      await page.getByTestId(testIds.students.proxyReasonInput).fill('E2E测试:住院期间豁免');
      await page.getByTestId(testIds.students.proxySubmitButton).click();
      await page.waitForTimeout(800);

      const rows = await withDb((c) => c.query(
        `SELECT action_type, target_kind, target_ref FROM proxy_action_records WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1`,
        [userId],
      ));
      expect(rows.rows[0].action_type).toBe('exempt');
      expect(rows.rows[0].target_kind).toBe('vow');
      expect(rows.rows[0].target_ref).toBe(vowId);
    } finally {
      await deleteTestProfile(userId);
    }
  });

  test('替代·选修法+数量 → proxy_action_records 落库(substitute_practice/count 正确)', async ({ page }) => {
    const { cohortId } = await getSeedIds();
    const email = `e2e-proxy2-${Date.now()}@local.test`;
    const name = `E2E代行替代-${Date.now()}`;
    const userId = await createTestProfile(email, name);
    const vowId = await makeAutoVow(userId, cohortId);
    try {
      await activateProfile(userId);
      await withDb((c) => c.query(`INSERT INTO class_members (cohort_id, user_id, member_role) VALUES ($1,$2,'formal')`, [cohortId, userId]));
      const { rows: [{ id: subPracticeId }] } = await withDb((c) => c.query(`SELECT id FROM practices WHERE measurement='count' LIMIT 1`));
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);

      await openWidePanel(page, name);
      await page.getByTestId(testIds.students.proxyButton).click();
      await page.getByTestId(testIds.students.proxyTypeChip('substitute')).click();
      await page.getByTestId(testIds.students.proxyKindChip('vow')).click();
      await page.getByTestId(testIds.students.proxyVowRow(vowId)).click();
      await page.getByTestId(testIds.students.proxyPracticeChip(subPracticeId)).click();
      await page.getByTestId(testIds.students.proxyCountInput).fill('30');
      await page.getByTestId(testIds.students.proxyReasonInput).fill('E2E测试:病假由他人代打卡30遍');
      await page.getByTestId(testIds.students.proxySubmitButton).click();
      await page.waitForTimeout(800);

      const rows = await withDb((c) => c.query(
        `SELECT action_type, substitute_practice_id, substitute_count FROM proxy_action_records WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1`,
        [userId],
      ));
      expect(rows.rows[0].action_type).toBe('substitute');
      expect(rows.rows[0].substitute_practice_id).toBe(subPracticeId);
      expect(Number(rows.rows[0].substitute_count)).toBe(30);
    } finally {
      await deleteTestProfile(userId);
    }
  });
});

test.describe('独立路由 /students/[id] 专属区块(宽屏面板不渲染,窄屏才有)', () => {
  test('传承记录:录入 → user_transmissions 落库 + 双写 proxy_action_records', async ({ page }) => {
    const email = `e2e-transmission-${Date.now()}@local.test`;
    const name = `E2E传承记录-${Date.now()}`;
    const userId = await createTestProfile(email, name);
    const transId = await makeTransmissionOption();
    try {
      await activateProfile(userId);
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);

      await openStandaloneRoute(page, name);
      await page.getByTestId(testIds.students.transmissionRecordButton).click();
      await page.getByTestId(testIds.students.transmissionPickChip(transId)).click();
      await page.getByTestId(testIds.students.transmissionReasonInput).fill('E2E测试:法会签到记录');
      await page.getByTestId(testIds.students.transmissionConfirmButton).click();
      await page.waitForTimeout(800);

      const rows = await withDb((c) => c.query(`SELECT source FROM user_transmissions WHERE user_id=$1 AND transmission_id=$2`, [userId, transId]));
      expect(rows.rows.length).toBe(1);
      expect(rows.rows[0].source).toBe('proxy_recognize');
      const proxyRows = await withDb((c) => c.query(`SELECT count(*) FROM proxy_action_records WHERE user_id=$1 AND target_kind='transmission' AND target_ref=$2`, [userId, transId]));
      expect(Number(proxyRows.rows[0].count)).toBeGreaterThan(0);
    } finally {
      await deleteTestProfile(userId);
      await withDb((c) => c.query(`DELETE FROM transmissions WHERE id=$1`, [transId]));
    }
  });

  test('无障碍学修:切换视力/听力障碍 chip → profiles.accessibility_needs 正确更新', async ({ page }) => {
    const email = `e2e-a11y-${Date.now()}@local.test`;
    const name = `E2E无障碍-${Date.now()}`;
    const userId = await createTestProfile(email, name);
    try {
      await activateProfile(userId);
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);

      await openStandaloneRoute(page, name);
      await page.getByTestId(testIds.students.a11yBlindChip).click();
      await page.waitForTimeout(600);
      let row = await withDb((c) => c.query(`SELECT accessibility_needs FROM profiles WHERE id=$1`, [userId]));
      expect(row.rows[0].accessibility_needs).toEqual(['blind']);

      await page.getByTestId(testIds.students.a11yDeafChip).click();
      await page.waitForTimeout(600);
      row = await withDb((c) => c.query(`SELECT accessibility_needs FROM profiles WHERE id=$1`, [userId]));
      expect(new Set(row.rows[0].accessibility_needs)).toEqual(new Set(['blind', 'deaf']));

      // 再点一次视力障碍 → 取消(数组里只剩听力障碍)
      await page.getByTestId(testIds.students.a11yBlindChip).click();
      await page.waitForTimeout(600);
      row = await withDb((c) => c.query(`SELECT accessibility_needs FROM profiles WHERE id=$1`, [userId]));
      expect(row.rows[0].accessibility_needs).toEqual(['deaf']);
    } finally {
      await deleteTestProfile(userId);
    }
  });

  test('撤回注销:已申请注销的账号 → 撤回 → deletion_requested_at 清空', async ({ page }) => {
    const email = `e2e-canceldel-${Date.now()}@local.test`;
    const name = `E2E撤回注销-${Date.now()}`;
    const userId = await createTestProfile(email, name);
    try {
      await requestAccountDeletion(userId);
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);

      await openStandaloneRoute(page, name);
      await expect(page.getByText('该学员已申请注销账号', { exact: true })).toBeVisible({ timeout: 10_000 });
      await page.getByTestId(testIds.students.cancelDeletionButton).click();
      await page.waitForTimeout(800);

      const row = await withDb((c) => c.query(`SELECT deletion_requested_at FROM profiles WHERE id=$1`, [userId]));
      expect(row.rows[0].deletion_requested_at).toBeNull();
    } finally {
      await deleteTestProfile(userId);
    }
  });
});
