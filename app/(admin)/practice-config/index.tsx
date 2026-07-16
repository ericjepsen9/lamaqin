import { Plus, Repeat2 } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AdminButton, AdminModal, Badge, EmptyState, ModalActions, ModalField, ModalFootnote, SCREEN_BG, ErrorState } from '@/components/ui/admin-kit';
import { Text } from '@/components/ui/text';
import { confirmAsync } from '@/lib/dialog';
import { useAdminCohorts } from '@/lib/queries/classes';
import {
  useCohortBindings,
  usePracticesMaster,
  usePracticeTemplates,
  useTemplateBindCounts,
  type PracticeTemplate,
  type TargetPeriod,
} from '@/lib/queries/practice-config';
import { useAddOptionalPractice, useRemoveOptionalPractice } from '@/lib/mutations/optional-practices';
import { useOptionalPracticesByProgram } from '@/lib/queries/optional-practices';
import { useAdminPrograms } from '@/lib/queries/scheduling';
import {
  useBindTemplate,
  useCreateTemplate,
  useProvisionCohortVows,
  useToggleTemplateActive,
  useUnbindTemplate,
  useUpdateTemplate,
  type TemplateInput,
} from '@/lib/mutations/practice-config';
import { useAddRequiredTransmission, useCreateTransmission, useRemoveRequiredTransmission } from '@/lib/mutations/proxy';
import { useRequiredTransmissionsByProgram, useTransmissions } from '@/lib/queries/admin/proxy';
import { testIds } from '@/lib/testids';
import { INK, INK2, INK3, INK4, SAFFRON, SAFFRON_DARK } from '@/lib/theme';
import { genClientToken } from '@/lib/utils';
import { useAdminLayout } from '../_layout';

const PERIODS: { key: TargetPeriod; label: string; hint: string }[] = [
  { key: 'until_complete', label: '限时完成', hint: '有总数,在期限内修完(内加行各修法)' },
  { key: 'lifetime', label: '终生', hint: '无终点(净土念佛等)' },
  { key: 'daily', label: '每日', hint: '每天固定数,无总数终点' },
  { key: 'weekly', label: '每周', hint: '每周固定数' },
];
const PERIOD_LABEL: Record<TargetPeriod, string> = { until_complete: '限时完成', lifetime: '终生', daily: '每日', weekly: '每周', event: '法会' };

// 数字输入:空→null,非法→null
function toNum(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t.replace(/,/g, ''));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}
function numStr(n: number | null | undefined): string {
  return n == null ? '' : String(n);
}

// ════════════════ 建/改任务模板弹窗 ════════════════
function TemplateFormModal({ initial, defaultProgramId, onClose, onSaved }: {
  initial: PracticeTemplate | 'new' | null;
  defaultProgramId: string | null;   // 新建时默认挂到当前所选专业(program 为根·决策012)
  onClose: () => void;
  onSaved: () => void;
}) {
  const visible = initial !== null;
  const editingTpl = initial !== null && initial !== 'new' ? initial : null;
  const { data: practices = [] } = usePracticesMaster();
  const { data: programs = [] } = useAdminPrograms();
  const create = useCreateTemplate();
  const update = useUpdateTemplate();

  const [practiceId, setPracticeId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [targetCount, setTargetCount] = useState('');
  const [period, setPeriod] = useState<TargetPeriod>('until_complete');
  const [dailyTarget, setDailyTarget] = useState('');
  const [weeklyTarget, setWeeklyTarget] = useState('');
  const [offsetDays, setOffsetDays] = useState('');
  const [durationDays, setDurationDays] = useState('');
  const [progIds, setProgIds] = useState<string[]>([]);
  const [timeLimited, setTimeLimited] = useState(false);
  const [minSessionMinutes, setMinSessionMinutes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [token, setToken] = useState(() => genClientToken());

  useEffect(() => {
    if (!visible) return;
    setToken(genClientToken());
    if (editingTpl) {
      setPracticeId(editingTpl.practiceId);
      setName(editingTpl.templateName);
      setTargetCount(numStr(editingTpl.targetCount));
      setPeriod(editingTpl.targetPeriod === 'event' ? 'until_complete' : editingTpl.targetPeriod);
      setDailyTarget(numStr(editingTpl.dailyTarget));
      setWeeklyTarget(numStr(editingTpl.weeklyTarget));
      setOffsetDays(numStr(editingTpl.startsOffsetDays));
      setDurationDays(numStr(editingTpl.durationDays));
      setProgIds(editingTpl.appliesToPrograms ?? []);
      setTimeLimited(editingTpl.isTimeLimited);
      setMinSessionMinutes(numStr(editingTpl.defaultMinSessionMinutes));
    } else {
      setPracticeId(null); setName(''); setTargetCount(''); setPeriod('until_complete');
      setDailyTarget(''); setWeeklyTarget(''); setOffsetDays(''); setDurationDays('');
      setProgIds(defaultProgramId ? [defaultProgramId] : []); setTimeLimited(false);
      setMinSessionMinutes('');
    }
    setErr(null);
  }, [visible, editingTpl, defaultProgramId]);

  const pending = create.isPending || update.isPending;
  const minSessionRaw = toNum(minSessionMinutes);
  const minSessionValid = minSessionMinutes.trim() === '' || (minSessionRaw != null && minSessionRaw >= 30);
  const canSubmit = !!practiceId && name.trim().length > 0 &&
    (period !== 'daily' || toNum(dailyTarget) != null) &&
    (period !== 'weekly' || toNum(weeklyTarget) != null) &&
    minSessionValid &&
    !pending;

  const submit = async () => {
    if (!canSubmit || !practiceId) return;
    setErr(null);
    const payload: TemplateInput = {
      practiceId,
      templateName: name,
      description: null,
      targetCount: toNum(targetCount),
      targetPeriod: period,
      dailyTarget: toNum(dailyTarget),
      weeklyTarget: period === 'weekly' ? toNum(weeklyTarget) : null,
      startsOffsetDays: toNum(offsetDays),
      durationDays: toNum(durationDays),
      appliesToPrograms: progIds.length > 0 ? progIds : null,
      isTimeLimited: timeLimited,
      defaultMinSessionMinutes: minSessionMinutes.trim() === '' ? null : minSessionRaw,
      clientToken: token,
    };
    try {
      if (editingTpl) await update.mutateAsync({ ...payload, id: editingTpl.id });
      else await create.mutateAsync(payload);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '保存失败,请重试');
    }
  };

  const unit = practices.find((p) => p.id === practiceId)?.unit ?? '遍';

  return (
    <AdminModal visible={visible} onClose={onClose} title={editingTpl ? '编辑任务模板' : '新建任务模板'} maxWidth={520} dismissOnOverlay={false}>
      <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ gap: 14 }} showsVerticalScrollIndicator={false}>
        {/* 修法 */}
        <View style={{ gap: 6 }}>
          <Text style={s.label}>修法 *</Text>
          <View style={s.chipWrap}>
            {practices.map((p) => {
              const on = p.id === practiceId;
              return (
                <Pressable key={p.id} testID={testIds.practiceConfig.practiceChip(p.id)} onPress={() => setPracticeId(p.id)} style={[s.chip, on && s.chipOn]}>
                  <Text style={[s.chipText, on && s.chipTextOn]}>{p.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <ModalField testID={testIds.practiceConfig.nameInput} label="模板名称 *" value={name} onChangeText={setName} placeholder="如:金刚萨埵 40万 · 标准" />

        {/* 周期 */}
        <View style={{ gap: 6 }}>
          <Text style={s.label}>周期类型 *</Text>
          <View style={s.chipWrap}>
            {PERIODS.map((p) => {
              const on = p.key === period;
              return (
                <Pressable key={p.key} onPress={() => setPeriod(p.key)} style={[s.chip, on && s.chipOn]}>
                  <Text style={[s.chipText, on && s.chipTextOn]}>{p.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={s.hint}>{PERIODS.find((p) => p.key === period)?.hint}</Text>
        </View>

        {/* 限时愿(内加行):梯次起修 + 建班年限窗口 + 仅 admin 延期(决策073/086)*/}
        <View style={{ gap: 6 }}>
          <Text style={s.label}>是否限时愿</Text>
          <View style={s.chipWrap}>
            <Pressable onPress={() => setTimeLimited(false)} style={[s.chip, !timeLimited && s.chipOn]}>
              <Text style={[s.chipText, !timeLimited && s.chipTextOn]}>普通愿</Text>
            </Pressable>
            <Pressable onPress={() => setTimeLimited(true)} style={[s.chip, timeLimited && s.chipOn]}>
              <Text style={[s.chipText, timeLimited && s.chipTextOn]}>限时愿(内加行)</Text>
            </Pressable>
          </View>
          <Text style={s.hint}>
            {timeLimited
              ? '限时:起修=开班日+起修偏移(梯次);截止=起修+建班年限(默认4年);仅管理员可延期、过期锁定补录。'
              : '普通:起修=入班当天;按目标/每日修,不受年限窗口约束。'}
          </Text>
        </View>

        <ModalField label={`目标总数(${unit})`} value={targetCount} onChangeText={setTargetCount} placeholder="如:400000(40万)。终生/每日可留空" keyboardType="numeric" />
        <ModalField label={`每日目标(${unit})${period === 'daily' ? ' *' : ''}`} value={dailyTarget} onChangeText={setDailyTarget} placeholder="如:1000(每天念诵数)" keyboardType="numeric" />
        {period === 'weekly' ? (
          <ModalField label={`每周目标(${unit}) *`} value={weeklyTarget} onChangeText={setWeeklyTarget} placeholder="每周固定数" keyboardType="numeric" />
        ) : null}

        {/* 座次门槛(波C双层方案·2026-07-08):新发的愿继承此值;改已发的单条愿另在学员详情页(仅admin) */}
        <View style={{ gap: 6 }}>
          <ModalField label="每座门槛(分钟)" value={minSessionMinutes} onChangeText={setMinSessionMinutes} placeholder="留空=沿用默认30分钟;填则≥30(大纲行105底线)" keyboardType="numeric" />
          {!minSessionValid ? <Text style={s.err}>门槛不能低于 30 分钟(大纲底线,需教务点头才可放开)</Text> : null}
          <Text style={s.hint}>只影响新发的愿;已发出的愿门槛不受影响,如需单独调整去学员详情页(仅系统管理员)。</Text>
        </View>

        <ModalField label="起修偏移(天)" value={offsetDays} onChangeText={setOffsetDays} placeholder="距开班日多少天起修;第2学期≈196,留空=开班即起" keyboardType="numeric" />
        <ModalField label="完成天数(天)" value={durationDays} onChangeText={setDurationDays} placeholder="起修后多少天内完成;留空=不限期(限时完成需填)" keyboardType="numeric" />

        {/* 适用专业(可多选;空=不限)*/}
        <View style={{ gap: 6 }}>
          <Text style={s.label}>适用专业(可多选,空=不限)</Text>
          <View style={s.chipWrap}>
            {programs.map((p) => {
              const on = progIds.includes(p.id);
              return (
                <Pressable key={p.id} testID={testIds.practiceConfig.appliesProgramChip(p.id)} onPress={() => setProgIds((cur) => on ? cur.filter((x) => x !== p.id) : [...cur, p.id])} style={[s.chip, on && s.chipOn]}>
                  <Text style={[s.chipText, on && s.chipTextOn]}>{p.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {err ? <Text style={s.err}>{err}</Text> : null}
      </ScrollView>

      <ModalActions>
        <AdminButton variant="negative" style={{ flex: 1 }} onPress={onClose}>取消</AdminButton>
        <AdminButton testID={testIds.practiceConfig.submitButton} variant="primary" style={{ flex: 1 }} disabled={!canSubmit} onPress={submit}>
          {pending ? '保存中…' : '保存'}
        </AdminButton>
      </ModalActions>
      <ModalFootnote>模板存「修什么、修多少、什么时候起、限哪个专业」。绑定到班级后,可在「班级绑定」发放为班级愿。</ModalFootnote>
    </AdminModal>
  );
}

// ════════════════ 模板卡片 ════════════════
function TemplateCard({ tpl, programNames, bindCount, onEdit, onToggle, toggling }: {
  tpl: PracticeTemplate;
  programNames: string;
  bindCount: number;
  onEdit: () => void;
  onToggle: () => void;
  toggling: boolean;
}) {
  return (
    <View style={[s.card, !tpl.isActive && s.cardInactive]}>
      <View style={s.cardTop}>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text className="font-serif" style={s.cardTitle}>{tpl.templateName}</Text>
            <Badge tone="saffron">{tpl.practiceName}</Badge>
            {tpl.isTimeLimited ? <Badge tone="crimson">限时</Badge> : null}
            {!tpl.isActive ? <Badge tone="neutral">已停用</Badge> : null}
          </View>
          <Text style={s.cardMeta}>
            {tpl.targetCount != null ? `目标 ${tpl.targetCount.toLocaleString()} ${tpl.unit} · ` : ''}
            {PERIOD_LABEL[tpl.targetPeriod]}
            {tpl.dailyTarget != null ? ` · 每日 ${tpl.dailyTarget.toLocaleString()}` : ''}
          </Text>
          <Text style={s.cardMeta2}>
            {tpl.startsOffsetDays != null ? `开班+${tpl.startsOffsetDays}天起` : '开班即起'}
            {tpl.durationDays != null ? ` · ${tpl.durationDays}天内完成` : ''}
            {` · 门槛${tpl.defaultMinSessionMinutes ?? 30}分钟`}
            {` · 适用:${programNames}`}
            {` · 已绑 ${bindCount} 班`}
          </Text>
        </View>
      </View>
      <View style={s.cardActions}>
        <AdminButton testID={testIds.practiceConfig.editButton(tpl.id)} variant="secondary" size="sm" onPress={onEdit}>编辑</AdminButton>
        <AdminButton testID={testIds.practiceConfig.toggleButton(tpl.id)} variant={tpl.isActive ? 'negative' : 'confirm'} size="sm" disabled={toggling} onPress={onToggle}>
          {tpl.isActive ? '停用' : '启用'}
        </AdminButton>
      </View>
    </View>
  );
}

// ════════════════ 按班覆盖 + 同步发放区 ════════════════
// 决策012:班级默认继承本专业功课;此处仅为「个别班例外」绑覆盖模板(逐修法覆盖专业默认)。
function CohortBindingSection({ templates, programId }: { templates: PracticeTemplate[]; programId: string | null }) {
  const { data: groups = [] } = useAdminCohorts();
  const cohorts = useMemo(
    () => (groups.find((g) => g.id === programId)?.cohorts ?? []).map((c) => ({ id: c.id, name: c.name })),
    [groups, programId],
  );
  const [cohortId, setCohortId] = useState<string | null>(null);
  const { data: bindings = [] } = useCohortBindings(cohortId ?? undefined);
  const bind = useBindTemplate();
  const unbind = useUnbindTemplate();
  const provision = useProvisionCohortVows();
  const [provMsg, setProvMsg] = useState<string | null>(null);
  const boundIds = useMemo(() => new Set(bindings.map((b) => b.templateId)), [bindings]);
  // 覆盖候选 = 本专业的 active 模板(可选别的模板替换某修法的默认)
  const candidates = useMemo(
    () => templates.filter((t) => t.isActive && programId && (t.appliesToPrograms ?? []).includes(programId)),
    [templates, programId],
  );

  // 切换班级时清掉上一班的提示
  useEffect(() => { setProvMsg(null); }, [cohortId]);
  // 切专业时重置选中的班(避免选了别专业的班)
  useEffect(() => { setCohortId(null); }, [programId]);

  const doProvision = async () => {
    if (!cohortId) return;
    setProvMsg(null);
    try {
      const n = await provision.mutateAsync({ cohortId });
      setProvMsg(n > 0 ? `已补发 ${n} 条新愿(已有的不重复)。` : '全班已是最新,没有要补发的愿。');
    } catch (e) {
      setProvMsg(e instanceof Error ? `发放失败:${e.message}` : '发放失败,请重试');
    }
  };

  return (
    <View style={{ gap: 12 }}>
      <View style={s.sectionHead}>
        <Text className="font-serif" style={s.sectionTitle}>按班覆盖 / 补发</Text>
        <Text style={s.sectionNote}>默认已自动继承上方功课,此处仅个别班例外</Text>
      </View>

      {cohorts.length === 0 ? (
        <EmptyState>本专业暂无班级。到「班级管理」建班后,学员入班会自动按上方功课发愿。</EmptyState>
      ) : (
        <View style={s.chipWrap}>
          {cohorts.map((c) => {
            const on = c.id === cohortId;
            return (
              <Pressable key={c.id} testID={testIds.practiceConfig.cohortChip(c.id)} onPress={() => setCohortId(c.id)} style={[s.chip, on && s.chipOn]}>
                <Text style={[s.chipText, on && s.chipTextOn]}>{c.name}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {cohortId ? (
        <>
          <Text style={s.overHint}>
            勾选 = 本班该修法用此模板覆盖专业默认;不勾的修法仍按专业默认。改完点下方「同步发放」对全班生效。
          </Text>
          {candidates.length === 0 ? (
            <EmptyState>本专业还没有功课模板可作覆盖。</EmptyState>
          ) : (
            <View style={s.bindList}>
              {candidates.map((t, i) => {
                const bound = boundIds.has(t.id);
                const busy = (bind.isPending || unbind.isPending);
                return (
                  <View key={t.id} style={[s.bindRow, i > 0 && s.bindRowBorder]}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.bindName}>{t.templateName}</Text>
                      <Text style={s.bindSub}>{t.practiceName}{t.targetCount != null ? ` · ${t.targetCount.toLocaleString()}${t.unit}` : ''}</Text>
                    </View>
                    <Pressable
                      testID={testIds.practiceConfig.bindToggleButton(t.id)}
                      disabled={busy}
                      onPress={async () => {
                        if (bound) {
                          if (!(await confirmAsync('取消该班的功课覆盖?', '该班回落到专业默认功课;已发放的愿不回收。', '取消覆盖'))) return;
                          unbind.mutate({ cohortId, templateId: t.id });
                        } else bind.mutate({ cohortId, templateId: t.id });
                      }}
                      style={[s.bindBtn, bound ? s.bindBtnOn : s.bindBtnOff]}
                    >
                      <Text style={[s.bindBtnText, bound ? s.bindBtnTextOn : s.bindBtnTextOff]}>{bound ? '✓ 覆盖中' : '＋ 覆盖'}</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}

          {/* 同步发放:把(专业默认∪本班覆盖)实例化给全班 active 学员;幂等补差额 */}
          <View style={s.provBox}>
            <AdminButton testID={testIds.practiceConfig.provisionButton} variant="primary" disabled={provision.isPending} onPress={doProvision}>
              {provision.isPending ? '同步中…' : '同步发放给全班'}
            </AdminButton>
            <Text style={s.provHint}>
              加学员时已自动发愿;此按钮用于改了功课后给全班补发(已有的不重复)。
            </Text>
            {provMsg ? <Text style={s.provMsg}>{provMsg}</Text> : null}
          </View>
        </>
      ) : null}
    </View>
  );
}

// ════════════════ 自选经/抄经/拜经候选清单管理(PD-20·决策052·2026-07-08波C)════════════════
// admin 在此专业下勾选哪些修法进入"自选经"候选清单;师兄端只能从这里勾过的清单选,不能自由输入。
function OptionalPracticesSection({ programId, programName }: { programId: string | null; programName: string }) {
  const { data: candidates = [] } = usePracticesMaster();
  const { data: optional = [] } = useOptionalPracticesByProgram(programId ?? undefined);
  const add = useAddOptionalPractice();
  const remove = useRemoveOptionalPractice();
  const optionalIds = useMemo(() => new Set(optional.map((o) => o.practiceId)), [optional]);
  const busy = add.isPending || remove.isPending;

  if (!programId) return null;

  return (
    <View style={{ gap: 12 }}>
      <View style={s.sectionHead}>
        <Text className="font-serif" style={s.sectionTitle}>自选经/抄经/拜经候选清单</Text>
        <Text style={s.sectionNote}>{optional.length} 项</Text>
      </View>
      <Text style={s.overHint}>
        勾选 = 该修法进入「{programName}」的自选经候选清单;师兄加自选功课时只能从这里选,不能自由输入(决策052)。
      </Text>
      {candidates.length === 0 ? (
        <EmptyState>暂无修法可选,先在上方「新建任务」的修法库里补齐。</EmptyState>
      ) : (
        <View style={s.chipWrap}>
          {candidates.map((p) => {
            const on = optionalIds.has(p.id);
            return (
              <Pressable
                key={p.id}
                testID={testIds.practiceConfig.optionalPracticeChip(p.id)}
                disabled={busy}
                onPress={() => {
                  if (on) remove.mutate({ programId, practiceId: p.id });
                  else add.mutate({ programId, practiceId: p.id });
                }}
                style={[s.chip, on && s.chipOn]}
              >
                <Text style={[s.chipText, on && s.chipTextOn]}>{on ? '✓ ' : ''}{p.name}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ════════════════ 新增传承(记事本条目,决策124主清单;仅新增不改删,理由见 mutations 注释)════════════════
function CreateTransmissionModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [sourceKind, setSourceKind] = useState<'course' | 'assembly'>('course');
  const [description, setDescription] = useState('');
  const create = useCreateTransmission();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (visible) { setName(''); setSourceKind('course'); setDescription(''); setErr(null); }
  }, [visible]);

  const submit = async () => {
    if (!name.trim() || create.isPending) return;
    setErr(null);
    try {
      await create.mutateAsync({ name: name.trim(), sourceKind, description: description.trim() || null });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '新增失败,请重试');
    }
  };

  return (
    <AdminModal visible={visible} onClose={onClose} title="新增传承" maxWidth={440} dismissOnOverlay={false}>
      <View style={{ gap: 14 }}>
        <ModalField testID={testIds.practiceConfig.transmissionNameInput} label="传承名称 *" value={name} onChangeText={setName} placeholder="如:入行论传承" />
        <View style={{ gap: 6 }}>
          <Text style={s.label}>来源</Text>
          <View style={s.chipWrap}>
            <Pressable onPress={() => setSourceKind('course')} style={[s.chip, sourceKind === 'course' && s.chipOn]}>
              <Text style={[s.chipText, sourceKind === 'course' && s.chipTextOn]}>随课程听闻</Text>
            </Pressable>
            <Pressable onPress={() => setSourceKind('assembly')} style={[s.chip, sourceKind === 'assembly' && s.chipOn]}>
              <Text style={[s.chipText, sourceKind === 'assembly' && s.chipTextOn]}>法会</Text>
            </Pressable>
          </View>
        </View>
        <ModalField label="备注(选填)" value={description} onChangeText={setDescription} placeholder="补充说明" multiline />
        {err ? <Text style={s.err}>{err}</Text> : null}
      </View>
      <ModalActions>
        <AdminButton variant="negative" style={{ flex: 1 }} onPress={onClose}>取消</AdminButton>
        <AdminButton testID={testIds.practiceConfig.transmissionSaveButton} variant="primary" style={{ flex: 1 }} disabled={!name.trim() || create.isPending} onPress={submit}>
          {create.isPending ? '保存中…' : '保存'}
        </AdminButton>
      </ModalActions>
      <ModalFootnote>传承本身是记事本性质的主清单(名称+来源),这里只做新增;如需改名/删除找系统管理员直接改库。</ModalFootnote>
    </AdminModal>
  );
}

// ════════════════ 专业必需传承清单(决策124·管理端配置入口·2026-07-12)════════════════
// 纯人工审核参考(升学评定页会显示"已获得/要求"两个数),不 auto-gate(守017/124)。
// 传承/灌顶只是记事本式记录用户获得了哪种(PM 2026-07-12),这里配的是"哪个专业列入审核参考清单"。
function RequiredTransmissionsSection({ programId, programName }: { programId: string | null; programName: string }) {
  const { data: options = [] } = useTransmissions();
  const { data: required = [] } = useRequiredTransmissionsByProgram(programId ?? undefined);
  const add = useAddRequiredTransmission();
  const remove = useRemoveRequiredTransmission();
  const [creating, setCreating] = useState(false);
  const requiredIds = useMemo(() => new Set(required), [required]);
  const busy = add.isPending || remove.isPending;

  if (!programId) return null;

  return (
    <View style={{ gap: 12 }}>
      <View style={s.sectionHead}>
        <Text className="font-serif" style={s.sectionTitle}>传承要求清单</Text>
        <AdminButton testID={testIds.practiceConfig.newTransmissionButton} variant="secondary" size="sm" onPress={() => setCreating(true)}>+ 新增传承</AdminButton>
      </View>
      <Text style={s.overHint}>
        勾选 = 该传承列入「{programName}」的必需传承清单;升学评定页会显示学员"已获得/要求"对照,仅供人工参考,不自动卡升学。
      </Text>
      {options.length === 0 ? (
        <EmptyState>还没有任何传承记录,先点上方「新增传承」建一条。</EmptyState>
      ) : (
        <View style={s.chipWrap}>
          {options.map((o) => {
            const on = requiredIds.has(o.id);
            return (
              <Pressable
                key={o.id}
                testID={testIds.practiceConfig.requiredTransmissionChip(o.id)}
                disabled={busy}
                onPress={() => {
                  if (on) remove.mutate({ programId, transmissionId: o.id });
                  else add.mutate({ programId, transmissionId: o.id });
                }}
                style={[s.chip, on && s.chipOn]}
              >
                <Text style={[s.chipText, on && s.chipTextOn]}>{on ? '✓ ' : ''}{o.name}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      <CreateTransmissionModal visible={creating} onClose={() => setCreating(false)} />
    </View>
  );
}

// ════════════════ 页面 ════════════════
export default function PracticeConfigScreen() {
  const { setTitle } = useAdminLayout();
  useEffect(() => { setTitle('功课配置'); }, [setTitle]);

  const { data: templates = [], isLoading, error } = usePracticeTemplates();
  const { data: bindCounts = {}, error: bindCountsError } = useTemplateBindCounts();
  const { data: programs = [], error: programsError } = useAdminPrograms();
  const toggle = useToggleTemplateActive();
  const [editing, setEditing] = useState<PracticeTemplate | 'new' | null>(null);
  const [progId, setProgId] = useState<string | null>(null);

  // 默认选第一个专业(program 为根·决策012)
  useEffect(() => { if (!progId && programs.length > 0) setProgId(programs[0].id); }, [programs, progId]);

  const progName = useMemo(() => {
    const m = new Map(programs.map((p) => [p.id, p.name]));
    return (ids: string[] | null) => (ids && ids.length > 0 ? ids.map((id) => m.get(id) ?? '?').join('/') : '不限');
  }, [programs]);

  // 当前专业的默认功课 = applies_to_programs 含该专业的模板
  const progTemplates = useMemo(
    () => (progId ? templates.filter((t) => (t.appliesToPrograms ?? []).includes(progId)) : []),
    [templates, progId],
  );
  const curProgName = programs.find((p) => p.id === progId)?.name ?? '专业';

  return (
    <SafeAreaView style={s.root} edges={['bottom']}>
      <View style={s.actionBar}>
        <Text className="font-serif" style={s.pageTitle}>功课配置</Text>
        <AdminButton testID={testIds.practiceConfig.newTemplateButton} variant="primary" size="sm" icon={<Plus size={15} color="#fff" />} onPress={() => setEditing('new')} disabled={!progId}>新建任务</AdminButton>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.intro}>
          <Repeat2 size={16} color={SAFFRON_DARK} />
          <Text style={s.introText}>
            功课挂在「专业」上(决策012):配好本专业功课模板,该专业的班级在「加学员」时即自动发愿;改了功课用下方「同步发放」补发,个别班可「按班覆盖」。
          </Text>
        </View>

        {/* 专业选择(program 为根) */}
        <View style={{ gap: 6 }}>
          <Text style={s.label}>选择专业</Text>
          {programsError ? (
            <Text style={s.err}>专业列表加载失败,请检查网络后重试</Text>
          ) : (
            <View style={s.chipWrap}>
              {programs.map((p) => {
                const on = p.id === progId;
                return (
                  <Pressable key={p.id} testID={testIds.practiceConfig.programChip(p.id)} onPress={() => setProgId(p.id)} style={[s.chip, on && s.chipOn]}>
                    <Text style={[s.chipText, on && s.chipTextOn]}>{p.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* 本专业默认功课 */}
        <View style={s.sectionHead}>
          <Text className="font-serif" style={s.sectionTitle}>{curProgName}的默认功课</Text>
          <Text style={s.sectionNote}>{progTemplates.length} 个{bindCountsError ? ' · 绑定数加载失败' : ''}</Text>
        </View>
        {error ? <ErrorState /> : isLoading ? (
          <View style={{ paddingVertical: 30, alignItems: 'center' }}><ActivityIndicator color={SAFFRON} /></View>
        ) : progTemplates.length === 0 ? (
          <EmptyState>「{curProgName}」还没有功课。点右上「新建任务」开始(如金刚萨埵40万/每天1000)。</EmptyState>
        ) : (
          <View style={{ gap: 10 }}>
            {progTemplates.map((t) => (
              <TemplateCard
                key={t.id}
                tpl={t}
                programNames={progName(t.appliesToPrograms)}
                bindCount={bindCounts[t.id] ?? 0}
                onEdit={() => setEditing(t)}
                onToggle={async () => {
                  if (t.isActive && !(await confirmAsync(`停用「${t.templateName || t.practiceName}」?`, '停用后新入班/新自学不再按此发愿;已建的愿不受影响。', '停用'))) return;
                  toggle.mutate({ id: t.id, isActive: !t.isActive });
                }}
                toggling={toggle.isPending}
              />
            ))}
          </View>
        )}

        <View style={{ height: 8 }} />
        <CohortBindingSection templates={templates} programId={progId} />

        <View style={{ height: 8 }} />
        <OptionalPracticesSection programId={progId} programName={curProgName} />

        <View style={{ height: 8 }} />
        <RequiredTransmissionsSection programId={progId} programName={curProgName} />
      </ScrollView>

      <TemplateFormModal initial={editing} defaultProgramId={progId} onClose={() => setEditing(null)} onSaved={() => setEditing(null)} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: SCREEN_BG },
  actionBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  pageTitle: { fontSize: 20, fontWeight: '700', color: INK, letterSpacing: 1 },
  scroll: { padding: 16, gap: 14, paddingBottom: 48 },
  intro: { flexDirection: 'row', gap: 8, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(43,34,24,0.07)', padding: 12, alignItems: 'flex-start' },
  introText: { flex: 1, fontSize: 12, color: INK2, lineHeight: 18 },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: INK, letterSpacing: 1 },
  sectionNote: { fontSize: 11, color: INK4 },
  // 模板卡
  card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)', padding: 14, gap: 10 },
  cardInactive: { opacity: 0.62 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: INK },
  cardMeta: { fontSize: 12.5, color: INK2, fontWeight: '600' },
  cardMeta2: { fontSize: 11, color: INK3, lineHeight: 16 },
  cardActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  // 绑定区
  bindList: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)', overflow: 'hidden' },
  bindRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  bindRowBorder: { borderTopWidth: 1, borderTopColor: 'rgba(43,34,24,0.06)' },
  bindName: { fontSize: 14, fontWeight: '600', color: INK },
  bindSub: { fontSize: 11, color: INK3, marginTop: 2 },
  bindBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 9999 },
  bindBtnOn: { backgroundColor: SAFFRON },
  bindBtnOff: { backgroundColor: 'rgba(43,34,24,0.06)' },
  bindBtnText: { fontSize: 12.5, fontWeight: '700' },
  bindBtnTextOn: { color: '#fff' },
  bindBtnTextOff: { color: INK2 },
  // 发放愿
  provBox: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)', padding: 14, gap: 8 },
  provHint: { fontSize: 11, color: INK3, lineHeight: 16 },
  provMsg: { fontSize: 13, color: SAFFRON_DARK, fontWeight: '600' },
  overHint: { fontSize: 11, color: INK3, lineHeight: 16 },
  // 共用
  label: { fontSize: 13, color: INK2, fontWeight: '500' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9999, backgroundColor: 'rgba(43,34,24,0.05)' },
  chipOn: { backgroundColor: SAFFRON },
  chipText: { fontSize: 13, fontWeight: '600', color: INK2 },
  chipTextOn: { color: '#fff' },
  hint: { fontSize: 11, color: INK3, lineHeight: 16 },
  err: { fontSize: 13, color: '#a13c2e', fontWeight: '600' },
});
