import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AdminButton,
  AdminModal,
  Badge,
  EmptyState,
  ErrorState,
  ModalActions,
  ModalField,
  SCREEN_BG,
} from '@/components/ui/admin-kit';
import { Text } from '@/components/ui/text';
import { useCreateReminderPreset, useToggleReminderPresetActive, useUpdateReminderPreset } from '@/lib/mutations/reminder-presets';
import { useReminderPresets, type ReminderPreset } from '@/lib/queries/reminder-presets';
import { testIds } from '@/lib/testids';
import { INK, INK2, INK3, INK4, SAFFRON } from '@/lib/theme';
import { genClientToken } from '@/lib/utils';
import { useAdminLayout } from '../_layout';

// 提醒语预设库(决策130/102/188)独立路由——非 practice-config 下的 tab(2026-07-09 PM 二次订正口径)。
// 投递方式(A/B)由决策188另定,本页只管预设文案库的 CRUD。

// ── 新建/编辑弹窗 ──────────────────────────────────────────────────────
function PresetFormModal({ visible, preset, nextOrder, onClose }: {
  visible: boolean; preset: ReminderPreset | null; nextOrder: number; onClose: () => void;
}) {
  const create = useCreateReminderPreset();
  const update = useUpdateReminderPreset();
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState('');
  const [orderStr, setOrderStr] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [token, setToken] = useState(() => genClientToken());
  const isEdit = !!preset;

  // 渲染期间比对上一次的visible/preset/nextOrder(react-hooks/set-state-in-effect·
  // 2026-07-17 lint债清理),逐项对应原依赖数组。
  const [prevVisible, setPrevVisible] = useState(visible);
  const [prevPreset, setPrevPreset] = useState(preset);
  const [prevNextOrder, setPrevNextOrder] = useState(nextOrder);
  if (visible !== prevVisible || preset !== prevPreset || nextOrder !== prevNextOrder) {
    setPrevVisible(visible);
    setPrevPreset(preset);
    setPrevNextOrder(nextOrder);
    if (visible) {
      setLabel(preset?.label ?? '');
      setCategory(preset?.category ?? '');
      setOrderStr(String(preset?.displayOrder ?? nextOrder));
      setErr(null);
      setToken(genClientToken());
    }
  }

  const pending = create.isPending || update.isPending;
  const canSubmit = label.trim().length > 0 && !pending;

  const submit = async () => {
    if (!canSubmit) return;
    setErr(null);
    const displayOrder = Math.max(0, parseInt(orderStr, 10) || 0);
    try {
      if (isEdit) {
        await update.mutateAsync({ id: preset.id, label, category: category || null, displayOrder });
      } else {
        await create.mutateAsync({ label, category: category || null, displayOrder, clientToken: token });
      }
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '保存失败');
    }
  };

  return (
    <AdminModal visible={visible} onClose={onClose} title={isEdit ? '编辑提醒语' : '新建提醒语'} dismissOnOverlay={false}>
      <ModalField testID={testIds.reminderPresets.labelInput} label="文案 *" value={label} onChangeText={setLabel} placeholder="如:今天的功课别忘了哦~" multiline />
      <ModalField label="分类(可选)" value={category} onChangeText={setCategory} placeholder="如:早课 / 晚课 / 通用" />
      <ModalField label="排序(数字越小越靠前)" value={orderStr} onChangeText={setOrderStr} placeholder="0" keyboardType="numeric" />
      {err ? <Text style={styles.errText}>{err}</Text> : null}
      <ModalActions>
        <AdminButton variant="negative" style={{ flex: 1 }} onPress={onClose}>取消</AdminButton>
        <AdminButton testID={testIds.reminderPresets.submitButton} variant="primary" style={{ flex: 1 }} disabled={!canSubmit} onPress={submit}>{pending ? '保存中…' : '保存'}</AdminButton>
      </ModalActions>
    </AdminModal>
  );
}

function PresetRow({ preset, onEdit }: { preset: ReminderPreset; onEdit: () => void }) {
  const toggle = useToggleReminderPresetActive();
  return (
    <View style={[styles.row, !preset.isActive && styles.rowInactive]}>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={styles.rowTop}>
          <Text style={styles.rowLabel}>{preset.label}</Text>
          {preset.category ? <Badge tone="sage">{preset.category}</Badge> : null}
          {!preset.isActive ? <Badge tone="neutral">已停用</Badge> : null}
        </View>
        <Text style={styles.rowMeta}>排序 {preset.displayOrder}{preset.createdByName ? ` · 创建:${preset.createdByName}` : ''}</Text>
      </View>
      <View style={styles.rowActions}>
        <AdminButton variant="secondary" size="sm" onPress={onEdit}>编辑</AdminButton>
        <AdminButton
          variant={preset.isActive ? 'negative' : 'confirm'}
          size="sm"
          disabled={toggle.isPending}
          onPress={() => toggle.mutate({ id: preset.id, isActive: !preset.isActive })}
        >
          {preset.isActive ? '停用' : '启用'}
        </AdminButton>
      </View>
    </View>
  );
}

export default function ReminderPresetsPage() {
  const { setTitle } = useAdminLayout();
  const { data: presets = [], isLoading, error } = useReminderPresets();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ReminderPreset | null>(null);

  useEffect(() => { setTitle('提醒语预设库'); }, [setTitle]);

  const nextOrder = presets.length ? Math.max(...presets.map((p) => p.displayOrder)) + 10 : 0;

  const openCreate = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (p: ReminderPreset) => { setEditing(p); setFormOpen(true); };

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.sectionHeader}>
          <Text className="font-serif" style={styles.sectionTitle}>提醒语预设库</Text>
          <AdminButton testID={testIds.reminderPresets.newButton} variant="primary" size="sm" onPress={openCreate}>＋ 新建提醒语</AdminButton>
        </View>
        <Text style={styles.hint}>供师兄在「学习提醒」里选用的文案库(决策130/102);投递方式(推送 A/B)另按决策188接线,此处只管文案本身。</Text>

        {error ? <ErrorState /> : isLoading ? (
          <View style={styles.loadingBox}><ActivityIndicator color={SAFFRON} /></View>
        ) : presets.length === 0 ? (
          <EmptyState>暂无预设,点「新建提醒语」添加。</EmptyState>
        ) : (
          presets.map((p) => <PresetRow key={p.id} preset={p} onEdit={() => openEdit(p)} />)
        )}
      </ScrollView>
      <PresetFormModal visible={formOpen} preset={editing} nextOrder={nextOrder} onClose={() => setFormOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SCREEN_BG },
  scroll: { padding: 20, gap: 12, paddingBottom: 40 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: INK },
  hint: { fontSize: 12, color: INK3, lineHeight: 18, marginTop: -6 },
  loadingBox: { paddingVertical: 30, alignItems: 'center' },
  errText: { fontSize: 12, color: '#a13c2e', fontWeight: '600' },
  row: { backgroundColor: '#fff', borderRadius: 14, padding: 16, gap: 10, borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)', flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  rowInactive: { opacity: 0.6 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  rowLabel: { fontSize: 14, fontWeight: '600', color: INK2, flexShrink: 1 },
  rowMeta: { fontSize: 11, color: INK4 },
  rowActions: { flexDirection: 'row', gap: 8 },
});
