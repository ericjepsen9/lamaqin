import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text as RNText, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { FONT_LEVELS, useFontScale } from '@/lib/font-scale';
import { DOWNLOADS_SUPPORTED } from '@/lib/downloads';
import { supabase } from '@/lib/supabase';

// 设置(决策160·从「我的」进)。整合通知/偏好/账号隐私/关于。
// 通知:系统推送 A/B/C 类(决策068)+ 自设提醒(决策102 恢复 v1.0)+ 殊胜日提醒(决策075 UTC+8)。
//   ⚠️ 关怀通知不在此(care_followups 对本人不可见/不推送·隐私红线·决策035)。
// 偏好:简繁体 v1.5+(决策089→暂禁用占位);字号本地。账号:注销走 Apple/Edge Function(决策078)。
// 守:无状态色、无排名;退出 = 回登录。TODO:user_settings(推送开关/偏好·C3·v1.5排期)。
//   （注销 Edge Function 已建·2026-07-10,此行此前过期未同步——待Eric部署,非前端待办）
const INK = '#2b2218';
const INK3 = '#7e6d5b';
const SAFFRON = '#e07856';
const CRIM = '#a13c2e';
export default function Settings() {
  const router = useRouter();
  // 字号:全局持久化 store(改即全 app 联动·决策见 lib/font-scale.ts)
  const font = useFontScale((s) => s.level);
  const setFont = useFontScale((s) => s.setLevel);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF4E9' }} edges={['top']}>
      <View style={styles.top}>
        <Pressable hitSlop={8} onPress={() => router.back()}><ChevronLeft size={24} color={INK} /></Pressable>
        <Text className="font-serif" style={{ fontSize: 17, fontWeight: '700', color: INK }}>设置</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
        {/* 通知(审计 P0 清空承诺·2026-07-02):v1 无推送系统,开关是纯本地假承诺 → 整区改「即将推出」;
            提醒系统 v1.5(决策 D-7)上线时恢复 Toggle 并接 user_settings。 */}
        <Group title="通知">
          <View style={styles.row}>
            <View style={{ flex: 1 }}><RNText style={styles.title}>学修 / 殊胜日 / 自设提醒</RNText><RNText style={styles.sub}>推送提醒功能完善中,上线后在这里开关</RNText></View>
            <View style={styles.soonTag}><RNText style={{ fontSize: 11, color: INK3, fontWeight: '600' }}>即将推出</RNText></View>
          </View>
        </Group>

        {/* 偏好 */}
        <Group title="偏好">
          <View style={[styles.row, styles.rowBorder]}>
            <View style={{ flex: 1 }}><RNText style={styles.title}>字号</RNText></View>
            <View style={styles.seg}>
              {FONT_LEVELS.map((f) => (
                <Pressable key={f} onPress={() => setFont(f)} style={[styles.segBtn, font === f && styles.segOn]}>
                  <RNText style={{ fontSize: 13, fontWeight: '700', color: font === f ? '#fff' : INK3 }}>{f}</RNText>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={[styles.row, DOWNLOADS_SUPPORTED && styles.rowBorder]}>
            <View style={{ flex: 1 }}><RNText style={styles.title}>简体 / 繁体</RNText><RNText style={styles.sub}>多语言切换</RNText></View>
            <View style={styles.soonTag}><RNText style={{ fontSize: 11, color: INK3, fontWeight: '600' }}>即将推出</RNText></View>
          </View>
          {DOWNLOADS_SUPPORTED ? (
            <NavRow title="离线下载管理" sub="已下载的音频 / 课件 · 占用与清理" last onPress={() => router.push('/downloads-manage')} />
          ) : null}
        </Group>

        {/* 账号与隐私 */}
        <Group title="账号与隐私">
          <NavRow title="编辑资料" sub="法名 / 头像 / 联系方式" onPress={() => router.push('/edit-profile')} />
          <NavRow title="隐私与条款" sub="隐私政策 · 用户协议" onPress={() => router.push('/legal')} />
          <NavRow title="帮助与反馈" sub="常见问题 · 联系辅导员" onPress={() => router.push('/help')} />
          <NavRow title="注销账号" sub="永久删除账号(学修档案后台留存)" titleColor={CRIM} last onPress={() => router.push('/delete-account')} />
        </Group>

        {/* 关于 */}
        <Group title="关于">
          <View style={[styles.row, styles.rowBorder]}><View style={{ flex: 1 }}><RNText style={styles.title}>版本</RNText></View><RNText style={styles.sub}>纽约佛学会 v1.0.0</RNText></View>
          <NavRow title="关于三殊胜" sub="闻思修 · 学修端" last onPress={() => router.push('/about')} />
        </Group>

        <Pressable style={styles.logout} onPress={async () => { await supabase.auth.signOut(); router.replace('/login'); }}>
          <RNText style={{ color: CRIM, fontWeight: '700', fontSize: 15 }}>退出登录</RNText>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text className="font-serif" style={{ fontSize: 14, fontWeight: '700', color: INK3, marginLeft: 4 }}>{title}</Text>
      <View style={styles.group}>{children}</View>
    </View>
  );
}
function Toggle({ title, sub, value, onChange, last }: { title: string; sub: string; value: boolean; onChange: (v: boolean) => void; last?: boolean }) {
  return (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <View style={{ flex: 1 }}><RNText style={styles.title}>{title}</RNText><RNText style={styles.sub}>{sub}</RNText></View>
      <IosSwitch value={value} onChange={onChange} />
    </View>
  );
}
// iOS 风格开关(自绘):web 上 RN Switch 不认 thumbColor 会出现绿色滑块,故自绘保证白滑块 + 藏红轨道。
function IosSwitch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      style={[styles.iosTrack, { backgroundColor: value ? SAFFRON : 'rgba(43,34,24,0.18)' }]}
    >
      <View style={[styles.iosThumb, value ? styles.iosThumbOn : null]} />
    </Pressable>
  );
}
function NavRow({ title, sub, titleColor, last, onPress }: { title: string; sub?: string; titleColor?: string; last?: boolean; onPress?: () => void }) {
  return (
    <Pressable style={[styles.row, !last && styles.rowBorder]} onPress={onPress}>
      <View style={{ flex: 1 }}><RNText style={[styles.title, titleColor ? { color: titleColor } : null]}>{title}</RNText>{sub ? <RNText style={styles.sub}>{sub}</RNText> : null}</View>
      <ChevronRight size={18} color={INK3} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  group: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(43,34,24,0.06)', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(43,34,24,0.06)' },
  title: { fontSize: 15, fontWeight: '600', color: INK },
  sub: { fontSize: 12, color: INK3, marginTop: 1 },
  seg: { flexDirection: 'row', backgroundColor: 'rgba(43,34,24,0.05)', borderRadius: 9999, padding: 2 },
  segBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 9999 },
  segOn: { backgroundColor: SAFFRON },
  soonTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: 'rgba(43,34,24,0.05)' },
  logout: { alignItems: 'center', paddingVertical: 15, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(161,60,46,0.25)' },
  // iOS 风格开关
  iosTrack: { width: 50, height: 30, borderRadius: 15, padding: 2, justifyContent: 'center' },
  iosThumb: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#fff', alignSelf: 'flex-start', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  iosThumbOn: { alignSelf: 'flex-end' },
});
