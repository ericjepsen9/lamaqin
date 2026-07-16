import { useRouter } from 'expo-router';
import { BadgeCheck, BookOpen, ChevronLeft, Flower2, Users } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text as RNText, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { useMarkAllNotificationsRead, useMarkNotificationRead } from '@/lib/mutations/notifications';
import { useMyNotifications, type NotificationCategory, type NotificationRow } from '@/lib/queries/notifications';

// 通知中心 · 首页铃铛的落点(决策062/068 推送四类的「站内」落地;决策170 UI 定型;
//   C2·2026-07-11 接真数据)。
// 显示分类(用户视角,非 A/B/C/D 推送类):学修 / 班级 / 法会 / 系统。
//   学修(C+B):新一周课程、待复习、断签随喜、每周回向(匿名总量)
//   班级(B):班级公告、共修、讲考    法会(B):法会、平台活动    系统(A):入学审批、转正、愿被管理方调整
// ⛔ 守红线:① care_followups 关怀跟进【完全不出现】(决策035·师兄不可见,关怀靠人工私下接力)
//   ② #193 不向他人具名/不排名/不比较——回向只显「全班已汇成」匿名总量,无个人数;
//   ③ 师兄端无状态色——未读用 saffron 品牌色提示(非"落后/达标"状态色);④ 密法 0 痕迹。
// 数据:notifications 表(user 私有)接真,mark read/mark all 真实落库,首页铃铛红点见 home.tsx。
//   本轮只接了 3 个"动作触发即写"的事件源(入学审批/转正/班级公告);"新一周课程/待复习/断签/
//   每周回向"这类时间型事件需要 cron 定时派发基建(同 SD-4 未建),尚未接,列表暂时只会看到前 3 类。
//   分组(今天/昨天/更早)与时间显示走设备本地时区(个人收件箱,同"个人打卡跟手机本地"口径)。
const INK = '#2b2218';
const INK2 = '#55463a';
const INK3 = '#7e6d5b';
const SAFFRON = '#e07856';
const SAFFRON_DARK = '#b35535';
const CRIMSON = '#a13c2e';

type Cat = NotificationCategory;
type Group = 'today' | 'yesterday' | 'earlier';

const CAT_LABEL: Record<Cat, string> = { study: '学修', class: '班级', event: '法会', system: '系统' };
const GROUP_LABEL: Record<Group, string> = { today: '今天', yesterday: '昨天', earlier: '更早' };
const GROUP_ORDER: Group[] = ['today', 'yesterday', 'earlier'];
type Filter = 'all' | 'unread' | Cat;

function toGroup(createdAt: string, now: Date): Group {
  const d = new Date(createdAt);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  if (d >= startOfToday) return 'today';
  if (d >= startOfYesterday) return 'yesterday';
  return 'earlier';
}
function formatTime(createdAt: string, group: Group): string {
  const d = new Date(createdAt);
  const hm = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (group === 'today') return hm;
  if (group === 'yesterday') return `昨天 ${hm}`;
  return `${d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })} ${hm}`;
}

function CatIcon({ cat }: { cat: Cat }) {
  const color = INK2;
  const icon =
    cat === 'study' ? <BookOpen size={18} color={color} /> :
    cat === 'class' ? <Users size={18} color={color} /> :
    cat === 'event' ? <Flower2 size={18} color={color} /> :
    <BadgeCheck size={18} color={color} />;
  return <View style={styles.iconCircle}>{icon}</View>;
}

export default function Notifications() {
  const router = useRouter();
  const { data: rows = [], isLoading, error } = useMyNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const [filter, setFilter] = useState<Filter>('all');

  const notifs = useMemo(() => {
    const now = new Date();
    return (rows as NotificationRow[]).map((r) => {
      const group = toGroup(r.createdAt, now);
      return { ...r, group, time: formatTime(r.createdAt, group), read: r.readAt != null };
    });
  }, [rows]);
  type DisplayNotif = (typeof notifs)[number];

  const isUnread = (n: DisplayNotif) => !n.read;
  const unreadCount = useMemo(() => notifs.filter(isUnread).length, [notifs]);
  const counts = useMemo(() => ({
    all: notifs.length,
    study: notifs.filter((n) => n.category === 'study').length,
    class: notifs.filter((n) => n.category === 'class').length,
    event: notifs.filter((n) => n.category === 'event').length,
    system: notifs.filter((n) => n.category === 'system').length,
  }), [notifs]);

  const filtered = useMemo(() => {
    if (filter === 'all') return notifs;
    if (filter === 'unread') return notifs.filter(isUnread);
    return notifs.filter((n) => n.category === filter);
  }, [filter, notifs]);

  const markAll = () => { markAllRead.mutate(); if (filter === 'unread') setFilter('all'); };
  const onTap = (n: DisplayNotif) => {
    if (!n.read) markRead.mutate(n.id);
    if (n.link) router.push(n.link as never);
  };

  const chips: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: '全部', count: counts.all },
    ...(unreadCount > 0 ? [{ key: 'unread' as Filter, label: '未读', count: unreadCount }] : []),
    ...(['study', 'class', 'event', 'system'] as Cat[])
      .filter((c) => counts[c] > 0)
      .map((c) => ({ key: c as Filter, label: CAT_LABEL[c], count: counts[c] })),
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF4E9' }} edges={['top']}>
      <View style={styles.top}>
        <View className="flex-row items-center" style={{ gap: 10 }}>
          <Pressable hitSlop={8} onPress={() => router.back()}><ChevronLeft size={24} color={INK} /></Pressable>
          <Text className="font-serif" style={{ fontSize: 18, fontWeight: '700', color: INK }}>通知</Text>
        </View>
        {unreadCount > 0 ? (
          <Pressable hitSlop={8} onPress={markAll}><RNText style={{ fontSize: 13, color: SAFFRON_DARK, fontWeight: '700' }}>全部已读</RNText></Pressable>
        ) : null}
      </View>

      {/* 筛选(横向 chip;ScrollView 不纵向撑高,chip 不被拉伸) */}
      <View style={styles.chipBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
          {chips.map((c) => (
            <Pressable key={c.key} style={[styles.chip, filter === c.key && styles.chipOn]} onPress={() => setFilter(c.key)}>
              <RNText numberOfLines={1} style={{ fontSize: 13, fontWeight: '700', color: filter === c.key ? '#fff' : INK2 }}>{c.label} {c.count}</RNText>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
        {error ? (
          <View style={styles.empty}>
            <RNText style={{ fontSize: 14, color: CRIMSON }}>加载失败,请检查网络后重试。</RNText>
          </View>
        ) : isLoading ? (
          <ActivityIndicator color={SAFFRON} style={{ paddingVertical: 60 }} />
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <Flower2 size={30} color={INK3} />
            <RNText style={{ fontSize: 14, color: INK3, marginTop: 10 }}>这里还没有通知</RNText>
          </View>
        ) : (
          GROUP_ORDER.map((g) => {
            const items = filtered.filter((n) => n.group === g);
            if (items.length === 0) return null;
            return (
              <View key={g} style={{ marginTop: 6 }}>
                <RNText style={styles.groupLabel}>{GROUP_LABEL[g]}</RNText>
                <View style={{ gap: 8 }}>
                  {items.map((n) => {
                    const unread = isUnread(n);
                    return (
                      <Pressable key={n.id} style={[styles.card, unread && styles.cardUnread]} onPress={() => onTap(n)}>
                        <CatIcon cat={n.category} />
                        <View style={{ flex: 1 }}>
                          <View className="flex-row items-center" style={{ gap: 6 }}>
                            {unread ? <View style={styles.dot} /> : null}
                            <Text className="font-serif" style={{ flex: 1, fontSize: 15, fontWeight: '700', color: INK }}>{n.title}</Text>
                          </View>
                          <RNText style={{ fontSize: 13, color: INK2, lineHeight: 20, marginTop: 3 }}>{n.body}</RNText>
                          <RNText style={{ fontSize: 11, color: INK3, marginTop: 6 }}>{n.time}</RNText>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })
        )}

        <RNText style={{ fontSize: 11, color: INK3, lineHeight: 18, marginTop: 18, textAlign: 'center' }}>
          这里汇总学修提醒、班级公告与法会活动通知。
        </RNText>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8 },
  chipBar: { flexGrow: 0, flexShrink: 0 },          // 包一层不撑高
  chipScroll: { flexGrow: 0, flexShrink: 0 },        // RNW 横向 ScrollView 默认 flex-grow:1 会纵向撑满 → 关掉
  chipRow: { paddingHorizontal: 16, paddingBottom: 10, gap: 8, alignItems: 'center' },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 9999, backgroundColor: 'rgba(43,34,24,0.05)' },
  chipOn: { backgroundColor: SAFFRON },
  groupLabel: { fontSize: 12, fontWeight: '700', color: INK3, letterSpacing: 1, marginBottom: 8, marginTop: 6 },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(43,34,24,0.06)', borderLeftWidth: 3, borderLeftColor: 'transparent' },
  cardUnread: { backgroundColor: '#FFF7F1', borderLeftColor: SAFFRON },
  iconCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(224,120,86,0.10)', alignItems: 'center', justifyContent: 'center' },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: SAFFRON },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
});
