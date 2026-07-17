import NetInfo from '@react-native-community/netinfo';
import { onlineManager, QueryClient } from '@tanstack/react-query';

// 弱网友好:失败重试 + 后台刷新由 TanStack Query 托管。
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      retry: 2,
    },
    // mutations 默认不重试(库默认即 0):大多数写入是纯 INSERT、还没做幂等去重,
    // 盲目全局重试会把"弱网下确认丢失"的风险从"可能漏记"变成"可能重复记"——
    // 更危险。已做幂等的写入(如 useRecordPracticeLog)按各自 mutation 单独开重试。
  },
});

// 接 NetInfo → TanStack Query 的 onlineManager(官方 React Native 集成点·2026-07-12)。
//   不接的话 onlineManager.isOnline() 原生端永远返回 true(只监听浏览器 online/offline
//   事件),networkMode:'online' 的默认网关形同虚设、refetchOnReconnect 永远不触发。
onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => {
    setOnline(!!state.isConnected && state.isInternetReachable !== false);
  });
});
