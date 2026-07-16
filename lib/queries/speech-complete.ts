// 大学演讲圆满判定线(D-15·B口径·2026-07-02 PM 拍板)。零依赖纯函数:从 self_study.ts 抽出以便 jest 直测。
// 大纲要求层:限制性课=「至少听一遍上师传法的音视频、看一遍法本」→ 有视频=看+读双条件;
// 纯文字(无视频篇)=读即圆满;盲=免读只看视频、聋=免听只读正文(豁免降单条件,同课程侧)。
// 判定放应用层(施工规约2:业务判定=应用层显式调用),库端 record_self_study_mark 只存结果。
export function speechCompleteDerive(input: {
  hasVideo: boolean;
  watched: boolean;
  read: boolean;
  blind?: boolean;
  deaf?: boolean;
}): boolean {
  if (!input.hasVideo) return input.read;      // 纯文字:读即圆满(盲人无法读纯文字篇,自然不判圆满,不臆造)
  if (input.blind) return input.watched;       // 盲:免读
  if (input.deaf) return input.read;           // 聋:免听
  return input.watched && input.read;          // 常规:双条件
}
