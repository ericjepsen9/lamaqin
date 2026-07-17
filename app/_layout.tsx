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
import { useFontScale } from '@/lib/font-scale'; // 副作用:导入即给 Text/TextInput 打字号补丁
import { OFFLINE_CACHE_MAX_AGE, shouldDehydrateQuery } from '@/lib/query-persist-allowlist';
import { queryClient } from '@/lib/query-client';
import { asyncStoragePersister } from '@/lib/query-persister';

// 离线缓存从 AsyncStorage 灌回 QueryClient 是异步的;灌回完成前各页 useQuery 会先各自
// 发起网络请求,离线时可能先闪一下"加载失败"才被灌回的缓存数据纠正过来——等灌回完成再渲染真实树。
function AppShell({ scale }: { scale: number }) {
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
      <Stack key={`fs-${scale}`} screenOptions={{ headerShown: false }} />
      <StatusBar style="auto" />
      <OfflineBanner />
    </AuthProvider>
  );
}

export default function RootLayout() {
  // 字号档位改变 → scale 变 → 用作 Stack 的 key,整树重渲染、全局即时生效(标准=1 时补丁无副作用)。
  const scale = useFontScale((s) => s.scale);
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
          <AppShell scale={scale} />
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
