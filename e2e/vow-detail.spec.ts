import { expect, test } from '@playwright/test';
import { getSeedIds, withDb } from './db';
import { STUDENT_EMAIL, TEST_PASSWORD } from './global-setup';
import { loginAs } from './helpers';
import { testIds } from '../lib/testids';

// 功课详情/管理(app/vow/[id].tsx)系统性覆盖(2026-07-16·PM"继续完成"剩余测试缺口第五批)。
// 此前0个testID、调整节奏/补录/放弃这三条师兄自主操作的写路径零e2e覆盖(计数本身走的是
// QuickCountSheet,与首页共用,已有别处覆盖,这里不重复测)。
// ⚠️ 不用种子自带的那条班级功课(source='auto',target_period='lifetime'但来自班级、不可放弃):
// 自建一条自定功课(source='custom')专测这页,practice选一条无daily_target_locked/无白名单的,
// 避免撞上PD-6/PD-9那类锁定/白名单分支(不在本批范围)。用完直接删行,不触碰学员真实功课列表。

async function makeCustomVow(userId: string): Promise<string> {
  const { rows: [{ id: practiceId }] } = await withDb((c) =>
    c.query(
      `SELECT id FROM practices WHERE measurement='count' AND daily_target_locked IS NOT TRUE
       AND (allowed_daily_targets IS NULL OR cardinality(allowed_daily_targets)=0) LIMIT 1`,
    ),
  );
  const { rows: [{ id: vowId }] } = await withDb((c) =>
    c.query(
      `INSERT INTO user_practice_vows (user_id, source, practice_id, custom_name, target_period, start_date, status, is_required_for_promotion, share_to_collective)
       VALUES ($1,'custom',$2,'E2E测试自定功课','lifetime','2026-01-01','active',false,false) RETURNING id`,
      [userId, practiceId],
    ),
  );
  return vowId as string;
}

test.describe('调整节奏 + 补录(app/vow/[id].tsx)', () => {
  test('调整每日目标 → daily_target与pace_history正确落库;补录昨天 → practice_logs正确落库', async ({ page }) => {
    const { studentId } = await getSeedIds();
    const vowId = await makeCustomVow(studentId);
    try {
      await loginAs(page, STUDENT_EMAIL, TEST_PASSWORD);
      await page.goto(`/vow/${vowId}`, { timeout: 45_000 });

      // 初始未设每日目标 → 触发按钮文案"设目标"
      await expect(page.getByText('设目标', { exact: true })).toBeVisible();
      await page.getByTestId(testIds.vowDetail.paceButton).click();
      await page.getByTestId(testIds.vowDetail.paceInput).fill('216');
      await page.getByTestId(testIds.vowDetail.paceSaveButton).click();
      // 保存成功只静默onClose,没有notify()提示——设完之后触发按钮文案变"调整"是真实的状态证明
      await expect(page.getByText('调整', { exact: true })).toBeVisible({ timeout: 10_000 });

      const { rows: paceRows } = await withDb((c) => c.query(`SELECT daily_target, pace_history FROM user_practice_vows WHERE id=$1`, [vowId]));
      expect(paceRows[0].daily_target).toBe(216);
      expect(Array.isArray(paceRows[0].pace_history)).toBe(true);
      expect(paceRows[0].pace_history.length).toBeGreaterThanOrEqual(1);

      // 补录昨天50遍
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = yesterday.toLocaleDateString('en-CA');
      await page.getByTestId(testIds.vowDetail.backfillButton).click();
      await page.getByText('昨天', { exact: true }).click();
      await expect(page.getByText(`补录日期:${yStr}`, { exact: true })).toBeVisible();
      await page.getByTestId(testIds.vowDetail.backfillAmountInput).fill('50');
      await page.getByTestId(testIds.vowDetail.backfillSubmitButton).click();
      // 补录成功静默reset+onClose,弹层关闭——补录按钮所在"补录"Section标题一直在,
      // 用计数历史里出现新一行日期文本作为UI侧证据,DB核对才是主依据
      await expect(page.getByText(yStr, { exact: true })).toBeVisible({ timeout: 10_000 });

      const { rows: logs } = await withDb((c) => c.query(`SELECT count, log_date::text FROM practice_logs WHERE vow_id=$1 AND log_date=$2`, [vowId, yStr]));
      expect(logs.length).toBe(1);
      expect(logs[0].count).toBe(50);
    } finally {
      await withDb((c) => c.query(`DELETE FROM practice_logs WHERE vow_id=$1`, [vowId]));
      await withDb((c) => c.query(`DELETE FROM user_practice_vows WHERE id=$1`, [vowId]));
    }
  });
});

test.describe('放弃自定功课(app/vow/[id].tsx)', () => {
  test('放弃 → status变abandoned(软删,不物理删除)', async ({ page }) => {
    const { studentId } = await getSeedIds();
    const vowId = await makeCustomVow(studentId);
    try {
      await loginAs(page, STUDENT_EMAIL, TEST_PASSWORD);
      await page.goto(`/vow/${vowId}`, { timeout: 45_000 });

      await page.getByTestId(testIds.vowDetail.abandonButton).click();
      await expect(page.getByText('确认放弃?', { exact: false })).toBeVisible();
      await page.getByTestId(testIds.vowDetail.abandonConfirmButton).click();
      // onSuccess触发router.back(),没有notify提示;这里直接跟DB状态(而非猜UI落点)——
      // router.back()在"直接page.goto()进详情页、没有真实前序history"这种测试场景下的
      // 实际去向不确定(可能真导航离开,也可能是no-op留在原页刷出"没有找到这项功课"空态),
      // 两种情况都不适合按固定时长等,改用expect.poll等DB真状态落地(TESTING.md§4-1"等状态")。
      await expect.poll(async () => {
        const { rows } = await withDb((c) => c.query(`SELECT status FROM user_practice_vows WHERE id=$1`, [vowId]));
        return rows[0]?.status;
      }, { timeout: 10_000 }).toBe('abandoned');

      const { rows } = await withDb((c) => c.query(`SELECT status FROM user_practice_vows WHERE id=$1`, [vowId]));
      expect(rows.length).toBe(1); // 软删:行还在(不是物理删除)
    } finally {
      await withDb((c) => c.query(`DELETE FROM practice_logs WHERE vow_id=$1`, [vowId]));
      await withDb((c) => c.query(`DELETE FROM user_practice_vows WHERE id=$1`, [vowId]));
    }
  });
});
