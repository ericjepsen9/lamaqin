import { formatWeeklyReportText, mondayOnOrBefore, shortLabel, sundayOf } from './report-week-calc';

// 报数周报纯函数单测(决策064/074a)。

describe('mondayOnOrBefore · PD-17 周界(周一起算)', () => {
  it('本身是周一 → 原地不动', () => {
    expect(mondayOnOrBefore('2026-07-06')).toBe('2026-07-06'); // 2026-07-06 是周一
  });
  it('周三 → 回退到本周一', () => {
    expect(mondayOnOrBefore('2026-07-08')).toBe('2026-07-06');
  });
  it('周日 → 回退到本周一(非跨入下周一)', () => {
    expect(mondayOnOrBefore('2026-07-12')).toBe('2026-07-06');
  });
  it('跨月:月初周三 → 上月周一', () => {
    expect(mondayOnOrBefore('2026-08-05')).toBe('2026-08-03');
  });
});

describe('sundayOf / shortLabel', () => {
  it('周一 + 6天 = 周日', () => {
    expect(sundayOf('2026-07-06')).toBe('2026-07-12');
  });
  it('shortLabel 去前导零', () => {
    expect(shortLabel('2026-07-06')).toBe('7/6');
    expect(shortLabel('2026-01-09')).toBe('1/9');
  });
});

describe('formatWeeklyReportText · 决策074a文本格式', () => {
  const base = { cohortName: '一班', weekStart: '2026-07-06', weekEnd: '2026-07-12', activeMembers: 8 };

  it('含班级名+周区间+各修法总量+人数+回向,不含任何具名个人数据(#193)', () => {
    const text = formatWeeklyReportText({ ...base, items: [{ name: '心经', unit: '遍', total: 12340 }, { name: '大礼拜', unit: '座', total: 85 }] });
    expect(text).toContain('【一班】本周共修汇报(7/6-7/12)');
    expect(text).toContain('· 心经:12,340遍');
    expect(text).toContain('· 大礼拜:85座');
    expect(text).toContain('共 8 人参与');
    expect(text).toContain('愿以此功德,普及于一切,');
    expect(text).toContain('我等与众生,皆共成佛道。');
    // #193:不出现任何人名/学号等个体标识
    expect(text).not.toMatch(/师兄|学号/);
  });

  it('本周零记录 → 占位行,不是空列表裸露', () => {
    const text = formatWeeklyReportText({ ...base, items: [], activeMembers: 0 });
    expect(text).toContain('本周暂无共修记录');
    expect(text).toContain('共 0 人参与');
  });
});
