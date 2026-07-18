import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AdminButton,
  Avatar,
  Badge,
  DetailHeader,
  Divider,
  EmptyState,
  SCREEN_BG,
  SectionCard,
  type BadgeTone,
} from '@/components/ui/admin-kit';
import { StudentAdminActions } from '@/components/admin/student-actions';
import { StudentCareDims, StudentCareFollowups } from '@/components/admin/student-care-panel';
import { StudentTransmissions } from '@/components/admin/student-transmissions';
import { Text } from '@/components/ui/text';
import { confirmAsync, notify } from '@/lib/dialog';
import { useCancelAccountDeletion } from '@/lib/mutations/account';
import { useUpdateAccessibilityNeeds } from '@/lib/mutations/proxy';
import { useGrantSelfStudy, useRevokeSelfStudy } from '@/lib/mutations/self-study';
import { useStudentProxyActions, type ProxyActionType, type ProxyTargetKind } from '@/lib/queries/admin/proxy';
import { useAdminStudentDetail } from '@/lib/queries/admin/students';
import { useCurrentUser } from '@/lib/queries/profile';
import { useStudentSelfStudyGrant } from '@/lib/queries/self-study-progress';
import { testIds } from '@/lib/testids';
import { INK, INK2, INK3, SAFFRON } from '@/lib/theme';
import { useAdminLayout } from '../_layout';

const LEARNING_MODE_LABEL: Record<string, string> = { self_study: '自学', class: '想进班共修' };
const PROXY_ACTION_LABEL: Record<ProxyActionType, string> = { substitute: '替代', recognize: '追溯认可', exempt: '豁免' };
const PROXY_TARGET_LABEL: Record<ProxyTargetKind, string> = { vow: '愿', lesson: '课程', exam: '考试', advancement: '升学', other: '其它', transmission: '传承' } as Record<ProxyTargetKind, string>;

type StudentStatus = 'active' | 'pending' | 'suspended' | 'inactive' | 'rejected' | 'graduated';
type MemberRole = 'auditor' | 'formal';

const STATUS_LABEL: Record<StudentStatus, string> = { active: '在读', pending: '待审', suspended: '暂停', inactive: '已离', rejected: '未通过', graduated: '已毕业' };
const STATUS_TONE: Record<StudentStatus, BadgeTone> = { active: 'sage', pending: 'saffron', suspended: 'gold', inactive: 'neutral', rejected: 'crimson', graduated: 'neutral' };
const MEMBER_ROLE_LABEL: Record<MemberRole, string> = { auditor: '旁听', formal: '正式' };

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.profileRow}>
      <Text style={styles.profileLabel}>{label}</Text>
      <Text style={styles.profileValue}>{value}</Text>
    </View>
  );
}

function A11yChip({ label, active, disabled, onPress, testID }: { label: string; active: boolean; disabled: boolean; onPress: () => void; testID?: string }) {
  return (
    <Pressable testID={testID} style={[styles.a11yChip, active && styles.a11yChipOn]} disabled={disabled} onPress={onPress}>
      <Text style={[styles.a11yChipTxt, active && styles.a11yChipTxtOn]}>{active ? '✓ ' : ''}{label}</Text>
    </Pressable>
  );
}

export default function StudentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { setTitle } = useAdminLayout();

  const { data: detail, isLoading, isError } = useAdminStudentDetail(id);
  const cancelDeletion = useCancelAccountDeletion();
  // 自学资格(决策119·仅系统管理员可授/撤;读也限本人或 admin → 非 admin 不查)
  const me = useCurrentUser();
  const isAdmin = me.data?.role === 'admin';
  // 关怀跟进写权对齐 RLS:care_followups 写 = 本班 zhumai/aixin(决策035/044-046;admin 只读不录)。
  const canWriteCare = me.data?.role === 'zhumai' || me.data?.role === 'aixin';
  const { data: grant, isError: grantError } = useStudentSelfStudyGrant(isAdmin ? id : undefined);
  const grantSS = useGrantSelfStudy();
  const revokeSS = useRevokeSelfStudy();
  const updateA11y = useUpdateAccessibilityNeeds();
  const { data: proxyActions = [], isError: proxyError } = useStudentProxyActions(id);

  const name = detail?.full_name ?? '学员';
  useEffect(() => { setTitle(name); }, [setTitle, name]);

  const dharmaName = detail?.dharma_name ?? null;
  const status = (detail?.status ?? 'active') as StudentStatus;
  const studentNo = detail?.student_id ?? null;

  const memberships = (detail?.classMemberships ?? []) as unknown as {
    cohort_id: string;
    member_role: string;
    is_primary: boolean | null;
    cohorts: { name: string } | null;
  }[];
  const primary = memberships.find((m) => m.is_primary) ?? memberships[0] ?? null;
  const cohortName = primary?.cohorts?.name ?? '未入班';
  const memberRole = (primary?.member_role ?? null) as MemberRole | null;

  const accessibilityNeeds = (detail?.accessibility_needs ?? []) as ('blind' | 'deaf')[];
  const learningMode = detail?.learning_mode as string | null;
  const intendedProgramName = (detail?.intended_program as unknown as { name?: string } | null)?.name ?? null;

  const toggleA11y = (need: 'blind' | 'deaf') => {
    const next = accessibilityNeeds.includes(need) ? accessibilityNeeds.filter((n) => n !== need) : [...accessibilityNeeds, need];
    updateA11y.mutate({ userId: id, needs: next }, { onError: (e) => notify('保存失败', e instanceof Error ? e.message : '请重试') });
  };

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <DetailHeader title={name} onBack={() => router.back()} />

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={SAFFRON} />
        </View>
      ) : isError ? (
        <View style={{ padding: 24 }}><EmptyState>加载失败,请检查网络后重试</EmptyState></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* 注销流程中(决策078+B1·2026-07-10):找回仅限后台操作,这里就是那个操作入口 */}
          {detail?.deletion_requested_at ? (
            <SectionCard>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#a13c2e' }}>该学员已申请注销账号</Text>
                  <Text style={{ fontSize: 12, color: INK3, marginTop: 2 }}>申请于 {detail.deletion_requested_at.slice(0, 10)};保留期满将永久删除全部数据。</Text>
                </View>
                <AdminButton
                  testID={testIds.students.cancelDeletionButton}
                  variant="secondary"
                  disabled={cancelDeletion.isPending}
                  onPress={() => cancelDeletion.mutate(id, {
                    onSuccess: () => notify('已撤回', '该学员账号已找回,注销流程终止。'),
                    onError: (e) => notify('撤回失败', e instanceof Error ? e.message : '请重试'),
                  })}
                >
                  {cancelDeletion.isPending ? '处理中…' : '撤回注销 · 找回账号'}
                </AdminButton>
              </View>
            </SectionCard>
          ) : null}

          {/* 档案卡 */}
          <SectionCard>
            <View style={styles.profileHeaderRow}>
              <Avatar name={name} size={52} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text className="font-serif" style={styles.cardName}>{name}</Text>
                {dharmaName ? <Text style={styles.cardDharma}>法名：{dharmaName}</Text> : null}
                <View style={styles.badgeRow}>
                  <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
                  {memberRole ? <Badge tone="neutral">{MEMBER_ROLE_LABEL[memberRole]}</Badge> : null}
                </View>
              </View>
            </View>
            <Divider />
            <ProfileRow label="班级" value={cohortName} />
            {studentNo ? <ProfileRow label="学号" value={studentNo} /> : null}
            {learningMode ? <ProfileRow label="注册意愿" value={`${LEARNING_MODE_LABEL[learningMode] ?? learningMode}${intendedProgramName ? `·${intendedProgramName}` : ''}`} /> : null}
          </SectionCard>

          {/* 学修统计 */}
          <SectionCard title="学修统计">
            <StudentCareDims userId={id} />
          </SectionCard>

          {/* 管理操作(审计 P1 接线 2026-07-02:与宽屏面板共用组件,真 RPC/写库) */}
          <SectionCard title="管理操作">
            <StudentAdminActions
              userId={id}
              name={name}
              status={status}
              memberships={memberships.map((m) => ({ cohortId: m.cohort_id, cohortName: m.cohorts?.name ?? '未命名班', memberRole: m.member_role, isPrimary: !!m.is_primary }))}
              isAdmin={isAdmin}
            />
          </SectionCard>

          {/* 自学资格(决策119·仅系统管理员;授权后无班/旁听师兄也可自学)*/}
          {isAdmin ? (
            <SectionCard title="自学资格">
              {memberRole === 'formal' ? (
                <Text style={styles.placeholder}>正式学员本身即可自学;此授权用于无班 / 旁听师兄。</Text>
              ) : null}
              {grantError ? (
                <Text style={styles.placeholder}>加载失败,请检查网络后重试</Text>
              ) : grant ? (
                <>
                  <View style={styles.profileRow}>
                    <Text style={styles.profileLabel}>状态</Text>
                    <Badge tone="sage">已授予</Badge>
                  </View>
                  {grant.grantedAt ? <ProfileRow label="授予于" value={grant.grantedAt.slice(0, 10)} /> : null}
                  <View style={{ marginTop: 12 }}>
                    <AdminButton
                      variant="negative"
                      disabled={revokeSS.isPending}
                      onPress={async () => {
                        if (!(await confirmAsync('撤销自学资格?', '撤销后该学员将无法自主追踪自学进度,需重新授予才能恢复。', '撤销'))) return;
                        revokeSS.mutate({ grantId: grant.id, userId: id }, { onError: (e) => notify('撤销失败', (e as Error)?.message ?? '请重试') });
                      }}
                    >
                      撤销自学资格
                    </AdminButton>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.placeholder}>未授予 · 无班 / 旁听师兄需授权后才能自学</Text>
                  <AdminButton
                    variant="primary"
                    disabled={grantSS.isPending}
                    onPress={() => grantSS.mutate({ userId: id }, {
                      onSuccess: () => notify('已授予', `已授予「${name}」自学资格,TA 可在课程页「加入自学」。`),
                      onError: (e) => notify('授予失败', (e as Error)?.message ?? '请重试'),
                    })}
                  >
                    授予自学资格
                  </AdminButton>
                </>
              )}
            </SectionCard>
          ) : null}

          {/* 传承记录(设计②·2026-07-08:显宗传承录入;灌顶/密法不做·决策060/112) */}
          <SectionCard title="传承记录">
            <StudentTransmissions userId={id} name={name} canWrite={isAdmin} />
          </SectionCard>

          {/* 无障碍(决策078登记;设计小活:管理端展示+代登记) */}
          <SectionCard title="无障碍学修">
            <View style={styles.row}>
              <A11yChip testID={testIds.students.a11yBlindChip} label="视力障碍" active={accessibilityNeeds.includes('blind')} disabled={!isAdmin || updateA11y.isPending} onPress={() => toggleA11y('blind')} />
              <A11yChip testID={testIds.students.a11yDeafChip} label="听力障碍" active={accessibilityNeeds.includes('deaf')} disabled={!isAdmin || updateA11y.isPending} onPress={() => toggleA11y('deaf')} />
            </View>
            {accessibilityNeeds.length === 0 ? <Text style={styles.placeholder}>未登记(闻思圆满按常规判定)</Text> : null}
            {!isAdmin ? <Text style={styles.hint}>仅系统管理员可代登记;学员本人可在个人设置自助登记。</Text> : null}
          </SectionCard>

          {/* 代行记录(设计①·2026-07-08:替代/追认/豁免只读历史,proxy_action_records) */}
          <SectionCard title="代行记录">
            {proxyError ? (
              <Text style={styles.placeholder}>加载失败,请检查网络后重试</Text>
            ) : proxyActions.length === 0 ? (
              <Text style={styles.placeholder}>暂无代行记录</Text>
            ) : (
              <View style={{ gap: 10 }}>
                {proxyActions.map((p) => (
                  <View key={p.id} style={styles.proxyRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Badge tone="gold">{PROXY_ACTION_LABEL[p.actionType] ?? p.actionType}</Badge>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: INK }}>{PROXY_TARGET_LABEL[p.targetKind] ?? p.targetKind}</Text>
                      {p.substitutePracticeName ? <Text style={{ fontSize: 11, color: INK3 }}>→ {p.substitutePracticeName} × {p.substituteCount}</Text> : null}
                    </View>
                    <Text style={{ fontSize: 12, color: INK2, marginTop: 2 }}>{p.reason}</Text>
                    <Text style={{ fontSize: 10, color: INK3, marginTop: 2 }}>{p.createdAt.slice(0, 10)} · {p.adminName ?? '管理员'}{p.basis ? ` · 依据:${p.basis}` : ''}</Text>
                  </View>
                ))}
              </View>
            )}
          </SectionCard>

          {/* 关怀日志（师兄端 0 可见）*/}
          <SectionCard title="关怀日志">
            <StudentCareFollowups userId={id} canWrite={canWriteCare} />
          </SectionCard>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SCREEN_BG },
  scroll: { padding: 16, gap: 16, paddingBottom: 40 },
  profileHeaderRow: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  cardName: { fontSize: 18, fontWeight: '700', color: INK, letterSpacing: 0.5 },
  cardDharma: { fontSize: 13, color: INK3 },
  badgeRow: { flexDirection: 'row', gap: 6, marginTop: 2, flexWrap: 'wrap' },
  profileRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  profileLabel: { fontSize: 13, color: INK3 },
  profileValue: { fontSize: 13, color: INK2, fontWeight: '500' },
  placeholder: { fontSize: 12, color: INK3, textAlign: 'center', paddingVertical: 12 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  hint: { fontSize: 11, color: INK3, lineHeight: 16, marginTop: 8 },
  a11yChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(43,34,24,0.15)' },
  a11yChipOn: { backgroundColor: '#FBE5DA', borderColor: 'rgba(224,120,86,0.5)' },
  a11yChipTxt: { fontSize: 13, fontWeight: '600', color: INK2 },
  a11yChipTxtOn: { color: '#b35535' },
  proxyRow: { padding: 10, borderRadius: 10, backgroundColor: 'rgba(43,34,24,0.03)' },
});
