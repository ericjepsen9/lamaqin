import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AdminButton,
  AdminModal,
  Avatar,
  Badge,
  DetailHeader,
  EmptyState,
  ModalActions,
  ModalField,
  SCREEN_BG,
  SectionCard,
  SegmentedControl,
  type AdminButtonVariant,
  type BadgeTone,
} from '@/components/ui/admin-kit';
import { Text } from '@/components/ui/text';
import type { ExamFormat } from '@/lib/exam-pass-line';
import { useRecordAdvancement, useRecordExamGrade } from '@/lib/mutations/advancement';
import { useRecordProxyAction } from '@/lib/mutations/proxy';
import { useProgramPracticeCompletion, useStudentAdvancement, type AdvDetail, type MemberStatus } from '@/lib/queries/advancement';
import { useCurrentUser } from '@/lib/queries/profile';
import { testIds } from '@/lib/testids';
import { CRIMSON, GOLD_DARK as GOLD, GOLD_PALE, INK, INK2, INK3, INK4, SAFFRON, SAFFRON_DARK, SAFFRON_LIGHT, SAGE_DARK } from '@/lib/theme';
import { genClientToken } from '@/lib/utils';
import { useAdminLayout } from '../_layout';

type ConfirmAction = 'graduate' | 'held_back' | 'left' | null;

const STATUS_LABEL: Record<MemberStatus, string> = {
  active: '学修中', paused: '已暂停', held_back: '留级', graduated: '已毕业', left: '已离班',
};
const STATUS_TONE: Record<MemberStatus, BadgeTone> = {
  active: 'sage', paused: 'gold', held_back: 'saffron', graduated: 'neutral', left: 'neutral',
};

const attRate = (s: AdvDetail) => {
  const total = s.attendCount + s.absentCount;
  return total > 0 ? Math.round((s.attendCount / total) * 100) : 0;
};
// 达标=报数≥目标(大纲给的是绝对数,不是"接近达标"这种比例概念,2026-07-12 去掉中间档)
const pracColorOf = (count: number, target: number) => (target <= 0 || count >= target ? SAGE_DARK : SAFFRON_DARK);

function DimCard({ num, title, children, warning, badge }: { num: string; title: string; children: React.ReactNode; warning?: boolean; badge?: React.ReactNode }) {
  return (
    <View style={[styles.dimCard, warning && styles.dimCardWarning]}>
      <View style={styles.dimHeader}>
        <View style={[styles.dimNum, warning && styles.dimNumWarning]}>
          <Text style={[styles.dimNumText, warning && { color: SAFFRON_DARK }]}>{num}</Text>
        </View>
        <Text style={styles.dimTitle}>{title}</Text>
        {badge}
      </View>
      {children}
    </View>
  );
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${pct * 100}%` as any, backgroundColor: color }]} />
    </View>
  );
}

// ── 判定确认弹窗(含 5 维摘要 + 判定依据)──────────────────────────────
function ActionModal({ action, s, onConfirm, onCancel, pending }: {
  action: ConfirmAction; s: AdvDetail; onConfirm: (basis: string, clientToken: string) => void; onCancel: () => void; pending: boolean;
}) {
  const [basis, setBasis] = useState('');
  const [token, setToken] = useState('');
  useEffect(() => { setBasis(''); setToken(genClientToken()); }, [action]);
  if (!action) return null;
  const CONFIG: Record<Exclude<ConfirmAction, null>, { title: string; desc: string; label: string; variant: AdminButtonVariant }> = {
    graduate: { title: '确认毕业', desc: '标记为「已毕业」并留痕(advancement_records),不可撤销。请确认五维并填判定依据。', label: '确认毕业', variant: 'confirm' },
    held_back: { title: '确认留级', desc: '标记为「留级」(留级次数 +1)并留痕,移至下一届继续学修。', label: '确认留级', variant: 'danger' },
    left: { title: '确认离班', desc: '标记为「已离班」并留痕,数据保留但不再计入班级统计。', label: '确认离班', variant: 'negative' },
  };
  const cfg = CONFIG[action];
  const rate = attRate(s);
  return (
    <AdminModal visible onClose={onCancel} title={`${cfg.title}:${s.name}`} dismissOnOverlay={false}>
      <Text style={styles.modalDesc}>{cfg.desc}</Text>
      <View style={styles.modalDimSummary}>
        <Row k="① 传承圆满" v={s.transmissionsRequired > 0 ? `${s.transmissionsObtained}/${s.transmissionsRequired}` : '暂无要求'} ok={s.transmissionsRequired === 0 || s.transmissionsObtained >= s.transmissionsRequired} />
        <Row k="② 共修出勤" v={`${rate}%(${s.attendCount}/${s.attendCount + s.absentCount})`} neutral />
        <Row k="③ 修量(报数)" v={s.practiceTarget > 0 ? `${s.practiceTotal.toLocaleString()}/${s.practiceTarget.toLocaleString()}` : s.practiceTotal.toLocaleString()} ok={s.practiceTarget === 0 || s.practiceTotal >= s.practiceTarget} />
        <Row k="④ 考试成绩" v={s.examExempt ? `已豁免(${s.examExemptReason})` : s.examScore !== null ? `${s.examScore} 分` : '待录入'} ok={s.examExempt || !!s.examIsPass} neutral={!s.examExempt && s.examScore === null} />
        <Row k="⑤ 发心评价" v="教学部人工评定" neutral last />
      </View>
      <ModalField label="判定依据(留痕,可填发心评价 / 综合说明)" value={basis} onChangeText={setBasis} placeholder="如:五维达标,发心精进,准予毕业" multiline />
      <ModalActions>
        <AdminButton variant="negative" onPress={onCancel} style={{ flex: 1 }}>取消</AdminButton>
        <AdminButton testID={testIds.advancement.confirmActionButton} variant={cfg.variant} disabled={pending} onPress={() => onConfirm(basis, token)} style={{ flex: 2 }}>{pending ? '提交中…' : cfg.label}</AdminButton>
      </ModalActions>
    </AdminModal>
  );
}

function Row({ k, v, ok, neutral, last }: { k: string; v: string; ok?: boolean; neutral?: boolean; last?: boolean }) {
  const color = neutral ? INK4 : ok ? SAGE_DARK : SAFFRON_DARK;
  return (
    <View style={[styles.modalDimRow, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.modalDimLabel}>{k}</Text>
      <Text style={[styles.modalDimVal, { color }]}>{v}</Text>
    </View>
  );
}

// ── 录入考试成绩弹窗 ──────────────────────────────────────────────────
function ExamModal({ visible, onClose, onSubmit, pending }: {
  visible: boolean; onClose: () => void; onSubmit: (p: { examName: string; score: number; examFormat: ExamFormat; clientToken: string }) => void; pending: boolean;
}) {
  const [name, setName] = useState('');
  const [score, setScore] = useState('');
  const [examFormat, setExamFormat] = useState<ExamFormat>('closed');
  const [token, setToken] = useState('');
  useEffect(() => { if (visible) { setName(''); setScore(''); setExamFormat('closed'); setToken(genClientToken()); } }, [visible]);
  const n = Number(score.trim());
  // 2026-07-17·PM决定:考试分数不允许小数(此前85.5这类小数能存进去,PM明确要求改掉)
  const scoreValid = score.trim() !== '' && Number.isFinite(n) && Number.isInteger(n) && n >= 0 && n <= 100;
  const valid = name.trim().length > 0 && scoreValid;
  return (
    <AdminModal visible={visible} onClose={onClose} title="录入考试成绩" dismissOnOverlay={false}>
      <ModalField label="考试名称 *" value={name} onChangeText={setName} placeholder="如:第一次考试 / 加行结业考" />
      <ModalField testID={testIds.advancement.examScoreInput} label="分数 *(0-100整数)" value={score} onChangeText={setScore} placeholder="如:85" keyboardType="numeric" />
      {score.trim() !== '' && !scoreValid ? <Text style={{ fontSize: 12, color: CRIMSON, marginTop: -4, marginBottom: 6 }}>请输入 0-100 之间的整数,不支持小数</Text> : null}
      <Text style={{ fontSize: 12, color: INK3, marginTop: 8, marginBottom: 4 }}>考试形式(共修出勤未达93次时决定合格线,达到则恒30分合格)</Text>
      <SegmentedControl items={[{ key: 'closed', label: '闭卷(60分合格)' }, { key: 'open', label: '开卷(72分合格)' }]} value={examFormat} onChange={setExamFormat} />
      <ModalActions>
        <AdminButton variant="negative" onPress={onClose} style={{ flex: 1 }}>取消</AdminButton>
        <AdminButton testID={testIds.advancement.examSaveButton} variant="primary" disabled={!valid || pending} onPress={() => onSubmit({ examName: name.trim(), score: n, examFormat, clientToken: token })} style={{ flex: 1 }}>{pending ? '保存中…' : '保存'}</AdminButton>
      </ModalActions>
    </AdminModal>
  );
}

// ── 标记考试豁免弹窗(代行记录 action_type=exempt/target_kind=exam·决策121)────
// 豁免视为通过(PM 2026-07-12),但必须填写原因标注具体豁免的是哪一项(如"满60岁免考")。
function ExemptModal({ visible, onClose, onSubmit, pending }: {
  visible: boolean; onClose: () => void; onSubmit: (reason: string, clientToken: string) => void; pending: boolean;
}) {
  const [reason, setReason] = useState('');
  const [token, setToken] = useState('');
  useEffect(() => { if (visible) { setReason(''); setToken(genClientToken()); } }, [visible]);
  const valid = reason.trim().length > 0;
  return (
    <AdminModal visible={visible} onClose={onClose} title="标记考试豁免" dismissOnOverlay={false}>
      <Text style={styles.modalDesc}>豁免后该学员④考试成绩维度视为通过,留痕(代行记录,双方可见)。</Text>
      <ModalField label="豁免原因 *(如:满60岁免考)" value={reason} onChangeText={setReason} placeholder="请说明具体豁免依据" multiline />
      <ModalActions>
        <AdminButton variant="negative" onPress={onClose} style={{ flex: 1 }}>取消</AdminButton>
        <AdminButton variant="primary" disabled={!valid || pending} onPress={() => onSubmit(reason.trim(), token)} style={{ flex: 1 }}>{pending ? '保存中…' : '确认豁免'}</AdminButton>
      </ModalActions>
    </AdminModal>
  );
}

export default function StudentAdvancement() {
  const { studentId } = useLocalSearchParams<{ studentId: string }>();
  const router = useRouter();
  const { setTitle } = useAdminLayout();
  const { data: me } = useCurrentUser();
  const { data: s, isLoading, isError } = useStudentAdvancement(studentId);
  const { data: practiceItems } = useProgramPracticeCompletion(s?.userId, s?.programId);
  const record = useRecordAdvancement();
  const recordExam = useRecordExamGrade();
  const recordExempt = useRecordProxyAction();
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [examOpen, setExamOpen] = useState(false);
  const [exemptOpen, setExemptOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { setTitle((s?.name ?? '学员') + ' · 升学评定'); }, [setTitle, s?.name]);

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color={SAFFRON} /></View>;
  }
  if (isError) {
    return (
      <SafeAreaView style={styles.root} edges={['bottom']}>
        <DetailHeader title="升学评定" onBack={() => router.back()} backLabel="报数升学" />
        <View style={{ padding: 24 }}><EmptyState>加载失败,请检查网络后重试(不代表该学员不存在)</EmptyState></View>
      </SafeAreaView>
    );
  }
  if (!s) {
    return (
      <SafeAreaView style={styles.root} edges={['bottom']}>
        <DetailHeader title="升学评定" onBack={() => router.back()} backLabel="报数升学" />
        <View style={{ padding: 24 }}><EmptyState>找不到该学员</EmptyState></View>
      </SafeAreaView>
    );
  }

  const isAdmin = me?.role === 'admin';
  const canAct = isAdmin && s.cohortId != null && (s.status === 'active' || s.status === 'paused');
  const rate = attRate(s);
  const pracColor = pracColorOf(s.practiceTotal, s.practiceTarget);
  const lineageComplete = s.transmissionsRequired > 0 && s.transmissionsObtained >= s.transmissionsRequired;

  const handleConfirm = async (basis: string, clientToken: string) => {
    if (!confirmAction || !s.cohortId) return;
    setErr(null);
    try {
      await record.mutateAsync({ userId: s.userId, cohortId: s.cohortId, action: confirmAction, basis: basis || null, clientToken });
      setConfirmAction(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '操作失败,请重试');
    }
  };
  const handleExam = async (p: { examName: string; score: number; examFormat: ExamFormat; clientToken: string }) => {
    setErr(null);
    try {
      await recordExam.mutateAsync({ userId: s.userId, programId: s.programId, cohortId: s.cohortId, ...p });
      setExamOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '录入失败,请重试');
    }
  };
  const handleExempt = async (reason: string, clientToken: string) => {
    setErr(null);
    try {
      await recordExempt.mutateAsync({ userId: s.userId, actionType: 'exempt', targetKind: 'exam', reason, clientToken });
      setExemptOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '标记豁免失败,请重试');
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <DetailHeader title={s.name + ' · 升学评定'} onBack={() => router.back()} backLabel="报数升学" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        <SectionCard>
          <View style={styles.profileHeader}>
            <Avatar name={s.name} size={52} />
            <View style={{ flex: 1 }}>
              <Text className="font-serif" style={styles.studentName}>{s.name}{s.dharmaName ? `(${s.dharmaName})` : ''}</Text>
              <Text style={styles.cohortText}>{s.cohortName}{s.programName ? ` · ${s.programName}` : ''} · 第{s.semester}学期 · {s.memberRole === 'formal' ? '正式' : '旁听'}</Text>
              <Text style={styles.joinedText}>{s.studentId ? `学号 ${s.studentId} · ` : ''}{s.joinedAt ? `入班 ${s.joinedAt.slice(0, 10)}` : ''}</Text>
            </View>
            <Badge tone={STATUS_TONE[s.status]} style={styles.statusBadgeLarge}>{STATUS_LABEL[s.status]}</Badge>
          </View>
          {s.heldBackCount > 0 && <Badge tone="saffron">已留级 {s.heldBackCount} 次</Badge>}
        </SectionCard>

        <View style={styles.sectionHeader}>
          <Text className="font-serif" style={styles.sectionTitle}>升学五维评定数据</Text>
          <Text style={styles.sectionNote}>仅供参考,教学部人工评定</Text>
        </View>

        {/* ① 传承圆满 */}
        <DimCard num="①" title="传承圆满" warning={s.transmissionsRequired > 0 && !lineageComplete}>
          <View style={styles.dimBody}>
            {s.transmissionsRequired > 0 ? (
              <>
                <View style={styles.dimStatRow}>
                  <Text style={[styles.dimBigVal, { color: lineageComplete ? SAGE_DARK : SAFFRON_DARK }]}>{s.transmissionsObtained}/{s.transmissionsRequired}</Text>
                  <Text style={styles.dimUnit}>项传承</Text>
                </View>
                <ProgressBar value={s.transmissionsObtained} max={s.transmissionsRequired} color={lineageComplete ? SAGE_DARK : SAFFRON_DARK} />
              </>
            ) : (
              <Text style={styles.dimNote}>本专业暂未配置传承要求(待 v1.5 / 教务录入)。</Text>
            )}
          </View>
        </DimCard>

        {/* ② 共修出勤 */}
        <DimCard num="②" title="共修出勤率">
          <View style={styles.dimBody}>
            <View style={styles.dimStatRow}>
              <Text style={[styles.dimBigVal, { color: INK }]}>{rate}%</Text>
              <Text style={styles.dimUnit}>{s.attendCount}/{s.attendCount + s.absentCount} 场</Text>
            </View>
            <ProgressBar value={rate} max={100} color={INK3} />
            {s.attendCount + s.absentCount === 0 ? <Text style={styles.dimNote}>暂无共修出勤记录。</Text> : null}
          </View>
        </DimCard>

        {/* ③ 修量(报数)*/}
        <DimCard num="③" title="修量(报数)" warning={s.practiceTarget > 0 && s.practiceTotal < s.practiceTarget} badge={<Badge tone="gold" style={styles.hardBadge}>升学硬依据</Badge>}>
          <View style={styles.dimBody}>
            <View style={styles.dimStatRow}>
              <Text style={[styles.dimBigVal, { color: pracColor }]}>{s.practiceTotal.toLocaleString()}</Text>
              {s.practiceTarget > 0 ? <Text style={styles.dimUnit}>/ {s.practiceTarget.toLocaleString()}</Text> : <Text style={styles.dimUnit}>(无限时目标)</Text>}
            </View>
            {s.practiceTarget > 0 ? <ProgressBar value={s.practiceTotal} max={s.practiceTarget} color={pracColor} /> : null}
            {s.vows.length > 0 ? (
              <View style={styles.vowList}>
                {s.vows.map((v, i) => (
                  <Text key={i} style={styles.vowItem}>· {v.practiceName} {v.current.toLocaleString()}{v.target ? `/${v.target.toLocaleString()}` : ''} {v.unit}{v.endDate ? ` · 截止 ${v.endDate.slice(0, 10)}` : ''}</Text>
                ))}
              </View>
            ) : <Text style={styles.dimNote}>暂无升学必修功课(可到「功课配置」发放)。</Text>}
            {practiceItems && practiceItems.length > 0 && (
              <View style={styles.vowList}>
                <Text style={styles.templateListTitle}>
                  该专业配置功课圆满度(含未发放·{practiceItems.filter((i) => i.isComplete).length}/{practiceItems.length})
                </Text>
                {practiceItems.map((it) => (
                  <Text key={it.templateId} style={[styles.vowItem, { color: it.isComplete ? SAGE_DARK : SAFFRON_DARK }]}>
                    {it.isComplete ? '✓' : '○'} {it.practiceName}({it.templateName}) {it.currentCount.toLocaleString()}/{it.targetCount.toLocaleString()} {it.unit}
                  </Text>
                ))}
              </View>
            )}
          </View>
        </DimCard>

        {/* ④ 考试成绩 */}
        <DimCard num="④" title="考试成绩" warning={!s.examExempt && s.examScore === null}>
          <View style={styles.dimBody}>
            {s.examExempt ? (
              <View style={styles.dimStatRow}>
                <Text style={[styles.dimBigVal, { color: SAGE_DARK, fontSize: 18 }]}>已豁免</Text>
              </View>
            ) : s.examScore !== null ? (
              <View style={styles.dimStatRow}>
                <Text style={[styles.dimBigVal, { color: s.examIsPass ? SAGE_DARK : SAFFRON_DARK }]}>{s.examScore}</Text>
                <Text style={styles.dimUnit}>分 · 已通过 {s.examsPassed} 门</Text>
              </View>
            ) : (
              <Text style={[styles.dimNote, { color: SAFFRON_DARK }]}>成绩尚未录入(线下考试 + 后台录入)。</Text>
            )}
            {s.examExempt && <Text style={styles.dimNote}>豁免原因:{s.examExemptReason}</Text>}
            {isAdmin && (
              <View style={styles.inlineActionRow}>
                <AdminButton testID={testIds.advancement.examEntryButton} variant="secondary" size="sm" style={styles.inlineActionBtn} onPress={() => setExamOpen(true)}>
                  {s.examScore !== null ? '再录一次' : '录入成绩'}
                </AdminButton>
                {!s.examExempt && (
                  <AdminButton variant="secondary" size="sm" style={styles.inlineActionBtn} onPress={() => setExemptOpen(true)}>
                    标记豁免
                  </AdminButton>
                )}
              </View>
            )}
          </View>
        </DimCard>

        {/* ⑤ 发心评价 */}
        <DimCard num="⑤" title="发心评价">
          <View style={styles.dimBody}>
            <Text style={styles.dimNote}>主观维度,教学部人工评定(决策124:不入系统量化)。在下方判定时填入「判定依据」留痕。</Text>
          </View>
        </DimCard>

        {err ? <Text style={styles.errText}>{err}</Text> : null}

        {canAct && (
          <View style={styles.actionSection}>
            <Text className="font-serif" style={styles.actionTitle}>判定操作</Text>
            <Text style={styles.actionNote}>由 admin 执行并留痕(advancement_records),操作前请与教学部确认。</Text>
            <View style={styles.actionBtns}>
              <AdminButton testID={testIds.advancement.graduateButton} variant="confirm" onPress={() => setConfirmAction('graduate')} style={styles.actionBtnGraduate}>标记毕业</AdminButton>
              <AdminButton testID={testIds.advancement.holdBackButton} variant="danger" onPress={() => setConfirmAction('held_back')} style={styles.actionBtnFlex1}>留级</AdminButton>
              <AdminButton testID={testIds.advancement.leaveButton} variant="negative" onPress={() => setConfirmAction('left')} style={styles.actionBtnFlex1}>离班</AdminButton>
            </View>
          </View>
        )}
        {!isAdmin && (s.status === 'active' || s.status === 'paused') && (
          <View style={styles.noActionNote}><Text style={styles.noActionNoteText}>升学/留级/毕业判定由 admin(教学部)操作。</Text></View>
        )}
        {isAdmin && !canAct && s.cohortId == null && (
          <View style={styles.noActionNote}><Text style={styles.noActionNoteText}>该学员无班级归属,暂不可判定。</Text></View>
        )}

      </ScrollView>

      <ActionModal action={confirmAction} s={s} onConfirm={handleConfirm} onCancel={() => setConfirmAction(null)} pending={record.isPending} />
      <ExamModal visible={examOpen} onClose={() => setExamOpen(false)} onSubmit={handleExam} pending={recordExam.isPending} />
      <ExemptModal visible={exemptOpen} onClose={() => setExemptOpen(false)} onSubmit={handleExempt} pending={recordExempt.isPending} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SCREEN_BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: SCREEN_BG },
  scroll: { padding: 20, gap: 14, paddingBottom: 40 },

  profileHeader: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  studentName: { fontSize: 20, fontWeight: '700', color: INK },
  cohortText: { fontSize: 12, color: INK3, marginTop: 2 },
  joinedText: { fontSize: 11, color: INK4, marginTop: 2 },
  statusBadgeLarge: { paddingHorizontal: 12, paddingVertical: 5 },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: INK },
  sectionNote: { fontSize: 11, color: INK4 },

  dimCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 10, borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)' },
  dimCardWarning: { borderColor: SAFFRON + '44', borderWidth: 1.5 },
  dimHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dimNum: { width: 28, height: 28, borderRadius: 8, backgroundColor: GOLD_PALE, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: GOLD + '33' },
  dimNumWarning: { backgroundColor: SAFFRON_LIGHT, borderColor: SAFFRON + '44' },
  dimNumText: { fontSize: 12, fontWeight: '700', color: GOLD },
  dimTitle: { fontSize: 14, fontWeight: '600', color: INK, flex: 1 },
  hardBadge: {},
  dimBody: { marginLeft: 38, gap: 8 },
  dimStatRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  dimBigVal: { fontSize: 28, fontWeight: '700' },
  dimUnit: { fontSize: 13, color: INK3 },
  progressTrack: { height: 8, backgroundColor: 'rgba(43,34,24,0.08)', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  dimNote: { fontSize: 12, color: INK3, lineHeight: 18 },
  vowList: { gap: 3, marginTop: 2 },
  vowItem: { fontSize: 12, color: INK2, lineHeight: 18 },
  templateListTitle: { fontSize: 11, color: INK4, fontWeight: '600', marginTop: 8, marginBottom: 2 },
  inlineActionRow: { flexDirection: 'row', gap: 8 },
  inlineActionBtn: { alignSelf: 'flex-start' },

  errText: { fontSize: 13, color: '#a13c2e', fontWeight: '600', textAlign: 'center' },

  actionSection: { backgroundColor: '#fff', borderRadius: 16, padding: 18, gap: 12, borderWidth: 1.5, borderColor: GOLD + '44' },
  actionTitle: { fontSize: 15, fontWeight: '700', color: INK },
  actionNote: { fontSize: 12, color: INK3, lineHeight: 18 },
  actionBtns: { flexDirection: 'row', gap: 10 },
  actionBtnGraduate: { flex: 2 },
  actionBtnFlex1: { flex: 1 },

  noActionNote: { backgroundColor: GOLD_PALE, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: GOLD + '33' },
  noActionNoteText: { fontSize: 12, color: INK2 },

  modalDesc: { fontSize: 13, color: INK2, lineHeight: 20 },
  modalDimSummary: { backgroundColor: SCREEN_BG, borderRadius: 12, padding: 14, gap: 0 },
  modalDimRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderColor: 'rgba(43,34,24,0.06)' },
  modalDimLabel: { fontSize: 13, color: INK2 },
  modalDimVal: { fontSize: 13, fontWeight: '700' },
});
