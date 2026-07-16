import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text as RNText, View } from 'react-native';

import { Text } from '@/components/ui/text';
import type { CoreviewNode } from '@/lib/queries/coreview';

// 共修 / 法会 时间轴节点渲染(细竖线 + 圆点 + 左侧日期 + 卡片;法会=实心钮、共修=描边钮·PM 批准版)。
const INK = '#2b2218';
const INK2 = '#55463a';
const INK3 = '#7e6d5b';
const SAFFRON = '#e07856';
const SAFFRON_DARK = '#b35535';
const SAGE = '#6f9a86';

const monthLabel = (d: string) => `${Number(d.split('-')[1])}月`;
const dayLabel = (d: string) => String(Number(d.split('-')[2])).padStart(2, '0');
const fmtWan = (n: number) => (n >= 10000 ? `${(n / 10000).toFixed(n >= 1000000 ? 0 : 1)} 万` : n.toLocaleString());

export function CoreviewList({ nodes, showMonths }: { nodes: CoreviewNode[]; showMonths?: boolean }) {
  const router = useRouter();
  let lastMonth = '';
  return (
    <View>
      {nodes.map((n, i) => {
        const ym = n.date.slice(0, 7);
        const monthHeader = showMonths && ym !== lastMonth;
        if (monthHeader) lastMonth = ym;
        return (
          <View key={n.key}>
            {monthHeader ? <RNText style={styles.monthHead}>{`${Number(n.date.slice(0, 4))} 年 ${Number(n.date.slice(5, 7))} 月`}</RNText> : null}
            <NodeRow
              node={n}
              first={i === 0}
              last={i === nodes.length - 1}
              onPress={() => {
                if (n.kind === 'event' && n.eventId) router.push(`/event/${n.eventId}`);
                else if (n.kind === 'coreview' && n.sessionId) router.push(`/session/${n.sessionId}`);
              }}
            />
          </View>
        );
      })}
    </View>
  );
}

function NodeRow({ node, first, last, onPress }: { node: CoreviewNode; first: boolean; last: boolean; onPress: () => void }) {
  const past = node.status === 'past';
  const isEvent = node.kind === 'event';
  const isWindow = isEvent && node.dateRange != null; // 无场次的法会=窗口节点(胖:带回向数据+发愿按钮);有场次则每场=轻节点
  const lineStyle = first ? { top: 22, bottom: 0 } : last ? { top: 0, height: 24 } : { top: 0, bottom: 0 };
  return (
    <View style={styles.node}>
      <View style={styles.dateCol}>
        <RNText style={styles.dMonth}>{monthLabel(node.date)}</RNText>
        <Text className="font-serif" style={[styles.dDay, past && { color: INK2 }]}>{dayLabel(node.date)}</Text>
        {node.time ? <RNText style={styles.dTime}>{node.time}</RNText> : null}
      </View>
      <View style={styles.railCol}>
        {!(first && last) ? <View style={[styles.railLine, lineStyle]} /> : null}
        <View style={[styles.dot, past ? styles.dotPast : styles.dotLive]} />
      </View>
      <Pressable style={[styles.card, past && styles.cardPast]} onPress={onPress}>
        <View style={styles.badges}>
          {node.status === 'live' && isEvent ? <Tag bg={SAGE} fg="#fff">进行中</Tag> : null}
          <Tag bg={isEvent ? 'rgba(224,120,86,0.13)' : 'rgba(111,154,134,0.16)'} fg={isEvent ? SAFFRON_DARK : SAGE}>
            {node.badge}{node.sessionTag ? ` · ${node.sessionTag}` : ''}
          </Tag>
          {node.status === 'upcoming' && node.kind === 'coreview' ? <Tag bg="rgba(43,34,24,0.07)" fg={INK3}>即将</Tag> : null}
        </View>

        <Text className="font-serif" style={[styles.title, past && { color: INK2 }]}>{node.title}</Text>
        {node.sub ? <RNText style={styles.sub}>{node.sub}</RNText> : null}

        {/* 法会「窗口节点」(无场次):回向数据 + 发愿按钮(只此一个胖节点,不在每场重复) */}
        {isWindow && !past ? (
          <>
            <View style={styles.stats}>
              <Stat v={(node.myCount ?? 0).toLocaleString()} k="我已念(遍)" />
              <Stat v={fmtWan(node.platformTotal ?? 0)} k="全平台共修(遍)" accent />
            </View>
            <View style={styles.btnFull}><RNText style={styles.btnFullTxt}>去发愿 / 回向 →</RNText></View>
          </>
        ) : null}
        {isWindow && past ? (
          <RNText style={styles.doneMuted}>已圆满{node.myCount ? ` · 我念 ${node.myCount.toLocaleString()} 遍` : ''}{node.platformTotal ? ` · 全平台 ${fmtWan(node.platformTotal)}` : ''}</RNText>
        ) : null}

        {/* 法会「场次节点」:轻节点(点卡进详情发愿/回向);此处不重复回向数据 */}
        {isEvent && !isWindow ? (
          <RNText style={styles.tapHint}>点开发愿 / 回向 ›</RNText>
        ) : null}

        {/* 共修即将:进入按钮 */}
        {node.kind === 'coreview' && !past ? (
          <View style={styles.btnPill}><RNText style={styles.btnPillTxt}>进入共修 →</RNText></View>
        ) : null}

        {/* 往期共修:出勤态 */}
        {node.kind === 'coreview' && past ? (
          node.attended === 'present' ? <RNText style={styles.done}>已出席 ✓</RNText>
            : node.attended === 'absent' ? <RNText style={styles.miss}>未出席</RNText>
              : null
        ) : null}
      </Pressable>
    </View>
  );
}

function Tag({ children, bg, fg }: { children: React.ReactNode; bg: string; fg: string }) {
  return <View style={[styles.tag, { backgroundColor: bg }]}><RNText style={{ fontSize: 10, fontWeight: '700', color: fg }}>{children}</RNText></View>;
}
function Stat({ v, k, accent }: { v: string; k: string; accent?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text className="font-serif" style={[styles.statV, accent && { color: SAFFRON_DARK }]}>{v}</Text>
      <RNText style={styles.statK}>{k}</RNText>
    </View>
  );
}

const styles = StyleSheet.create({
  monthHead: { fontSize: 13, fontWeight: '700', color: INK2, paddingLeft: 56, paddingTop: 10, paddingBottom: 2 },
  node: { flexDirection: 'row', gap: 6 },
  dateCol: { width: 36, flexShrink: 0, paddingTop: 14, alignItems: 'center' },
  dMonth: { fontSize: 11, color: INK3, fontWeight: '600' },
  dDay: { fontSize: 17, fontWeight: '700', color: INK, lineHeight: 20 },
  dTime: { fontSize: 10, color: INK3, marginTop: 1 },
  railCol: { width: 16, flexShrink: 0, position: 'relative' },
  railLine: { position: 'absolute', left: 7, width: 2, backgroundColor: 'rgba(43,34,24,0.12)' },
  dot: { position: 'absolute', left: 1, top: 18, width: 14, height: 14, borderRadius: 7, borderWidth: 3 },
  dotLive: { backgroundColor: SAFFRON, borderColor: SAFFRON },
  dotPast: { backgroundColor: '#fff', borderColor: '#c9bda8' },
  card: { flex: 1, minWidth: 0, backgroundColor: '#fff', borderRadius: 16, padding: 14, marginVertical: 6, borderWidth: 1, borderColor: 'rgba(43,34,24,0.07)' },
  cardPast: { backgroundColor: 'rgba(255,255,255,0.55)' },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' },
  tag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  title: { fontSize: 15.5, fontWeight: '700', color: INK },
  sub: { fontSize: 12, color: INK3, marginTop: 4, lineHeight: 18 },
  stats: { flexDirection: 'row', gap: 10, marginTop: 10 },
  stat: { flex: 1, alignItems: 'center', backgroundColor: 'rgba(43,34,24,0.03)', borderRadius: 10, paddingVertical: 9 },
  statV: { fontSize: 17, fontWeight: '700', color: INK },
  statK: { fontSize: 10, color: INK3, marginTop: 1 },
  btnFull: { marginTop: 10, paddingVertical: 11, borderRadius: 12, backgroundColor: SAFFRON, alignItems: 'center' },
  btnFullTxt: { color: '#fff', fontWeight: '700', fontSize: 13.5 },
  btnPill: { alignSelf: 'flex-start', marginTop: 11, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 9999, borderWidth: 1.5, borderColor: SAFFRON, backgroundColor: 'rgba(224,120,86,0.06)' },
  btnPillTxt: { color: SAFFRON_DARK, fontWeight: '700', fontSize: 13 },
  tapHint: { marginTop: 8, fontSize: 12, color: SAFFRON_DARK, fontWeight: '700' },
  done: { marginTop: 8, fontSize: 12.5, color: SAGE, fontWeight: '700' },
  miss: { marginTop: 8, fontSize: 12.5, color: INK3, fontWeight: '600' },
  doneMuted: { marginTop: 8, fontSize: 12, color: INK3, fontWeight: '600' },
});
