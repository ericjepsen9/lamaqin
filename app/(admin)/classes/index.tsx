import { useRouter } from 'expo-router';
import { ChevronRight, Clock, MapPin, Plus, Users } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AdminButton, AdminModal, Badge, EmptyState, ModalActions, ModalField, ModalFootnote, SCREEN_BG, type BadgeTone } from '@/components/ui/admin-kit';
import { Text } from '@/components/ui/text';
import { useAdminCohorts, type AdminCohort } from '@/lib/queries/classes';
import { useAdminPrograms } from '@/lib/queries/scheduling';
import { useCreateCohort } from '@/lib/mutations/classes';
import { GOLD_SOFT, INK, INK2, INK3, INK4, SAFFRON, SAGE, SAGE_SOFT } from '@/lib/theme';
import { useAdminLayout } from '../_layout';
import { ClassDetailPanel } from './[id]';

const WIDE = 900;
const MASTER_W = 360;

type ClassStatus = AdminCohort['status'];
const STATUS_LABEL: Record<ClassStatus, string> = { active: '在读', graduated: '已结业' };
const STATUS_TONE: Record<ClassStatus, BadgeTone> = { active: 'sage', graduated: 'neutral' };

// 专业强调色按顺序分配（DB 无颜色字段）。
const PROGRAM_COLORS = [SAFFRON, SAGE, GOLD_SOFT, SAGE_SOFT];

function ClassCard({ cls, onPress, selected }: { cls: AdminCohort; onPress: () => void; selected?: boolean }) {
  return (
    <Pressable style={[styles.classCard, selected && styles.classCardSelected]} onPress={onPress}>
      <View style={styles.classCardTop}>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text className="font-serif" style={styles.className}>{cls.name}</Text>
            <Badge tone={STATUS_TONE[cls.status]}>{STATUS_LABEL[cls.status]}</Badge>
          </View>
          <Text style={styles.classCode}>{cls.code}</Text>
        </View>
        {!selected && <ChevronRight size={16} color={INK4} />}
      </View>
      {cls.status === 'active' && (
        <View style={styles.classMeta}>
          <View style={styles.metaItem}>
            <Users size={12} color={INK3} />
            <Text style={styles.metaText}>{cls.studentCount} 人</Text>
          </View>
          {cls.schedule ? (
            <View style={styles.metaItem}>
              <Clock size={12} color={INK3} />
              <Text style={styles.metaText}>{cls.schedule}</Text>
            </View>
          ) : null}
          {cls.timezone ? (
            <View style={styles.metaItem}>
              <MapPin size={12} color={INK3} />
              <Text style={styles.metaText}>{cls.timezone}</Text>
            </View>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

// 常用班级时区预设(IANA);其余走「其他」自填。共修/进度的「今天」按此算(CLAUDE.md §1)。
const TZ_PRESETS: { tz: string; label: string }[] = [
  { tz: 'Asia/Shanghai', label: '汉地·上海' },
  { tz: 'America/New_York', label: '美东·纽约' },
  { tz: 'America/Los_Angeles', label: '美西·洛杉矶' },
  { tz: 'Asia/Hong_Kong', label: '香港' },
];

// ── 新建班级弹窗(必填 专业/名称/编号/开班日期/时区;日程建班后再补)─────
function CreateCohortModal({ visible, onClose, onCreated }: {
  visible: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { data: programs = [] } = useAdminPrograms();
  const create = useCreateCohort();
  const [programId, setProgramId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [startDate, setStartDate] = useState('');
  const [tz, setTz] = useState('Asia/Shanghai');
  const [customTz, setCustomTz] = useState('');
  const [useCustomTz, setUseCustomTz] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 每次打开重置——渲染期间比对上一次的visible(react-hooks/set-state-in-effect·
  // 2026-07-17 lint债清理)
  const [prevVisible, setPrevVisible] = useState(visible);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) {
      setProgramId(null); setName(''); setCode(''); setStartDate('');
      setTz('Asia/Shanghai'); setCustomTz(''); setUseCustomTz(false); setErr(null);
    }
  }

  const effectiveTz = useCustomTz ? customTz.trim() : tz;
  const sd = startDate.trim();
  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(sd) && !Number.isNaN(new Date(sd + 'T00:00:00').getTime());
  const canSubmit = !!programId && name.trim().length > 0 && code.trim().length > 0 && dateValid && effectiveTz.length > 0 && !create.isPending;

  const submit = async () => {
    if (!canSubmit || !programId) return;
    setErr(null);
    try {
      const id = await create.mutateAsync({ programId, name, code, startDate: sd, timezone: effectiveTz });
      onCreated(id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '创建失败,请重试');
    }
  };

  return (
    <AdminModal visible={visible} onClose={onClose} title="新建班级" maxWidth={480} dismissOnOverlay={false}>
      {/* 专业(单选) */}
      <View style={{ gap: 6 }}>
        <Text style={mStyles.label}>专业 *</Text>
        <View style={mStyles.chipWrap}>
          {programs.map((p) => {
            const on = p.id === programId;
            return (
              <Pressable key={p.id} onPress={() => setProgramId(p.id)} style={[mStyles.chip, on && mStyles.chipOn]}>
                <Text style={[mStyles.chipText, on && mStyles.chipTextOn]}>{p.name}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ModalField label="班级名称 *" value={name} onChangeText={setName} placeholder="如:22 加行班" />
      <ModalField label="班级编号 *(全局唯一)" value={code} onChangeText={setCode} placeholder="如:jiaxing-22 / TST_JX_2026" />
      <ModalField label="开班日期 *" value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD,如 2026-03-01" />

      {/* 时区(预设 + 其他自填) */}
      <View style={{ gap: 6 }}>
        <Text style={mStyles.label}>班级时区 *</Text>
        <View style={mStyles.chipWrap}>
          {TZ_PRESETS.map((t) => {
            const on = !useCustomTz && t.tz === tz;
            return (
              <Pressable key={t.tz} onPress={() => { setUseCustomTz(false); setTz(t.tz); }} style={[mStyles.chip, on && mStyles.chipOn]}>
                <Text style={[mStyles.chipText, on && mStyles.chipTextOn]}>{t.label}</Text>
              </Pressable>
            );
          })}
          <Pressable onPress={() => setUseCustomTz(true)} style={[mStyles.chip, useCustomTz && mStyles.chipOn]}>
            <Text style={[mStyles.chipText, useCustomTz && mStyles.chipTextOn]}>其他</Text>
          </Pressable>
        </View>
        {useCustomTz ? (
          <TextInput value={customTz} onChangeText={setCustomTz} placeholder="IANA 名,如 Australia/Sydney" placeholderTextColor={INK4} autoCapitalize="none" style={mStyles.input} />
        ) : null}
        <Text style={mStyles.hint}>共修 / 进度的「今天」按此时区算{!useCustomTz ? `(当前 ${tz})` : ''}。</Text>
      </View>

      {err ? <Text style={mStyles.err}>{err}</Text> : null}

      <ModalActions>
        <AdminButton variant="negative" style={{ flex: 1 }} onPress={onClose}>取消</AdminButton>
        <AdminButton variant="primary" style={{ flex: 1 }} disabled={!canSubmit} onPress={submit}>
          {create.isPending ? '创建中…' : '创建'}
        </AdminButton>
      </ModalActions>
      <ModalFootnote>建班后可在班级详情里「调整日程」设共修时间、添加学员、设辅导员。</ModalFootnote>
    </AdminModal>
  );
}

const mStyles = StyleSheet.create({
  label: { fontSize: 13, color: INK2, fontWeight: '500' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9999, backgroundColor: 'rgba(43,34,24,0.05)' },
  chipOn: { backgroundColor: SAFFRON },
  chipText: { fontSize: 13, fontWeight: '600', color: INK2 },
  chipTextOn: { color: '#fff' },
  input: { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: INK, borderWidth: 1, borderColor: 'rgba(43,34,24,0.12)' },
  hint: { fontSize: 11, color: INK3, lineHeight: 16 },
  err: { fontSize: 13, color: '#a13c2e', fontWeight: '600' },
});

export default function ClassesScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE;
  const router = useRouter();
  const { setTitle } = useAdminLayout();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const { data: groups = [], isLoading, error } = useAdminCohorts();

  useEffect(() => { setTitle('班级管理'); }, [setTitle]);

  const stats = useMemo(() => {
    const all = groups.flatMap((g) => g.cohorts);
    const active = all.filter((c) => c.status === 'active');
    const totalStudents = active.reduce((acc, c) => acc + c.studentCount, 0);
    const coaches = new Set(all.map((c) => c.coachName).filter((n): n is string => !!n));
    return { total: all.length, active: active.length, totalStudents, coaches: coaches.size };
  }, [groups]);

  const statsCard = (
    <View style={styles.statsCard}>
      {[
        [stats.total, '总班级'],
        [stats.active, '在读班'],
        [stats.totalStudents, '在读人数'],
        [stats.coaches, '辅导员'],
      ].map(([num, label], i) => (
        <View key={label} style={[styles.statItem, i > 0 && styles.statItemBordered]}>
          <Text className="font-serif" style={styles.statNum}>{num}</Text>
          <Text style={styles.statLabel}>{label}</Text>
        </View>
      ))}
    </View>
  );

  // 班级列表(按专业分节,卡片)。onPress 由调用方决定:宽屏=选中, 窄屏=整页跳。
  const classList = (onPress: (id: string) => void, selectable: boolean) => (
    <>
      {groups.map((program, pIdx) => {
        const accent = PROGRAM_COLORS[pIdx % PROGRAM_COLORS.length];
        return (
          <View key={program.id} style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.programDot, { backgroundColor: accent }]} />
              <Text className="font-serif" style={styles.sectionTitle}>{program.name}</Text>
              <Text style={styles.sectionCount}>{program.cohorts.length} 个班</Text>
            </View>
            <View style={styles.classGroup}>
              {program.cohorts.map((cls, i) => (
                <View key={cls.id}>
                  {i > 0 && <View style={styles.divider} />}
                  <ClassCard cls={cls} onPress={() => onPress(cls.id)} selected={selectable && cls.id === selectedId} />
                </View>
              ))}
            </View>
          </View>
        );
      })}
    </>
  );

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color={SAFFRON} /></View>;
  }
  if (error) {
    return <View style={{ flex: 1, padding: 16, justifyContent: 'center' }}><EmptyState>加载失败，请稍后重试</EmptyState></View>;
  }

  // ── 宽屏:主从分栏(左班级列表 + 右班级详情同屏,不整页跳)──────────────
  if (isWide) {
    return (
      <SafeAreaView style={styles.root} edges={['bottom']}>
        <View style={styles.masterDetailLayout}>
          <View style={styles.masterPanel}>
            <View style={styles.actionBar}>
              <Text className="font-serif" style={styles.pageTitle}>班级管理</Text>
              <AdminButton variant="primary" size="sm" icon={<Plus size={15} color="#fff" />} onPress={() => setCreateOpen(true)}>新建</AdminButton>
            </View>
            <ScrollView contentContainerStyle={styles.masterScroll} showsVerticalScrollIndicator={false}>
              {statsCard}
              {groups.length === 0 ? <EmptyState>暂无班级</EmptyState> : classList(setSelectedId, true)}
            </ScrollView>
          </View>
          <View style={styles.detailPanelContainer}>
            {selectedId ? (
              <ClassDetailPanel key={selectedId} cohortId={selectedId} />
            ) : (
              <View style={styles.detailEmptyState}>
                <Text style={styles.detailEmptyText}>← 选择一个班级查看与管理</Text>
              </View>
            )}
          </View>
        </View>
        <CreateCohortModal visible={createOpen} onClose={() => setCreateOpen(false)} onCreated={(id) => { setCreateOpen(false); setSelectedId(id); }} />
      </SafeAreaView>
    );
  }

  // ── 移动端:整屏列表(点进详情页)────────────────────────────────────
  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <View style={styles.actionBar}>
        <Text className="font-serif" style={styles.pageTitle}>班级管理</Text>
        <AdminButton variant="primary" size="sm" icon={<Plus size={15} color="#fff" />} onPress={() => setCreateOpen(true)}>新建班级</AdminButton>
      </View>
      {statsCard}
      {groups.length === 0 ? (
        <View style={{ padding: 16 }}><EmptyState>暂无班级</EmptyState></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {classList((id) => router.push(`/(admin)/classes/${id}` as never), false)}
        </ScrollView>
      )}
      <CreateCohortModal visible={createOpen} onClose={() => setCreateOpen(false)} onCreated={(id) => { setCreateOpen(false); router.push(`/(admin)/classes/${id}` as never); }} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SCREEN_BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  actionBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  pageTitle: { fontSize: 20, fontWeight: '700', color: INK, letterSpacing: 1 },
  // 统计概览
  statsCard: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(43,34,24,0.07)', paddingVertical: 14, marginBottom: 4 },
  statItem: { flex: 1, alignItems: 'center', gap: 3 },
  statItemBordered: { borderLeftWidth: 1, borderLeftColor: 'rgba(43,34,24,0.08)' },
  statNum: { fontSize: 22, fontWeight: '700', color: INK },
  statLabel: { fontSize: 11, color: INK3 },
  // 专业分节
  section: { gap: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 2 },
  programDot: { width: 10, height: 10, borderRadius: 5 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: INK },
  sectionCount: { fontSize: 12, color: INK3, marginLeft: 2 },
  // 班级卡片组
  classGroup: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(43,34,24,0.07)', overflow: 'hidden', shadowColor: '#2b2218', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  classCard: { paddingHorizontal: 16, paddingVertical: 13, gap: 10 },
  classCardSelected: { backgroundColor: '#fdf2ec' },
  classCardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  className: { fontSize: 15, fontWeight: '600', color: INK },
  classCode: { fontSize: 11, color: INK4 },
  classMeta: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: INK3 },
  divider: { height: 1, backgroundColor: 'rgba(43,34,24,0.06)', marginHorizontal: 16 },
  // 宽屏主从
  masterDetailLayout: { flex: 1, flexDirection: 'row' },
  masterPanel: { width: MASTER_W, borderRightWidth: 1, borderRightColor: 'rgba(43,34,24,0.08)', backgroundColor: SCREEN_BG },
  masterScroll: { padding: 12, gap: 16, paddingBottom: 40 },
  detailPanelContainer: { flex: 1, backgroundColor: '#faf5ef' },
  detailEmptyState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  detailEmptyText: { fontSize: 14, color: INK4 },
});
