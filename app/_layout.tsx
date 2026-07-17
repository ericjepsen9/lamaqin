import '../global.css';

import { useIsRestoring } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { OfflineBanner } from '@/components/offline-banner';
import { AuthProvider } from '@/lib/auth';
import { OFFLINE_CACHE_MAX_AGE, shouldDehydrateQuery } from '@/lib/query-persist-allowlist';
import { queryClient } from '@/lib/query-client';
import { asyncStoragePersister } from '@/lib/query-persister';

// 离线缓存从 AsyncStorage 灌回 QueryClient 是异步的;灌回完成前各页 useQuery 会先各自
// 发起网络请求,离线时可能先闪一下"加载失败"才被灌回的缓存数据纠正过来——等灌回完成再渲染真实树。
function AppShell() {
  const isRestoring = useIsRestoring();
  if (isRestoring) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FBF4E9', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }} />
      <StatusBar style="auto" />
      <OfflineBanner />
    </AuthProvider>
  );
}

export default function RootLayout() {
  // 字号改档不再需要在这里强制整树重渲染(2026-07-17 重做):components/ui/text.tsx 的 Text /
  // components/ui/text-input.tsx 的 TextInput 各自订阅 useFontScale 的 scale,改档时各自
  // 该组件自然重渲染,不需要靠 Stack 换 key 抡一次全树重挂载。
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister: asyncStoragePersister,
            maxAge: OFFLINE_CACHE_MAX_AGE,
            dehydrateOptions: { shouldDehydrateQuery },
          }}>
          <AppShell />
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
