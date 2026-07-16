import type { TibetanDay } from './tibetan';

// 共享库藏历数据(2026-07-09 修正):真实存在于 dev/生产的是两表 tibetan_calendar + buddhist_days
// (2026-06-19 定案,决策137 合并单表 tibetan_days 方案已被推翻且从未建成——之前一版代码查的正是
// 这张不存在的表,导致"切源"从未真正生效、一直静默兜底回本地 JSON;详见审计 2026-07-09)。
// 零依赖纯文件,可 jest 直测。

export type TibetanCalendarRow = {
  gregorian_date: string;
  tib_month: number | null;
  tib_day: number | null;
  tib_month_name: string | null; // 已是中文串(如"十二月"),非数字,无需再转换
  tib_day_name: string | null;   // 已是中文串(如"三十")
  is_leap_day: boolean | null;
  nong_month_name: string | null; // 农历月名(如"正月")
  nong_day_name: string | null;   // 农历日名(如"初一")
};

export type BuddhistDayRow = {
  day_type: 'holiday' | 'auspicious' | 'blessing' | string;
  day_name: string;
  description: string | null;
};

// 固定四类藏历传统标签(schema/terminology 文档反复出现的同一组,可靠)。
const FIXED_TAGS = ['十斋日', '飞幡日', '八吉同聚', '九凶同聚'];
// 二十四节气(客观历法事实,非宗教判定,可靠)。
const SOLAR_TERMS = [
  '小寒', '大寒', '立春', '雨水', '惊蛰', '春分', '清明', '谷雨', '立夏', '小满', '芒种', '夏至',
  '小暑', '大暑', '立秋', '处暑', '白露', '秋分', '寒露', '霜降', '立冬', '小雪', '大雪', '冬至',
];
// 常见公历法定/民俗节日名(用于从 events 里挑出"公历节日"这一类,同本地 JSON 的 publicHoliday 语义)。
const COMMON_HOLIDAYS = ['元旦', '春节', '除夕', '元宵', '清明节', '劳动节', '端午', '端午节', '中秋', '中秋节', '国庆', '国庆节'];

function combineNameDesc(name: string, desc: string | null): string {
  return desc ? `${name},${desc}` : name;
}

// ⚠️ 已知局限(2026-07-09 审计,不臆造):`auspicious`(修法功德日🌺)这个布尔值,本地 JSON
//   (觉学 TibetanDay 数据集)的原始判定规则不明——用真实 dev 数据逐日核对了 8 个不同 tags/events
//   组合样本,试过"有固定标签""有 auspicious 类行""有非标签的法会/圣诞类事件"三种规则,
//   命中率均在 40%-65%,没有一种可靠(即同为"十斋日"标签的两天,本地 JSON 一天 true 一天 false)。
//   保守选择:共享库数据源下 auspicious 恒为 false,不猜一个验证不过的规则来假装精确。
//   若需保留这个视觉标记,需内容侧(官网/lotusborn数据源owner)明确给出判定字段或规则。
export function mergeTibetanCalendarDay(cal: TibetanCalendarRow, days: BuddhistDayRow[]): TibetanDay {
  const tags: string[] = [];
  const events: string[] = [];
  let publicHoliday: string | null = null;
  for (const d of days) {
    if (FIXED_TAGS.includes(d.day_name)) { tags.push(d.day_name); continue; }
    if (SOLAR_TERMS.includes(d.day_name) || COMMON_HOLIDAYS.includes(d.day_name)) { publicHoliday = d.day_name; continue; }
    events.push(combineNameDesc(d.day_name, d.description));
  }
  return {
    date: cal.gregorian_date,
    lunar: cal.nong_month_name && cal.nong_day_name ? `${cal.nong_month_name}${cal.nong_day_name}` : '',
    tibetan: cal.tib_month_name && cal.tib_day_name ? `${cal.tib_month_name}${cal.tib_day_name}` : '',
    tibetanMonth: cal.tib_month_name ?? '',
    isIntercalary: !!cal.is_leap_day,
    tags,
    auspicious: false, // 见上方局限说明
    events,
    publicHoliday,
  };
}
