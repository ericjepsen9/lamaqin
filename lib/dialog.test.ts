// 单元测试:confirmAsync 的 web 端 fail-safe(非 fail-open)修复(A12·2026-07-13发现)。
// jest-expo 用纯 node 测试环境(无 jsdom),没有全局 window,Platform.OS 默认也不是 'web'——
// 这里手动搭 window 模拟三种真实环境状态,并直接改 Platform.OS(RN 的 Platform 是普通可变对象,
// 不是 getter,jest-expo 环境下可直接赋值,无需 jest.mock 整个 react-native——那样会连累
// react-native-css-interop 的组件初始化链,在这个版本组合下会直接炸)以命中要测的那个分支。
import { Platform } from 'react-native';

import { confirmAsync } from './dialog';

describe('confirmAsync · web端环境异常时 fail-safe(不可逆操作宁可挡住,不能误放行)', () => {
  const originalOS = Platform.OS;
  beforeEach(() => {
    (Platform as { OS: string }).OS = 'web';
  });
  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
    (Platform as { OS: string }).OS = originalOS;
  });

  it('window.confirm 可用 → 如实返回其结果(true/false 都要透传,不是恒真恒假)', async () => {
    (globalThis as unknown as { window: { confirm: () => boolean } }).window = { confirm: () => true };
    await expect(confirmAsync('标题')).resolves.toBe(true);
    (globalThis as unknown as { window: { confirm: () => boolean } }).window.confirm = () => false;
    await expect(confirmAsync('标题')).resolves.toBe(false);
  });

  it('window 存在但没有 confirm 方法 → 默认 false(fail-safe),不是此前的 true(fail-open)', async () => {
    (globalThis as unknown as { window: object }).window = {};
    await expect(confirmAsync('标题')).resolves.toBe(false);
  });

  it('window 本身不存在 → 同样默认 false,不抛错', async () => {
    delete (globalThis as unknown as { window?: unknown }).window;
    await expect(confirmAsync('标题')).resolves.toBe(false);
  });
});
