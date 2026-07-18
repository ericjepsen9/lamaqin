import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { testIds } from '@/lib/testids';
import { BORDER, INK, INK3, SAFFRON } from '@/lib/theme';

// 轻量时间选择(时0-23 + 分0/5/…/55 两列网格,配 month-calendar.tsx::DatePickerModal 同款卡片外壳,
// 2026-07-18 后台日期/时间录入体验审计改造新增)。分钟步进定死5分钟——覆盖现有全部共修/讲考/提醒
// 时间字段的实际粒度(19:30/20:00/09:00等),免60格分钟网格过密;两格网格都全量平铺、不滚动,
// 免在 Modal 里再嵌套 ScrollView。
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
const pad2 = (n: number) => String(n).padStart(2, '0');

function TimeGrid({ label, options, selected, onPick, testId }: {
  label: string;
  options: number[];
  selected: number | null;
  onPick: (n: number) => void;
  testId: (n: number) => string;
}) {
  return (
    <View style={styles.col}>
      <Text style={styles.colLabel}>{label}</Text>
      <View style={styles.grid}>
        {options.map((n) => {
          const on = selected === n;
          return (
            <Pressable key={n} testID={testId(n)} style={[styles.cell, on && styles.cellSel]} onPress={() => onPick(n)}>
              <Text style={{ fontSize: 14, fontWeight: on ? '700' : '500', color: on ? '#fff' : INK }}>{pad2(n)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// 弹窗版时间选择(配 DatePickerModal 同一套 UX 语言)。时/分各自独立网格,两项都选定才能「确定」;
// allowClear=真(默认)时给「不设置」选项——本仓现有时间字段多数支持留空表示「未定/全天」,
// 与 DatePickerModal 不同(日期字段目前没有"留空"这个合法业务状态)。
// scopeId(2026-07-18·同 DatePickerModal 修复):同屏两个时间字段(如共修起止时间)各自的
// TimePickerModal 会同时挂载在 DOM 里(RN Modal web 端不摘除),不传 scopeId 时时/分格 testID
// 全局唯一会撞 Playwright 严格模式。
export function TimePickerModal({ visible, value, onPick, onClose, title, allowClear = true, scopeId }: {
  visible: boolean;
  value: string; // 'HH:mm' 或 ''
  onPick: (v: string) => void;
  onClose: () => void;
  title?: string;
  allowClear?: boolean;
  scopeId?: string;
}) {
  const parsed = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  const initial = parsed ? { h: Number(parsed[1]), m: Number(parsed[2]) } : null;
  const [draft, setDraft] = useState<{ h: number; m: number } | null>(initial);
  // 每次打开重新取当前值(渲染期比对visible,同 classes/[id].tsx::SessionsModal 先例,不用 useEffect)
  const [prevVisible, setPrevVisible] = useState(visible);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) setDraft(initial);
  }

  const confirm = () => {
    if (!draft) return;
    onPick(`${pad2(draft.h)}:${pad2(draft.m)}`);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text className="font-serif" style={styles.title}>{title ?? '选择时间'}</Text>
          <View style={styles.row}>
            <TimeGrid label="时" options={HOURS} selected={draft?.h ?? null} onPick={(h) => setDraft({ h, m: draft?.m ?? 0 })} testId={(h) => testIds.timePicker.hourCell(h, scopeId)} />
            <TimeGrid label="分" options={MINUTES} selected={draft?.m ?? null} onPick={(m) => setDraft({ h: draft?.h ?? 0, m })} testId={(m) => testIds.timePicker.minuteCell(m, scopeId)} />
          </View>
          <View style={styles.actions}>
            {allowClear ? (
              <Pressable style={styles.actionBtn} onPress={() => { onPick(''); onClose(); }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: INK3 }}>不设置</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.actionBtn} onPress={onClose}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: INK3 }}>取消</Text>
            </Pressable>
            <Pressable
              testID={testIds.timePicker.confirmButton(scopeId)}
              style={[styles.actionBtn, styles.confirmBtn, !draft && styles.confirmBtnDisabled]}
              disabled={!draft}
              onPress={confirm}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>确定</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const CELL = 32;
const GRID_GAP = 6;
const COL_W = 4 * CELL + 3 * GRID_GAP;

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 360, backgroundColor: '#FBF4E9', borderRadius: 18, padding: 16 },
  title: { fontSize: 16, fontWeight: '700', color: INK, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 14, justifyContent: 'center' },
  col: { width: COL_W, alignItems: 'center' },
  colLabel: { fontSize: 11, color: INK3, fontWeight: '600', marginBottom: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP, width: COL_W },
  cell: { width: CELL, height: CELL, borderRadius: 9999, alignItems: 'center', justifyContent: 'center' },
  cellSel: { backgroundColor: SAFFRON },
  actions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  actionBtn: { flex: 1, paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderColor: BORDER, alignItems: 'center' },
  confirmBtn: { backgroundColor: SAFFRON, borderColor: SAFFRON },
  confirmBtnDisabled: { opacity: 0.4 },
});
