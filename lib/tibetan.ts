import RAW from './data/tibetan-2026.json';

// 藏历数据访问(决策137/172)。本文件导出的是本地 JSON 兜底源(觉学 TibetanDay 2026 全年 365 天)
// + 纯日期计算工具;共享库优先的查询在 lib/queries/tibetan-db.ts(useTibetanLookup,查真实存在的
// tibetan_calendar+buddhist_days 两表,本文件的 getTibetanDay 只作该表查无当天数据时的兜底)。
// 时区 UTC+8 固定算"今天"(决策075:全球同观殊胜日,非手机本地)。
export type TibetanDay = {
  date: string;            // 公历 YYYY-MM-DD
  lunar: string;           // 农历
  tibetan: string;         // 藏历日(如 五月初六)
  tibetanMonth: string;    // 藏历月名(萨嘎月 / 作净月…)
  isIntercalary: boolean;  // 闰日
  tags: string[];          // 十斋日 / 飞幡日 / 八吉同聚 / 九凶同聚
  auspicious: boolean;     // 修法功德日 🌺
  events: string[];        // 佛事 / 法会 / 圣诞 / 加持日 + 民俗(理发吉日)
  publicHoliday: string | null; // 公历节日 / 节气
};

const DAYS = RAW as unknown as TibetanDay[];
const MAP = new Map<string, TibetanDay>(DAYS.map((d) => [d.date, d]));

export function getTibetanDay(date: string): TibetanDay | undefined {
  return MAP.get(date);
}

export const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

// UTC+8 的"今天"(决策075)
export function todayUTC8(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}
function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function dow(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
}
export function addMonths(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const dim = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, dim));
  return fmt(d);
}
// 含 date 的那一周(周日→周六)
export function weekDays(date: string): string[] {
  const start = addDays(date, -dow(date));
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}
// 含 date 的整月网格(前导空格补 null,补满 7 的倍数)
export function monthCells(date: string): (string | null)[] {
  const d = new Date(`${date}T00:00:00Z`);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const first = new Date(Date.UTC(y, m, 1)).getUTCDay();
  const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < first; i += 1) cells.push(null);
  for (let dd = 1; dd <= dim; dd += 1) cells.push(`${y}-${String(m + 1).padStart(2, '0')}-${String(dd).padStart(2, '0')}`);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

// 佛事 / 殊胜(排除民俗黄历);民俗黄历(理发吉日);是否法会日
export const buddhaEvents = (d?: TibetanDay): string[] => (d?.events ?? []).filter((e) => !e.startsWith('理发吉日'));
export const folkEvents = (d?: TibetanDay): string[] => (d?.events ?? []).filter((e) => e.startsWith('理发吉日'));
export const isCeremony = (d?: TibetanDay): boolean => buddhaEvents(d).some((e) => e.includes('法会'));
