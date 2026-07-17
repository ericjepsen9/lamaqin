import { mergeTibetanCalendarDay } from './tibetan-map';

// 藏历共享库两表合并单测(2026-07-09 修正:真实表是 tibetan_calendar+buddhist_days,
// 不是之前代码假设的单表 tibetan_days——那张表设计已被推翻、从未建成)。
describe('mergeTibetanCalendarDay', () => {
  const cal = {
    gregorian_date: '2026-01-01',
    tib_month: 11, tib_day: 13, tib_month_name: '十一月', tib_day_name: '十三',
    is_leap_day: false, nong_month_name: '十一月', nong_day_name: '十三',
  };

  it('组合藏历日名与月名(直接拼接中文串,无需数字转换)', () => {
    const d = mergeTibetanCalendarDay(cal, []);
    expect(d.tibetan).toBe('十一月十三');
    expect(d.tibetanMonth).toBe('十一月');
    expect(d.lunar).toBe('十一月十三');
  });

  it('固定四类标签(十斋日/飞幡日/八吉同聚/九凶同聚)分流进 tags,不进 events', () => {
    const d = mergeTibetanCalendarDay(cal, [
      { day_type: 'auspicious', day_name: '八吉同聚', description: null },
    ]);
    expect(d.tags).toEqual(['八吉同聚']);
    expect(d.events).toEqual([]);
  });

  it('二十四节气/常见公历节日分流进 publicHoliday,不进 events/tags', () => {
    const d = mergeTibetanCalendarDay(cal, [
      { day_type: 'holiday', day_name: '元旦', description: null },
      { day_type: 'auspicious', day_name: '小寒', description: null },
    ]);
    expect(d.publicHoliday).toBe('小寒'); // 最后一条命中的覆盖前一条,同本地JSON单值语义
    expect(d.tags).toEqual([]);
    expect(d.events).toEqual([]);
  });

  it('其余(法会/圣诞/加持日等)进 events,带 description 时格式化为"name,description"', () => {
    const d = mergeTibetanCalendarDay(cal, [
      { day_type: 'holiday', day_name: '法王如意宝涅槃法会开始', description: null },
      { day_type: 'holiday', day_name: '地藏菩萨加持日', description: '作何善恶成亿倍' },
    ]);
    expect(d.events).toEqual(['法王如意宝涅槃法会开始', '地藏菩萨加持日,作何善恶成亿倍']);
  });

  it('三类混合:同一天可以同时有标签+节气+事件,各归各', () => {
    const d = mergeTibetanCalendarDay(cal, [
      { day_type: 'auspicious', day_name: '十斋日', description: null },
      { day_type: 'auspicious', day_name: '飞幡日', description: null },
      { day_type: 'holiday', day_name: '大寒', description: null },
      { day_type: 'holiday', day_name: '禅定胜王佛加持日', description: '作何善恶成百倍' },
    ]);
    expect(d.tags.sort()).toEqual(['十斋日', '飞幡日']);
    expect(d.publicHoliday).toBe('大寒');
    expect(d.events).toEqual(['禅定胜王佛加持日,作何善恶成百倍']);
  });

  it('无 buddhist_days 行(该日无殊胜日记录):tags/events 空,publicHoliday null', () => {
    const d = mergeTibetanCalendarDay(cal, []);
    expect(d.tags).toEqual([]);
    expect(d.events).toEqual([]);
    expect(d.publicHoliday).toBeNull();
  });

  it('auspicious 恒为 false(已知局限,规则不可靠,保守不猜)', () => {
    const d = mergeTibetanCalendarDay(cal, [{ day_type: 'auspicious', day_name: '八吉同聚', description: null }]);
    expect(d.auspicious).toBe(false);
  });

  it('闰日标记透传', () => {
    expect(mergeTibetanCalendarDay({ ...cal, is_leap_day: true }, []).isIntercalary).toBe(true);
  });

  it('空值防御:月/日名缺失→ tibetan/lunar 空串', () => {
    const d = mergeTibetanCalendarDay({ ...cal, tib_month_name: null, tib_day_name: null, nong_month_name: null, nong_day_name: null }, []);
    expect(d.tibetan).toBe('');
    expect(d.lunar).toBe('');
  });
});
