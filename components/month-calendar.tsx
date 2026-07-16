import { addDays, addMonths, format, isSameDay, isSameMonth, isToday, startOfMonth, startOfWeek } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text as RNText, View } from 'react-native';

import { Text } from '@/components/ui/text';

// 轻量月历(纯 RN + date-fns,无新依赖;web/iOS 一致)。日期选择:截止日(未来)/ 补录日(过去)复用。
//   minDate/maxDate 之外置灰不可选;选中=橙底白字;今天=橙色描边。按本地日期字符串比较,避免时分误差。
const INK = '#2b2218';
const INK3 = '#7e6d5b';
const SAFFRON = '#e07856';
const SAFFRON_DARK = '#b35535';
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const iso = (d: Date) => format(d, 'yyyy-MM-dd');

export function MonthCalendar({ value, onChange, minDate, maxDate }: {
  value: Date | null;
  onChange: (d: Date) => void;
  minDate?: Date;
  maxDate?: Date;
}) {
  const [visible, setVisible] = useState<Date>(startOfMonth(value ?? new Date()));
  const minIso = minDate ? iso(minDate) : null;
  const maxIso = maxDate ? iso(maxDate) : null;
  const gridStart = startOfWeek(startOfMonth(visible), { weekStartsOn: 0 });
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Pressable hitSlop={8} onPress={() => setVisible((m) => addMonths(m, -1))}><ChevronLeft size={20} color={INK} /></Pressable>
        <Text className="font-serif" style={{ fontSize: 15, fontWeight: '700', color: INK }}>{format(visible, 'yyyy 年 M 月')}</Text>
        <Pressable hitSlop={8} onPress={() => setVisible((m) => addMonths(m, 1))}><ChevronRight size={20} color={INK} /></Pressable>
      </View>
      <View style={styles.wkRow}>
        {WEEKDAYS.map((w) => <RNText key={w} style={styles.wk}>{w}</RNText>)}
      </View>
      <View style={styles.grid}>
        {days.map((day) => {
          const dIso = iso(day);
          const inMonth = isSameMonth(day, visible);
          const disabled = (minIso != null && dIso < minIso) || (maxIso != null && dIso > maxIso);
          const selected = value != null && isSameDay(day, value);
          const today = isToday(day);
          return (
            <Pressable
              key={dIso}
              disabled={disabled}
              onPress={() => onChange(day)}
              style={[styles.cell, selected && styles.cellSel, !selected && today && styles.cellToday]}
            >
              <RNText style={{ fontSize: 14, fontWeight: selected ? '700' : '500', color: selected ? '#fff' : disabled ? 'rgba(133,115,96,0.35)' : inMonth ? INK : INK3 }}>
                {day.getDate()}
              </RNText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// 弹窗版日期选择(PM:选择日期用弹窗)。居中卡片 + 月历;选中即回调并关闭。
export function DatePickerModal({ visible, value, onPick, onClose, minDate, maxDate, title }: {
  visible: boolean;
  value: Date | null;
  onPick: (d: Date) => void;
  onClose: () => void;
  minDate?: Date;
  maxDate?: Date;
  title?: string;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.dpBackdrop} onPress={onClose}>
        <Pressable style={styles.dpCard} onPress={() => {}}>
          <Text className="font-serif" style={styles.dpTitle}>{title ?? '选择日期'}</Text>
          <MonthCalendar value={value} minDate={minDate} maxDate={maxDate} onChange={(d) => { onPick(d); onClose(); }} />
          <Pressable style={styles.dpCancel} onPress={onClose}><RNText style={{ fontSize: 14, fontWeight: '700', color: INK3 }}>取消</RNText></Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 10, borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)', marginTop: 8 },
  dpBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  dpCard: { width: '100%', maxWidth: 360, backgroundColor: '#FBF4E9', borderRadius: 18, padding: 16 },
  dpTitle: { fontSize: 16, fontWeight: '700', color: '#2b2218', marginBottom: 2 },
  dpCancel: { marginTop: 12, paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(43,34,24,0.15)', alignItems: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6, paddingVertical: 4 },
  wkRow: { flexDirection: 'row', marginTop: 6 },
  wk: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 11, color: INK3, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 2 },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 9999 },
  cellSel: { backgroundColor: SAFFRON },
  cellToday: { borderWidth: 1, borderColor: SAFFRON_DARK },
});
