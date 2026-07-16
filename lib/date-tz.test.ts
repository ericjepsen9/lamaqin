import { todayInTz, todayInTzOrLocal } from './date-tz';

// 时区工具单测(时区四层单一真源·CLAUDE.md §1)。固定时刻:2026-07-08 03:00 UTC——
// 这一刻东西半球日期不同(奥克兰已是 7-8 下午,洛杉矶还是 7-7 晚),专测跨日界。

describe('todayInTz', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-08T03:00:00Z'));
  });
  afterEach(() => jest.useRealTimers());

  it('合法 IANA 时区返回该时区的 YYYY-MM-DD', () => {
    expect(todayInTz('Asia/Shanghai')).toBe('2026-07-08'); // UTC+8 → 11:00
  });

  it('跨日界:同一物理时刻,东西半球日期差一天', () => {
    expect(todayInTz('Pacific/Auckland')).toBe('2026-07-08');     // UTC+12 → 15:00
    expect(todayInTz('America/Los_Angeles')).toBe('2026-07-07');  // PDT-7 → 前一天 20:00
  });

  it('UTC 边界:03:00Z 本身是 7-8', () => {
    expect(todayInTz('UTC')).toBe('2026-07-08');
  });

  it('非法时区字符串 → undefined(catch 分支,不抛)', () => {
    expect(todayInTz('Not/AZone')).toBeUndefined();
  });

  it('空值 → undefined(null/undefined/空串)', () => {
    expect(todayInTz(null)).toBeUndefined();
    expect(todayInTz(undefined)).toBeUndefined();
    expect(todayInTz('')).toBeUndefined();
  });
});

describe('todayInTzOrLocal', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-08T03:00:00Z'));
  });
  afterEach(() => jest.useRealTimers());

  it('有时区走时区', () => {
    expect(todayInTzOrLocal('Asia/Shanghai')).toBe('2026-07-08');
  });

  it('无时区回退设备本地日,恒为 YYYY-MM-DD 格式', () => {
    expect(todayInTzOrLocal(null)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(todayInTzOrLocal(undefined)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('非法时区也回退本地日(不抛)', () => {
    expect(todayInTzOrLocal('Not/AZone')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
