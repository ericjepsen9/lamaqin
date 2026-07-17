import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';

// 隐私与条款(设置 → 账号与隐私)。占位文本,正式发布前由学会 / 法务定稿替换。
// 与三殊胜相关口径:学修档案后台留存(决策078)、关怀记录师兄不可见(决策035)、密法相关另议。
const INK = '#2b2218';
const INK2 = '#55463a';
const INK3 = '#7e6d5b';
const SAFFRON = '#e07856';

const PRIVACY = [
  ['我们收集什么', '法名、真实姓名(供辅导员核对身份)、联系方式、学修记录(进度 / 计数 / 出勤 / 答题)。这些用于呈现你的学修档案、辅导员关怀与升学参考。'],
  ['谁能看到', '你的学修进度与累计【仅你本人及管理者可见】,不会向其他师兄具名展示;集体数据只以匿名总量呈现。关怀跟进记录由辅导员 / 爱心师兄维护,对你不展示。'],
  ['数据留存', '注销账号后,个人登录信息删除;学修档案按学会规定在后台留存(供学籍 / 升学查考)。'],
  ['你的权利', '可随时编辑资料、调整提醒、申请注销。如对数据有疑问,联系你的辅导员。'],
];
const TERMS = [
  ['学修约定', '本应用为已入学师兄的学修端。请如实补录学修记录;系统信任师兄,虚报由人工核查。'],
  ['账号', '一人一号;旁听经辅导员转正为正式学员后发放学号、计入升学。'],
  ['行为规范', '应用以闻思修为本,尊重师长同修。'],
  ['免责', '法义内容以上师讲解与学会教材为准;应用为辅助工具。'],
];

export default function Legal() {
  const router = useRouter();
  const [tab, setTab] = useState<'privacy' | 'terms'>('privacy');
  const data = tab === 'privacy' ? PRIVACY : TERMS;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF4E9' }} edges={['top']}>
      <View style={styles.top}>
        <Pressable hitSlop={8} onPress={() => router.back()}><ChevronLeft size={24} color={INK} /></Pressable>
        <Text className="font-serif" style={{ fontSize: 17, fontWeight: '700', color: INK }}>隐私与条款</Text>
      </View>

      <View style={{ paddingHorizontal: 16 }}>
        <View style={styles.seg}>
          {([['privacy', '隐私政策'], ['terms', '用户协议']] as const).map(([k, l]) => (
            <Pressable key={k} onPress={() => setTab(k)} style={[styles.segBtn, tab === k && styles.segOn]}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: tab === k ? '#fff' : INK3 }}>{l}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }}>
        {data.map(([h, b]) => (
          <View key={h} style={styles.card}>
            <Text className="font-serif" style={{ fontSize: 15, fontWeight: '700', color: INK }}>{h}</Text>
            <Text style={{ fontSize: 14, color: INK2, lineHeight: 23, marginTop: 6 }}>{b}</Text>
          </View>
        ))}
        <Text style={{ fontSize: 11, color: INK3, textAlign: 'center', lineHeight: 18 }}>以上为摘要,完整文本以正式发布版本为准。{'\n'}更新日期:待定</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  seg: { flexDirection: 'row', backgroundColor: 'rgba(43,34,24,0.05)', borderRadius: 9999, padding: 3 },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 9999 },
  segOn: { backgroundColor: SAFFRON },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(43,34,24,0.06)' },
});
