// 冒烟测试：藏历纯日期函数（决策075 UTC 基准 · 无外部依赖 · 确定性）。
// 证明 jest 底座可跑；同时这批日期逻辑正是高价值可测对象。
import { addDays, addMonths, dow, monthCells, weekDays } from './tibetan';

describe('tibetan 日期函数', () => {
  test('dow：2026-07-03 是周五 = 5', () => {
    expect(dow('2026-07-03')).toBe(5);
    expect(dow('2026-07-05')).toBe(0); // 周日
  });

  test('addDays：跨月进位', () => {
    expect(addDays('2026-07-31', 1)).toBe('2026-08-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  test('addMonths：月末夹取到目标月的最后一天（1/31 + 1月 = 2/28）', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28'); // 2026 非闰年
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29'); // 2024 闰年
    expect(addMonths('2026-07-15', -7)).toBe('2025-12-15'); // 跨年回退
  });

  test('weekDays：返回含该日的周日→周六共 7 天', () => {
    const wk = weekDays('2026-07-03'); // 周五
    expect(wk).toHaveLength(7);
    expect(wk[0]).toBe('2026-06-28'); // 该周周日
    expect(wk[5]).toBe('2026-07-03'); // 周五本身
    expect(wk[6]).toBe('2026-07-04'); // 周六
  });

  test('monthCells：前导 null 补齐 + 总数为 7 的倍数', () => {
    const cells = monthCells('2026-07-10'); // 2026-07-01 是周三 → 前导 3 个 null
    expect(cells.slice(0, 3)).toEqual([null, null, null]);
    expect(cells[3]).toBe('2026-07-01');
    expect(cells.length % 7).toBe(0);
    expect(cells).toContain('2026-07-31'); // 7 月 31 天
    expect(cells).not.toContain('2026-07-32');
  });
});
