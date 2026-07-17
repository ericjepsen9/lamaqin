import { expect, test } from '@playwright/test';
import { withDb } from './db';
import { STUDENT_EMAIL, TEST_PASSWORD } from './global-setup';
import { loginAs } from './helpers';
import { testIds } from '../lib/testids';

// 课程详情页"加入自学"(app/course/[id].tsx::useStartSelfStudy,决策119自助报名)系统性
// 覆盖(2026-07-16·PM"继续完成"剩余测试缺口第八批)。catalog.tsx/(student)/courses.tsx两个
// 浏览页纯读(筛选/搜索/跳转,无写操作),数据正确性风险低,本批不测;真正0覆盖且有写风险的
// 是这个"加入自学"按钮——写user_self_study_programs + 触发provision_selfstudy_vows RPC。
// 用种子学员(formal主修,决策119天然满足资格):自建一次性专业+课程,报名后清理复位。

test.describe('加入自学(course/[id].tsx)', () => {
  test('单专业课程直接报名 → user_self_study_programs正确落库(is_primary=true,首个自学专业)', async ({ page }) => {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const { rows: [{ id: programId }] } = await withDb((c) =>
      c.query(`INSERT INTO programs (name, code, start_semester, weeks_per_semester) VALUES ($1,$2,1,26) RETURNING id`,
        [`E2E自学测试专业-${suffix}`, `E2E_SS_${suffix}`]),
    );
    const { rows: [{ id: courseId }] } = await withDb((c) =>
      c.query(`INSERT INTO courses (name, slug, course_type, is_required) VALUES ($1,$2,'formal',true) RETURNING id`,
        [`E2E自学测试课程-${suffix}`, `e2e-ss-${suffix}`]),
    );
    await withDb((c) => c.query(`INSERT INTO course_lessons (course_id, lesson_number, title) VALUES ($1,1,'E2E第1节')`, [courseId]));
    await withDb((c) => c.query(`INSERT INTO program_courses (program_id, course_id, sort_order) VALUES ($1,$2,0)`, [programId, courseId]));

    const { rows: [{ id: studentId }] } = await withDb((c) => c.query(`SELECT id FROM profiles WHERE email=$1`, [STUDENT_EMAIL]));
    // 前置断言:种子学员此前没有任何自学专业(否则is_primary=true的假设不成立,且清理会波及别的注册)
    const { rows: preExisting } = await withDb((c) => c.query(`SELECT count(*) FROM user_self_study_programs WHERE user_id=$1`, [studentId]));
    expect(Number(preExisting[0].count)).toBe(0);

    try {
      await loginAs(page, STUDENT_EMAIL, TEST_PASSWORD);
      await page.goto(`/course/${courseId}`, { timeout: 45_000 });

      // 单专业课程:doEnroll直接触发,不弹"选择自学专业"弹层。
      // ⚠️ 真机CI两轮实测+时间戳诊断确认:Promise.all([waitForEvent('dialog'), click()])
      // 这个全项目通用的"安全模式"在这里不成立——第一次点击(mutationFn先INSERT再RPC,两次
      // 网络往返)用这个模式没问题,但第二次点击(已报名,mutationFn只有一次SELECT就提前
      // return)会让click()本身卡90+秒才resolve(dialog几乎同时到,不是网络/后端慢)。这跟
      // admin-quiz.spec.ts"从讲记提取"是同一类坑(click()内部actionability轮询与alert()
      // 阻塞渲染进程之间的时序竞争,dialog距click()的异步间隙越窄越容易踩中)——用那边验证
      // 过的办法:page.once预先注册监听器+expect.poll,不搭配Promise.all等待。两次点击统一
      // 用这个更稳的模式,不只修第二次。
      let notifyMsg = '';
      page.once('dialog', (d) => { notifyMsg = d.message(); void d.accept(); });
      await page.getByTestId(testIds.courseDetail.startSelfStudyButton).click();
      await expect.poll(() => notifyMsg, { timeout: 15_000 }).toContain('已开始自学');

      const { rows } = await withDb((c) =>
        c.query(`SELECT program_id, status, is_primary, start_date::text FROM user_self_study_programs WHERE user_id=$1`, [studentId]),
      );
      expect(rows.length).toBe(1);
      expect(rows[0].program_id).toBe(programId);
      expect(rows[0].status).toBe('active');
      expect(rows[0].is_primary).toBe(true); // 首个自学专业自动设主修

      // 重复点击(已报名同一专业)→ 走already分支,不重复插入,dialog文案变"已在自学"
      let notifyMsg2 = '';
      page.once('dialog', (d) => { notifyMsg2 = d.message(); void d.accept(); });
      await page.getByTestId(testIds.courseDetail.startSelfStudyButton).click();
      await expect.poll(() => notifyMsg2, { timeout: 15_000 }).toContain('已在自学');
      const { rows: afterRepeat } = await withDb((c) => c.query(`SELECT count(*) FROM user_self_study_programs WHERE user_id=$1`, [studentId]));
      expect(Number(afterRepeat[0].count)).toBe(1); // 没有变成2行
    } finally {
      await withDb((c) => c.query(`DELETE FROM user_self_study_programs WHERE user_id=$1 AND program_id=$2`, [studentId, programId]));
      await withDb((c) => c.query(`DELETE FROM programs WHERE id=$1`, [programId]));
      await withDb((c) => c.query(`DELETE FROM courses WHERE id=$1`, [courseId]));
    }
  });
});
