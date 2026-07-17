import { WifiOff } from 'lucide-react-native';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsOnline } from '@/lib/network-status';

import { Text } from '@/components/ui/text';
// 全局离线提示条(弱网基础设施·2026-07-12):挂根布局顶部,任何页面断网都能看到,不打断
// 操作(纯提示非弹窗)。中性墨色而非告警红——这是系统级网络提示,不是"进度落后"这类业务
// 状态色,不受师兄端无状态色红线约束,但仍守克制、不用红色制造焦虑。
export function OfflineBanner() {
  const online = useIsOnline();
  const insets = useSafeAreaInsets();
  if (online) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: insets.top + 4, left: 0, right: 0, zIndex: 999, alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(43,34,24,0.85)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 9999 }}>
        <WifiOff size={13} color="#fff" />
        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>当前离线 · 部分内容可能无法加载</Text>
      </View>
    </View>
  );
}
