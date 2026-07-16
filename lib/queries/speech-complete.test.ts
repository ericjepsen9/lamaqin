import { speechCompleteDerive } from './speech-complete';

// 圆满判定线真值表(D-15·B口径·2026-07-02 PM 拍板)。4 分支逐一钉死。

describe('speechCompleteDerive · 纯文字篇(hasVideo=false)', () => {
  it('读了即圆满', () => {
    expect(speechCompleteDerive({ hasVideo: false, watched: false, read: true })).toBe(true);
  });
  it('没读不圆满(即使 watched=true 也无视频可看,不臆造)', () => {
    expect(speechCompleteDerive({ hasVideo: false, watched: true, read: false })).toBe(false);
  });
  it('盲人对纯文字篇:读不了 → 不判圆满(不臆造豁免)', () => {
    expect(speechCompleteDerive({ hasVideo: false, watched: true, read: false, blind: true })).toBe(false);
  });
});

describe('speechCompleteDerive · 盲(免读只看)', () => {
  it('看了视频即圆满,不要求读', () => {
    expect(speechCompleteDerive({ hasVideo: true, watched: true, read: false, blind: true })).toBe(true);
  });
  it('没看不圆满(读了也不行——盲判看)', () => {
    expect(speechCompleteDerive({ hasVideo: true, watched: false, read: true, blind: true })).toBe(false);
  });
});

describe('speechCompleteDerive · 聋(免听只读)', () => {
  it('读了即圆满,不要求看', () => {
    expect(speechCompleteDerive({ hasVideo: true, watched: false, read: true, deaf: true })).toBe(true);
  });
  it('没读不圆满(看了也不行——聋判读)', () => {
    expect(speechCompleteDerive({ hasVideo: true, watched: true, read: false, deaf: true })).toBe(false);
  });
});

describe('speechCompleteDerive · 常规(双条件)', () => {
  it.each([
    [true, true, true],
    [true, false, false],
    [false, true, false],
    [false, false, false],
  ])('watched=%s read=%s → %s', (watched, read, expected) => {
    expect(speechCompleteDerive({ hasVideo: true, watched, read })).toBe(expected);
  });
});

describe('speechCompleteDerive · 盲聋并存(现实现:盲分支优先)', () => {
  // 特征化断言:代码顺序 blind 先判——盲聋并存者按"免读只看"。若教务另有口径,改这条前先问 PM。
  it('blind+deaf 同true → 按盲判(watched)', () => {
    expect(speechCompleteDerive({ hasVideo: true, watched: true, read: false, blind: true, deaf: true })).toBe(true);
    expect(speechCompleteDerive({ hasVideo: true, watched: false, read: true, blind: true, deaf: true })).toBe(false);
  });
});
