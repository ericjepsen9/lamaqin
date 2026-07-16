import { expect, test } from '@playwright/test';
import { deleteTestProfile, withDb } from './db';
import { STUDENT_EMAIL } from './global-setup';
import { fetchLatestOtpCode } from './mailpit';
import { testIds } from '../lib/testids';

// 注册流程系统性覆盖(2026-07-16·PM"系统性测试包括点击"):register.tsx 2026-07-15 改版加验证码
// 确认(PM 选项③),此前零e2e覆盖(包括改版前的老表单本身)。
// 2026-07-16补:本地 supabase/config.toml 此前 enable_confirmations=false,跟这个验证码流程
// 不匹配(signUp() 本地会直接给会话,验证码页根本不出现,下面3条测试一度90秒超时)——已改true+
// 配自定义邮件模板(supabase/templates/confirmation.html 带 {{ .Token }}),真验证码闭环经
// e2e/mailpit.ts 解析本地栈假邮件收发服务(真身是Mailpit,http://127.0.0.1:54324——
// config.toml里仍叫local_smtp/习惯说"Inbucket"是历史命名,实测过更正见mailpit.ts头注释)
// 拿到,不再是"测不到"的已知限制,见文末"输入真实验证码"测试。

test.describe('注册:表单基础校验', () => {
  test('两次密码不一致 → 提交按钮保持禁用', async ({ page }) => {
    await page.goto('/register');
    await page.getByTestId(testIds.register.emailInput).fill(`e2e-reg-${Date.now()}@local.test`);
    await page.getByTestId(testIds.register.passwordInput).fill('password123');
    await page.getByTestId(testIds.register.password2Input).fill('password456');
    await expect(page.getByText('两次密码不一致')).toBeVisible();
    await expect(page.getByTestId(testIds.register.submitButton)).toHaveAttribute('aria-disabled', 'true');
  });

  test('密码不足8位 → 提交按钮保持禁用', async ({ page }) => {
    await page.goto('/register');
    await page.getByTestId(testIds.register.emailInput).fill(`e2e-reg-${Date.now()}@local.test`);
    await page.getByTestId(testIds.register.passwordInput).fill('short1');
    await page.getByTestId(testIds.register.password2Input).fill('short1');
    await expect(page.getByTestId(testIds.register.submitButton)).toHaveAttribute('aria-disabled', 'true');
  });
});

test.describe('注册:邮箱已被占用(2026-07-15修:isEmailTakenError统一判定)', () => {
  // ⚠️ 这条只测得到"干净路径"(email_exists/user_already_exists,种子里 STUDENT_EMAIL 是走
  // Admin API 正常建的号)。2026-07-15 真正修的那个"脏路径"(老学员批量导入、auth.users缺列
  // 导致500 unexpected_failure)本地栈没有对应的malformed账号夹具,测不到那一支——但这条至少
  // 确认"邮箱已占用→统一走友好文案"这条主干没有因为改动被破坏。
  test('用已存在账号的邮箱注册 → 显示"该邮箱已注册,请直接登录。",不是原始英文报错', async ({ page }) => {
    await page.goto('/register');
    await page.getByTestId(testIds.register.emailInput).fill(STUDENT_EMAIL);
    await page.getByTestId(testIds.register.passwordInput).fill('newpassword123');
    await page.getByTestId(testIds.register.password2Input).fill('newpassword123');
    await page.getByTestId(testIds.register.submitButton).click();
    await expect(page.getByText('该邮箱已注册,请直接登录。')).toBeVisible({ timeout: 10_000 });
    // 反向确认:不应该看到原始英文数据库报错字样
    await expect(page.getByText(/database error/i)).not.toBeVisible();
  });
});

test.describe('注册:全新邮箱 → 验证码确认(PM 2026-07-15选项③,不再点邮件里的链接)', () => {
  test('提交成功 → 出现验证码输入界面(不是"点击链接"提示)', async ({ page }) => {
    const email = `e2e-reg-code-${Date.now()}@local.test`;
    try {
      await page.goto('/register');
      await page.getByTestId(testIds.register.emailInput).fill(email);
      await page.getByTestId(testIds.register.passwordInput).fill('password12345');
      await page.getByTestId(testIds.register.password2Input).fill('password12345');
      await page.getByTestId(testIds.register.submitButton).click();
      await expect(page.getByTestId(testIds.register.codeInput)).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(email)).toBeVisible();
      // 反向确认:不应该出现旧版"点开里面的链接完成确认"这句(已删,如果又出现说明改动被回退了)
      await expect(page.getByText('点开里面的链接')).not.toBeVisible();
    } finally {
      const { rows } = await withDb((c) => c.query(`SELECT id FROM profiles WHERE email=$1`, [email]));
      if (rows[0]) await deleteTestProfile(rows[0].id);
    }
  });

  test('输入错误验证码 → 报错,不崩溃、不静默当成功', async ({ page }) => {
    const email = `e2e-reg-wrongcode-${Date.now()}@local.test`;
    try {
      await page.goto('/register');
      await page.getByTestId(testIds.register.emailInput).fill(email);
      await page.getByTestId(testIds.register.passwordInput).fill('password12345');
      await page.getByTestId(testIds.register.password2Input).fill('password12345');
      await page.getByTestId(testIds.register.submitButton).click();
      await expect(page.getByTestId(testIds.register.codeInput)).toBeVisible({ timeout: 10_000 });

      await page.getByTestId(testIds.register.codeInput).fill('000000');
      await page.getByTestId(testIds.register.codeSubmitButton).click();
      // 错验证码应该报错、留在验证码页面(不应该跳去 /onboarding)
      await page.waitForTimeout(1500);
      await expect(page).not.toHaveURL(/\/onboarding/);
      await expect(page.getByTestId(testIds.register.codeInput)).toBeVisible();
    } finally {
      const { rows } = await withDb((c) => c.query(`SELECT id FROM profiles WHERE email=$1`, [email]));
      if (rows[0]) await deleteTestProfile(rows[0].id);
    }
  });

  test('点"重新发送" → 不崩溃,按钮文案变为"已重新发送"', async ({ page }) => {
    const email = `e2e-reg-resend-${Date.now()}@local.test`;
    try {
      await page.goto('/register');
      await page.getByTestId(testIds.register.emailInput).fill(email);
      await page.getByTestId(testIds.register.passwordInput).fill('password12345');
      await page.getByTestId(testIds.register.password2Input).fill('password12345');
      await page.getByTestId(testIds.register.submitButton).click();
      await expect(page.getByTestId(testIds.register.codeInput)).toBeVisible({ timeout: 10_000 });

      await page.getByTestId(testIds.register.resendButton).click();
      await expect(page.getByText('已重新发送')).toBeVisible({ timeout: 10_000 });
    } finally {
      const { rows } = await withDb((c) => c.query(`SELECT id FROM profiles WHERE email=$1`, [email]));
      if (rows[0]) await deleteTestProfile(rows[0].id);
    }
  });

  test('输入真实验证码(经Mailpit解析真实邮件)→ 确认成功,进入onboarding,auth.users标记已确认', async ({ page }) => {
    const email = `e2e-reg-realcode-${Date.now()}@local.test`;
    try {
      await page.goto('/register');
      await page.getByTestId(testIds.register.emailInput).fill(email);
      await page.getByTestId(testIds.register.passwordInput).fill('password12345');
      await page.getByTestId(testIds.register.password2Input).fill('password12345');
      await page.getByTestId(testIds.register.submitButton).click();
      await expect(page.getByTestId(testIds.register.codeInput)).toBeVisible({ timeout: 10_000 });

      const code = await fetchLatestOtpCode(email);
      await page.getByTestId(testIds.register.codeInput).fill(code);
      await page.getByTestId(testIds.register.codeSubmitButton).click();
      await page.waitForURL(/\/onboarding/, { timeout: 10_000 });

      const { rows: authRows } = await withDb((c) => c.query(`SELECT email_confirmed_at FROM auth.users WHERE email=$1`, [email]));
      expect(authRows[0].email_confirmed_at).not.toBeNull();
    } finally {
      const { rows } = await withDb((c) => c.query(`SELECT id FROM profiles WHERE email=$1`, [email]));
      if (rows[0]) await deleteTestProfile(rows[0].id);
    }
  });
});
