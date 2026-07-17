import { Delete } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { testIds } from '@/lib/testids';

// 一次性提交凭证生成(弱网幂等·2026-07-12):不用额外依赖,Date.now()+Math.random() 的组合
// 熵足够避免同用户/跨用户碰撞,仅作为去重键、非安全敏感值。
function genToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

// 快速计数底部弹层(决策165/166/167)。选修法 → 自定数字键盘填数 → 记录(大数软提示)→ 已记入(可撤销)。
// 复用:首页「快速计数」卡 + 修持页每条愿的「计数」。本组件只负责选修法+填数,经 onRecord 回调交父组件写库(practice_logs·recordLog.mutate)。
const INK = '#2b2218';
const INK2 = '#55463a';
const INK3 = '#7e6d5b';
const SAFFRON = '#e07856';
const SAFFRON_DARK = '#b35535';
const SAGE = '#6f9a86';

export function QuickCountSheet({ visible, items, initialVow = 0, topVows = 2, onRecord, onUndo, onClose }: {
  visible: boolean;
  items: { id: string; name: string }[];
  initialVow?: number;
  topVows?: number;
  // 返回 Promise 时:等待写库成功才显示「已记入」,失败保留输入供重试(父组件负责 notify 报错)——
  // 审计 2026-07-09:原实现发完请求立即显示 ✓,DB 拒绝(如内加行过期锁定)时是假成功。
  // 第三参 clientToken(弱网幂等·2026-07-12):同一笔待提交值(vowId+数量不变)的重复尝试复用
  // 同一凭证,父组件传给 recordLog.mutateAsync 的 clientToken 字段,配合 DB 唯一索引防重复计数。
  onRecord?: (vowId: string, count: number, clientToken: string) => Promise<string | void> | void;
  // 传入则「撤销这一笔」真删刚记的 log(父组件接 useUndoPracticeLog);不传则不显示撤销入口(不做假按钮)。
  onUndo?: (logId: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [n, setN] = useState(0);
  const [vow, setVow] = useState(initialVow);
  const [vowsOpen, setVowsOpen] = useState(false);
  const [confirmBig, setConfirmBig] = useState(false);
  const [saved, setSaved] = useState<number | null>(null);
  const [savedLogId, setSavedLogId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 待提交凭证(弱网幂等):同一(vowId,数量)组合的重复提交尝试复用同一 token;
  // 提交成功或数量/修法改变时清空,下次是"新的一笔"故换新 token(不会被误判成同一笔而丢数据)。
  const tokenRef = useRef<{ key: string; token: string } | null>(null);
  const getToken = (vowId: string, count: number): string => {
    const key = `${vowId}:${count}`;
    if (tokenRef.current?.key !== key) tokenRef.current = { key, token: genToken() };
    return tokenRef.current.token;
  };

  // 打开 / 切换初始修法时重置——渲染期间比对上一次的visible/initialVow
  // (react-hooks/set-state-in-effect·2026-07-17 lint债清理)。不再显式清tokenRef.current
  // (原意防止reopen复用旧凭证的边角情况):n此时已经重置回0,recordButton在n===0时disabled,
  // 这个边角情况实际不可达。
  const [prevVisible, setPrevVisible] = useState(visible);
  const [prevInitialVow, setPrevInitialVow] = useState(initialVow);
  if (visible !== prevVisible || initialVow !== prevInitialVow) {
    setPrevVisible(visible);
    setPrevInitialVow(initialVow);
    if (visible) { setN(0); setVow(initialVow); setVowsOpen(false); setConfirmBig(false); setSaved(null); setSavedLogId(null); setBusy(false); }
  }

  const pressDigit = (d: number) => setN((x) => Math.min(x * 10 + d, 9999999));
  const doRecord = async () => {
    const it = items[vow];
    if (!it || busy) return;
    setBusy(true);
    try {
      const logId = await onRecord?.(it.id, n, getToken(it.id, n));
      tokenRef.current = null; // 成功了,下一笔换新凭证
      setSavedLogId(typeof logId === 'string' ? logId : null);
      setSaved(n); setN(0); setConfirmBig(false);
    } catch {
      // 写库被拒(如限时功课已过期):父组件已弹 notify;保留已输入的数供师兄看清后重试/放弃;
      // token 不清空——如果师兄不改数直接再点「记录」,算同一笔重试,不会被计成两笔。
      setConfirmBig(false);
    } finally { setBusy(false); }
  };
  const tryRecord = () => { if (n <= 0 || busy) return; if (n > 10000) setConfirmBig(true); else void doRecord(); };

  return (
    // animationType 分平台(2026-07-17 PM 反馈"没有展开动画"·折中方案):
    //   问题只存在于 web——react-native-web 的 Modal 在 slide/fade 动画期间,aria-modal="true"
    //   立即挂上,但 role="dialog" 要等 CSS 动画的 animationend 事件触发 onShow 后才补上
    //   (react-native-web/dist/exports/Modal/ModalAnimation.js:ANIMATION_DURATION=250ms)——这
    //   ~250ms 窗口内是"aria-modal却无role=dialog"的无效ARIA组合,axe-core判定critical(A7
    //   无障碍扫描2026-07-14发现)。原生 iOS/Android 的 Modal 不走这套 web DOM/ARIA 机制,
    //   VoiceOver/TalkBack 没有这个特定时序问题,不需要跟着 web 一起去掉动画。
    <Modal aria-label="快速计数" visible={visible} transparent animationType={Platform.OS === 'web' ? 'none' : 'slide'} onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} onPress={() => {}}>
          <View style={styles.handle} />
          <Text className="font-serif" style={{ fontSize: 18, fontWeight: '700', color: INK }}>快速计数</Text>

          {/* 修法选择:优先展示最常计数的,其余「更多」折叠 */}
          <View style={styles.vowRow}>
            {items.map((it, i) => {
              if (!vowsOpen && i >= topVows && i !== vow) return null;
              return (
                <Pressable key={it.id} testID={testIds.quickCount.vowChip(it.id)} style={[styles.vowChip, vow === i && styles.vowChipOn]} onPress={() => setVow(i)}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: vow === i ? '#fff' : INK2 }}>{it.name}</Text>
                </Pressable>
              );
            })}
            {items.length > topVows ? (
              <Pressable style={styles.vowMore} onPress={() => setVowsOpen((o) => !o)}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: INK3 }}>{vowsOpen ? '收起 ▴' : '更多 ▾'}</Text>
              </Pressable>
            ) : null}
          </View>

          {saved != null ? (
            <>
              <View testID={testIds.quickCount.savedMark} style={styles.savedCircle}><Text style={{ color: '#fff', fontWeight: '700', fontSize: 28 }}>✓</Text></View>
              <Text className="font-serif" style={{ fontSize: 17, fontWeight: '700', color: INK, textAlign: 'center', marginTop: 12 }}>已记入 · {items[vow]?.name ?? ''}</Text>
              <Text style={{ fontSize: 13, color: INK3, textAlign: 'center', marginTop: 4 }}>+{saved.toLocaleString()} · 已记入今日功课</Text>
              <View className="flex-row items-center" style={{ gap: 10, marginTop: 18, alignSelf: 'stretch' }}>
                <Pressable style={styles.clearBtn} onPress={() => setSaved(null)}><Text style={{ color: INK2, fontWeight: '700' }}>再记一笔</Text></Pressable>
                <Pressable style={styles.commitBtn} onPress={onClose}><Text style={{ color: '#fff', fontWeight: '700' }}>完成</Text></Pressable>
              </View>
              {onUndo && savedLogId ? (
                <Pressable
                  disabled={busy}
                  onPress={async () => {
                    if (busy) return;
                    setBusy(true);
                    try { await onUndo(savedLogId); setSaved(null); setSavedLogId(null); setN(0); }
                    catch { /* 撤销失败父组件已 notify;保持已记入态,师兄可去计数历史处理 */ }
                    finally { setBusy(false); }
                  }}
                  style={{ paddingVertical: 8 }}
                  hitSlop={6}
                >
                  <Text style={{ fontSize: 12, color: INK3 }}>{busy ? '撤销中…' : '记错了?撤销这一笔'}</Text>
                </Pressable>
              ) : null}
            </>
          ) : confirmBig ? (
            <>
              <Text className="font-serif" style={{ marginTop: 16, fontSize: 36, fontWeight: '700', color: SAFFRON_DARK, textAlign: 'center' }}>{n.toLocaleString()}</Text>
              <Text style={{ fontSize: 13, color: INK2, textAlign: 'center', marginTop: 8, lineHeight: 20 }}>本次数量较大,确认记入这一笔吗?{'\n'}(填错可在「计数历史」里改)</Text>
              <View className="flex-row items-center" style={{ gap: 10, marginTop: 18, alignSelf: 'stretch' }}>
                <Pressable style={styles.clearBtn} onPress={() => setConfirmBig(false)}><Text style={{ color: INK3, fontWeight: '600' }}>再改改</Text></Pressable>
                <Pressable style={[styles.commitBtn, busy && { opacity: 0.5 }]} disabled={busy} onPress={() => void doRecord()}><Text style={{ color: '#fff', fontWeight: '700' }}>{busy ? '记录中…' : '确认记入'}</Text></Pressable>
              </View>
            </>
          ) : (
            <>
              <View style={styles.display}><Text className="font-serif" style={styles.displayNum}>{n.toLocaleString()}</Text></View>
              <View className="flex-row items-center justify-center" style={{ gap: 6 }}>
                <Text style={{ fontSize: 12, color: INK3 }}>本次 · {items[vow]?.name ?? ''}</Text>
                {n > 0 ? <Pressable hitSlop={6} onPress={() => setN(0)}><Text style={{ fontSize: 12, color: SAFFRON_DARK, fontWeight: '700' }}>· 清空</Text></Pressable> : null}
              </View>
              {/* 自定数字键盘(防输入错·决策165) */}
              <View style={styles.keypad}>
                {[['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']].map((row) => (
                  <View key={row[0]} style={styles.kpRow}>
                    {row.map((k) => (
                      <Pressable key={k} testID={testIds.quickCount.digitKey(Number(k))} style={styles.key} onPress={() => pressDigit(Number(k))}><Text style={styles.keyTxt}>{k}</Text></Pressable>
                    ))}
                  </View>
                ))}
                <View style={styles.kpRow}>
                  <Pressable style={[styles.key, styles.keyAlt]} onPress={() => setN((x) => Math.min(x + 108, 9999999))}><Text style={styles.keyAltTxt}>+108</Text></Pressable>
                  <Pressable testID={testIds.quickCount.digitKey(0)} style={styles.key} onPress={() => pressDigit(0)}><Text style={styles.keyTxt}>0</Text></Pressable>
                  <Pressable style={[styles.key, styles.keyAlt]} onPress={() => setN((x) => Math.floor(x / 10))}><Delete size={22} color={INK2} /></Pressable>
                </View>
              </View>
              <Pressable testID={testIds.quickCount.recordButton} style={[styles.recordBtn, (n === 0 || busy) && { opacity: 0.4 }]} disabled={n === 0 || busy} onPress={tryRecord}><Text style={{ color: '#fff', fontWeight: '700' }}>{busy ? '记录中…' : `记录 · ${n.toLocaleString()}`}</Text></Pressable>
              <Text style={{ fontSize: 11, color: INK3, textAlign: 'center', marginTop: 8 }}>记错了?记完可「撤销」,计数历史也能改。</Text>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FBF4E9', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 10, alignItems: 'center' },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(43,34,24,0.18)', marginBottom: 12 },
  clearBtn: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(43,34,24,0.15)' },
  commitBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: SAFFRON, alignItems: 'center' },
  vowRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 10 },
  vowChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9999, backgroundColor: 'rgba(43,34,24,0.05)' },
  vowChipOn: { backgroundColor: SAFFRON },
  vowMore: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9999, borderWidth: 1, borderColor: 'rgba(43,34,24,0.14)' },
  savedCircle: { alignSelf: 'center', width: 64, height: 64, borderRadius: 32, backgroundColor: SAGE, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  display: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 6, marginTop: 14 },
  displayNum: { fontSize: 46, fontWeight: '700', color: INK, letterSpacing: 1 },
  keypad: { alignSelf: 'stretch', marginTop: 16, gap: 10 },
  kpRow: { flexDirection: 'row', gap: 10 },
  key: { flex: 1, height: 52, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)', alignItems: 'center', justifyContent: 'center' },
  keyTxt: { fontSize: 22, fontWeight: '600', color: INK },
  keyAlt: { backgroundColor: 'rgba(43,34,24,0.04)' },
  keyAltTxt: { fontSize: 16, fontWeight: '700', color: SAFFRON_DARK },
  recordBtn: { alignSelf: 'stretch', paddingVertical: 13, borderRadius: 12, backgroundColor: SAFFRON, alignItems: 'center', marginTop: 14 },
});
