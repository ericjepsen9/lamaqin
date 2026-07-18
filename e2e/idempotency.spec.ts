import { expect, test } from '@playwright/test';
import { getSeedIds, withDb } from './db';
import { ADMIN_EMAIL, COACH_EMAIL, STUDENT_EMAIL, TEST_PASSWORD } from './global-setup';
import { loginAs, pickDate } from './helpers';
import { testIds } from '../lib/testids';

const uniqueContent = (label: string) => `e2e测试${label}-${Date.now()}`;

// A3剩余幂等修复的e2e覆盖(2026-07-14·PM"一起做完,逐条与我讨论")。
// 这批fix此前只在mutation层验证过client_token+唯一索引机制本身有效(SQL harness挑了2个
// 代表样例),没有逐一验证UI调用点是否真的把凭证传到位——这里补上,一处一条,双击验证。

test.describe('关怀跟进记录幂等(care.ts::useAddFollowup)', () => {
  test('双击「保存记录」→ care_followups只落1行(此前调用方漏传clientToken,2026-07-14修)', async ({ page }) => {
    const { studentId, cohortId } = await getSeedIds();
    await loginAs(page, COACH_EMAIL, TEST_PASSWORD);
    await page.goto(`/care/${studentId}`, { timeout: 45_000 }); // Metro 冷编译新路由偶尔较慢,放宽超时(非app问题)

    await page.getByTestId(testIds.care.addFollowupButton).click();
    await page.getByTestId(testIds.care.followupSummaryInput).fill('e2e测试跟进记录');
    const saveBtn = page.getByTestId(testIds.care.followupSaveButton);
    await saveBtn.click();
    try { await saveBtn.click({ timeout: 1000 }); } catch { /* 保存成功后表单关闭,第二下点不中属预期 */ }
    await page.waitForTimeout(800); // 给异步写库留时间

    const rows = await withDb((c) =>
      c.query(`SELECT client_token FROM care_followups WHERE student_id=$1 AND cohort_id=$2 AND summary='e2e测试跟进记录'`, [studentId, cohortId]),
    );
    expect(rows.rows.length).toBe(1);
    await withDb((c) => c.query(`DELETE FROM care_followups WHERE student_id=$1 AND summary='e2e测试跟进记录'`, [studentId]));
  });
});

test.describe('法会管理:新建法会(events.ts::useCreateEvent)', () => {
  test('双击「创建」→ events只落1行(需admin角色,zhumai看不到这个按钮)', async ({ page }) => {
    const evName = `E2E测试法会-${Date.now()}`;
    await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);
    await page.goto('/events', { timeout: 45_000 });

    await page.getByTestId(testIds.events.newEventButton).click();
    await page.getByTestId(testIds.events.newEventNameInput).fill(evName);
    await pickDate(page, testIds.events.newEventStartInput, '2026-08-01'); // 2026-07-18改用日历选择器
    await pickDate(page, testIds.events.newEventEndInput, '2026-08-03');
    const submitBtn = page.getByTestId(testIds.events.newEventSubmitButton);
    await submitBtn.click();
    try { await submitBtn.click({ timeout: 1000 }); } catch { /* 创建成功后弹层已关,第二下点不中属预期 */ }
    await page.waitForTimeout(800);

    const rows = await withDb((c) => c.query(`SELECT id FROM events WHERE name=$1`, [evName]));
    expect(rows.rows.length).toBe(1);
    await withDb((c) => c.query(`DELETE FROM events WHERE name=$1`, [evName]));
  });
});

test.describe('法会管理:加场次(events.ts::useAddEventSession)', () => {
  test('双击「加这一场」→ event_sessions只落1行', async ({ page }) => {
    const evName = `E2E测试法会-场次专用-${Date.now()}`;
    const { rows: [ev] } = await withDb((c) =>
      c.query(`INSERT INTO events(name, event_type, start_date, end_date) VALUES ($1,'法会','2026-08-01','2026-08-05') RETURNING id`, [evName]),
    );
    await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);
    await page.goto('/events', { timeout: 45_000 });

    await page.getByTestId(testIds.events.manageSessionsButton(ev.id)).click();
    await pickDate(page, testIds.events.sessionDateInput, '2026-08-02'); // 2026-07-18改用日历选择器
    const addBtn = page.getByTestId(testIds.events.sessionAddButton);
    await addBtn.click();
    try { await addBtn.click({ timeout: 1000 }); } catch { /* 弹层不会自动关(可连加几场),但同一天同一凭证第二下应被幂等挡住,不一定点不中——不依赖这个catch判断结果 */ }
    await page.waitForTimeout(800);

    const rows = await withDb((c) => c.query(`SELECT id FROM event_sessions WHERE event_id=$1 AND session_date='2026-08-02'`, [ev.id]));
    expect(rows.rows.length).toBe(1);
    await withDb((c) => c.query(`DELETE FROM events WHERE id=$1`, [ev.id])); // CASCADE 带走 event_sessions
  });
});

test.describe('法会管理:发布班级公告(events.ts::useCreateAnnouncement,前置查重特殊方案)', () => {
  test('双击「发布公告」→ cohort_announcements只落1行,且给全班扇出的通知也只发1次(不是插入被挡住、通知却发了2次)', async ({ page }) => {
    const { cohortId, studentId } = await getSeedIds();
    const content = `e2e测试公告-${Date.now()}`;
    await loginAs(page, COACH_EMAIL, TEST_PASSWORD); // zhumai 满足 canWriteAnn,不需要 admin
    await page.goto('/events', { timeout: 45_000 });
    await page.getByText('班级公告').click();

    await page.getByTestId(testIds.events.addAnnouncementButton).click();
    await page.getByTestId(testIds.events.cohortOption(cohortId)).click();
    await page.getByTestId(testIds.events.announcementContentInput).fill(content);
    const publishBtn = page.getByTestId(testIds.events.announcementPublishButton);
    await publishBtn.click();
    try { await publishBtn.click({ timeout: 1000 }); } catch { /* 发布成功后表单关闭,第二下点不中属预期 */ }
    await page.waitForTimeout(800);

    const annRows = await withDb((c) => c.query(`SELECT id FROM cohort_announcements WHERE cohort_id=$1 AND content=$2`, [cohortId, content]));
    expect(annRows.rows.length).toBe(1);
    // 前置查重方案的关键点:不只是公告本身没重复,给学员扇出的通知也不能因为"insert被幂等挡住、
    // 但通知代码仍继续跑"而发2次——查重必须在两步副作用之前就整体短路。
    const notifRows = await withDb((c) =>
      c.query(`SELECT id FROM notifications WHERE user_id=$1 AND category='class' AND body LIKE $2`, [studentId, `%${content}%`]),
    );
    expect(notifRows.rows.length).toBe(1); // 不多(重复) 也不少(前置查重挡对了插入,但不能连正常那一次也被误挡)
    await withDb((c) => c.query(`DELETE FROM cohort_announcements WHERE cohort_id=$1 AND content=$2`, [cohortId, content]));
    await withDb((c) => c.query(`DELETE FROM notifications WHERE user_id=$1 AND category='class' AND body LIKE $2`, [studentId, `%${content}%`]));
  });
});

test.describe('法会详情:报名发愿(events.ts::useJoinEventVow)', () => {
  test('双击「发愿·参加」→ user_practice_vows只落1行(joinToken挂载时生成一次、不重开,双击/网络重试算同一次尝试)', async ({ page }) => {
    const { studentId } = await getSeedIds();
    const { rows: [pr] } = await withDb((c) => c.query(`SELECT id FROM practices WHERE measurement='count' LIMIT 1`));
    const { rows: [ev] } = await withDb((c) =>
      c.query(
        `INSERT INTO events(name, event_type, start_date, end_date, default_practice_id) VALUES ($1,'法会','2026-01-01','2027-01-01',$2) RETURNING id`,
        [`E2E测试法会-发愿专用-${Date.now()}`, pr.id],
      ),
    );

    await loginAs(page, STUDENT_EMAIL, TEST_PASSWORD);
    await page.goto(`/event/${ev.id}`, { timeout: 45_000 });

    const joinBtn = page.getByTestId(testIds.event.joinButton);
    await expect(joinBtn).toBeVisible();
    await joinBtn.click();
    try { await joinBtn.click({ timeout: 1000 }); } catch { /* 发愿成功后查询重取,发愿区会被"我的法会功课"替掉,第二下点不中属预期 */ }
    await page.waitForTimeout(800);

    const rows = await withDb((c) => c.query(`SELECT id FROM user_practice_vows WHERE user_id=$1 AND event_id=$2`, [studentId, ev.id]));
    expect(rows.rows.length).toBe(1);
    // event_id是ON DELETE SET NULL(不会跟着events级联删),按具体vow id精确删,不靠时间窗口猜测——
    // 避免误删同一学员同一时刻可能存在的其它合法记录。
    await withDb((c) => c.query(`DELETE FROM user_practice_vows WHERE id = ANY($1::uuid[])`, [rows.rows.map((r) => r.id)]));
    await withDb((c) => c.query(`DELETE FROM events WHERE id=$1`, [ev.id]));
  });
});

test.describe('意见反馈(feedback.ts::useSubmitFeedback)', () => {
  test('双击「提交反馈」→ feedback只落1行', async ({ page }) => {
    const { studentId } = await getSeedIds();
    const content = uniqueContent('意见反馈');
    await loginAs(page, STUDENT_EMAIL, TEST_PASSWORD);
    await page.goto('/help', { timeout: 45_000 });

    await page.getByTestId(testIds.help.feedbackInput).fill(content);
    const submitBtn = page.getByTestId(testIds.help.feedbackSubmitButton);
    await submitBtn.click();
    try { await submitBtn.click({ timeout: 1000 }); } catch { /* 提交成功后表单切到"已收到"态,第二下点不中属预期 */ }
    await page.waitForTimeout(800);

    const rows = await withDb((c) => c.query(`SELECT id FROM feedback WHERE user_id=$1 AND content=$2`, [studentId, content]));
    expect(rows.rows.length).toBe(1);
    await withDb((c) => c.query(`DELETE FROM feedback WHERE id = ANY($1::uuid[])`, [rows.rows.map((r) => r.id)]));
  });
});

test.describe('观修记录(meditation.ts::useLogMeditationSession)', () => {
  test('填写时间(不用真等30分钟计时)→ 近乎同时点两次「完成并计时」→ meditation_sessions只落1行', async ({ page }) => {
    const { studentId, lessons } = await getSeedIds();
    const lesson1 = lessons.find((l) => l.lesson_number === 1)!;
    await loginAs(page, STUDENT_EMAIL, TEST_PASSWORD);
    await page.goto(`/lesson/${lesson1.id}?step=guan`, { timeout: 45_000 });

    // 走"填写时间"手动补一笔的路径(比真等计时快):填5分钟→确认→sec变300、token换新,
    // 不启动running状态,主按钮从"开始观修"变成"完成并计时"。
    await page.getByTestId(testIds.guan.manualOpenButton).click();
    await page.getByTestId(testIds.guan.manualInput).fill('5');
    await page.getByTestId(testIds.guan.manualConfirmButton).click();

    // ⚠️ 这个按钮点一下就同步setSec(0)+setRunning(false)回idle态(不像其它表单那样等mutation
    // 结束才复位),用"点完再点一下"的顺序双击测不出真正的竞态(第二下大概率已经落到"开始观修"
    // 分支,只会开一个新计时、不会走mutate)。改用Promise.all近似同时派发两次点击,尽量在同一次
    // 渲染窗口内让两个onMain都读到同一个sessionToken(仍是尽力而为,不保证100%命中这个窗口——
    // 真正的正确性保证来自DB唯一索引,这条e2e是补充验证,不是唯一防线)。
    const mainBtn = page.getByTestId(testIds.guan.mainButton);
    await expect(mainBtn).toHaveText(/完成并计时/);
    await Promise.all([mainBtn.click(), mainBtn.click().catch(() => {})]);
    await page.waitForTimeout(800);

    const rows = await withDb((c) => c.query(`SELECT id FROM meditation_sessions WHERE user_id=$1 AND lesson_id=$2 AND duration_minutes=5`, [studentId, lesson1.id]));
    expect(rows.rows.length).toBe(1);
    await withDb((c) => c.query(`DELETE FROM meditation_sessions WHERE id = ANY($1::uuid[])`, [rows.rows.map((r) => r.id)]));
  });
});

test.describe('功课模板配置(practice-config.ts::useCreateTemplate)', () => {
  test('双击「保存」→ practice_templates只落1行(前置查重返回既有id的特殊变体,同useRecordPracticeLog先例)', async ({ page }) => {
    const tplName = uniqueContent('功课模板');
    const { rows: [pr] } = await withDb((c) => c.query(`SELECT id FROM practices LIMIT 1`));
    await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);
    await page.goto('/practice-config', { timeout: 45_000 });

    await page.getByTestId(testIds.practiceConfig.newTemplateButton).click();
    await page.getByTestId(testIds.practiceConfig.practiceChip(pr.id)).click();
    await page.getByTestId(testIds.practiceConfig.nameInput).fill(tplName);
    const submitBtn = page.getByTestId(testIds.practiceConfig.submitButton);
    await submitBtn.click();
    try { await submitBtn.click({ timeout: 1000 }); } catch { /* 保存成功后弹层关闭,第二下点不中属预期 */ }
    await page.waitForTimeout(800);

    const rows = await withDb((c) => c.query(`SELECT id FROM practice_templates WHERE template_name=$1`, [tplName]));
    expect(rows.rows.length).toBe(1);
    await withDb((c) => c.query(`DELETE FROM practice_templates WHERE id = ANY($1::uuid[])`, [rows.rows.map((r) => r.id)]));
  });
});

test.describe('提醒语预设库(reminder-presets.ts::useCreateReminderPreset)', () => {
  test('双击「保存」→ reminder_presets只落1行', async ({ page }) => {
    const label = uniqueContent('提醒语');
    await loginAs(page, COACH_EMAIL, TEST_PASSWORD); // roles: admin/zhumai/aixin 都可,zhumai够用
    await page.goto('/reminder-presets', { timeout: 45_000 });

    await page.getByTestId(testIds.reminderPresets.newButton).click();
    await page.getByTestId(testIds.reminderPresets.labelInput).fill(label);
    const submitBtn = page.getByTestId(testIds.reminderPresets.submitButton);
    await submitBtn.click();
    try { await submitBtn.click({ timeout: 1000 }); } catch { /* 保存成功后弹层关闭,第二下点不中属预期 */ }
    await page.waitForTimeout(800);

    const rows = await withDb((c) => c.query(`SELECT id FROM reminder_presets WHERE label=$1`, [label]));
    expect(rows.rows.length).toBe(1);
    await withDb((c) => c.query(`DELETE FROM reminder_presets WHERE id = ANY($1::uuid[])`, [rows.rows.map((r) => r.id)]));
  });
});

test.describe('新建讲考场次(speaking.ts::useCreateSpeakingSession)', () => {
  test('双击「创建讲考场次」→ speaking_sessions只落1行(此组件挂在AdminModal里不会真卸载,凭证靠onSuccess手动换新,同useRecordPracticeLog/useCreateTemplate同类设计)', async ({ page }) => {
    const { cohortId, lessons } = await getSeedIds();
    const lesson1 = lessons.find((l) => l.lesson_number === 1)!;
    await loginAs(page, COACH_EMAIL, TEST_PASSWORD);
    await page.goto('/attendance', { timeout: 45_000 });
    // exact:true——页面标题"共修与讲考"本身就包含"讲考"这个子串,非精确匹配会命中2个元素报错
    await page.getByText('讲考', { exact: true }).click();

    await page.getByTestId(testIds.speaking.newButton).click();
    await page.getByTestId(testIds.speaking.lessonRow(lesson1.id)).click();
    await pickDate(page, testIds.speaking.dateInput, '2027-01-01');
    const submitBtn = page.getByTestId(testIds.speaking.submitButton);
    await submitBtn.click();
    try { await submitBtn.click({ timeout: 1000 }); } catch { /* 创建成功后弹层关闭,第二下点不中属预期 */ }
    await page.waitForTimeout(800);

    const rows = await withDb((c) => c.query(`SELECT id FROM speaking_sessions WHERE cohort_id=$1 AND lesson_id=$2`, [cohortId, lesson1.id]));
    expect(rows.rows.length).toBe(1);
    await withDb((c) => c.query(`DELETE FROM speaking_sessions WHERE id = ANY($1::uuid[])`, [rows.rows.map((r) => r.id)]));
  });
});
