// 报数周报纯函数(决策064/074a"WhatsApp报数文本")——零依赖,供 jest 直测。
// PD-17 周界:一周 = 周一 00:00(班级时区)起至下周一 00:00 前,与愿状态机/入行周界同一尺子。

// 给定某时区下的"今天"(YYYY-MM-DD),算出其所在周的周一日期(YYYY-MM-DD)。
export function mondayOnOrBefore(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  const dow = d.getDay(); // 0=周日..6=周六
  const diff = dow === 0 ? 6 : dow - 1; // 距本周一的天数
  d.setDate(d.getDate() - diff);
  return d.toLocaleDateString('en-CA');
}

// 周一日期 → 周日(周末)日期,供文本展示周区间。
export function sundayOf(mondayStr: string): string {
  const d = new Date(`${mondayStr}T00:00:00`);
  d.setDate(d.getDate() + 6);
  return d.toLocaleDateString('en-CA');
}

// 'YYYY-MM-DD' → 'M/D' 展示(去前导零,贴微信/WhatsApp 惯例)。
export function shortLabel(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  return `${Number(m)}/${Number(d)}`;
}

export type WeeklyReportItem = { name: string; unit: string; total: number };

// 决策074a:文本 = 班级名 + 本周各修法总量 + 回向文案,只含总量、不含具名个人数据(#193)。
// 回向文案沿用 app/about.tsx 已用的普贤回向偈(单一真源,勿另拟新文案)。
export function formatWeeklyReportText(input: {
  cohortName: string;
  weekStart: string; // YYYY-MM-DD(周一)
  weekEnd: string;   // YYYY-MM-DD(周日)
  items: WeeklyReportItem[];
  activeMembers: number;
}): string {
  const lines = [
    `【${input.cohortName}】本周共修汇报(${shortLabel(input.weekStart)}-${shortLabel(input.weekEnd)})`,
    ...(input.items.length > 0
      ? input.items.map((it) => `· ${it.name}:${it.total.toLocaleString()}${it.unit}`)
      : ['本周暂无共修记录']),
    `共 ${input.activeMembers} 人参与`,
    '',
    '愿以此功德,普及于一切,',
    '我等与众生,皆共成佛道。',
  ];
  return lines.join('\n');
}
