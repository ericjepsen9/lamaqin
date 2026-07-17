import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AdminButton,
  AdminModal,
  Badge,
  EmptyState,
  FilterChips,
  ModalActions,
  ModalField,
  SCREEN_BG,
  type BadgeTone,
  ErrorState,
  ModalFootnote,
} from '@/components/ui/admin-kit';
import { Text } from '@/components/ui/text';
import { confirmAsync, notify } from '@/lib/dialog';
import { useAdminCohorts } from '@/lib/queries/classes';
import { useAdminAnnouncements, useAdminEvents, useEventSessions, type AppEvent, type Announcement } from '@/lib/queries/events';
import { useAddEventSession, useCreateAnnouncement, useCreateEvent, useDeleteEventSession, useSetEventPractice, useToggleEventActive } from '@/lib/mutations/events';
import { usePractices } from '@/lib/queries/practice';
import { useCurrentUser } from '@/lib/queries/profile';
import { testIds } from '@/lib/testids';
import { GOLD_DARK as GOLD, INK, INK2, INK3, INK4, SAFFRON } from '@/lib/theme';
import { genClientToken } from '@/lib/utils';
import { useAdminLayout } from '../_layout';

type TabType = 'events' | 'announcements';

const EVENT_TYPE_TONE: Record<string, BadgeTone> = { 法会: 'gold' };
const eventTypeTone = (t: string): BadgeTone => EVENT_TYPE_TONE[t] ?? 'sage';
const dateValid = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s.trim()) && !Number.isNaN(new Date(s.trim() + 'T00:00:00').getTime());

// ── 新建法会弹窗 ──────────────────────────────────────────────────────
// 先建法会(名称/类型/起止窗口/说明);建好后在卡片「管理场次」逐场加(每天几场不固定·决策②)。
//   场次纯排期、不记出勤(守决策140反出勤核心)。
function NewEventModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const create = useCreateEvent();
  const { data: practices = [] } = usePractices();
  const [name, setName] = useState('');
  const [type, setType] = useState('法会');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [desc, setDesc] = useState('');
  const [practiceId, setPracticeId] = useState<string | null>(null);
  const [targetStr, setTargetStr] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [token, setToken] = useState(() => genClientToken());
  // 渲染期间比对上一次的visible(react-hooks/set-state-in-effect·2026-07-17 lint债清理)
  const [prevVisible, setPrevVisible] = useState(visible);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) { setName(''); setType('法会'); setStart(''); setEnd(''); setDesc(''); setPracticeId(null); setTargetStr(''); setErr(null); setToken(genClientToken()); }
  }

  const canSubmit = name.trim() && dateValid(start) && dateValid(end) && end.trim() >= start.trim() && !create.isPending;
  const submit = async () => {
    if (!canSubmit) return;
    setErr(null);
    try {
      await create.mutateAsync({
        name, eventType: type, startDate: start.trim(), endDate: end.trim(), description: desc || null,
        defaultPracticeId: practiceId,
        defaultTargetCount: targetStr.trim() ? Math.max(1, parseInt(targetStr, 10) || 0) || null : null,
        clientToken: token,
      });
      onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : '创建失败'); }
  };
  return (
    <AdminModal visible={visible} onClose={onClose} title="新建法会" dismissOnOverlay={false}>
      <ModalField testID={testIds.events.newEventNameInput} label="名称 *" value={name} onChangeText={setName} placeholder="如:神变月共修" />
      <ModalField label="类型" value={type} onChangeText={setType} placeholder="法会 / 共修营…" />
      <ModalField testID={testIds.events.newEventStartInput} label="开始日期 *" value={start} onChangeText={setStart} placeholder="YYYY-MM-DD" />
      <ModalField testID={testIds.events.newEventEndInput} label="结束日期 *" value={end} onChangeText={setEnd} placeholder="YYYY-MM-DD(不早于开始)" />
      <ModalField label="说明" value={desc} onChangeText={setDesc} placeholder="活动说明(可选);具体场次建好后在「管理场次」逐场添加" multiline />
      {/* 共修功课(§3.12 法会愿模板·一法会一修法):不选=纯讲座,学员端无发愿区 */}
      <Text style={styles.pickTitle}>共修功课(可选·全体同修此一门)</Text>
      <View style={styles.practiceWrap}>
        {practices.map((pr) => (
          <Pressable key={pr.id} style={[styles.pChip, practiceId === pr.id && styles.pChipOn]} onPress={() => setPracticeId(practiceId === pr.id ? null : pr.id)}>
            <Text style={[styles.pChipTxt, practiceId === pr.id && { color: '#fff' }]}>{pr.name}</Text>
          </Pressable>
        ))}
      </View>
      {practiceId ? <ModalField label="建议目标遍数(留空=随喜不限)" value={targetStr} onChangeText={setTargetStr} placeholder="如 100000" keyboardType="numeric" /> : null}
      {err ? <Text style={styles.errText}>{err}</Text> : null}
      <ModalActions>
        <AdminButton variant="negative" style={{ flex: 1 }} onPress={onClose}>取消</AdminButton>
        <AdminButton testID={testIds.events.newEventSubmitButton} variant="primary" style={{ flex: 1 }} disabled={!canSubmit} onPress={submit}>{create.isPending ? '创建中…' : '创建'}</AdminButton>
      </ModalActions>
    </AdminModal>
  );
}

// ── 管理场次弹窗(逐场添加·每天不固定)──────────────────────────────
const SESS_MODES: { k: 'online' | 'offline' | 'hybrid'; l: string }[] = [
  { k: 'online', l: '线上' }, { k: 'offline', l: '线下' }, { k: 'hybrid', l: '混合' },
];
const modeLabel = (m: string) => (m === 'online' ? '线上' : m === 'offline' ? '线下' : '混合');
function SessionsModal({ visible, event, onClose }: { visible: boolean; event: AppEvent; onClose: () => void }) {
  const { data: sessions = [], isLoading } = useEventSessions(visible ? event.id : undefined);
  const add = useAddEventSession();
  const del = useDeleteEventSession();
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState<'online' | 'offline' | 'hybrid'>('online');
  const [link, setLink] = useState('');
  const [place, setPlace] = useState('');
  const [err, setErr] = useState<string | null>(null);
  // 凭证按表单内容派生(同quick-count-sheet.tsx::getToken先例,2026-07-14修):此前每次成功后无条件
  // 换新凭证,原意是"方便连加几场"——但这让真双击(第二下点在第一下响应之前)也会因为第一下已经
  // 换了新凭证而被当成"新的一场",两条完全相同的记录都插入成功。改成按内容(日期+时间+标题+
  // 形式+链接+地点)算key:内容不变=同一凭证(真双击被幂等挡住),内容变了(如上面清空time/title
  // 后再填下一场)=自然生成新凭证,不需要手动rotate。
  const tokenRef = useRef<{ key: string; token: string } | null>(null);
  const getToken = (): string => {
    const key = `${date.trim()}|${time.trim()}|${title.trim()}|${mode}|${link.trim()}|${place.trim()}`;
    if (tokenRef.current?.key !== key) tokenRef.current = { key, token: genClientToken() };
    return tokenRef.current.token;
  };
  // 渲染期间比对上一次的visible(react-hooks/set-state-in-effect·2026-07-17 lint债清理)。
  // 不再显式清tokenRef.current(原意防"reopen后复用旧凭证"这个边角情况)——字段本身已经
  // 重置回空,canAdd要求date必须合法非空才能点"添加",这个边角情况实际不可达,不需要另外处理ref。
  const [prevVisible, setPrevVisible] = useState(visible);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) { setDate(''); setTime(''); setTitle(''); setMode('online'); setLink(''); setPlace(''); setErr(null); }
  }

  const dateInWindow = dateValid(date) && date.trim() >= event.startDate && date.trim() <= event.endDate;
  const timeOk = !time.trim() || /^([01]?\d|2[0-3]):[0-5]\d$/.test(time.trim());
  const canAdd = dateInWindow && timeOk && !add.isPending;
  const onAdd = async () => {
    if (!canAdd) return;
    setErr(null);
    try {
      await add.mutateAsync({ eventId: event.id, sessionDate: date.trim(), startTime: time.trim() || null, title: title || null, mode, onlineUrl: link || null, location: place || null, clientToken: getToken() });
      setTime(''); setTitle(''); // 留日期+形式,方便同一天连加几场(内容变了,getToken()下次自然给新凭证)
    } catch (e) { setErr(e instanceof Error ? e.message : '添加失败'); }
  };

  return (
    <AdminModal visible={visible} onClose={onClose} title="管理场次">
      <Text style={styles.sessHint}>{event.name} · {event.startDate} — {event.endDate}(场次日期须在此区间;每天几场不限)</Text>
      {isLoading ? (
        <View style={styles.loadingBox}><ActivityIndicator color={SAFFRON} /></View>
      ) : sessions.length === 0 ? (
        <EmptyState>还没有场次,在下面添加。</EmptyState>
      ) : (
        sessions.map((s) => (
          <View key={s.id} style={styles.sessRow}>
            <Text style={styles.sessTxt}>{s.sessionDate.slice(5)} · {s.startTime ? s.startTime.slice(0, 5) : '全天'} · {s.title ?? '场次'} · {modeLabel(s.mode)}</Text>
            <AdminButton size="sm" variant="negative" disabled={del.isPending} onPress={async () => {
              if (await confirmAsync('删除该场次?', `${s.sessionDate} · ${s.title ?? '场次'} 删除后不可恢复。`, '删除')) del.mutate(s.id);
            }}>删</AdminButton>
          </View>
        ))
      )}

      <Text style={styles.sessAddLabel}>添加场次</Text>
      <ModalField testID={testIds.events.sessionDateInput} label="日期 *" value={date} onChangeText={setDate} placeholder={`${event.startDate} ~ ${event.endDate}`} />
      <ModalField label="时间(可空=全天)" value={time} onChangeText={setTime} placeholder="HH:mm,如 09:00" />
      <ModalField label="场次名" value={title} onChangeText={setTitle} placeholder="如 早课 / 午课 / 晚课" />
      <Text style={styles.fLabel}>形式</Text>
      <View style={styles.seg}>
        {SESS_MODES.map((m) => (
          <Pressable key={m.k} style={[styles.segItem, mode === m.k && styles.segItemOn]} onPress={() => setMode(m.k)}>
            <Text style={[styles.segText, mode === m.k && styles.segTextOn]}>{m.l}</Text>
          </Pressable>
        ))}
      </View>
      {mode !== 'offline' ? <ModalField label="线上链接(可选)" value={link} onChangeText={setLink} placeholder="Zoom / 会议链接" /> : null}
      {mode !== 'online' ? <ModalField label="线下地点(可选)" value={place} onChangeText={setPlace} placeholder="如:学会道场" /> : null}
      {err ? <Text style={styles.errText}>{err}</Text> : null}
      <AdminButton testID={testIds.events.sessionAddButton} variant="primary" disabled={!canAdd} style={{ marginTop: 10 }} onPress={onAdd}>{add.isPending ? '添加中…' : '加这一场'}</AdminButton>
      <ModalActions>
        <AdminButton variant="negative" style={{ flex: 1 }} onPress={onClose}>完成</AdminButton>
      </ModalActions>
    </AdminModal>
  );
}

// ── 配功课弹窗(§3.12 法会愿模板·已建法会补配/改配;修法定死、目标为学员端预选建议)──
function EventPracticeModal({ visible, event, onClose }: { visible: boolean; event: AppEvent; onClose: () => void }) {
  const { data: practices = [] } = usePractices();
  const setPractice = useSetEventPractice();
  const [practiceId, setPracticeId] = useState<string | null>(null);
  const [targetStr, setTargetStr] = useState('');
  // 渲染期间比对上一次的visible/event(react-hooks/set-state-in-effect·2026-07-17
  // lint债清理),逐项对应原依赖数组。
  const [prevVisible, setPrevVisible] = useState(visible);
  const [prevEvent, setPrevEvent] = useState(event);
  if (visible !== prevVisible || event !== prevEvent) {
    setPrevVisible(visible);
    setPrevEvent(event);
    if (visible) { setPracticeId(event.defaultPracticeId); setTargetStr(event.defaultTargetCount ? String(event.defaultTargetCount) : ''); }
  }
  const submit = () => {
    setPractice.mutate(
      { eventId: event.id, practiceId, targetCount: practiceId && targetStr.trim() ? Math.max(1, parseInt(targetStr, 10) || 0) || null : null },
      { onSuccess: onClose, onError: (e) => notify('保存失败', e instanceof Error ? e.message : '请重试') },
    );
  };
  return (
    <AdminModal visible={visible} onClose={onClose} title="配共修功课" dismissOnOverlay={false}>
      <Text style={styles.pickTitle}>全体师兄同修此一门(再点一下=取消,即纯讲座法会)</Text>
      <View style={styles.practiceWrap}>
        {practices.map((pr) => (
          <Pressable key={pr.id} style={[styles.pChip, practiceId === pr.id && styles.pChipOn]} onPress={() => setPracticeId(practiceId === pr.id ? null : pr.id)}>
            <Text style={[styles.pChipTxt, practiceId === pr.id && { color: '#fff' }]}>{pr.name}</Text>
          </Pressable>
        ))}
      </View>
      {practiceId ? <ModalField label="建议目标遍数(留空=随喜不限)" value={targetStr} onChangeText={setTargetStr} placeholder="如 100000" keyboardType="numeric" /> : null}
      <ModalActions>
        <AdminButton variant="negative" style={{ flex: 1 }} onPress={onClose}>取消</AdminButton>
        <AdminButton variant="primary" style={{ flex: 1 }} disabled={setPractice.isPending} onPress={submit}>{setPractice.isPending ? '保存中…' : '保存'}</AdminButton>
      </ModalActions>
      <ModalFootnote>已发愿的师兄不受改配影响(愿是发愿当时的修法);改配只影响之后加入的人。</ModalFootnote>
    </AdminModal>
  );
}

function EventCard({ event, isAdmin }: { event: AppEvent; isAdmin: boolean }) {
  const toggle = useToggleEventActive();
  const [sessOpen, setSessOpen] = useState(false);
  const [practiceOpen, setPracticeOpen] = useState(false);
  return (
    <View style={[styles.eventCard, !event.isActive && styles.eventCardInactive]}>
      <View style={styles.eventHeader}>
        <View style={{ flex: 1 }}>
          <View style={styles.eventTitleRow}>
            <Text className="font-serif" style={styles.eventName}>{event.name}</Text>
            <Badge tone={eventTypeTone(event.eventType)}>{event.eventType}</Badge>
          </View>
          <Text style={styles.eventDates}>{event.startDate} — {event.endDate}</Text>
        </View>
        <Badge tone={event.isActive ? 'sage' : 'neutral'}>{event.isActive ? '● 进行中' : '○ 已结束'}</Badge>
      </View>
      {event.description ? <Text style={styles.eventDesc}>{event.description}</Text> : null}
      <Text style={styles.eventPractice}>
        {event.defaultPracticeName
          ? `共修功课:${event.defaultPracticeName}${event.defaultTargetCount ? ` · 建议 ${event.defaultTargetCount.toLocaleString()} 遍` : ' · 随喜不限'}`
          : '未配共修功课(学员端不显发愿区)'}
      </Text>
      <View style={styles.eventFooter}>
        <Text style={styles.eventCreatedBy}>{event.createdByName ? `创建:${event.createdByName}` : ''}</Text>
        {isAdmin && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <AdminButton testID={testIds.events.manageSessionsButton(event.id)} variant="primary" size="sm" onPress={() => setSessOpen(true)}>管理场次</AdminButton>
            <AdminButton variant="secondary" size="sm" onPress={() => setPracticeOpen(true)}>配功课</AdminButton>
            <AdminButton variant={event.isActive ? 'negative' : 'confirm'} size="sm" disabled={toggle.isPending}
              onPress={async () => {
                if (event.isActive && !(await confirmAsync(`把「${event.name}」设为已结束?`, '学员端将转入历史;可随时恢复为进行中。', '设为已结束'))) return;
                toggle.mutate({ id: event.id, isActive: !event.isActive });
              }}>
              {event.isActive ? '设为已结束' : '设为进行中'}
            </AdminButton>
          </View>
        )}
      </View>
      {isAdmin ? <SessionsModal visible={sessOpen} event={event} onClose={() => setSessOpen(false)} /> : null}
      {isAdmin ? <EventPracticeModal visible={practiceOpen} event={event} onClose={() => setPracticeOpen(false)} /> : null}
    </View>
  );
}

function AnnouncementCard({ ann }: { ann: Announcement }) {
  return (
    <View style={[styles.annCard, ann.isPinned && styles.annCardPinned]}>
      <View style={styles.annHeader}>
        <View style={styles.annMeta}>
          <Badge tone="gold">{ann.cohortName}</Badge>
          {ann.isPinned && <Badge tone="gold">置顶</Badge>}
        </View>
      </View>
      {ann.title ? <Text style={styles.annTitle}>{ann.title}</Text> : null}
      <Text style={styles.annContent}>{ann.content}</Text>
      <View style={styles.annFooter}>
        <Text style={styles.annPostedBy}>{ann.postedByName ?? '—'} · {ann.postedAt}</Text>
      </View>
    </View>
  );
}

export default function EventsPage() {
  const { setTitle } = useAdminLayout();
  const { data: me } = useCurrentUser();
  const [tab, setTab] = useState<TabType>('events');
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [showAddAnn, setShowAddAnn] = useState(false);
  const [annCohort, setAnnCohort] = useState<string | null>(null);
  const [annContent, setAnnContent] = useState('');
  const [annPinned, setAnnPinned] = useState(false);
  const [annErr, setAnnErr] = useState<string | null>(null);
  const [annToken, setAnnToken] = useState(() => genClientToken());

  const { data: events = [], isLoading: eLoading, error: eError } = useAdminEvents();
  const { data: anns = [], isLoading: aLoading, error: aError } = useAdminAnnouncements();
  const { data: groups = [], error: cohortsError } = useAdminCohorts();
  const createAnn = useCreateAnnouncement();

  const cohorts = useMemo(() => groups.flatMap((g) => g.cohorts.map((c) => ({ id: c.id, name: c.name }))), [groups]);
  const isAdmin = me?.role === 'admin';
  const canWriteAnn = me?.role === 'admin' || me?.role === 'zhumai';

  useEffect(() => { setTitle('法会管理'); }, [setTitle]);

  const tabs: { key: TabType; label: string }[] = [
    { key: 'events', label: '法会活动' },
    { key: 'announcements', label: '班级公告' },
  ];

  const publishAnn = async () => {
    if (!annCohort || !annContent.trim()) return;
    setAnnErr(null);
    try {
      await createAnn.mutateAsync({ cohortId: annCohort, title: null, content: annContent, isPinned: annPinned, clientToken: annToken });
      setAnnContent(''); setAnnPinned(false); setShowAddAnn(false);
    } catch (e) { setAnnErr(e instanceof Error ? e.message : '发布失败'); }
  };

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <FilterChips items={tabs} value={tab} onChange={setTab} />

        {tab === 'events' && (
          <>
            <View style={styles.sectionHeader}>
              <Text className="font-serif" style={styles.sectionTitle}>法会活动</Text>
              {isAdmin && <AdminButton testID={testIds.events.newEventButton} variant="primary" size="sm" onPress={() => setShowNewEvent(true)}>＋ 新建法会</AdminButton>}
            </View>
            {eError ? <ErrorState /> : eLoading ? (
              <View style={styles.loadingBox}><ActivityIndicator color={SAFFRON} /></View>
            ) : events.length === 0 ? (
              <EmptyState>暂无法会活动{isAdmin ? ',点「新建法会」添加。' : '。'}</EmptyState>
            ) : (
              events.map((e) => <EventCard key={e.id} event={e} isAdmin={isAdmin} />)
            )}
          </>
        )}

        {tab === 'announcements' && (
          <>
            <View style={styles.sectionHeader}>
              <Text className="font-serif" style={styles.sectionTitle}>班级公告</Text>
              {canWriteAnn && (
                <AdminButton testID={testIds.events.addAnnouncementButton} variant={showAddAnn ? 'negative' : 'primary'} size="sm" onPress={() => { setShowAddAnn((v) => { if (!v) setAnnToken(genClientToken()); return !v; }); }}>
                  {showAddAnn ? '取消' : '＋ 发布公告'}
                </AdminButton>
              )}
            </View>

            {showAddAnn && (
              <View style={styles.addAnnForm}>
                <Text style={styles.formLabel}>班级</Text>
                <View style={styles.cohortSelector}>
                  {cohortsError ? (
                    <Text style={styles.cohortOptionText}>班级加载失败,请检查网络后重试</Text>
                  ) : cohorts.length === 0 ? <Text style={styles.cohortOptionText}>暂无班级</Text> : cohorts.map((c) => {
                    const on = c.id === annCohort;
                    return (
                      <Pressable key={c.id} testID={testIds.events.cohortOption(c.id)} style={[styles.cohortOption, on && styles.cohortOptionOn]} onPress={() => setAnnCohort(c.id)}>
                        <Text style={[styles.cohortOptionText, on && styles.cohortOptionTextOn]}>{c.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={styles.formLabel}>公告内容</Text>
                <TextInput testID={testIds.events.announcementContentInput} style={styles.annTextarea} multiline numberOfLines={4} placeholder="输入公告内容…" placeholderTextColor={INK4} value={annContent} onChangeText={setAnnContent} textAlignVertical="top" />
                <Pressable style={styles.pinRow} onPress={() => setAnnPinned((v) => !v)}>
                  <View style={[styles.pinBox, annPinned && styles.pinBoxOn]}>{annPinned ? <Text style={styles.pinCheck}>✓</Text> : null}</View>
                  <Text style={styles.pinLabel}>置顶</Text>
                </Pressable>
                {annErr ? <Text style={styles.errText}>{annErr}</Text> : null}
                <AdminButton testID={testIds.events.announcementPublishButton} variant="primary" disabled={!annCohort || !annContent.trim() || createAnn.isPending} style={styles.publishBtn} onPress={publishAnn}>
                  {createAnn.isPending ? '发布中…' : '发布公告'}
                </AdminButton>
              </View>
            )}

            {aError ? <ErrorState /> : aLoading ? (
              <View style={styles.loadingBox}><ActivityIndicator color={SAFFRON} /></View>
            ) : anns.length === 0 ? (
              <EmptyState>暂无班级公告</EmptyState>
            ) : (
              anns.map((a) => <AnnouncementCard key={a.id} ann={a} />)
            )}
          </>
        )}

      </ScrollView>
      <NewEventModal visible={showNewEvent} onClose={() => setShowNewEvent(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  pickTitle: { fontSize: 12, fontWeight: '600', color: '#7e6d5b', marginTop: 4, marginBottom: 8 },
  practiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  pChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9999, backgroundColor: 'rgba(43,34,24,0.05)', borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)' },
  pChipOn: { backgroundColor: '#e07856', borderColor: '#e07856' },
  pChipTxt: { fontSize: 13, fontWeight: '600', color: '#55463a' },
  eventPractice: { fontSize: 12, color: '#7e6d5b', marginTop: 6 },
  root: { flex: 1, backgroundColor: SCREEN_BG },
  scroll: { padding: 20, gap: 12, paddingBottom: 40 },
  loadingBox: { paddingVertical: 30, alignItems: 'center' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: INK },
  errText: { fontSize: 12, color: '#a13c2e', fontWeight: '600' },
  sessHint: { fontSize: 12, color: INK3, marginBottom: 10, lineHeight: 18 },
  sessRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: 'rgba(43,34,24,0.06)' },
  sessTxt: { flex: 1, fontSize: 13, color: INK2 },
  sessAddLabel: { fontSize: 13, fontWeight: '700', color: INK, marginTop: 14, marginBottom: 4 },
  fLabel: { fontSize: 12, fontWeight: '600', color: INK2, marginTop: 12, marginBottom: 6 },
  seg: { flexDirection: 'row', gap: 8 },
  segItem: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(43,34,24,0.12)', backgroundColor: '#fff' },
  segItemOn: { backgroundColor: SAFFRON, borderColor: SAFFRON },
  segText: { fontSize: 13, color: INK3 },
  segTextOn: { color: '#fff', fontWeight: '600' },
  eventCard: { backgroundColor: '#fff', borderRadius: 16, padding: 18, gap: 10, borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)' },
  eventCardInactive: { opacity: 0.65 },
  eventHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  eventTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  eventName: { fontSize: 16, fontWeight: '700', color: INK },
  eventDates: { fontSize: 12, color: INK3, marginTop: 4 },
  eventDesc: { fontSize: 13, color: INK2, lineHeight: 20 },
  eventFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  eventCreatedBy: { fontSize: 11, color: INK4, flex: 1 },
  annCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, gap: 8, borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)' },
  annCardPinned: { borderColor: GOLD + '55', borderWidth: 1.5 },
  annHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  annMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  annTitle: { fontSize: 14, fontWeight: '700', color: INK },
  annContent: { fontSize: 13, color: INK2, lineHeight: 20 },
  annFooter: {},
  annPostedBy: { fontSize: 11, color: INK4 },
  addAnnForm: { backgroundColor: '#fff', borderRadius: 14, padding: 16, gap: 10, borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)' },
  formLabel: { fontSize: 12, fontWeight: '600', color: INK2 },
  cohortSelector: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  cohortOption: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(43,34,24,0.12)', backgroundColor: '#f7f2ec' },
  cohortOptionOn: { backgroundColor: SAFFRON, borderColor: SAFFRON },
  cohortOptionText: { fontSize: 12, color: INK3 },
  cohortOptionTextOn: { color: '#fff', fontWeight: '600' },
  annTextarea: { backgroundColor: '#f7f2ec', borderRadius: 10, padding: 12, fontSize: 13, color: INK, minHeight: 90, borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)' },
  pinRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pinBox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1, borderColor: 'rgba(43,34,24,0.25)', alignItems: 'center', justifyContent: 'center' },
  pinBoxOn: { backgroundColor: SAFFRON, borderColor: SAFFRON },
  pinCheck: { color: '#fff', fontSize: 12, fontWeight: '700' },
  pinLabel: { fontSize: 13, color: INK2 },
  publishBtn: { paddingVertical: 11 },
});
