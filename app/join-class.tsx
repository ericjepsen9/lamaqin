import { useRouter } from 'expo-router';
import { ChevronLeft, Users } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text as RNText, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';

// 入班说明页(审计 P0 清假数据·2026-07-02:原假「选专业选班自助加入」流程撤除)。
// 口径:入班全部由管理员分配(决策126/127),师兄不自助选班——原页面方向即不对,改为诚实说明。
// 切主班(多班者)已移至班级页顶部切换器(走 switch_primary_cohort·决策131/134),不在本页。
const INK = '#2b2218';
const INK2 = '#55463a';
const INK3 = '#7e6d5b';
const SAFFRON = '#e07856';

export default function JoinClass() {
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF4E9' }} edges={['top']}>
      <View style={styles.top}>
        <Pressable hitSlop={8} onPress={() => router.back()}><ChevronLeft size={24} color={INK} /></Pressable>
        <Text className="font-serif" style={{ fontSize: 17, fontWeight: '700', color: INK }}>加入班级</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 14 }}>
        <View style={styles.card}>
          <View style={styles.icon}><Users size={22} color={SAFFRON} /></View>
          <Text className="font-serif" style={{ fontSize: 17, fontWeight: '700', color: INK, marginTop: 12 }}>入班由管理员安排</Text>
          <RNText style={{ fontSize: 14, color: INK2, lineHeight: 23, marginTop: 8 }}>
            班级共修按学会的班次统一编排,由管理员根据你的学习意愿与进度分配入班——无需在这里自选。
          </RNText>
          <RNText style={{ fontSize: 13, color: INK3, lineHeight: 21, marginTop: 10 }}>
            想加入班级共修:请联系你的辅导员或管理员;还没有联系方式的,可在「设置 → 帮助与反馈」里留言,管理员会与你联系。
          </RNText>
        </View>
        <RNText style={{ fontSize: 11, color: INK3, textAlign: 'center' }}>入班后课程随班级专业分配;先以旁听加入,辅导员核对后转正式。</RNText>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: 'rgba(43,34,24,0.06)' },
  icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(224,120,86,0.10)', alignItems: 'center', justifyContent: 'center' },
});
