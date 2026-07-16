# lib/data

静态数据资产(非代码生成、由 PM/内容侧提供)。

## bookcovers.json

明光网(mingguang.im)书系封面图全集 —— 索达吉堪布著译/讲解系列,共 **282 张**,已上传到公开 R2,可直接用 `url` 字段在 App 里加载(无需鉴权)。

来源:中枢 `sss/etl/covers/all_bookcovers_urls.tsv`(2026-06-28 生成)。

### 结构

```jsonc
{
  "r2_base": "https://pub-be36fdddbab249e29a1991dda041d9e5.r2.dev/bookcovers",
  "count": 282,
  "categories": { "yz":"论著译释","zz":"杂著·传记","kc":"课程讲解","ks":"开示文集","dx":"大学演讲" },
  "covers": [
    {
      "code": "yz001z",            // 明光码(R2 key:bookcovers/{code}.jpg)
      "category": "yz",
      "category_label": "论著译释",
      "name": "大圆满前行引导文",
      "url": "https://…/bookcovers/yz001z.jpg",
      "course_slug": "qianxingyuanwen"  // 非空=对应站内某课;null=暂无站内归属
    }
  ]
}
```

### ⚠️ 课卡封面请优先读数据库

29 张(`course_slug` 非空)已对应站内课程。**做课程卡片封面时,优先读 `courses.cover_image_url`**(值为 `…/covers/{course_slug}.jpg`,与本表同图、不同 key)。本 JSON 用于**全量书系/存档/选择器**等需要整套封面的场景。

分类张数:论著 79 · 杂著传记 28 · 课程讲解 112 · 开示 33 · 大学演讲 30。
