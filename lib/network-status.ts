import { useEffect, useState } from 'react';

import NetInfo from '@react-native-community/netinfo';

// 全局在线状态(弱网基础设施·2026-07-12)。与 lib/query-client.ts 里给 TanStack Query
// onlineManager 接的是同一个 NetInfo 数据源,但那份不暴露 React 状态,这里单独订阅一份
// 供 UI(如离线提示条)渲染用。乐观初始值 true,避免开屏瞬间(NetInfo 首次回调前)误报离线。
export function useIsOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    return NetInfo.addEventListener((state) => {
      setOnline(!!state.isConnected && state.isInternetReachable !== false);
    });
  }, []);
  return online;
}
