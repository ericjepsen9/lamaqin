// 外部所有表(官网/ETL 线产出,结构真源不在本仓迁移;审计 2026-07-02 台账缺口收口)。
// 生成器(gen-types-from-migrations.cjs)把这里并进 database.ts 的 Tables 段。
// ⚠️ 勿在任何清理脚本里 DROP 这些表(2026-06-23 清理脚本曾误删 self_study_resources);
//    改结构先与官网线对齐(CLAUDE.md §6),这里只登记 App 实测消费到的列。
module.exports = {
  self_study_categories: {
    // 11 学科分类(宗教学/教育学/医学…);App 当前不消费(实测列 2026-06-24)
    id: 'string',
    name: 'string',
    slug: 'string | null',
    display_order: 'number | null',
    created_at: 'string | null',
  },
  self_study_article_categories: {
    // article↔category 多对多;App 当前不消费(实测列 2026-06-24)
    article_id: 'string',
    category_id: 'string',
  },
  self_study_resources: {
    // 每篇演讲的视频/音频链接(kind=video/audio);App 消费中(大学演讲媒体区·实测列 2026-06-24)
    id: 'string',
    article_id: 'string',
    kind: 'string',
    url: 'string',
    label: 'string | null',
    sort_order: 'number | null',
    created_at: 'string | null',
  },
};
