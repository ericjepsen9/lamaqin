import type { Query } from '@tanstack/react-query';

// 离线内容第一层白名单(PM 2026-07-12:"浏览过就要离线保存,下次直接打开阅读")——
// 只放行"课程内容"类只读查询;进度/状态类(会随学习变化,离线陈旧值可能让本人误判自己进度)
// 不持久化,默认拒绝、显式加白名单,防止以后新增查询意外沉淀进本地存储。
// 大文件(音频/PPT图)走第二层(expo-file-system 主动下载),这里只管文字/结构化数据。
// 独立成无 AsyncStorage 依赖的纯文件便于 jest 直接单测(同 vow-pace.ts 先例的注释:
// "jest 载入会撞 AsyncStorage"——query-persister.ts 会 import 原生模块,这个文件不引它)。
const OFFLINE_CONTENT_QUERY_KEYS = new Set<string>([
  'courses',
  'course-detail',
  'lesson-detail',
  'lesson-questions',
  'self-study-books',
  'self-study-book-detail',
  'speech-library',
  'speech-detail',
]);

export function shouldDehydrateQuery(query: Query): boolean {
  const key = query.queryKey[0];
  return query.state.status === 'success' && typeof key === 'string' && OFFLINE_CONTENT_QUERY_KEYS.has(key);
}

// 30天:课程内容变动很少,离线场景(如闭关/出行)可能连续多日不联网;
// 联网后各查询仍按各自 staleTime 正常后台刷新,这里只兜底"完全离线时还能打开"。
export const OFFLINE_CACHE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
