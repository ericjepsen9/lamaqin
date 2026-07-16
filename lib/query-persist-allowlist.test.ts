import type { Query } from '@tanstack/react-query';

import { shouldDehydrateQuery } from './query-persist-allowlist';

// 白名单纯函数单测——钉死"只有课程内容类查询才离线持久化"这条边界,防止以后随手改漏或改宽。
function fakeQuery(queryKey: unknown[], status: 'success' | 'error' | 'pending' = 'success'): Query {
  return { queryKey, state: { status } } as unknown as Query;
}

describe('shouldDehydrateQuery · 白名单', () => {
  it('课程内容类查询(成功态)→ 持久化', () => {
    expect(shouldDehydrateQuery(fakeQuery(['courses', 'u1']))).toBe(true);
    expect(shouldDehydrateQuery(fakeQuery(['course-detail', 'c1']))).toBe(true);
    expect(shouldDehydrateQuery(fakeQuery(['lesson-detail', 'l1']))).toBe(true);
    expect(shouldDehydrateQuery(fakeQuery(['lesson-questions', 'l1']))).toBe(true);
    expect(shouldDehydrateQuery(fakeQuery(['self-study-books']))).toBe(true);
    expect(shouldDehydrateQuery(fakeQuery(['self-study-book-detail', 'b1']))).toBe(true);
    expect(shouldDehydrateQuery(fakeQuery(['speech-library', 'u1']))).toBe(true);
    expect(shouldDehydrateQuery(fakeQuery(['speech-detail', 'a1']))).toBe(true);
  });

  it('进度/状态类查询不在白名单 → 不持久化(离线陈旧值可能误导本人进度)', () => {
    expect(shouldDehydrateQuery(fakeQuery(['my-course-studied', 'u1', 'c1']))).toBe(false);
    expect(shouldDehydrateQuery(fakeQuery(['my-course-status', 'u1', 'c1']))).toBe(false);
    expect(shouldDehydrateQuery(fakeQuery(['lesson-status-map', 'u1', 'k1']))).toBe(false);
    expect(shouldDehydrateQuery(fakeQuery(['course-schedule', 'u1', 'c1']))).toBe(false);
  });

  it('管理端/个人业务数据不在白名单 → 不持久化', () => {
    expect(shouldDehydrateQuery(fakeQuery(['admin-question', 'q1']))).toBe(false);
    expect(shouldDehydrateQuery(fakeQuery(['my-vows']))).toBe(false);
    expect(shouldDehydrateQuery(fakeQuery(['cohort-detail', 'co1']))).toBe(false);
  });

  it('未成功(加载中/报错)的查询不持久化,即使 key 在白名单里', () => {
    expect(shouldDehydrateQuery(fakeQuery(['lesson-detail', 'l1'], 'pending'))).toBe(false);
    expect(shouldDehydrateQuery(fakeQuery(['lesson-detail', 'l1'], 'error'))).toBe(false);
  });
});
