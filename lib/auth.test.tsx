// 单元测试:验证 A2 审计发现的登出缓存清空修复(lib/auth.tsx 的 SIGNED_OUT 分支)。
// 用假 supabase.auth 捕获 onAuthStateChange 注册的回调、直接调用模拟登出/登入事件——
// 比真机e2e"抓UI闪现时序"更稳定精确:直接测被改的那段逻辑本身,不依赖渲染/网络时序。
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { useDownloadStore } from '@/lib/download-store';

type AuthEventHandler = (event: string, session: null) => void;
let capturedHandler: AuthEventHandler | null = null;

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: (cb: AuthEventHandler) => {
        capturedHandler = cb;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
  },
}));

import { AuthProvider } from '@/lib/auth';

function Probe() {
  return <Text>ok</Text>;
}

function seedEntry() {
  useDownloadStore.getState().setEntry({
    url: 'https://x.test/audio.mp3',
    localUri: 'file:///x.mp3',
    kind: 'audio',
    label: '测试音频',
    sizeBytes: 100,
    downloadedAt: Date.now(),
  });
}

describe('lib/auth.tsx · onAuthStateChange 缓存处理(A2审计修复)', () => {
  beforeEach(() => {
    capturedHandler = null;
    useDownloadStore.getState().clearAll();
  });

  test('SIGNED_OUT → queryClient.clear() 立即清空(不是invalidate标脏)+ 下载列表 clearAll()', async () => {
    const qc = new QueryClient();
    qc.setQueryData(['some-cached-query'], { stale: '上一账号的数据' });
    seedEntry();

    const view = await render(
      <QueryClientProvider client={qc}>
        <AuthProvider><Probe /></AuthProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(capturedHandler).not.toBeNull());

    // 登出前:缓存/下载列表都还在(确认下面的清空确实是事件触发的,不是本来就是空的)
    expect(qc.getQueryData(['some-cached-query'])).toBeDefined();
    expect(Object.keys(useDownloadStore.getState().entries)).toHaveLength(1);

    capturedHandler!('SIGNED_OUT', null);

    expect(qc.getQueryData(['some-cached-query'])).toBeUndefined();
    expect(useDownloadStore.getState().entries).toEqual({});
    await view.unmount();
    qc.clear();
    qc.unmount();
  });

  test('SIGNED_IN → 仍走 invalidateQueries(标脏待刷新),不清空已有数据(正常刷新场景不该丢数据)', async () => {
    const qc = new QueryClient();
    qc.setQueryData(['some-cached-query'], { fresh: '同账号刷新前的数据' });

    const view = await render(
      <QueryClientProvider client={qc}>
        <AuthProvider><Probe /></AuthProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(capturedHandler).not.toBeNull());

    capturedHandler!('SIGNED_IN', null);

    // invalidateQueries 只标脏、不删数据——RTL 没有直接查"是否stale"的公开API,
    // 用"数据还查得到"证明走的是 invalidate 分支、不是 SIGNED_OUT 那条 clear() 分支。
    expect(qc.getQueryData(['some-cached-query'])).toBeDefined();
    await view.unmount();
    qc.clear(); // 测试自己收尾用(销毁query、连带清掉setQueryData排的GC定时器),不是在测这行本身
    qc.unmount();
  });
});
