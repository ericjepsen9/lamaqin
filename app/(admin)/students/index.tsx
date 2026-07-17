import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AdminButton,
  AdminModal,
  Avatar,
  Badge,
  Card,
  Divider,
  EmptyState,
  FilterChips,
  ModalActions,
  ModalField,
  ModalFootnote,
  SCREEN_BG,
  SearchBar,
  SectionCard,
  type BadgeTone,
} from '@/components/ui/admin-kit';
import { StudentAdminActions } from '@/components/admin/student-actions';
import { StudentCareDims, StudentCareFollowups } from '@/components/admin/student-care-panel';
import { Text } from '@/components/ui/text';
import { confirmAsync, notify } from '@/lib/dialog';
import { useGrantSelfStudy, useRevokeSelfStudy } from '@/lib/mutations/self-study';
import { useAdminCreateStudent, useAdminStudentDetail, useAdminStudents } from '@/lib/queries/admin/students';
import { useCurrentUser } from '@/lib/queries/profile';
import { useStudentSelfStudyGrant } from '@/lib/queries/self-study-progress';
import { testIds } from '@/lib/testids';
import { GOLD_SOFT, INK, INK2, INK3, INK4, SAFFRON, SAFFRON_DARK, SAGE } from '@/lib/theme';
import { useAdminLayout } from '../_layout';

const WIDE = 900;
const MASTER_W = 360;

type StudentStatus = 'active' | 'pending' | 'suspended' | 'inactive' | 'rejected' | 'graduated';
type MemberRole = 'auditor' | 'formal';
type FilterTab = 'pending' | 'active' | 'all';

type Student = {
  id: string;
  name: string;
  dharmaName: string | null;
  cohort: string | null;
  memberRole: MemberRole | null;
  status: StudentStatus;
  snap: ('ok' | 'warn' | 'low')[];
};

const STATUS_LABEL: Record<StudentStatus, string> = { active: '在读', pending: '待审', suspended: '暂停', inactive: '已离', rejected: '未通过', graduated: '已毕业' };
const STATUS_TONE: Record<StudentStatus, BadgeTone> = { active: 'sage', pending: 'saffron', suspended: 'gold', inactive: 'neutral', rejected: 'crimson', graduated: 'neutral' };
const MEMBER_ROLE_LABEL: Record<MemberRole, string> = { auditor: '旁听', formal: '正式' };
const SNAP_LABELS = ['出勤', '听课', '答题', '共修', '功课'];
const SNAP_COLOR: Record<string, string> = { ok: SAGE, warn: GOLD_SOFT, low: SAFFRON };

function StatusBadge({ status }: { status: StudentStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}
function MemberRoleBadge({ role }: { role: MemberRole | null }) {
  if (!role) return null;
  return <Badge tone="neutral">{MEMBER_ROLE_LABEL[role]}</Badge>;
}

// 5维快照（学员管理特有，非通用组件，留本地）
function SnapBars({ snap }: { snap: Student['snap'] }) {
  return (
    <View style={styles.snapRow}>
      {snap.map((level, i) => (
        <View key={i} style={styles.snapItem}>
          <View style={[styles.snapBar, { backgroundColor: SNAP_COLOR[level] }]} />
          <Text style={styles.snapLabel}>{SNAP_LABELS[i]}</Text>
        </View>
      ))}
    </View>
  );
}

function StudentCard({ student, onPress, selected }: { student: Student; onPress: () => void; selected?: boolean }) {
  return (
    <Card onPress={onPress} selected={selected} style={styles.studentCard}>
      <View style={styles.cardTop}>
        <Avatar name={student.name} />
        <View style={{ flex: 1, gap: 4 }}>
          <View style={styles.cardNameRow}>
            <Text className="font-serif" style={styles.cardName}>{student.name ?? '未填姓名'}</Text>
            <StatusBadge status={student.status} />
            <MemberRoleBadge role={student.memberRole} />
          </View>
          <Text style={styles.cardCohort}>
            {student.dharmaName ? `法名 ${student.dharmaName} · ` : ''}{student.cohort ?? '未入班'}
          </Text>
        </View>
        {!selected && <Text style={styles.chevron}>›</Text>}
      </View>
      {student.snap.length > 0 && <SnapBars snap={student.snap} />}
    </Card>
  );
}

// ── 详情面板（宽屏 Master-Detail 右侧）────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailRowLabel}>{label}</Text>
      <Text style={styles.detailRowValue}>{value}</Text>
    </View>
  );
}

function StudentDetailPanel({ id, listStudent }: { id: string; listStudent: Student | undefined }) {
  const { data: detail, isLoading, isError: detailError } = useAdminStudentDetail(id);
  // 自学资格(决策119·D-2 审批赋权):此前授予/撤销只在手机版详情页有,宽屏(≥900)走本面板点不到 → 补齐(P0)
  const me = useCurrentUser();
  const isAdmin = me.data?.role === 'admin';
  // 关怀跟进写权对齐 RLS:care_followups 写 = 本班 zhumai/aixin(决策035/044-046;admin 只读不录)。
  const canWriteCare = me.data?.role === 'zhumai' || me.data?.role === 'aixin';
  const { data: grant, isError: grantError } = useStudentSelfStudyGrant(isAdmin ? id : undefined);
  const grantSS = useGrantSelfStudy();
  const revokeSS = useRevokeSelfStudy();

  if (isLoading) {
    return <View style={styles.detailLoading}><ActivityIndicator color={SAFFRON} /></View>;
  }
  if (detailError) {
    return (
      <View style={styles.detailLoading}>
        <Text style={{ color: SAFFRON_DARK, textAlign: 'center', padding: 24 }}>加载失败，请检查网络或权限。</Text>
      </View>
    );
  }

  const name = detail?.full_name ?? listStudent?.name ?? '—';
  const dharmaName = detail?.dharma_name ?? listStudent?.dharmaName ?? null;
  const status = ((detail?.status ?? listStudent?.status) ?? 'active') as StudentStatus;
  const studentNo = detail?.student_id ?? null;

  const memberships = (detail?.classMemberships ?? []) as unknown as {
    cohort_id: string;
    member_role: string;
    is_primary: boolean | null;
    cohorts: { name: string } | null;
  }[];
  const primary = memberships.find((m) => m.is_primary) ?? memberships[0] ?? null;
  const cohortName = primary?.cohorts?.name ?? listStudent?.cohort ?? '未入班';
  const memberRole = (primary?.member_role ?? listStudent?.memberRole) as MemberRole | null;

  return (
    <ScrollView contentContainerStyle={styles.detailScroll} showsVerticalScrollIndicator={false}>
      <SectionCard>
        <View style={styles.detailProfileHeader}>
          <Avatar name={name} size={52} />
          <View style={{ flex: 1, gap: 5 }}>
            <Text className="font-serif" style={styles.detailName}>{name}</Text>
            {dharmaName ? <Text style={styles.detailDharma}>法名：{dharmaName}</Text> : null}
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              <StatusBadge status={status} />
              <MemberRoleBadge role={memberRole} />
            </View>
          </View>
        </View>
        <Divider />
        <DetailRow label="班级" value={cohortName} />
        {studentNo ? <DetailRow label="学号" value={studentNo} /> : null}
        {/* 注册意愿(D-3):pending 审批时照单赋权;批准后仅作参考 */}
        <DetailRow label="学习意愿" value={(detail as { learning_mode?: string; intended_program?: { name?: string } | null } | null | undefined)?.learning_mode === 'self_study' ? `自学 · ${(detail as { intended_program?: { name?: string } | null } | null | undefined)?.intended_program?.name ?? '未选专业'}` : '进班共修'} />
      </SectionCard>

      <SectionCard title="学修统计">
        <StudentCareDims userId={id} />
      </SectionCard>

      <SectionCard title="管理操作">
        {/* 审计 P1 接线(2026-07-02):转正/切主班/设宽限走真 RPC/写库,拒绝带终态确认;宽窄两版共用组件 */}
        <StudentAdminActions
          userId={id}
          name={name}
          status={status}
          memberships={memberships.map((m) => ({ cohortId: m.cohort_id, cohortName: m.cohorts?.name ?? '未命名班', memberRole: m.member_role, isPrimary: !!m.is_primary }))}
          isAdmin={isAdmin}
        />
      </SectionCard>

      {/* 自学资格(决策119·仅系统管理员;与手机版详情页同款) */}
      {isAdmin ? (
        <SectionCard title="自学资格">
          {grantError ? (
            <Text style={{ fontSize: 12, color: '#a13c2e', textAlign: 'center', paddingVertical: 12 }}>加载失败,请检查网络后重试</Text>
          ) : grant ? (
            <>
              <DetailRow label="状态" value={`已授予${grant.grantedAt ? ` · ${grant.grantedAt.slice(0, 10)}` : ''}`} />
              <View style={{ marginTop: 10 }}>
                <AdminButton variant="negative" size="sm" disabled={revokeSS.isPending}
                  onPress={async () => {
                    if (!(await confirmAsync('撤销自学资格?', '撤销后该学员将无法自主追踪自学进度,需重新授予才能恢复。', '撤销'))) return;
                    revokeSS.mutate({ grantId: grant.id, userId: id }, { onError: (e) => notify('撤销失败', (e as Error)?.message ?? '请重试') });
                  }}>
                  撤销自学资格
                </AdminButton>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.detailPlaceholder}>未授予 · 无班 / 旁听师兄需授权后才能自学</Text>
              <View style={{ marginTop: 10 }}>
                <AdminButton variant="primary" size="sm" disabled={grantSS.isPending}
                  onPress={() => grantSS.mutate({ userId: id }, {
                    onSuccess: () => notify('已授予', `已授予「${name}」自学资格,TA 可在课程页「加入自学」。`),
                    onError: (e) => notify('授予失败', (e as Error)?.message ?? '请重试'),
                  })}>
                  授予自学资格
                </AdminButton>
              </View>
            </>
          )}
        </SectionCard>
      ) : null}

      <SectionCard title="关怀日志">
        <StudentCareFollowups userId={id} canWrite={canWriteCare} />
      </SectionCard>
    </ScrollView>
  );
}

// ── 创建学员账号(PM 2026-07-15 决定:免手机端自助注册,后台直接建号)───────────
function CreateStudentModal({ onClose }: { onClose: () => void }) {
  const create = useAdminCreateStudent();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [dharmaName, setDharmaName] = useState('');
  const [phone, setPhone] = useState('');

  const valid = /.+@.+\..+/.test(email.trim()) && password.length >= 8 && fullName.trim().length > 0;

  const submit = () => {
    if (!valid || create.isPending) return;
    create.mutate(
      { email: email.trim(), password, fullName: fullName.trim(), dharmaName: dharmaName.trim() || undefined, phone: phone.trim() || undefined },
      {
        onSuccess: () => {
          onClose();
          notify('已创建', `${fullName.trim()} 的账号已创建,状态直接为「在读」;首次登录会强制先改密码。接下来到「班级管理→添加学员」把TA加入班级(可加多个班)。`);
        },
        onError: (e) => notify('创建失败', e instanceof Error ? e.message : '请重试'),
      },
    );
  };

  return (
    <AdminModal visible onClose={onClose} title="创建学员账号">
      <ModalField label="邮箱" value={email} onChangeText={setEmail} placeholder="用于登录,须唯一" testID={testIds.students.createEmailInput} />
      <ModalField label="初始密码" value={password} onChangeText={setPassword} placeholder="至少 8 位" secureTextEntry testID={testIds.students.createPasswordInput} />
      <ModalField label="姓名" value={fullName} onChangeText={setFullName} placeholder="真实姓名" testID={testIds.students.createNameInput} />
      <ModalField label="法名(选填)" value={dharmaName} onChangeText={setDharmaName} placeholder="法名" />
      <ModalField label="手机(选填)" value={phone} onChangeText={setPhone} placeholder="手机号" keyboardType="numeric" />
      <ModalActions>
        <AdminButton variant="negative" onPress={onClose} style={{ flex: 1 }}>取消</AdminButton>
        <AdminButton testID={testIds.students.createSubmitButton} variant="primary" disabled={!valid || create.isPending} onPress={submit} style={{ flex: 1.4 }}>
          {create.isPending ? '创建中…' : '创建账号'}
        </AdminButton>
      </ModalActions>
      <ModalFootnote>创建后状态直接是「在读」,不走审批流程;初始密码是你刚设的这个,需另行告知TA,首次登录会强制改成TA自己的密码。分班不在这里选,创建后到「班级管理→添加学员」操作。</ModalFootnote>
    </AdminModal>
  );
}

// ── 主屏 ────────────────────────────────────────────────────────────────

export default function StudentsScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE;
  const router = useRouter();
  const { setTitle } = useAdminLayout();
  const [tab, setTab] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const me = useCurrentUser();
  const isAdmin = me.data?.role === 'admin';

  const { data: rawStudents, isLoading, error } = useAdminStudents();

  useEffect(() => { setTitle('学员管理'); }, [setTitle]);

  const allStudents: Student[] = (rawStudents ?? []).map((s) => ({
    id: s.id,
    name: s.fullName ?? '未填姓名',
    dharmaName: s.dharmaName,
    cohort: s.cohortName,
    memberRole: s.memberRole as MemberRole | null,
    status: s.status as StudentStatus,
    snap: [],
  }));

  const filtered = allStudents.filter((s) => {
    const matchTab = tab === 'all' || (tab === 'pending' && s.status === 'pending') || (tab === 'active' && s.status === 'active');
    const matchSearch = !search || (s.name && s.name.includes(search)) || (s.dharmaName && s.dharmaName.includes(search));
    return matchTab && matchSearch;
  });

  const pendingCount = allStudents.filter((s) => s.status === 'pending').length;
  const activeCount = allStudents.filter((s) => s.status === 'active').length;

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'pending', label: `待审批 (${pendingCount})` },
    { key: 'active', label: `在读 (${activeCount})` },
    { key: 'all', label: `全部 (${allStudents.length})` },
  ];

  if (isLoading) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={SAFFRON} /></View>;
  }
  if (error) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: SAFFRON_DARK, textAlign: 'center' }}>加载失败，请检查网络或权限。</Text>
      </View>
    );
  }

  const searchAndTabs = (
    <>
      <SearchBar value={search} onChangeText={setSearch} placeholder="搜索姓名或法名…" />
      <FilterChips items={tabs} value={tab} onChange={setTab} style={styles.tabBar} />
      {isAdmin ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <AdminButton testID={testIds.students.createButton} variant="secondary" size="sm" onPress={() => setCreateOpen(true)}>创建学员账号</AdminButton>
        </View>
      ) : null}
    </>
  );

  // ── 宽屏：Master-Detail ──────────────────────────────────────────────
  if (isWide) {
    return (
      <SafeAreaView style={styles.root} edges={['bottom']}>
        <View style={styles.masterDetailLayout}>
          <View style={styles.masterPanel}>
            {searchAndTabs}
            <ScrollView contentContainerStyle={styles.masterScroll} showsVerticalScrollIndicator={false}>
              {filtered.map((s) => (
                <StudentCard key={s.id} student={s} selected={s.id === selectedId} onPress={() => setSelectedId(s.id)} />
              ))}
              {filtered.length === 0 && <EmptyState>暂无匹配学员</EmptyState>}
            </ScrollView>
          </View>
          <View style={styles.detailPanelContainer}>
            {selectedId ? (
              <StudentDetailPanel key={selectedId} id={selectedId} listStudent={allStudents.find((s) => s.id === selectedId)} />
            ) : (
              <View style={styles.detailEmptyState}>
                <Text style={styles.detailEmptyText}>← 选择一位学员查看详情</Text>
              </View>
            )}
          </View>
        </View>
        {createOpen ? <CreateStudentModal onClose={() => setCreateOpen(false)} /> : null}
      </SafeAreaView>
    );
  }

  // ── 移动端：全屏列表 ─────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      {searchAndTabs}
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {filtered.map((s) => (
          <StudentCard key={s.id} student={s} onPress={() => router.push(`/(admin)/students/${s.id}` as never)} />
        ))}
        {filtered.length === 0 && <EmptyState>暂无匹配学员</EmptyState>}
      </ScrollView>
      {createOpen ? <CreateStudentModal onClose={() => setCreateOpen(false)} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SCREEN_BG },
  tabBar: { paddingHorizontal: 16, paddingBottom: 8 },
  // 学员卡（卡基座来自 kit，这里只加内距与间距）
  studentCard: { padding: 15, gap: 13 },
  cardTop: { flexDirection: 'row', gap: 11, alignItems: 'center' },
  cardNameRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  cardName: { fontSize: 16, fontWeight: '600', color: INK },
  cardCohort: { fontSize: 11, color: INK4 },
  chevron: { fontSize: 18, color: INK4 },
  // 5维快照
  snapRow: { flexDirection: 'row', gap: 0 },
  snapItem: { flex: 1, alignItems: 'center', paddingHorizontal: 3 },
  snapBar: { alignSelf: 'stretch', height: 5, borderRadius: 3, marginBottom: 5 },
  snapLabel: { fontSize: 9, color: INK4 },
  // 宽屏 Master-Detail
  masterDetailLayout: { flex: 1, flexDirection: 'row' },
  masterPanel: { width: MASTER_W, borderRightWidth: 1, borderRightColor: 'rgba(43,34,24,0.08)', backgroundColor: SCREEN_BG },
  masterScroll: { padding: 12, gap: 8, paddingBottom: 40 },
  // 详情面板
  detailPanelContainer: { flex: 1, backgroundColor: '#faf5ef' },
  detailLoading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  detailEmptyState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  detailEmptyText: { fontSize: 14, color: INK4 },
  detailScroll: { padding: 20, gap: 14, paddingBottom: 40 },
  detailProfileHeader: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  detailName: { fontSize: 18, fontWeight: '700', color: INK, letterSpacing: 0.5 },
  detailDharma: { fontSize: 13, color: INK3 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailRowLabel: { fontSize: 13, color: INK3 },
  detailRowValue: { fontSize: 13, color: INK2, fontWeight: '500' },
  detailPlaceholder: { fontSize: 12, color: INK4, textAlign: 'center', paddingVertical: 12 },
  detailActionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
