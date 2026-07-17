import { examPassLine, isExamPass } from './exam-pass-line';

describe('examPassLine · 大纲三档', () => {
  it('出勤≥93次 → 30分线,与开卷/闭卷无关', () => {
    expect(examPassLine(93, 'open')).toBe(30);
    expect(examPassLine(93, 'closed')).toBe(30);
    expect(examPassLine(200, 'closed')).toBe(30);
  });
  it('出勤<93次 · 开卷72分 / 闭卷60分', () => {
    expect(examPassLine(92, 'open')).toBe(72);
    expect(examPassLine(92, 'closed')).toBe(60);
    expect(examPassLine(0, 'closed')).toBe(60);
  });
});

describe('isExamPass', () => {
  it('出勤≥93次:30分过、29分不过', () => {
    expect(isExamPass(30, 93, 'closed')).toBe(true);
    expect(isExamPass(29, 93, 'closed')).toBe(false);
  });
  it('出勤<93次·闭卷:60分过、59分不过', () => {
    expect(isExamPass(60, 50, 'closed')).toBe(true);
    expect(isExamPass(59, 50, 'closed')).toBe(false);
  });
  it('出勤<93次·开卷:72分过、71分不过', () => {
    expect(isExamPass(72, 50, 'open')).toBe(true);
    expect(isExamPass(71, 50, 'open')).toBe(false);
  });
});
