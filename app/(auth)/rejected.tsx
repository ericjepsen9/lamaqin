import { CircleAlert } from 'lucide-react-native';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';

// 「未通过」提示页(决策058,status=rejected)。语气克制、不催促。暖藏式。
const INK = '#2b2218';
const INK3 = '#7e6d5b';

export default function Rejected() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF4E9' }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 16 }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(43,34,24,0.05)', alignItems: 'center', justifyContent: 'center' }}>
          <CircleAlert size={34} color={INK3} />
        </View>
        <Text className="font-serif" style={{ fontSize: 20, fontWeight: '700', color: INK }}>报名暂未通过</Text>
        <Text style={{ fontSize: 14, color: INK3, textAlign: 'center', lineHeight: 24 }}>如有疑问,请联系你的辅导员了解详情。</Text>
      </View>
    </SafeAreaView>
  );
}
