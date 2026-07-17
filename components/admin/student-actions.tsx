import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text as RNText, TextInput, View } from 'react-native';

import { AdminButton } from '@/components/ui/admin-kit';
import { Text } from '@/components/ui/text';
import { confirmAsync, notify } from '@/lib/dialog';
import { useSwitchPrimaryCohort, useUpdateMemberRole } from '@/lib/mutations/classes';
import { usePauseVow, useRecordProxyAction, useResumeVow } from '@/lib/mutations/proxy';
import { type ProxyActionType, type ProxyTargetKind } from '@/lib/queries/admin/proxy';
import { useApproveStudent, useExtendVowDueDate, useRejectStudent, useStudentAutoVows, useUpdateVowDailyTarget, useUpdateVowMinSessionMinutes } from '@/lib/queries/admin/students';
import { usePractices } from '@/lib/queries/practice';
import { testIds } from '@/lib/testids';
import { INK, INK2, INK3, SAFFRON_DARK } from '@/lib/theme';

// 学员屏「管理操作」(审计 P1·2026-07-02:原三个死按钮接线,宽窄两版共用):
//   批准(一键·可逆)/ 拒绝(终态·必确认)/ 旁听转正(promote_member_role RPC:转正+首发学号+审计)
//   / 调班=切主班(switch_primary_cohort RPC·限已入的班)/ 设宽限(改 auto 愿 current_end_date·#186,
//   custom 愿私密不代改;vow_due_date_audit 触发器留痕)/ 暂停·恢复自动愿(决策071·auto必修愿
//   须代停,防师兄自助藏起来躲关怀)/ 代行(设计①·2026-07-08:替代/追认/豁免·proxy_action_records,
//   写权=admin/本班zhumai)/ 纠正每日目标(R1·PD-6 后门·2026-07-10 补线:锁定修法如净土三选一,
//   师兄不可自改,仅admin能改且只能选白名单值,vows_check_daily_target 触发器兜底+自动留审计)。
export type MembershipLite = { cohortId: string; cohortName: string; memberRole: string; isPrimary: boolean };

const ACTION_TYPE_LABEL: Record<ProxyActionType, string> = { substitute: '替代', recognize: '追溯认可', exempt: '豁免' };
const TARGET_KIND_LABEL: Record<ProxyTargetKind, string> = { vow: '愿(功课)', lesson: '课程', exam: '考试', advancement: '升学', other: '其它' };

export function StudentAdminActions({ userId, name, status, memberships, isAdmin }: {
  userId: string;
  name: string;
  status: string;
  memberships: MembershipLite[];
  isAdmin: boolean; // 门槛覆写仅admin可见(比宽限更紧·2026-07-08裁决;RLS/触发器已收紧,前端不出入口更直观)
}) {
  const approve = useApproveStudent();
  const reject = useRejectStudent();
  const promote = useUpdateMemberRole();
  const switchPrimary = useSwitchPrimaryCohort();
  const extend = useExtendVowDueDate();
  const pauseVow = usePauseVow();
  const resumeVow = useResumeVow();
  const recordProxy = useRecordProxyAction();
  const updateMinSession = useUpdateVowMinSessionMinutes();
  const updateDailyTarget = useUpdateVowDailyTarget();
  const { data: autoVows = [] } = useStudentAutoVows(userId);
  const { data: practices = [] } = usePractices();

  const [switchOpen, setSwitchOpen] = useState(false);
  const [graceOpen, setGraceOpen] = useState(false);
  const [graceVowId, setGraceVowId] = useState<string | null>(null);
  const [graceDate, setGraceDate] = useState('');
  const [minSessionInput, setMinSessionInput] = useState('');
  const [dailyTargetPick, setDailyTargetPick] = useState<number | null>(null);

  const [proxyOpen, setProxyOpen] = useState(false);
  const [proxyType, setProxyType] = useState<ProxyActionType>('exempt');
  const [proxyKind, setProxyKind] = useState<ProxyTargetKind>('vow');
  const [proxyVowId, setProxyVowId] = useState<string | null>(null);
  const [proxyNote, setProxyNote] = useState('');
  const [proxyPracticeId, setProxyPracticeId] = useState<string | null>(null);
  const [proxyCount, setProxyCount] = useState('');
  const [proxyReason, setProxyReason] = useState('');
  const [proxyBasis, setProxyBasis] = useState('');

  const isPending = status === 'pending';
  // 拒绝不再是终态(PM 2026-07-15 决定):批准入学在 pending/rejected 都可点,随时可把
  // "拒绝"改判为"批准";拒绝按钮本身仍只在 pending 出现(不做"已批准/在读→打回拒绝"这条反向路,
  // 那是没被问到的另一件事,不在这次要求范围内)。
  const canApprove = status === 'pending' || status === 'rejected';
  const auditorMembership = memberships.find((m) => m.memberRole === 'auditor') ?? null;

  const graceDateValid = /^\d{4}-\d{2}-\d{2}$/.test(graceDate) && !Number.isNaN(new Date(graceDate + 'T00:00:00').getTime());
  const proxyCountNum = proxyCount.trim() ? Number(proxyCount) : null;
  const proxyValid = proxyReason.trim().length > 0
    && (proxyType !== 'substitute' || (!!proxyPracticeId && !!proxyCountNum && proxyCountNum > 0))
    && (proxyKind !== 'vow' || !!proxyVowId);

  const resetProxyForm = () => {
    setProxyType('exempt'); setProxyKind('vow'); setProxyVowId(null); setProxyNote('');
    setProxyPracticeId(null); setProxyCount(''); setProxyReason(''); setProxyBasis('');
  };

  const onPromote = async () => {
    if (!auditorMembership) return;
    if (!(await confirmAsync(`把 ${name} 转为正式学员?`, `${auditorMembership.cohortName} · 转正后不可降回旁听;首次转正自动发放学号。`, '转为正式'))) return;
    promote.mutate(
      { cohortId: auditorMembership.cohortId, userId, role: 'formal' },
      {
        onSuccess: () => notify('已转正', `${name} 现为正式学员(学号已发放)。`),
        onError: (e) => notify('转正失败', e instanceof Error ? e.message : '请重试'),
      },
    );
  };

  const onGraceSubmit = () => {
    if (!graceVowId || !graceDateValid) return;
    extend.mutate(
      { vowId: graceVowId, newEndDate: graceDate },
      {
        onSuccess: () => { setGraceOpen(false); setGraceVowId(null); setGraceDate(''); notify('已设宽限', '截止日已更新,操作已记入审计。'); },
        onError: (e) => notify('设宽限失败', e instanceof Error ? e.message : '请重试'),
      },
    );
  };

  const graceVow = autoVows.find((v) => v.id === graceVowId) ?? null;
  const minSessionNum = minSessionInput.trim() ? Number(minSessionInput) : null;
  const minSessionValid = minSessionNum != null && Number.isFinite(minSessionNum) && minSessionNum >= 30;
  const onMinSessionSubmit = () => {
    if (!graceVowId || !minSessionValid || minSessionNum == null) return;
    updateMinSession.mutate(
      { vowId: graceVowId, minSessionMinutes: minSessionNum },
      {
        onSuccess: () => notify('已更新门槛', `座次门槛已改为 ${minSessionNum} 分钟,只影响之后的新打卡。`),
        onError: (e) => notify('更新门槛失败', e instanceof Error ? e.message : '请重试'),
      },
    );
  };

  const onDailyTargetSubmit = () => {
    if (!graceVowId || dailyTargetPick == null) return;
    updateDailyTarget.mutate(
      { vowId: graceVowId, dailyTarget: dailyTargetPick },
      {
        onSuccess: () => notify('已纠正目标', `每日目标已改为 ${dailyTargetPick},已记入审计。`),
        onError: (e) => notify('更新失败', e instanceof Error ? e.message : '请重试'),
      },
    );
  };

  const onTogglePause = async (vowId: string, practiceName: string, paused: boolean) => {
    if (paused) {
      resumeVow.mutate({ vowId }, { onError: (e) => notify('恢复失败', e instanceof Error ? e.message : '请重试') });
      return;
    }
    if (!(await confirmAsync(`暂停「${practiceName}」?`, '暂停后不进状态机/关怀名单、不触发断签提醒;不顺延截止日,恢复全手动(决策071)。', '暂停'))) return;
    pauseVow.mutate({ vowId }, { onError: (e) => notify('暂停失败', e instanceof Error ? e.message : '请重试') });
  };

  const onProxySubmit = () => {
    if (!proxyValid) return;
    recordProxy.mutate(
      {
        userId, actionType: proxyType, targetKind: proxyKind,
        targetRef: proxyKind === 'vow' ? proxyVowId : null,
        targetNote: proxyKind === 'vow' ? null : (proxyNote.trim() || null),
        substitutePracticeId: proxyType === 'substitute' ? proxyPracticeId : null,
        substituteCount: proxyType === 'substitute' ? proxyCountNum : null,
        reason: proxyReason.trim(), basis: proxyBasis.trim() || null,
      },
      {
        onSuccess: () => { setProxyOpen(false); resetProxyForm(); notify('已记录', `代行操作已记录(${ACTION_TYPE_LABEL[proxyType]}·${TARGET_KIND_LABEL[proxyKind]})。`); },
        onError: (e) => notify('记录失败', e instanceof Error ? e.message : '请重试(仅 admin / 本班辅导员可代行)'),
      },
    );
  };

  return (
    <>
      <View style={styles.row}>
        {canApprove ? (
          <AdminButton testID={testIds.students.approveButton} variant="primary" size="sm" disabled={approve.isPending} onPress={() => approve.mutate(userId)}>批准入学</AdminButton>
        ) : null}
        {isPending ? (
          <AdminButton testID={testIds.students.rejectButton} variant="negative" size="sm" disabled={reject.isPending} onPress={async () => {
            if (await confirmAsync(`拒绝 ${name} 的入学申请?`, '拒绝后该账号暂时无法进入学修端,之后可随时重新点「批准入学」放行,不是终态。', '拒绝申请')) reject.mutate(userId);
          }}>拒绝</AdminButton>
        ) : null}
        {auditorMembership && !isPending ? (
          <AdminButton testID={testIds.students.promoteButton} variant="secondary" size="sm" disabled={promote.isPending} onPress={onPromote}>旁听转正</AdminButton>
        ) : null}
        {memberships.length > 1 ? (
          <AdminButton variant="secondary" size="sm" onPress={() => setSwitchOpen(true)}>切主班</AdminButton>
        ) : null}
        {!isPending ? (
          <AdminButton variant="secondary" size="sm" onPress={() => { setGraceVowId(null); setGraceDate(''); setDailyTargetPick(null); setGraceOpen(true); }}>设宽限 / 暂停 / 纠错</AdminButton>
        ) : null}
        {!isPending ? (
          <AdminButton variant="secondary" size="sm" onPress={() => { resetProxyForm(); setProxyOpen(true); }}>代行</AdminButton>
        ) : null}
        {!isPending && memberships.length === 0 ? (
          <RNText style={styles.hint}>未入班:入班/调班在「班级管理 → 班级详情 → 添加学员」操作。</RNText>
        ) : null}
      </View>

      {/* 切主班(仅已入的班里挑·决策131/134) */}
      <Modal visible={switchOpen} transparent animationType="fade" onRequestClose={() => setSwitchOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setSwitchOpen(false)}>
          <Pressable style={styles.card} onPress={() => {}}>
            <Text className="font-serif" style={styles.cardTitle}>切换主班</Text>
            <RNText style={styles.cardSub}>主班=主修归属(升学锚定);只能在 TA 已加入的班里挑。</RNText>
            <View style={{ gap: 8, marginTop: 12 }}>
              {memberships.map((m) => (
                <Pressable
                  key={m.cohortId}
                  style={[styles.opt, m.isPrimary && styles.optOn]}
                  disabled={m.isPrimary || switchPrimary.isPending}
                  onPress={() => switchPrimary.mutate(
                    { userId, newPrimaryCohortId: m.cohortId },
                    {
                      onSuccess: () => { setSwitchOpen(false); notify('已切换', `${name} 的主班已改为 ${m.cohortName}。`); },
                      onError: (e) => notify('切换失败', e instanceof Error ? e.message : '请重试'),
                    },
                  )}
                >
                  <RNText style={{ flex: 1, fontSize: 14, fontWeight: '600', color: INK }}>{m.cohortName}</RNText>
                  {m.isPrimary ? <RNText style={{ fontSize: 11, fontWeight: '700', color: SAFFRON_DARK }}>当前主班</RNText> : null}
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 设宽限(auto 愿延期·#186)+ 暂停/恢复(决策071·auto必修愿须代停) */}
      <Modal visible={graceOpen} transparent animationType="fade" onRequestClose={() => setGraceOpen(false)}>
        {/* KeyboardAvoidingView(2026-07-17·PM真机反馈键盘挡住弹层输入框,全app排查后补齐) */}
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <Pressable style={styles.backdrop} onPress={() => setGraceOpen(false)}>
          <Pressable style={styles.card} onPress={() => {}}>
            <Text className="font-serif" style={styles.cardTitle}>设宽限 / 暂停 / 纠正目标</Text>
            <RNText style={styles.cardSub}>只对自动指派的功课(auto);师兄自定功课私密、不代改。设宽限自动记入审计;暂停不顺延截止日、不进状态机与关怀名单;锁定修法的每日目标纠错仅系统管理员可见。</RNText>
            {autoVows.length === 0 ? (
              <RNText style={[styles.hint, { marginTop: 12 }]}>TA 当前没有进行中的自动功课。</RNText>
            ) : (
              <ScrollView style={{ maxHeight: 360, marginTop: 12 }}>
                <View style={{ gap: 8 }}>
                  {autoVows.map((v) => {
                    const paused = v.status === 'paused';
                    return (
                      <View key={v.id} style={[styles.opt, graceVowId === v.id && styles.optPick]}>
                        <Pressable style={{ flex: 1 }} onPress={() => { setGraceVowId(v.id); setGraceDate(v.currentEndDate ?? ''); setMinSessionInput(v.minSessionMinutes != null ? String(v.minSessionMinutes) : ''); setDailyTargetPick(v.dailyTarget); }}>
                          <RNText style={{ fontSize: 14, fontWeight: '600', color: INK }}>{v.practiceName}{paused ? '(已暂停)' : ''}</RNText>
                          <RNText style={{ fontSize: 11, color: INK3, marginTop: 1 }}>现截止 {v.currentEndDate ?? '—'}{v.originalEndDate && v.originalEndDate !== v.currentEndDate ? `(原 ${v.originalEndDate})` : ''}</RNText>
                        </Pressable>
                        <Pressable
                          style={[styles.pauseBtn, paused && styles.pauseBtnResume]}
                          disabled={pauseVow.isPending || resumeVow.isPending}
                          onPress={() => onTogglePause(v.id, v.practiceName, paused)}
                        >
                          <RNText style={{ fontSize: 11, fontWeight: '700', color: paused ? '#2f6b4f' : SAFFRON_DARK }}>{paused ? '恢复' : '暂停'}</RNText>
                        </Pressable>
                      </View>
                    );
                  })}
                  {graceVowId ? (
                    <View style={{ gap: 6 }}>
                      <TextInput
                        value={graceDate}
                        onChangeText={setGraceDate}
                        placeholder="新截止日 YYYY-MM-DD"
                        placeholderTextColor={INK3}
                        autoCapitalize="none"
                        maxLength={10}
                        style={styles.dateInput}
                      />
                      <AdminButton variant="primary" size="sm" disabled={!graceDateValid || extend.isPending} onPress={onGraceSubmit}>
                        {extend.isPending ? '保存中…' : '延长到该日'}
                      </AdminButton>
                      {isAdmin ? (
                        <>
                          <RNText style={[styles.hint, { marginTop: 6 }]}>座次门槛(仅系统管理员可改·比宽限更紧):</RNText>
                          <TextInput
                            value={minSessionInput}
                            onChangeText={setMinSessionInput}
                            placeholder="分钟数,≥30(留空视为沿用当前值)"
                            placeholderTextColor={INK3}
                            keyboardType="number-pad"
                            style={styles.dateInput}
                          />
                          {minSessionInput.trim() && !minSessionValid ? (
                            <RNText style={{ fontSize: 11, color: '#a13c2e' }}>门槛不能低于 30 分钟(大纲底线)</RNText>
                          ) : null}
                          <AdminButton variant="secondary" size="sm" disabled={!minSessionValid || updateMinSession.isPending} onPress={onMinSessionSubmit}>
                            {updateMinSession.isPending ? '保存中…' : '更新门槛(只影响新打卡)'}
                          </AdminButton>
                        </>
                      ) : null}
                      {isAdmin && graceVow?.dailyTargetLocked ? (
                        <>
                          <RNText style={[styles.hint, { marginTop: 6 }]}>每日目标已锁定(PD-6 三选一),师兄不可自改;纠错只能选以下白名单值:</RNText>
                          {graceVow.allowedDailyTargets && graceVow.allowedDailyTargets.length > 0 ? (
                            <View style={styles.chipRow}>
                              {graceVow.allowedDailyTargets.map((t) => (
                                <Pressable key={t} style={[styles.chip, dailyTargetPick === t && styles.chipOn]} onPress={() => setDailyTargetPick(t)}>
                                  <RNText style={[styles.chipTxt, dailyTargetPick === t && styles.chipTxtOn]}>{t}</RNText>
                                </Pressable>
                              ))}
                            </View>
                          ) : (
                            <RNText style={{ fontSize: 11, color: '#a13c2e' }}>该修法已锁定但未配置白名单值,无法纠错(请先在功课配置里补白名单)。</RNText>
                          )}
                          <AdminButton
                            variant="secondary" size="sm"
                            disabled={dailyTargetPick == null || dailyTargetPick === graceVow.dailyTarget || updateDailyTarget.isPending}
                            onPress={onDailyTargetSubmit}
                          >
                            {updateDailyTarget.isPending ? '保存中…' : `纠正为 ${dailyTargetPick ?? '—'}(自动留审计)`}
                          </AdminButton>
                        </>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* 代行(设计①·2026-07-08):替代/追溯认可/豁免。传承走独立"传承记录"入口(060/112 不含灌顶)。 */}
      <Modal visible={proxyOpen} transparent animationType="fade" onRequestClose={() => setProxyOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <Pressable style={styles.backdrop} onPress={() => setProxyOpen(false)}>
          <Pressable style={[styles.card, { maxHeight: '86%' }]} onPress={() => {}}>
            <Text className="font-serif" style={styles.cardTitle}>代行操作</Text>
            <RNText style={styles.cardSub}>为 {name} 代行替代 / 追溯认可 / 豁免,必须写明理由,永久留痕(决策121)。</RNText>
            <ScrollView style={{ marginTop: 12 }}>
              <RNText style={styles.fieldLabel}>类型</RNText>
              <View style={styles.chipRow}>
                {(Object.keys(ACTION_TYPE_LABEL) as ProxyActionType[]).map((t) => (
                  <Pressable key={t} style={[styles.chip, proxyType === t && styles.chipOn]} onPress={() => setProxyType(t)}>
                    <RNText style={[styles.chipTxt, proxyType === t && styles.chipTxtOn]}>{ACTION_TYPE_LABEL[t]}</RNText>
                  </Pressable>
                ))}
              </View>

              <RNText style={styles.fieldLabel}>对象</RNText>
              <View style={styles.chipRow}>
                {(Object.keys(TARGET_KIND_LABEL) as ProxyTargetKind[]).map((k) => (
                  <Pressable key={k} style={[styles.chip, proxyKind === k && styles.chipOn]} onPress={() => { setProxyKind(k); setProxyVowId(null); }}>
                    <RNText style={[styles.chipTxt, proxyKind === k && styles.chipTxtOn]}>{TARGET_KIND_LABEL[k]}</RNText>
                  </Pressable>
                ))}
              </View>

              {proxyKind === 'vow' ? (
                autoVows.length === 0 ? (
                  <RNText style={styles.hint}>TA 当前没有进行中的自动功课(自定功课不接受代行)。</RNText>
                ) : (
                  <View style={{ gap: 6, marginTop: 4 }}>
                    {autoVows.map((v) => (
                      <Pressable key={v.id} style={[styles.opt, proxyVowId === v.id && styles.optPick]} onPress={() => setProxyVowId(v.id)}>
                        <RNText style={{ fontSize: 13, fontWeight: '600', color: INK }}>{v.practiceName}</RNText>
                      </Pressable>
                    ))}
                  </View>
                )
              ) : (
                <TextInput
                  value={proxyNote}
                  onChangeText={setProxyNote}
                  placeholder={`说明具体${TARGET_KIND_LABEL[proxyKind]}(如课节/考试名称)`}
                  placeholderTextColor={INK3}
                  style={styles.textInput}
                />
              )}

              {proxyType === 'substitute' ? (
                <>
                  <RNText style={styles.fieldLabel}>替代修法 + 数量</RNText>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {practices.map((p) => (
                        <Pressable key={p.id} style={[styles.chip, proxyPracticeId === p.id && styles.chipOn]} onPress={() => setProxyPracticeId(p.id)}>
                          <RNText style={[styles.chipTxt, proxyPracticeId === p.id && styles.chipTxtOn]}>{p.name}</RNText>
                        </Pressable>
                      ))}
                    </View>
                  </ScrollView>
                  <TextInput
                    value={proxyCount}
                    onChangeText={setProxyCount}
                    placeholder="代替数量(如遍数)"
                    placeholderTextColor={INK3}
                    keyboardType="number-pad"
                    style={styles.textInput}
                  />
                </>
              ) : null}

              <RNText style={styles.fieldLabel}>理由(必填)</RNText>
              <TextInput
                value={proxyReason}
                onChangeText={setProxyReason}
                placeholder="如:病假期间由他人代打卡 92 修法 30 遍"
                placeholderTextColor={INK3}
                multiline
                style={[styles.textInput, { minHeight: 60, textAlignVertical: 'top' }]}
              />
              <RNText style={styles.fieldLabel}>依据(选填)</RNText>
              <TextInput
                value={proxyBasis}
                onChangeText={setProxyBasis}
                placeholder="如:教务口头同意 / 医院证明编号"
                placeholderTextColor={INK3}
                style={styles.textInput}
              />

              <View style={{ marginTop: 14 }}>
                <AdminButton variant="primary" disabled={!proxyValid || recordProxy.isPending} onPress={onProxySubmit}>
                  {recordProxy.isPending ? '记录中…' : '确认记录'}
                </AdminButton>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  hint: { fontSize: 11, color: INK3, lineHeight: 16 },
  backdrop: { flex: 1, backgroundColor: 'rgba(20,14,8,0.4)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  card: { width: '100%', maxWidth: 460, backgroundColor: '#FBF4E9', borderRadius: 18, padding: 18 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: INK },
  cardSub: { fontSize: 12, color: INK2, marginTop: 4, lineHeight: 18 },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(43,34,24,0.1)' },
  optOn: { borderColor: 'rgba(224,120,86,0.5)', backgroundColor: '#FBE5DA' },
  optPick: { borderColor: SAFFRON_DARK },
  dateInput: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(43,34,24,0.15)', paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: INK },
  textInput: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(43,34,24,0.15)', paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: INK, marginBottom: 10 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: INK2, marginBottom: 6, marginTop: 4 },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(43,34,24,0.15)' },
  chipOn: { backgroundColor: SAFFRON_DARK, borderColor: SAFFRON_DARK },
  chipTxt: { fontSize: 12, fontWeight: '600', color: INK2 },
  chipTxtOn: { color: '#fff' },
  pauseBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#FBE5DA' },
  pauseBtnResume: { backgroundColor: '#E3F0E8' },
});
