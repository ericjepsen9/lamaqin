import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BookOpen, ChevronRight, Clock, Copy, MapPin, Users } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AdminButton,
  AdminDateField,
  AdminModal,
  AdminTimeField,
  Avatar,
  Badge,
  DetailHeader,
  Divider,
  EmptyState,
  ModalActions,
  ModalField,
  ModalFootnote,
  SCREEN_BG,
  SearchBar,
  SectionCard,
  SegmentedControl,
  type BadgeTone,
} from '@/components/ui/admin-kit';
import { Text } from '@/components/ui/text';
import { confirmAsync, notify } from '@/lib/dialog';
import {
  useAddClassMembers,
  useAppointClassAdmin,
  useRemoveClassAdmin,
  useAddRestWeek,
  useRemoveRestWeek,
  useSetCohortActive,
  useUpdateCohortSchedule,
  useUpdateMemberRole,
  useUpdateMemberStatus,
  useUpdateReminderSettings,
} from '@/lib/mutations/classes';
import {
  useActiveProfilesSearch,
  useAddableProfiles,
  useCohortAdmins,
  useCohortCurrentWeek,
  useCohortDetail,
  useCohortRestWeeks,
  useCohortRoster,
  type CohortDetail,
  type RosterMember,
} from '@/lib/queries/classes';
import { useCurrentUser } from '@/lib/queries/profile';
import { useCohortWeeklyReport } from '@/lib/queries/report';
import { formatWeeklyReportText } from '@/lib/queries/report-week-calc';
import { testIds } from '@/lib/testids';
import { INK, INK2, INK3, INK4, SAFFRON, SAFFRON_DARK } from '@/lib/theme';
import { useAdminLayout } from '../_layout';
import { bookTitle } from '@/lib/utils';

const MEMBER_STATUS_LABEL: Record<string, string> = { active: '在读', paused: '暂停', held_back: '留级', graduated: '已毕业', left: '已离' };
const MEMBER_STATUS_TONE: Record<string, BadgeTone> = { active: 'sage', paused: 'gold', held_back: 'gold', graduated: 'neutral', left: 'neutral' };

// 周几选项(null=无)。共修日程用。
const DOW_OPTS: { k: number | null; l: string }[] = [
  { k: null, l: '无' }, { k: 0, l: '日' }, { k: 1, l: '一' }, { k: 2, l: '二' }, { k: 3, l: '三' }, { k: 4, l: '四' }, { k: 5, l: '五' }, { k: 6, l: '六' },
];

// 写库失败友好提示(无权限 = 非系统管理员)。
function notifyErr(title: string, e: unknown) {
  const msg = (e as { message?: string })?.message ?? '请重试';
  const perm = /row-level security|42501|permission/i.test(msg);
  notify(title, perm ? '没有该操作权限(需系统管理员)。' : msg);
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.profileRow}>
      <Text style={styles.profileLabel}>{label}</Text>
      <Text style={styles.profileValue}>{value}</Text>
    </View>
  );
}

function DowPicker({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <View style={styles.dowRow}>
      {DOW_OPTS.map((d) => {
        const active = value === d.k;
        return (
          <Pressable key={String(d.k)} style={[styles.dowChip, active && styles.dowChipOn]} onPress={() => onChange(d.k)}>
            <Text style={[styles.dowChipText, active && styles.dowChipTextOn]}>{d.l}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── 设辅导员 / 爱心(2026-07-02 补「后台不能任命干事」缺口;写 class_admins,角色即时生效)──
function StaffModal({ cohortId, onClose }: { cohortId: string; onClose: () => void }) {
  const { data: admins = [], error: adminsError } = useCohortAdmins(cohortId);
  const [role, setRole] = useState<'zhumai' | 'aixin'>('zhumai');
  const [search, setSearch] = useState('');
  const { data: people = [], isLoading, error: searchError } = useActiveProfilesSearch(search);
  const appoint = useAppointClassAdmin();
  const remove = useRemoveClassAdmin();
  const ROLE_LABEL = { zhumai: '辅导员', aixin: '爱心' } as const;

  return (
    <AdminModal visible onClose={onClose} title="设辅导员 / 爱心" dismissOnOverlay={false}>
      {/* 现任 */}
      {adminsError ? (
        <Text style={{ fontSize: 12, color: '#a13c2e', marginBottom: 12 }}>加载失败,请检查网络后重试。</Text>
      ) : admins.length > 0 ? (
        <View style={{ gap: 6, marginBottom: 12 }}>
          {admins.map((a) => (
            <View key={`${a.userId}:${a.role}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Badge tone={a.role === 'zhumai' ? 'saffron' : 'sage'}>{ROLE_LABEL[a.role]}</Badge>
              <Text style={{ flex: 1, fontSize: 14, color: INK }}>{a.name}</Text>
              <AdminButton testID={testIds.classDetail.staffRevokeButton(a.userId, a.role)} variant="negative" size="sm" disabled={remove.isPending}
                onPress={async () => {
                  if (!(await confirmAsync(`撤销 ${a.name} 的${ROLE_LABEL[a.role]}身份?`, '撤销后其后台本班权限即时失效;可随时重新任命。', '撤销'))) return;
                  remove.mutate({ cohortId, userId: a.userId, role: a.role }, { onError: (e) => notify('撤销失败', (e as Error)?.message ?? '请重试') });
                }}>
                撤销
              </AdminButton>
            </View>
          ))}
        </View>
      ) : (
        <Text style={{ fontSize: 12, color: INK3, marginBottom: 12 }}>本班还没有辅导员 / 爱心。</Text>
      )}
      {/* 任命 */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
        {(['zhumai', 'aixin'] as const).map((r) => (
          <Pressable key={r} onPress={() => setRole(r)}
            style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 9999, backgroundColor: role === r ? SAFFRON : 'rgba(43,34,24,0.06)' }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: role === r ? '#fff' : INK2 }}>任命{ROLE_LABEL[r]}</Text>
          </Pressable>
        ))}
      </View>
      <ModalField testID={testIds.classDetail.staffSearchInput} label="搜索师兄(姓名 / 法名)" value={search} onChangeText={setSearch} placeholder="输入以搜索,可任命本班成员或任何在读师兄" />
      <View style={{ gap: 4, marginTop: 6, maxHeight: 240 }}>
        {isLoading ? <Text style={{ fontSize: 12, color: INK3 }}>搜索中…</Text> : searchError ? <Text style={{ fontSize: 12, color: '#a13c2e' }}>搜索失败,请重试。</Text> : people.map((pp) => {
          const held = admins.some((a) => a.userId === pp.id && a.role === role);
          return (
            <View key={pp.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 }}>
              <Text style={{ flex: 1, fontSize: 14, color: INK }}>{pp.name}{pp.dharmaName ? `(${pp.dharmaName})` : ''}</Text>
              <AdminButton testID={testIds.classDetail.staffAppointButton(pp.id)} variant="primary" size="sm" disabled={held || appoint.isPending}
                onPress={() => appoint.mutate({ cohortId, userId: pp.id, role }, { onError: (e) => notify('任命失败', (e as Error)?.message ?? '请重试') })}>
                {held ? '已任命' : `任命为${ROLE_LABEL[role]}`}
              </AdminButton>
            </View>
          );
        })}
      </View>
      <ModalActions>
        <AdminButton testID={testIds.classDetail.staffDoneButton} variant="primary" onPress={onClose} style={{ flex: 1 }}>完成</AdminButton>
      </ModalActions>
      <ModalFootnote>任命即时生效:该师兄登录后即进入辅导员 / 爱心视角(角色派生自本表,无需改账号)。</ModalFootnote>
    </AdminModal>
  );
}

// ── 添加学员 ─────────────────────────────────────────────────────────
function AddMembersModal({ cohortId, onClose }: { cohortId: string; onClose: () => void }) {
  const [search, setSearch] = useState('');
  const { data: people = [], isLoading, error: peopleError } = useAddableProfiles(cohortId, search);
  const add = useAddClassMembers();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [role, setRole] = useState<'auditor' | 'formal'>('auditor');

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const submit = () => {
    if (sel.size === 0) return;
    add.mutate(
      { cohortId, userIds: [...sel], memberRole: role },
      { onSuccess: () => { onClose(); notify('已添加', `${sel.size} 位师兄已加入本班(${role === 'formal' ? '正式' : '旁听'})。`); }, onError: (e) => notifyErr('添加失败', e) },
    );
  };

  return (
    <AdminModal visible onClose={onClose} title="添加学员" dismissOnOverlay={false}>
      <View style={{ marginHorizontal: -22 }}>
        <SearchBar testID={testIds.classDetail.addMembersSearchInput} value={search} onChangeText={setSearch} placeholder="搜姓名 / 学号" />
      </View>
      <SegmentedControl
        items={[{ key: 'auditor', label: '旁听' }, { key: 'formal', label: '正式' }]}
        value={role}
        onChange={(k) => setRole(k as 'auditor' | 'formal')}
      />
      <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <ActivityIndicator color={SAFFRON} style={{ marginVertical: 16 }} />
        ) : peopleError ? (
          <EmptyState>加载失败,请检查网络后重试</EmptyState>
        ) : people.length === 0 ? (
          <EmptyState>{search ? '没有匹配的师兄' : '没有可添加的师兄(都已在本班或暂无其他账号)'}</EmptyState>
        ) : (
          people.map((p) => {
            const checked = sel.has(p.id);
            return (
              <Pressable key={p.id} testID={testIds.classDetail.addMembersRow(p.id)} style={styles.pickRow} onPress={() => toggle(p.id)}>
                <View style={[styles.checkbox, checked && styles.checkboxOn]}>{checked ? <Text style={styles.checkMark}>✓</Text> : null}</View>
                <Avatar name={p.name} size={32} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickName}>{p.name}{p.dharmaName ? <Text style={styles.pickDharma}>  法名 {p.dharmaName}</Text> : null}</Text>
                  {p.studentId ? <Text style={styles.pickMeta}>学号 {p.studentId}</Text> : null}
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>
      <ModalActions>
        <AdminButton variant="negative" onPress={onClose} style={{ flex: 1 }}>取消</AdminButton>
        <AdminButton testID={testIds.classDetail.addMembersSubmitButton} variant="primary" disabled={sel.size === 0 || add.isPending} onPress={submit} style={{ flex: 1.4 }}>
          {add.isPending ? '添加中…' : `添加 ${sel.size > 0 ? `(${sel.size})` : ''}`}
        </AdminButton>
      </ModalActions>
      <ModalFootnote>新成员默认状态「在读」;转正 / 留级等可日后在学员档案调整。</ModalFootnote>
    </AdminModal>
  );
}

// ── 调整共修日程 ─────────────────────────────────────────────────────
function ScheduleModal({ cohort, onClose }: { cohort: CohortDetail; onClose: () => void }) {
  const upd = useUpdateCohortSchedule();
  const [wDow, setWDow] = useState<number | null>(cohort.weeklyDow);
  const [wTime, setWTime] = useState((cohort.weeklyTime ?? '').slice(0, 5));
  const [wZoom, setWZoom] = useState(cohort.regularZoom ?? '');
  const [pDow, setPDow] = useState<number | null>(cohort.practiceDow);
  const [pTime, setPTime] = useState((cohort.practiceTime ?? '').slice(0, 5));
  const [pZoom, setPZoom] = useState(cohort.practiceZoom ?? '');

  const timeOk = (t: string) => t.trim() === '' || /^([01]?\d|2[0-3]):[0-5]\d$/.test(t.trim());
  const canSave = timeOk(wTime) && timeOk(pTime) && !upd.isPending;
  const norm = (t: string) => (t.trim() === '' ? null : `${t.trim()}:00`);

  const save = () => {
    if (!canSave) return;
    upd.mutate(
      {
        cohortId: cohort.id,
        weeklyDow: wDow, weeklyTime: norm(wTime), regularZoom: wZoom.trim() || null,
        practiceDow: pDow, practiceTime: norm(pTime), practiceZoom: pZoom.trim() || null,
      },
      { onSuccess: () => { onClose(); notify('已更新', '共修日程已保存。'); }, onError: (e) => notifyErr('保存失败', e) },
    );
  };

  return (
    <AdminModal visible onClose={onClose} title="调整共修日程" dismissOnOverlay={false}>
      <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.modalGroupLabel}>常规共修</Text>
        <Text style={styles.fieldHint}>星期</Text>
        <DowPicker value={wDow} onChange={setWDow} />
        <AdminTimeField label="时间" value={wTime} onChange={setWTime} placeholder="留空表示未定" />
        <ModalField label="Zoom 链接" value={wZoom} onChangeText={setWZoom} placeholder="https://…" />
        {!timeOk(wTime) ? <Text style={styles.errText}>时间格式应为 HH:MM</Text> : null}

        <Divider />
        <Text style={styles.modalGroupLabel}>实修共修</Text>
        <Text style={styles.fieldHint}>星期</Text>
        <DowPicker value={pDow} onChange={setPDow} />
        <AdminTimeField label="时间" value={pTime} onChange={setPTime} placeholder="留空表示未定" />
        <ModalField label="Zoom 链接" value={pZoom} onChangeText={setPZoom} placeholder="https://…" />
        {!timeOk(pTime) ? <Text style={styles.errText}>时间格式应为 HH:MM</Text> : null}
      </ScrollView>
      <ModalActions>
        <AdminButton variant="negative" onPress={onClose} style={{ flex: 1 }}>取消</AdminButton>
        <AdminButton variant="primary" disabled={!canSave} onPress={save} style={{ flex: 1 }}>{upd.isPending ? '保存中…' : '保存'}</AdminButton>
      </ModalActions>
    </AdminModal>
  );
}

// ── 学习提醒(决策188方案A,PM 2026-07-12三点拍板)──────────────────
// 只管"这个班要不要提醒、星期几、几点、文案"这4项配置;推送权限请求/token注册在登录时
// 就已经问过(lib/push-notifications.ts),不在这里重复问。默认文案跟Edge Function
// (supabase/functions/send-cohort-reminders)里的DEFAULT_REMINDER_MESSAGE保持一致
// (占位符提示用,实际留空即由后端套用默认文案,不需要这里也import那份Deno代码)。
const DEFAULT_REMINDER_MESSAGE_HINT = '本周共修时间快到了,愿大家精进闻思,同沾法喜。';

function ReminderModal({ cohort, onClose }: { cohort: CohortDetail; onClose: () => void }) {
  const upd = useUpdateReminderSettings();
  const [enabled, setEnabled] = useState(cohort.reminderEnabled);
  const [weekday, setWeekday] = useState<number | null>(cohort.reminderWeekday);
  const [time, setTime] = useState((cohort.reminderTime ?? '').slice(0, 5));
  const [message, setMessage] = useState(cohort.reminderMessage ?? '');

  const timeOk = time.trim() === '' || /^([01]?\d|2[0-3]):[0-5]\d$/.test(time.trim());
  const canSave = !upd.isPending && (!enabled || (weekday !== null && timeOk && time.trim() !== ''));

  const save = () => {
    if (!canSave) return;
    upd.mutate(
      {
        cohortId: cohort.id,
        enabled,
        weekday: enabled ? weekday : null,
        time: enabled && time.trim() ? `${time.trim()}:00` : null,
        message: message.trim() || null,
      },
      { onSuccess: () => { onClose(); notify('已更新', '学习提醒设置已保存。'); }, onError: (e) => notifyErr('保存失败', e) },
    );
  };

  return (
    <AdminModal visible onClose={onClose} title="学习提醒" dismissOnOverlay={false}>
      <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.fieldHint}>本班学习提醒</Text>
        <View style={styles.dowRow}>
          <Pressable testID={testIds.classDetail.reminderEnabledToggle} style={[styles.dowChip, !enabled && styles.dowChipOn]} onPress={() => setEnabled(false)}>
            <Text style={[styles.dowChipText, !enabled && styles.dowChipTextOn]}>关闭</Text>
          </Pressable>
          <Pressable style={[styles.dowChip, enabled && styles.dowChipOn]} onPress={() => setEnabled(true)}>
            <Text style={[styles.dowChipText, enabled && styles.dowChipTextOn]}>开启</Text>
          </Pressable>
        </View>
        {enabled ? (
          <>
            <Text style={styles.fieldHint}>星期</Text>
            <DowPicker value={weekday} onChange={setWeekday} />
            <AdminTimeField testID={testIds.classDetail.reminderTimeInput} label="时间" value={time} onChange={setTime} placeholder="必填" allowClear={false} />
            {!timeOk ? <Text style={styles.errText}>时间格式应为 HH:MM</Text> : null}
            <ModalField
              testID={testIds.classDetail.reminderMessageInput}
              label="提醒文案(留空用默认文案)"
              value={message}
              onChangeText={setMessage}
              placeholder={DEFAULT_REMINDER_MESSAGE_HINT}
              multiline
            />
          </>
        ) : null}
        <ModalFootnote>提醒每15分钟由系统扫描一次(非精确到秒),按本班时区({cohort.timezone ?? '未设'})判断;同一天只发一次,不会重复打扰。</ModalFootnote>
      </ScrollView>
      <ModalActions>
        <AdminButton variant="negative" onPress={onClose} style={{ flex: 1 }}>取消</AdminButton>
        <AdminButton testID={testIds.classDetail.reminderSaveButton} variant="primary" disabled={!canSave} onPress={save} style={{ flex: 1 }}>{upd.isPending ? '保存中…' : '保存'}</AdminButton>
      </ModalActions>
    </AdminModal>
  );
}

// ── 设休息周 ─────────────────────────────────────────────────────────
function RestWeeksModal({ cohortId, onClose }: { cohortId: string; onClose: () => void }) {
  const { data: weeks = [], error: weeksError } = useCohortRestWeeks(cohortId);
  const addRest = useAddRestWeek();
  const removeRest = useRemoveRestWeek();
  const today = new Date().toLocaleDateString('en-CA');
  const [date, setDate] = useState(today);
  const [reason, setReason] = useState('');

  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(new Date(`${date}T00:00:00`).getTime());

  const add = () => {
    if (!dateValid) return;
    addRest.mutate(
      { cohortId, restStartDate: date, reason: reason.trim() || null },
      { onSuccess: () => { setReason(''); notify('已添加', `休息周(${date})已记。本班进度会相应顺延。`); }, onError: (e) => notifyErr('添加失败', e) },
    );
  };
  const remove = async (id: string, d: string) => {
    if (!(await confirmAsync(`删除休息周(${d})?`, '删除后该周不再扣减进度。', '删除'))) return;
    removeRest.mutate({ id, cohortId }, { onError: (e) => notifyErr('删除失败', e) });
  };

  return (
    <AdminModal visible onClose={onClose} title="休息周" dismissOnOverlay={false}>
      <Text style={styles.note}>计划外休息(如临时停课)。起始日不晚于今天的,会让本班进度往后顺延一周——「本周该学」随之延后。</Text>
      <AdminDateField testID={testIds.classDetail.restDateInput} label="休息周起始日" value={date} onChange={setDate} />
      {!dateValid ? <Text style={styles.errText}>日期格式应为 YYYY-MM-DD</Text> : null}
      <ModalField label="原因(选填)" value={reason} onChangeText={setReason} placeholder="如:春节假期" />
      <AdminButton testID={testIds.classDetail.restAddButton} variant="primary" disabled={!dateValid || addRest.isPending} onPress={add}>{addRest.isPending ? '添加中…' : '＋ 添加休息周'}</AdminButton>

      {weeksError ? (
        <Text style={{ fontSize: 12, color: '#a13c2e', marginTop: 8 }}>休息周列表加载失败,请检查网络后重试。</Text>
      ) : weeks.length > 0 ? (
        <>
          <Divider />
          <Text style={styles.modalGroupLabel}>已设休息周({weeks.length})</Text>
          {weeks.map((w) => (
            <View key={w.id} style={styles.restRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.restDate}>{w.restStartDate}</Text>
                {w.reason ? <Text style={styles.restReason}>{w.reason}</Text> : null}
              </View>
              <Pressable testID={testIds.classDetail.restRemoveButton(w.id)} hitSlop={8} onPress={() => remove(w.id, w.restStartDate)} style={styles.restDel}>
                <Text style={styles.restDelText}>×</Text>
              </Pressable>
            </View>
          ))}
        </>
      ) : null}
    </AdminModal>
  );
}

// ── 成员管理(转正 / 暂停 / 留级 / 恢复 / 移出)──────────────────────
function MemberActionModal({ cohortId, member, canEditStatus, onClose }: { cohortId: string; member: RosterMember; canEditStatus: boolean; onClose: () => void }) {
  const updRole = useUpdateMemberRole();
  const updStatus = useUpdateMemberStatus();
  const [reason, setReason] = useState('');
  const busy = updRole.isPending || updStatus.isPending;
  const st = member.status;

  const doStatus = async (status: 'active' | 'paused' | 'held_back' | 'left', label: string, msg: string) => {
    if (!(await confirmAsync(`${label} · ${member.name}?`, msg, label))) return;
    updStatus.mutate(
      { cohortId, userId: member.userId, status, reason: reason.trim() || null },
      { onSuccess: () => { onClose(); notify('已更新', `${member.name}:${label}。`); }, onError: (e) => notifyErr('操作失败', e) },
    );
  };
  const promote = async () => {
    if (!(await confirmAsync(`把 ${member.name} 转为正式学员?`, '转正后不可降回旁听。', '转为正式'))) return;
    updRole.mutate(
      { cohortId, userId: member.userId, role: 'formal' },
      { onSuccess: () => { onClose(); notify('已转正', `${member.name} 现为正式学员。`); }, onError: (e) => notifyErr('操作失败', e) },
    );
  };

  return (
    <AdminModal visible onClose={onClose} title={`管理 · ${member.name}`} dismissOnOverlay={false}>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Badge tone="neutral">{member.memberRole === 'formal' ? '正式' : '旁听'}</Badge>
        <Badge tone={MEMBER_STATUS_TONE[st] ?? 'neutral'}>{MEMBER_STATUS_LABEL[st] ?? st}</Badge>
      </View>
      {canEditStatus ? (
        <ModalField label="变更理由(选填,记入档案)" value={reason} onChangeText={setReason} placeholder="如:个人原因暂停" />
      ) : null}
      <View style={{ gap: 8 }}>
        {member.memberRole === 'auditor' ? (
          <AdminButton testID={testIds.classDetail.memberPromoteButton} variant="primary" disabled={busy} onPress={promote} style={{ alignSelf: 'stretch' }}>转为正式学员</AdminButton>
        ) : null}
        {/* 暂停/留级/恢复/移出 4 项走 class_members_update RLS(仅 admin),本班主麦(zhumai)不放行(决策040/134 只放行转正)。 */}
        {canEditStatus && st === 'active' ? (
          <>
            <AdminButton testID={testIds.classDetail.memberPauseButton} variant="negative" disabled={busy} onPress={() => doStatus('paused', '暂停学习', '暂停后不计入在读,可随时恢复。')} style={{ alignSelf: 'stretch' }}>暂停学习</AdminButton>
            <AdminButton testID={testIds.classDetail.memberHoldBackButton} variant="negative" disabled={busy} onPress={() => doStatus('held_back', '留级', '标记留级(留级次数 +1);进度按日历不回拨。')} style={{ alignSelf: 'stretch' }}>留级</AdminButton>
          </>
        ) : null}
        {canEditStatus && (st === 'paused' || st === 'held_back' || st === 'left') ? (
          <AdminButton testID={testIds.classDetail.memberResumeButton} variant="confirm" disabled={busy} onPress={() => doStatus('active', '恢复在读', '恢复为在读状态。')} style={{ alignSelf: 'stretch' }}>恢复在读</AdminButton>
        ) : null}
        {canEditStatus && st !== 'left' ? (
          <AdminButton testID={testIds.classDetail.memberLeaveButton} variant="danger" disabled={busy} onPress={() => doStatus('left', '移出本班', '移出后标为「已离」,保留学修记录;之后可再恢复。')} style={{ alignSelf: 'stretch' }}>移出本班</AdminButton>
        ) : null}
      </View>
    </AdminModal>
  );
}

// 报数一键复制(决策064/074a):本周各修法总量生成 WhatsApp 文本,一键复制、随时可发(不绑报数节奏·决策087)。
// 只出班级总量,不含具名个人数据(#193)。
function WeeklyReportModal({ cohortId, cohortName, timezone, onClose }: { cohortId: string; cohortName: string; timezone: string | null; onClose: () => void }) {
  const { data: report, isLoading, error: reportError } = useCohortWeeklyReport(cohortId, timezone);
  const [copied, setCopied] = useState(false);

  const text = report ? formatWeeklyReportText({ cohortName, weekStart: report.weekStart, weekEnd: report.weekEnd, items: report.items, activeMembers: report.activeMembers }) : '';

  const copy = async () => {
    if (!text) return;
    await Clipboard.setStringAsync(text);
    setCopied(true);
    notify('已复制', '可直接粘贴到 WhatsApp 等聊天工具。');
  };

  return (
    <AdminModal visible onClose={onClose} title="本周报数" maxWidth={480}>
      {isLoading ? (
        <View style={{ paddingVertical: 30, alignItems: 'center' }}><ActivityIndicator color={SAFFRON} /></View>
      ) : reportError ? (
        <View style={{ paddingVertical: 20, alignItems: 'center' }}><Text style={{ color: '#a13c2e', fontSize: 13 }}>加载失败,请检查网络后重试。</Text></View>
      ) : (
        <>
          <View style={styles.reportTextBox}>
            <Text style={styles.reportText} selectable>{text}</Text>
          </View>
          <ModalFootnote>只统计各修法总量,不含任何师兄具名数据;随时可生成,不绑固定节奏。</ModalFootnote>
        </>
      )}
      <ModalActions>
        <AdminButton variant="negative" style={{ flex: 1 }} onPress={onClose}>关闭</AdminButton>
        <AdminButton variant="primary" style={{ flex: 1 }} disabled={!text} icon={<Copy size={15} color="#fff" />} onPress={copy}>
          {copied ? '已复制 ✓' : '一键复制'}
        </AdminButton>
      </ModalActions>
    </AdminModal>
  );
}

// 班级详情面板:被 [id] 全屏页(手机)与 classes/index 右栏(宽屏主从)共用。无自带返回头/标题。
export function ClassDetailPanel({ cohortId }: { cohortId: string }) {
  const id = cohortId;
  const router = useRouter();

  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === 'admin';

  const { data: cohort, isLoading, isError } = useCohortDetail(id);
  // 本班主麦(zhumai):转正权限放宽依据(决策040/134,promote_member_role RPC 本就允许主麦调)。
  // 4 个状态变更(暂停/留级/恢复/移出)仍走 class_members_update RLS(仅 admin),不放宽。
  const isZhumai = !!me?.id && !!cohort?.coachIds.includes(me.id);
  const { data: roster = [], error: rosterError } = useCohortRoster(id);
  const { data: progress } = useCohortCurrentWeek(
    cohort ? { cohortId: cohort.id, programId: cohort.programId, startDate: cohort.startDate, timezone: cohort.timezone } : undefined,
  );
  const setActive = useSetCohortActive();
  const [modal, setModal] = useState<null | 'members' | 'schedule' | 'rest' | 'staff' | 'reminder'>(null);
  const [memberModal, setMemberModal] = useState<RosterMember | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  const endClass = async () => {
    if (!cohort) return;
    if (!(await confirmAsync(`标记「${cohort.name}」结班?`, '结班后班级标为「已结业」,不再计入在读。可随时恢复。', '标记结班'))) return;
    setActive.mutate({ cohortId: cohort.id, isActive: false }, { onError: (e) => notifyErr('操作失败', e) });
  };
  const reopenClass = () => {
    if (!cohort) return;
    setActive.mutate({ cohortId: cohort.id, isActive: true }, { onError: (e) => notifyErr('操作失败', e) });
  };

  return (
    <View style={styles.root}>
      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={SAFFRON} /></View>
      ) : isError ? (
        <View style={styles.center}><Text style={{ color: INK3 }}>加载失败,请检查网络后重试(不代表班级不存在)</Text></View>
      ) : !cohort ? (
        <View style={styles.center}><Text style={{ color: INK3 }}>班级不存在</Text></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* 班级档案卡 */}
          <SectionCard>
            <View style={styles.classHeaderRow}>
              <View style={{ flex: 1, gap: 5 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Text className="font-serif" style={styles.className}>{cohort.name}</Text>
                  <Badge tone={cohort.isActive ? 'sage' : 'neutral'}>{cohort.isActive ? '在读' : '已结业'}</Badge>
                </View>
                <Text style={styles.classCode}>{cohort.code}</Text>
                {cohort.programName ? <Text style={styles.programName}>{cohort.programName}</Text> : null}
              </View>
            </View>
            <Divider />

            <View style={styles.infoRow}>
              <View style={styles.infoItem}>
                <Users size={14} color={INK3} />
                <Text style={styles.infoText}>{cohort.memberCount} 人在读</Text>
              </View>
              {cohort.schedule ? (
                <View style={styles.infoItem}>
                  <Clock size={14} color={INK3} />
                  <Text style={styles.infoText}>{cohort.schedule}</Text>
                </View>
              ) : null}
              {cohort.timezone ? (
                <View style={styles.infoItem}>
                  <MapPin size={14} color={INK3} />
                  <Text style={styles.infoText}>{cohort.timezone}</Text>
                </View>
              ) : null}
            </View>

            <Divider />
            <ProfileRow label="辅导员" value={cohort.coaches.length > 0 ? cohort.coaches.join('、') : '—'} />
            {cohort.aixin.length > 0 ? <ProfileRow label="爱心" value={cohort.aixin.join('、')} /> : null}
            {cohort.practiceSchedule ? <ProfileRow label="实修共修" value={cohort.practiceSchedule} /> : null}
            <ProfileRow label="开班日期" value={cohort.startDate ?? '—'} />
            <Divider />
            <AdminButton variant="secondary" icon={<Copy size={15} color={SAFFRON_DARK} />} onPress={() => setReportOpen(true)}>本周报数 · 一键复制</AdminButton>
          </SectionCard>

          {reportOpen ? (
            <WeeklyReportModal cohortId={cohort.id} cohortName={cohort.name} timezone={cohort.timezone} onClose={() => setReportOpen(false)} />
          ) : null}

          {/* 管理操作（仅系统管理员）*/}
          {isAdmin ? (
            <SectionCard title="管理操作">
              {cohort.isActive ? (
                <View style={styles.actionRow}>
                  <AdminButton testID={testIds.classDetail.addMembersButton} variant="primary" onPress={() => setModal('members')}>添加学员</AdminButton>
                  <AdminButton testID={testIds.classDetail.staffButton} variant="negative" onPress={() => setModal('staff')}>设辅导员 / 爱心</AdminButton>
                  <AdminButton testID={testIds.classDetail.scheduleButton} variant="negative" onPress={() => setModal('schedule')}>调整共修日程</AdminButton>
                  <AdminButton testID={testIds.classDetail.restButton} variant="negative" onPress={() => setModal('rest')}>设休息周</AdminButton>
                  <AdminButton testID={testIds.classDetail.reminderButton} variant="negative" onPress={() => setModal('reminder')}>学习提醒</AdminButton>
                  <AdminButton variant="negative" onPress={() => router.push(`/(admin)/advancement/semester-end/${cohort.id}` as never)}>学期末处理</AdminButton>
                  <AdminButton testID={testIds.classDetail.endClassButton} variant="danger" onPress={endClass}>标记结班</AdminButton>
                </View>
              ) : (
                <View style={styles.actionRow}>
                  <AdminButton testID={testIds.classDetail.reopenClassButton} variant="confirm" onPress={reopenClass}>恢复在读</AdminButton>
                </View>
              )}
            </SectionCard>
          ) : null}

          {/* 本班辅导员(非 admin)只放行"调整共修日程"+"学习提醒"这两项(三易审计孤儿函数
              跟进·PM 2026-07-15裁定;学习提醒2026-07-17随决策188补入,同一套权限口径):
              不给上面那一整块"管理操作"(添加学员/设辅导员/学期末处理/标记结班等仍
              admin-only),权限判断在 update_cosession_settings/update_reminder_settings
              这两个 RPC 内部,这里只是给个入口。 */}
          {isZhumai && !isAdmin && cohort.isActive ? (
            <SectionCard title="共修设定">
              <View style={styles.actionRow}>
                <AdminButton testID={testIds.classDetail.scheduleButton} variant="negative" onPress={() => setModal('schedule')}>调整共修日程</AdminButton>
                <AdminButton testID={testIds.classDetail.reminderButton} variant="negative" onPress={() => setModal('reminder')}>学习提醒</AdminButton>
              </View>
            </SectionCard>
          ) : null}

          {/* 学员名单 */}
          <SectionCard title={`学员名单（${roster.length}）`}>
            {rosterError ? (
              <EmptyState>加载失败,请检查网络后重试</EmptyState>
            ) : roster.length === 0 ? (
              <EmptyState>暂无学员</EmptyState>
            ) : (
              roster.map((student, index) => (
                <View key={student.userId}>
                  {index > 0 && <Divider />}
                  <View style={styles.rosterRow}>
                    <Pressable
                      style={styles.rosterInfo}
                      onPress={() => router.push(`/(admin)/students/${student.userId}` as never)}
                    >
                      <Avatar name={student.name} size={36} />
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <Text style={styles.rosterName}>{student.name}</Text>
                          {student.dharmaName ? <Text style={styles.rosterDharma}>法名 {student.dharmaName}</Text> : null}
                          <Badge tone="neutral">{student.memberRole === 'formal' ? '正式' : '旁听'}</Badge>
                        </View>
                        <View style={{ marginTop: 4 }}>
                          <Badge tone={MEMBER_STATUS_TONE[student.status] ?? 'neutral'}>
                            {MEMBER_STATUS_LABEL[student.status] ?? student.status}
                          </Badge>
                        </View>
                      </View>
                    </Pressable>
                    {isAdmin || (isZhumai && student.memberRole === 'auditor') ? (
                      <Pressable testID={testIds.classDetail.manageMemberButton(student.userId)} hitSlop={6} style={styles.rosterManage} onPress={() => setMemberModal(student)}>
                        <Text style={styles.rosterManageText}>管理</Text>
                      </Pressable>
                    ) : (
                      <ChevronRight size={14} color={INK4} />
                    )}
                  </View>
                </View>
              ))
            )}
          </SectionCard>

          {/* 课程进度（班级当前周 + 本周节次，按 start_date + §12.6.5 算法 + 排课表）*/}
          <SectionCard title="课程进度">
            {!progress || progress.status === 'no_start_date' ? (
              <View style={styles.progressPlaceholder}>
                <BookOpen size={24} color={INK4} />
                <Text style={styles.progressPlaceholderText}>{cohort.startDate ? '加载中…' : '未设开班日期,无法计算进度'}</Text>
              </View>
            ) : progress.status === 'not_started' ? (
              <View style={styles.progressPlaceholder}>
                <BookOpen size={24} color={INK4} />
                <Text style={styles.progressPlaceholderText}>尚未开班 · {progress.startDate} 起</Text>
              </View>
            ) : (
              <>
                <View style={styles.progressWeekRow}>
                  <Badge tone="saffron">本班当前 · 第 {progress.calWeek} 周</Badge>
                  <Text style={styles.progressWeekSub}>第 {progress.semesterNumber} 学期 · 第 {progress.weekInSemester} 周</Text>
                </View>
                <Divider />
                <Text style={styles.progressLabel}>本周应学</Text>
                {progress.lessons.length === 0 ? (
                  <EmptyState>本周暂无排课(可能是休息周,或该周未在「排课管理」排课)</EmptyState>
                ) : (
                  progress.lessons.map((l, i) => (
                    <View key={l.lessonId}>
                      {i > 0 && <Divider />}
                      <View style={styles.progressLessonRow}>
                        <Text className="font-serif" style={styles.progressLessonName}>{bookTitle(l.courseName)}</Text>
                        <Text style={styles.progressLessonMeta}>第 {l.lessonNumber} 节 · {l.lessonTitle}</Text>
                      </View>
                    </View>
                  ))
                )}
              </>
            )}
          </SectionCard>

        </ScrollView>
      )}

      {modal === 'members' && cohort ? <AddMembersModal cohortId={cohort.id} onClose={() => setModal(null)} /> : null}
      {modal === 'schedule' && cohort ? <ScheduleModal cohort={cohort} onClose={() => setModal(null)} /> : null}
      {modal === 'reminder' && cohort ? <ReminderModal cohort={cohort} onClose={() => setModal(null)} /> : null}
      {modal === 'rest' && cohort ? <RestWeeksModal cohortId={cohort.id} onClose={() => setModal(null)} /> : null}
      {modal === 'staff' && cohort ? <StaffModal cohortId={cohort.id} onClose={() => setModal(null)} /> : null}
      {memberModal && cohort ? (
        <MemberActionModal cohortId={cohort.id} member={memberModal} canEditStatus={isAdmin} onClose={() => setMemberModal(null)} />
      ) : null}
    </View>
  );
}

// 手机:全屏详情页(带返回头)。宽屏主从在 classes/index 右栏直接渲染 ClassDetailPanel。
export default function ClassDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { setTitle } = useAdminLayout();
  const { data: cohort } = useCohortDetail(id);
  const name = cohort?.name ?? '班级';
  useEffect(() => { setTitle(name); }, [setTitle, name]);
  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <DetailHeader title={name} onBack={() => router.back()} />
      <ClassDetailPanel cohortId={id} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SCREEN_BG },
  scroll: { padding: 16, gap: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  classHeaderRow: { flexDirection: 'row', alignItems: 'flex-start' },
  className: { fontSize: 18, fontWeight: '700', color: INK, letterSpacing: 0.5 },
  classCode: { fontSize: 13, color: INK3 },
  programName: { fontSize: 13, color: INK2, fontWeight: '500' },
  infoRow: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  infoItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  infoText: { fontSize: 13, color: INK2 },
  profileRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  profileLabel: { fontSize: 13, color: INK3 },
  profileValue: { fontSize: 13, color: INK2, fontWeight: '500' },
  reportTextBox: { backgroundColor: '#f7f2ec', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)' },
  reportText: { fontSize: 13, color: INK, lineHeight: 20 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  rosterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  rosterInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rosterName: { fontSize: 14, fontWeight: '600', color: INK },
  rosterDharma: { fontSize: 12, color: INK3 },
  rosterManage: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9999, backgroundColor: '#fbe5da' },
  rosterManageText: { fontSize: 12, color: '#b35535', fontWeight: '700' },
  progressPlaceholder: { alignItems: 'center', gap: 8, paddingVertical: 20 },
  progressPlaceholderText: { fontSize: 13, color: INK4 },
  progressWeekRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  progressWeekSub: { fontSize: 13, color: INK2, fontWeight: '500' },
  progressLabel: { fontSize: 12, color: INK3, fontWeight: '600', letterSpacing: 1 },
  progressLessonRow: { paddingVertical: 8, gap: 2 },
  progressLessonName: { fontSize: 14, fontWeight: '600', color: INK },
  progressLessonMeta: { fontSize: 12, color: INK3 },
  // 弹窗内
  modalGroupLabel: { fontSize: 13, fontWeight: '700', color: INK, marginBottom: 6, marginTop: 2 },
  fieldHint: { fontSize: 12, color: INK3, marginBottom: 6 },
  note: { fontSize: 12, color: INK3, lineHeight: 18 },
  errText: { fontSize: 11, color: '#a1402e', marginTop: -4 },
  // 选人
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: 'rgba(43,34,24,0.25)', alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: SAFFRON, borderColor: SAFFRON },
  checkMark: { color: '#fff', fontSize: 13, fontWeight: '700' },
  pickName: { fontSize: 14, color: INK, fontWeight: '600' },
  pickDharma: { fontSize: 12, color: INK3, fontWeight: '400' },
  pickMeta: { fontSize: 12, color: INK3, marginTop: 1 },
  // 周几
  dowRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  dowChip: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#faf6f0', borderWidth: 1, borderColor: 'rgba(43,34,24,0.12)' },
  dowChipOn: { backgroundColor: SAFFRON, borderColor: SAFFRON },
  dowChipText: { fontSize: 13, color: INK2, fontWeight: '600' },
  dowChipTextOn: { color: '#fff', fontWeight: '700' },
  // 休息周列表
  restRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  restDate: { fontSize: 14, color: INK, fontWeight: '600' },
  restReason: { fontSize: 12, color: INK3, marginTop: 1 },
  restDel: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(43,34,24,0.06)' },
  restDelText: { fontSize: 15, color: INK3, fontWeight: '700', lineHeight: 17 },
});
