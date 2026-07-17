import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text as RNText, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { useAuth } from '@/lib/auth';
import { FONT_LEVELS, useFontScale } from '@/lib/font-scale';
import { DOWNLOADS_SUPPORTED } from '@/lib/downloads';
import { requestPushPermissionAndRegisterToken } from '@/lib/push-notifications';
import { supabase } from '@/lib/supabase';
import { testIds } from '@/lib/testids';

// 设置(决策160·从「我的」进)。整合通知/偏好/账号隐私/关于。
// 通知:学习提醒(决策188方案A,2026-07-17接线)——这里只显示"本设备通知权限"这个真实状态+
//   给拒绝过系统权限弹窗的人一个手动重开的后路;是否真的发提醒由所在班级的辅导员配置
//   (cohort.reminder_*,管理端「学习提醒」),决策188明确不做个人user_settings开关这层,
//   这里不是、也不该是一个可以自己关掉提醒的开关。
// 偏好:简繁体 v1.5+(决策089→暂禁用占位);字号本地。账号:注销走 Apple/Edge Function(决策078)。
// 守:无状态色、无排名;退出 = 回登录。
//   （注销 Edge Function 已建·2026-07-10,此行此前过期未同步——待Eric部署,非前端待办）
const INK = '#2b2218';
const INK3 = '#7e6d5b';
const SAFFRON = '#e07856';
const CRIM = '#a13c2e';
export default function Settings() {
  const router = useRouter();
  const { session } = useAuth();
  // 字号:全局持久化 store(改即全 app 联动·决策见 lib/font-scale.ts)
  const font = useFontScale((s) => s.level);
  const setFont = useFontScale((s) => s.setLevel);

  // 本设备通知权限真实状态(决策188方案A·2026-07-17接线)。web不支持Expo Push这套token
  // 机制(同lib/push-notifications.ts的Platform门控),直接标"仅移动端支持",不调用API。
  const [notifStatus, setNotifStatus] = useState<'checking' | 'granted' | 'denied' | 'unsupported'>(
    Platform.OS === 'web' ? 'unsupported' : 'checking',
  );
  useEffect(() => {
    if (Platform.OS === 'web') return;
    Notifications.getPermissionsAsync().then((r) => setNotifStatus(r.granted ? 'granted' : 'denied'));
  }, []);
  const enableNotifications = async () => {
    if (!session?.user.id) return;
    await requestPushPermissionAndRegisterToken(session.user.id);
    const r = await Notifications.getPermissionsAsync();
    setNotifStatus(r.granted ? 'granted' : 'denied');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF4E9' }} edges={['top']}>
      <View style={styles.top}>
        <Pressable hitSlop={8} onPress={() => router.back()}><ChevronLeft size={24} color={INK} /></Pressable>
        <Text className="font-serif" style={{ fontSize: 17, fontWeight: '700', color: INK }}>设置</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
        <Group title="通知">
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <RNText style={styles.title}>学习提醒</RNText>
              <RNText style={styles.sub}>是否提醒由所在班级的辅导员统一设置;这里是本设备的通知权限状态</RNText>
            </View>
            {notifStatus === 'granted' ? (
              <View style={styles.soonTag}><RNText style={{ fontSize: 11, color: INK3, fontWeight: '600' }}>已开启</RNText></View>
            ) : notifStatus === 'unsupported' ? (
              <View style={styles.soonTag}><RNText style={{ fontSize: 11, color: INK3, fontWeight: '600' }}>仅移动端支持</RNText></View>
            ) : notifStatus === 'checking' ? null : (
              <Pressable testID={testIds.settings.enableNotificationsButton} style={styles.enableBtn} onPress={() => void enableNotifications()}>
                <RNText style={{ fontSize: 12, color: '#fff', fontWeight: '700' }}>开启通知</RNText>
              </Pressable>
            )}
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
          <NavRow title="关于纽约佛学会" sub="闻思修 · 学修端" last onPress={() => router.push('/about')} />
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
  enableBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9999, backgroundColor: SAFFRON },
  logout: { alignItems: 'center', paddingVertical: 15, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(161,60,46,0.25)' },
});
