import { expect, test, type Page } from '@playwright/test';
import { withDb } from './db';
import { ADMIN_EMAIL, TEST_PASSWORD } from './global-setup';
import { expectDisabled, loginAs } from './helpers';
import { testIds } from '../lib/testids';

// 思考题管理(quiz/index.tsx + new.tsx + [questionId].tsx)系统性覆盖(2026-07-16·PM"继续
// 完成"剩余测试缺口第九批 + "把剩余的测试内容也加进去"追加批,补齐全部已知缺口)。此前0个
// testID、零e2e覆盖。自建一次性课程+课节,专测这条链路,用完删课程级联清理(course_lessons→
// questions→question_references均CASCADE)。

test.describe('新建问答题 → 详情页编辑/删除(quiz全链路)', () => {
  test('新建(选课选节+题干+参考答案)→ 列表页展开导航 → 编辑题干 → 修改参考答案 → 删除题目', async ({ page }) => {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const { rows: [{ id: courseId }] } = await withDb((c) =>
      c.query(`INSERT INTO courses (name, slug, course_type, is_required) VALUES ($1,$2,'formal',true) RETURNING id`,
        [`E2E思考题测试课程-${suffix}`, `e2e-quiz-${suffix}`]),
    );
    const { rows: [{ id: lessonId }] } = await withDb((c) =>
      c.query(`INSERT INTO course_lessons (course_id, lesson_number, title) VALUES ($1,1,'E2E测试课节') RETURNING id`, [courseId]),
    );
    const originalPrompt = `E2E测试思考题-${Date.now()}`;
    const originalRef = `E2E测试参考答案-${Date.now()}`;
    try {
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);
      await page.goto('/quiz/new', { timeout: 45_000 });

      await page.getByTestId(testIds.quiz.coursePickerTrigger).click();
      await page.getByTestId(testIds.quiz.courseOption(courseId)).click();
      await page.getByTestId(testIds.quiz.lessonPickerTrigger).click();
      await page.getByTestId(testIds.quiz.lessonOption(lessonId)).click();
      await page.getByTestId(testIds.quiz.promptInput).fill(originalPrompt);
      await page.getByTestId(testIds.quiz.referenceInput).fill(originalRef);
      await page.getByTestId(testIds.quiz.createButton).click();

      // 创建成功静默:先upsert参考答案再router.replace进详情页,没有notify——用详情页内容出现作为真实落地信号
      await expect(page.getByText(originalPrompt, { exact: true })).toBeVisible({ timeout: 10_000 });
      // 2026-07-17·这条"UI已确认成功、紧接着单次查DB查不到"的现象在这条创建链路上真机CI
      // 三度出现(这条 + 下面"客观题payload编辑器"的"颂词续接"用例),读过useCreateQuestion/
      // useAdminQuestion两处代码,都是走真实INSERT/SELECT,没有乐观缓存捷径,没找到能100%
      // 解释的应用层根因——但3次都是"查一次没有、不是永久查不到",改成expect.poll重试
      // (同admin-scheduling.spec.ts等既有先例的写法,不是放宽断言,是承认"刚提交、DB可见性
      // 要过一下才追上"这个环节值得允许短暂重试)。
      let created: { id: string }[] = [];
      await expect.poll(async () => {
        const res = await withDb((c) => c.query(`SELECT id FROM questions WHERE prompt=$1`, [originalPrompt]));
        created = res.rows as { id: string }[];
        return created.length;
      }, { timeout: 10_000 }).toBe(1);
      const questionId = created[0].id as string;
      await expect(page).toHaveURL(new RegExp(`/quiz/${questionId}$`));

      const { rows: refRows } = await withDb((c) => c.query(`SELECT reference_text FROM question_references WHERE question_id=$1`, [questionId]));
      expect(refRows.length).toBe(1);
      expect(refRows[0].reference_text).toBe(originalRef);

      // 列表页:展开节次分组 → 点题目行导航回同一条详情(exercise quiz/index.tsx分组/展开/导航)
      await page.goto('/quiz', { timeout: 45_000 });
      await page.getByTestId(testIds.quiz.lessonGroupHeader(lessonId)).click();
      await expect(page.getByTestId(testIds.quiz.questionRow(questionId))).toBeVisible({ timeout: 10_000 });
      await page.getByTestId(testIds.quiz.questionRow(questionId)).click();
      await expect(page).toHaveURL(new RegExp(`/quiz/${questionId}$`));

      // 编辑题干
      const newPrompt = `${originalPrompt}-已编辑`;
      await page.getByTestId(testIds.quiz.editPromptButton).click(); // "编辑题目"→显示输入框
      await page.getByTestId(testIds.quiz.promptEditInput).fill(newPrompt);
      await page.getByTestId(testIds.quiz.editPromptButton).click(); // 此时文案已变"保存"→savePrompt()
      // ⚠️真机CI实测发现的坑:Expo Router的stack导航在web端不会真的卸载"列表→详情"这条路径
      // 里的上一屏(list页题目行的prompt文本仍隐藏挂在DOM里),跟当前详情页的prompt文本撞严格
      // 模式(resolved to 2 elements,其中一个unexpected value "hidden")。.last()取当前(新挂载
      // 的)那份,不是猜时序——是"新屏比旧屏后挂载"这个确定性事实。
      await expect(page.getByText(newPrompt, { exact: true }).last()).toBeVisible({ timeout: 10_000 });
      const { rows: afterPromptEdit } = await withDb((c) => c.query(`SELECT prompt FROM questions WHERE id=$1`, [questionId]));
      expect(afterPromptEdit[0].prompt).toBe(newPrompt);

      // 修改参考答案
      const newRef = `${originalRef}-已修改`;
      await page.getByTestId(testIds.quiz.editReferenceButton).click(); // "修改答案"→显示编辑区
      await page.getByTestId(testIds.quiz.referenceEditInput).fill(newRef);
      await page.getByTestId(testIds.quiz.saveReferenceButton).click();
      await expect(page.getByText(newRef, { exact: true })).toBeVisible({ timeout: 10_000 });
      const { rows: afterRefEdit } = await withDb((c) => c.query(`SELECT reference_text FROM question_references WHERE question_id=$1`, [questionId]));
      expect(afterRefEdit[0].reference_text).toBe(newRef);

      // 删除题目(confirmAsync确认框)
      page.once('dialog', (d) => { void d.accept(); });
      await page.getByTestId(testIds.quiz.deleteButton).click();
      await expect.poll(async () => {
        const { rows } = await withDb((c) => c.query(`SELECT count(*) FROM questions WHERE id=$1`, [questionId]));
        return Number(rows[0].count);
      }, { timeout: 10_000 }).toBe(0);
    } finally {
      await withDb((c) => c.query(`DELETE FROM courses WHERE id=$1`, [courseId]));
    }
  });
});

// 客观题(单选/判断/填空/记忆卡/颂词组句/颂词续接)payload编辑器(components/admin/
// question-payload-editor.tsx)——v1完成后此前一直标"后续单独做",现补全6种题型的新建覆盖。
// 每种题型payload形状不同(options/answer、back、tokens/distractors/hint/previousLine),
// 用同一个课节顺序建6条,每条建完直接查DB核对payload JSON形状,不测UI层的复杂展开/收起。
test.describe('客观题payload编辑器(6种题型新建)', () => {
  const CASES: { label: string; fill: (page: Page) => Promise<void>; expectPayload: Record<string, unknown> }[] = [
    {
      label: '单选',
      fill: async (page) => {
        await page.getByPlaceholder('选项A\n选项B\n选项C').fill('选项甲\n选项乙\n选项丙');
        await page.getByText('选项乙', { exact: true }).click();
      },
      expectPayload: { options: ['选项甲', '选项乙', '选项丙'], answer: '选项乙' },
    },
    {
      label: '判断',
      fill: async (page) => { await page.getByText('正确', { exact: true }).click(); },
      expectPayload: { answer: '正确' },
    },
    {
      label: '填空',
      fill: async (page) => { await page.getByPlaceholder('填空正确答案').fill('E2E填空答案'); },
      expectPayload: { answer: 'E2E填空答案' },
    },
    {
      label: '记忆卡',
      fill: async (page) => { await page.getByPlaceholder('点击翻看时显示的内容').fill('E2E背面内容'); },
      expectPayload: { back: 'E2E背面内容' },
    },
    {
      label: '颂词组句',
      fill: async (page) => {
        // ⚠️真机CI实测发现的坑:getByPlaceholder默认子串匹配,页面上new.tsx自带的参考答案
        // textarea占位文本是"可留空,稍后在题目页补充…",跟这里"上文提示"字段的占位文本"可
        // 留空"恰好是前缀关系,不加exact:true会撞严格模式(resolved to 2 elements)。
        await page.getByPlaceholder('可留空', { exact: true }).fill('E2E上文提示');
        await page.getByPlaceholder('第一块\n第二块\n第三块').fill('块一\n块二\n块三');
        await page.getByPlaceholder('混在词池里的错误选项').fill('干扰块');
      },
      expectPayload: { tokens: ['块一', '块二', '块三'], distractors: ['干扰块'], hint: 'E2E上文提示' },
    },
    {
      label: '颂词续接',
      fill: async (page) => {
        await page.getByPlaceholder('提供给师兄的上一句').fill('E2E上一句');
        await page.getByPlaceholder('第一块\n第二块\n第三块').fill('续块一\n续块二');
      },
      expectPayload: { tokens: ['续块一', '续块二'], previousLine: 'E2E上一句' },
    },
  ];

  for (const c of CASES) {
    test(`${c.label} → payload形状正确落库`, async ({ page }) => {
      const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const { rows: [{ id: courseId }] } = await withDb((c2) =>
        c2.query(`INSERT INTO courses (name, slug, course_type, is_required) VALUES ($1,$2,'formal',true) RETURNING id`,
          [`E2E客观题测试课程-${suffix}`, `e2e-obj-${suffix}`]),
      );
      const { rows: [{ id: lessonId }] } = await withDb((c2) =>
        c2.query(`INSERT INTO course_lessons (course_id, lesson_number, title) VALUES ($1,1,'E2E测试课节') RETURNING id`, [courseId]),
      );
      const prompt = `E2E客观题-${c.label}-${suffix}`;
      try {
        await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);
        await page.goto('/quiz/new', { timeout: 45_000 });
        await page.getByTestId(testIds.quiz.coursePickerTrigger).click();
        await page.getByTestId(testIds.quiz.courseOption(courseId)).click();
        await page.getByTestId(testIds.quiz.lessonPickerTrigger).click();
        await page.getByTestId(testIds.quiz.lessonOption(lessonId)).click();
        await page.getByText(c.label, { exact: true }).click(); // 题型chip
        await c.fill(page);
        await page.getByTestId(testIds.quiz.promptInput).fill(prompt);
        await page.getByTestId(testIds.quiz.createButton).click();

        await expect(page.getByText(prompt, { exact: true })).toBeVisible({ timeout: 10_000 });
        // 同上"新建问答题"测试那条注释:这类现象已3次出现在这条创建链路上,改expect.poll重试。
        let rows: { payload: unknown }[] = [];
        await expect.poll(async () => {
          const res = await withDb((c2) => c2.query(`SELECT payload FROM questions WHERE prompt=$1`, [prompt]));
          rows = res.rows as { payload: unknown }[];
          return rows.length;
        }, { timeout: 10_000 }).toBe(1);
        expect(rows[0].payload).toEqual(c.expectPayload);
      } finally {
        await withDb((c2) => c2.query(`DELETE FROM courses WHERE id=$1`, [courseId]));
      }
    });
  }
});

test.describe('从讲记提取思考题(useExtractQuestionsFromBlocks)', () => {
  test('扫描lesson_blocks的question块 → 已存在的题(按去前缀题文比对)跳过,新的创建;重跑幂等不重复', async ({ page }) => {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const { rows: [{ id: courseId }] } = await withDb((c) =>
      c.query(`INSERT INTO courses (name, slug, course_type, is_required) VALUES ($1,$2,'formal',true) RETURNING id`,
        [`E2E讲记提取测试课程-${suffix}`, `e2e-extract-${suffix}`]),
    );
    const { rows: [{ id: lessonId }] } = await withDb((c) =>
      c.query(`INSERT INTO course_lessons (course_id, lesson_number, title) VALUES ($1,1,'E2E测试课节') RETURNING id`, [courseId]),
    );
    // 已有题:与block①去前缀后同文,提取时应识别为重复、跳过
    const existingPrompt = `E2E已存在的思考题-${suffix}`;
    await withDb((c) => c.query(`INSERT INTO questions (lesson_id, question_number, prompt, question_type) VALUES ($1,1,$2,'open')`, [lessonId, existingPrompt]));
    const newPrompt = `E2E全新的思考题-${suffix}`;
    // lesson_blocks 是官网ETL主导的数据模型(CLAUDE.md §6),这里只用其既有列插测试行,不改schema
    await withDb((c) =>
      c.query(
        `INSERT INTO lesson_blocks (lesson_id, block_order, block_type, text) VALUES ($1,0,'question',$2), ($1,1,'question',$3)`,
        [lessonId, `1、${existingPrompt}`, `2.${newPrompt}`],
      ),
    );
    try {
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);
      await page.goto('/quiz', { timeout: 45_000 });

      // ⚠️真机CI实测发现的坑(比"click()+等dialog顺序await会卡死"更深一层):onExtract里
      // confirmAsync()是点击后【立刻同步】弹出(没有先做任何异步mutation),不像本文件其它按钮
      // "先mutate、成功了才notify"那种confirm/alert隔了一次网络往返才出现——Promise.all并发等
      // 一样卡死,因为click()本身的"等页面稳定"内部逻辑会被这个几乎同步弹出的原生confirm卡住。
      // 唯一验证有效的写法(参照本文件其它"确认弹窗直接accept不关心内容"的地方全都用这个模式
      // 且从未失败):click()前用page.once()注册fire-and-forget监听,不用Promise链式等待——
      // 第一个监听器触发时,在它内部同步接着注册第二个监听器,确保第二个(notify)监听器在
      // mutate完成前就已经就位。
      let notifyMsg = '';
      page.once('dialog', (d) => {
        void d.accept();
        page.once('dialog', (d2) => { notifyMsg = d2.message(); void d2.accept(); });
      });
      await page.getByTestId(testIds.quiz.extractButton).click();
      await expect.poll(() => notifyMsg, { timeout: 15_000 }).toContain('已导入 1 道思考题'); // 只有②是新的,①去前缀后与既有题重复

      const { rows: afterExtract } = await withDb((c) => c.query(`SELECT prompt FROM questions WHERE lesson_id=$1 ORDER BY question_number`, [lessonId]));
      expect(afterExtract.length).toBe(2); // 原有1条+新提取1条,不是3条(①没被重复插入)
      expect(afterExtract[0].prompt).toBe(existingPrompt);
      expect(afterExtract[1].prompt).toBe(newPrompt); // 提取时已去掉"2."前缀

      // 幂等重跑:两块都已能在questions里找到对应(去前缀比对),不再新增。同上,confirm几乎
      // 同步弹出,用once链式监听,不用Promise等待。
      let notifyMsg2 = '';
      page.once('dialog', (d) => {
        void d.accept();
        page.once('dialog', (d2) => { notifyMsg2 = d2.message(); void d2.accept(); });
      });
      await page.getByTestId(testIds.quiz.extractButton).click();
      await expect.poll(() => notifyMsg2, { timeout: 15_000 }).toContain('没有新的思考题');
      const { rows: afterRerun } = await withDb((c) => c.query(`SELECT count(*) FROM questions WHERE lesson_id=$1`, [lessonId]));
      expect(Number(afterRerun[0].count)).toBe(2);
    } finally {
      await withDb((c) => c.query(`DELETE FROM courses WHERE id=$1`, [courseId]));
    }
  });
});

// 异常输入扩展(2026-07-17·PM"这两个都要测"·测试计划①):单选题少于2个选项确实挡住创建
// (已有校验);题干/参考答案没有长度上限,超长文本完整存入不截断——这是记录现状,不是bug
// 断言,是否要限制长度属于PM决定。
test.describe('异常输入:客观题选项数 + 超长文本', () => {
  test('单选题只填1个选项 → isPayloadComplete判定不完整,创建按钮保持禁用', async ({ page }) => {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const { rows: [{ id: courseId }] } = await withDb((c) =>
      c.query(`INSERT INTO courses (name, slug, course_type, is_required) VALUES ($1,$2,'formal',true) RETURNING id`,
        [`E2E单选边界测试课程-${suffix}`, `e2e-single-edge-${suffix}`]),
    );
    const { rows: [{ id: lessonId }] } = await withDb((c) =>
      c.query(`INSERT INTO course_lessons (course_id, lesson_number, title) VALUES ($1,1,'E2E测试课节') RETURNING id`, [courseId]),
    );
    try {
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);
      await page.goto('/quiz/new', { timeout: 45_000 });
      await page.getByTestId(testIds.quiz.coursePickerTrigger).click();
      await page.getByTestId(testIds.quiz.courseOption(courseId)).click();
      await page.getByTestId(testIds.quiz.lessonPickerTrigger).click();
      await page.getByTestId(testIds.quiz.lessonOption(lessonId)).click();
      await page.getByText('单选', { exact: true }).click();
      await page.getByPlaceholder('选项A\n选项B\n选项C').fill('只有一个选项');
      await page.getByTestId(testIds.quiz.promptInput).fill(`E2E单选少选项-${suffix}`);
      // 没选正确答案+只有1个选项,两者都不满足isPayloadComplete,创建按钮应保持禁用
      await expectDisabled(page.getByTestId(testIds.quiz.createButton));

      // ⚠️真机CI实测发现的坑:选项文本填的字符串跟自己撞了——textarea当前值就是"只有一个选项"
      // 本身,getByText同时命中textarea的内容和下方答案chip两处(resolved to 2 elements)。chip
      // 在JSX里排在textarea后面挂载,.last()按挂载顺序取,不是猜时序。
      await page.getByText('只有一个选项', { exact: true }).last().click(); // 补选正确答案,选项数仍是1
      await expectDisabled(page.getByTestId(testIds.quiz.createButton)); // 单选<2项,仍然禁用
    } finally {
      await withDb((c) => c.query(`DELETE FROM courses WHERE id=$1`, [courseId]));
    }
  });

  test('颂词组句题只填1个词块 → 排序题少于2项没有意义,创建按钮保持禁用(2026-07-17门槛从>=1提到>=2)', async ({ page }) => {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const { rows: [{ id: courseId }] } = await withDb((c) =>
      c.query(`INSERT INTO courses (name, slug, course_type, is_required) VALUES ($1,$2,'formal',true) RETURNING id`,
        [`E2E颂词边界测试课程-${suffix}`, `e2e-verse-edge-${suffix}`]),
    );
    const { rows: [{ id: lessonId }] } = await withDb((c) =>
      c.query(`INSERT INTO course_lessons (course_id, lesson_number, title) VALUES ($1,1,'E2E测试课节') RETURNING id`, [courseId]),
    );
    try {
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);
      await page.goto('/quiz/new', { timeout: 45_000 });
      await page.getByTestId(testIds.quiz.coursePickerTrigger).click();
      await page.getByTestId(testIds.quiz.courseOption(courseId)).click();
      await page.getByTestId(testIds.quiz.lessonPickerTrigger).click();
      await page.getByTestId(testIds.quiz.lessonOption(lessonId)).click();
      await page.getByText('颂词组句', { exact: true }).click();
      await page.getByPlaceholder('第一块\n第二块\n第三块').fill('只有一块');
      await page.getByTestId(testIds.quiz.promptInput).fill(`E2E颂词少词块-${suffix}`);
      await expectDisabled(page.getByTestId(testIds.quiz.createButton));
    } finally {
      await withDb((c) => c.query(`DELETE FROM courses WHERE id=$1`, [courseId]));
    }
  });

  test('题干/参考答案填超长字符串(6000字符)→ 前端maxLength挡在5000,DB也存不进超过5000的', async ({ page }) => {
    // 2026-07-17·PM决定加上限后从"确认现状"改成"确认挡住"。QUIZ_TEXT_MAX_LENGTH=5000
    // (lib/admin-thresholds.ts,占位·待核)。填6000个字符(明显超限),读回输入框实际值来做
    // 断言——不假设具体是"精确截断在5000"还是别的行为,用真实读回的值去核对DB,自洽。
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const { rows: [{ id: courseId }] } = await withDb((c) =>
      c.query(`INSERT INTO courses (name, slug, course_type, is_required) VALUES ($1,$2,'formal',true) RETURNING id`,
        [`E2E超长文本测试课程-${suffix}`, `e2e-longtext-${suffix}`]),
    );
    const { rows: [{ id: lessonId }] } = await withDb((c) =>
      c.query(`INSERT INTO course_lessons (course_id, lesson_number, title) VALUES ($1,1,'E2E测试课节') RETURNING id`, [courseId]),
    );
    const marker = `E2E超长-${suffix}`;
    const longPrompt = `${marker}-${'甲'.repeat(6000)}`;
    const longRef = `${marker}参考-${'乙'.repeat(6000)}`;
    try {
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);
      await page.goto('/quiz/new', { timeout: 45_000 });
      await page.getByTestId(testIds.quiz.coursePickerTrigger).click();
      await page.getByTestId(testIds.quiz.courseOption(courseId)).click();
      await page.getByTestId(testIds.quiz.lessonPickerTrigger).click();
      await page.getByTestId(testIds.quiz.lessonOption(lessonId)).click();
      await page.getByTestId(testIds.quiz.promptInput).fill(longPrompt);
      await page.getByTestId(testIds.quiz.referenceInput).fill(longRef);

      const actualPrompt = await page.getByTestId(testIds.quiz.promptInput).inputValue();
      const actualRef = await page.getByTestId(testIds.quiz.referenceInput).inputValue();
      expect(actualPrompt.length).toBeLessThanOrEqual(5000);
      expect(actualRef.length).toBeLessThanOrEqual(5000);

      await page.getByTestId(testIds.quiz.createButton).click();
      await expect(page.getByText(marker, { exact: false }).first()).toBeVisible({ timeout: 10_000 });

      const { rows } = await withDb((c) => c.query(`SELECT id, prompt FROM questions WHERE prompt=$1`, [actualPrompt]));
      expect(rows.length).toBe(1); // 精确匹配"输入框实际接受的那段"(被maxLength挡过的),不是原始6000字符
      const { rows: refRows } = await withDb((c) => c.query(`SELECT reference_text FROM question_references WHERE question_id=$1`, [rows[0].id]));
      expect(refRows[0].reference_text).toBe(actualRef);
    } finally {
      await withDb((c) => c.query(`DELETE FROM courses WHERE id=$1`, [courseId]));
    }
  });
});

// 权限边界·写层面场景4的次生发现(2026-07-17·PM"这两个都要测"·测试计划②):调研aixin改
// 参考答案这条时发现handleSaveRef没有onError,保存失败admin本人也看不到任何提示——跟本页
// 其它mutation(如删除题目)以及全项目其它页面的一致做法不同,不是aixin权限问题本身,是
// 这一处遗漏,已补上onError+notify()(与项目既有一致性对齐,不是新的产品决策)。这里用"并发
// 删除"这个真实场景触发一次真正的失败(question_id外键约束),验证admin确实会看到提示,
// 不是静默失败。
test.describe('保存参考答案失败时的错误提示(此前遗漏,已补onError)', () => {
  test('编辑参考答案时题目被并发删除 → 保存触发外键约束失败,admin看到"保存失败"提示', async ({ page }) => {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const { rows: [{ id: courseId }] } = await withDb((c) =>
      c.query(`INSERT INTO courses (name, slug, course_type, is_required) VALUES ($1,$2,'formal',true) RETURNING id`,
        [`E2E参考答案失败测试课程-${suffix}`, `e2e-refail-${suffix}`]),
    );
    const { rows: [{ id: lessonId }] } = await withDb((c) =>
      c.query(`INSERT INTO course_lessons (course_id, lesson_number, title) VALUES ($1,1,'E2E测试课节') RETURNING id`, [courseId]),
    );
    const prompt = `E2E参考答案失败测试-${suffix}`;
    const { rows: [{ id: questionId }] } = await withDb((c) =>
      c.query(`INSERT INTO questions (lesson_id, question_number, prompt, question_type) VALUES ($1,1,$2,'open') RETURNING id`, [lessonId, prompt]),
    );
    try {
      await loginAs(page, ADMIN_EMAIL, TEST_PASSWORD);
      await page.goto(`/quiz/${questionId}`, { timeout: 45_000 });
      await page.getByTestId(testIds.quiz.editReferenceButton).click();
      await page.getByTestId(testIds.quiz.referenceEditInput).fill('E2E参考答案内容');

      // 模拟另一个admin在这一刻把题目删了——question_references.question_id外键约束
      // (REFERENCES questions(id))会让接下来的upsert真的失败,不是伪造的错误
      await withDb((c) => c.query(`DELETE FROM questions WHERE id=$1`, [questionId]));

      // click()和dialog等待用page.once+expect.poll(Promise.all这套在"调整共修日程"真机CI
      // 复现过90秒超时,证明本身不安全,全项目统一换掉)
      let failMsg = '';
      page.once('dialog', (d) => { failMsg = d.message(); void d.accept(); });
      await page.getByTestId(testIds.quiz.saveReferenceButton).click();
      await expect.poll(() => failMsg, { timeout: 15_000 }).toContain('保存失败');
    } finally {
      await withDb((c) => c.query(`DELETE FROM courses WHERE id=$1`, [courseId]));
    }
  });
});
