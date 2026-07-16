import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Switch, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AdminButton,
  AdminModal,
  Badge,
  FilterChips,
  ModalActions,
  ModalField,
  ModalFootnote,
  SCREEN_BG,
  ErrorState,
} from '@/components/ui/admin-kit';
import { Text } from '@/components/ui/text';
import { confirmAsync, notify } from '@/lib/dialog';
import { useDeleteEventPoster, useUploadEventPosterImage, useUploadPosterImage, useUpsertEventPoster, useUpsertPoster } from '@/lib/mutations/posters';
import { useCurrentUser } from '@/lib/queries/profile';
import { useAdminEventPosters, useAdminPosters, type AdminEventPoster } from '@/lib/queries/posters';
import { CRIMSON, GOLD_DARK as GOLD, GOLD_PALE, INK, INK3, INK4, SAFFRON, SAFFRON_DARK, SAFFRON_LIGHT, SAGE_DARK, SAGE_PALE } from '@/lib/theme';
import { addMonths, buddhaEvents, isCeremony, monthCells, todayUTC8, WEEKDAYS, type TibetanDay } from '@/lib/tibetan';
import { useTibetanLookup } from '@/lib/queries/tibetan-db';
import { useAdminLayout } from '../_layout';

const WIDE = 900;



type Tab = 'posters' | 'event' | 'special' | 'calendar';

// ─────────────────────────────────────────────────────────────────────
// 月度画报（home_posters：year/month/image_url/caption/is_active）
// 殊胜日不单独配图，统一以当月画报作首页背景（决策180·方案A3）
// ⑦ 法会期(event)/特别日(special)画报(2026-07-11 接线)：同表 poster_type 区分，起止日期段，
//   命中时【替代】当月画报作首页背景(PM 2026-07-11)，特别日优先于法会期(lib/queries/home.ts)。
//   无固定数量，做列表(新增/编辑/删除)而非月度那种固定 12 格。
// ─────────────────────────────────────────────────────────────────────
type Poster = { month: number; imageUrl: string | null; caption: string | null; isActive: boolean };

const MONTH_LABEL = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];

// ─────────────────────────────────────────────────────────────────────
// 藏历日历（决策137/172）：读 lib/tibetan(觉学 2026 全年·UTC+8 全球同观),与学员端同源。
// v1 为只读查阅(可切月);殊胜日如需更正走数据更新,不在后台逐日编辑。
// ─────────────────────────────────────────────────────────────────────

// ─── 画报卡 ───────────────────────────────────────────────────────────
function PosterCard({ poster, cardWidth, canEdit, onEdit }: { poster: Poster; cardWidth: number; canEdit: boolean; onEdit: () => void }) {
  const filled = !!poster.imageUrl;
  return (
    <View style={[styles.posterCard, { width: cardWidth }]}>
      {/* 缩略图:显已传真图(审计 P2:原渐变占位看不出传了什么) */}
      <View style={[styles.posterThumb, filled ? styles.posterThumbFilled : styles.posterThumbEmpty]}>
        {filled ? (
          <>
            <Image source={{ uri: poster.imageUrl! }} resizeMode="cover" style={StyleSheet.absoluteFill} />
            <View style={styles.posterThumbShade} />
            <Text className="font-serif" style={styles.posterThumbMonth}>{MONTH_LABEL[poster.month - 1]}</Text>
            <View style={styles.posterBadgeWrap}>
              <Badge tone={poster.isActive ? 'sage' : 'neutral'}>{poster.isActive ? '启用中' : '已停用'}</Badge>
            </View>
          </>
        ) : (
          <Text style={styles.posterEmptyText}>＋ 未上传</Text>
        )}
      </View>
      <View style={styles.posterMeta}>
        <Text style={styles.posterMonthLabel}>{MONTH_LABEL[poster.month - 1]}</Text>
        {poster.caption ? (
          <Text style={styles.posterCaption} numberOfLines={1}>{poster.caption}</Text>
        ) : (
          <Text style={styles.posterCaptionEmpty}>暂无诗句</Text>
        )}
      </View>
      {canEdit && (
        <AdminButton variant="secondary" size="sm" onPress={onEdit} style={styles.posterBtn}>
          {filled ? '替换 / 编辑' : '上传画报'}
        </AdminButton>
      )}
    </View>
  );
}

// ─── 藏历日格(真实数据·只读) ──────────────────────────────────────────
function DayCell({ day, tib, selected, today, onPress }: { day: number; tib: TibetanDay | undefined; selected: boolean; today: boolean; onPress: () => void }) {
  const ceremony = isCeremony(tib);
  return (
    <Pressable onPress={onPress} style={[styles.dayCell, tib?.auspicious && styles.dayCellAuspicious, ceremony && styles.dayCellCeremony, selected && styles.dayCellSelected]}>
      <Text style={[styles.dayCellGreg, today && !selected && styles.dayCellGregToday, selected && styles.dayCellGregSelected]}>{day}</Text>
      {tib ? <Text numberOfLines={1} style={styles.dayCellTib}>{tib.tibetan}</Text> : null}
      {tib?.auspicious ? <Text style={styles.dayCellFlower}>🌺</Text> : null}
      {ceremony && !tib?.auspicious ? <View style={styles.dayCellEventDot} /> : null}
    </Pressable>
  );
}

export default function CalendarAdmin() {
  const { setTitle } = useAdminLayout();
  const isAdmin = useCurrentUser().data?.role === 'admin'; // 审计 P1:原 MOCK_ROLE 写死,接真
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE;
  const [tab, setTab] = useState<Tab>('posters');
  const [year] = useState(2026);
  const { data: posters = [], isLoading: postersLoading, error: postersError } = useAdminPosters(year);
  const upsertPoster = useUpsertPoster();
  const [editingPoster, setEditingPoster] = useState<Poster | null>(null);

  // 藏历日历:真实数据(lib/tibetan);selected = 选中公历日 YYYY-MM-DD,默认今天(UTC+8)。月导航 = 移动 selected。
  const today = todayUTC8();
  const [selected, setSelected] = useState(today);

  useEffect(() => { setTitle('藏历画报'); }, [setTitle]);
  const cols = isWide ? 4 : 2;
  const gap = 12;
  const horizontalPadding = 40;
  const cardWidth = (Math.min(width, WIDE + 240) - horizontalPadding - gap * (cols - 1)) / cols;

  const calendarCells = monthCells(selected);
  const selYear = Number(selected.slice(0, 4));
  const selMonth = Number(selected.slice(5, 7));
  const tib = useTibetanLookup(selected);   // 设计⑥:共享库优先·本地JSON兜底
  const selectedTib = tib(selected);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'posters', label: '月度画报' },
    { key: 'event', label: '法会期画报' },
    { key: 'special', label: '特别日画报' },
    { key: 'calendar', label: '藏历日历' },
  ];

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* 头部 + Tab 切换 */}
        <View style={styles.headerCard}>
          <Text className="font-serif" style={styles.headerTitle}>藏历画报</Text>
          <Text style={styles.headerSub}>首页月度画报 + 藏历殊胜日维护（仅管理员）</Text>
          <FilterChips items={tabs} value={tab} onChange={setTab} style={styles.tabRow} />
        </View>

        {tab === 'posters' ? (
          <>
            {/* 说明条 */}
            <View style={styles.noticeBox}>
              <Text style={styles.noticeText}>
                每月一张画报，同时作【首页 + 藏历页】的全屏背景；殊胜日不单独配图，统一以当月画报呈现。无画报时降级为金色藏地天空渐变。
              </Text>
            </View>

            {/* 年份 */}
            <View style={styles.yearRow}>
              <Text style={styles.yearLabel}>{year} 年</Text>
              <Text style={styles.yearCount}>已上传 {posters.filter(p => p.imageUrl).length} / 12 月</Text>
            </View>

            {/* 12 月网格 */}
            <View style={[styles.posterGrid, { gap }]}>
              {postersError ? <ErrorState /> : postersLoading ? <ActivityIndicator color={SAFFRON} style={{ paddingVertical: 30 }} /> : posters.map(p => <PosterCard key={p.month} poster={p} cardWidth={cardWidth} canEdit={isAdmin} onEdit={() => setEditingPoster(p)} />)}
            </View>
          </>
        ) : tab === 'event' || tab === 'special' ? (
          <EventPosterList posterType={tab} canEdit={isAdmin} />
        ) : (
          <>
            {/* 数据来源说明(只读) */}
            <View style={styles.noticeBox}>
              <Text style={styles.noticeText}>
                藏历数据随 App 版本内置(觉学 2026 全年 · UTC+8 全球同观),与学员端同源。此处为只读查阅;殊胜日如需更正,走数据更新,不在后台逐日编辑。
              </Text>
            </View>

            {/* 月导航(可切月) */}
            <View style={styles.monthNav}>
              <Pressable hitSlop={10} onPress={() => setSelected(addMonths(selected, -1))}><Text style={styles.monthNavArrow}>‹</Text></Pressable>
              <Text className="font-serif" style={styles.monthNavLabel}>{selYear} 年 {selMonth} 月</Text>
              <Pressable hitSlop={10} onPress={() => setSelected(addMonths(selected, 1))}><Text style={styles.monthNavArrow}>›</Text></Pressable>
            </View>

            {/* 星期表头 */}
            <View style={styles.weekHeader}>
              {WEEKDAYS.map(w => (
                <Text key={w} style={styles.weekHeaderText}>{w}</Text>
              ))}
            </View>

            {/* 日历网格(真实数据) */}
            <View style={styles.calendarGrid}>
              {calendarCells.map((ymd, i) => (
                ymd === null
                  ? <View key={`e${i}`} style={styles.dayCell} />
                  : <DayCell key={ymd} day={Number(ymd.slice(8))} tib={tib(ymd)} selected={selected === ymd} today={today === ymd} onPress={() => setSelected(ymd)} />
              ))}
            </View>

            {/* 图例 */}
            <View style={styles.legendRow}>
              <View style={styles.legendItem}><Text style={styles.legendFlower}>🌺</Text><Text style={styles.legendText}>修法功德日（殊胜日）</Text></View>
              <View style={styles.legendItem}><View style={styles.legendDot} /><Text style={styles.legendText}>法会 / 圣诞</Text></View>
            </View>

            {/* 选中日详情(只读) */}
            {selectedTib ? (
              <View style={styles.dayDetailCard}>
                <View style={styles.dayDetailHeader}>
                  <Text className="font-serif" style={styles.dayDetailDate}>{selMonth}月{Number(selected.slice(8))}日</Text>
                  <Text style={styles.dayDetailTib}>
                    藏历 {selectedTib.tibetanMonth} {selectedTib.isIntercalary ? '闰' : ''}{selectedTib.tibetan} · 农历 {selectedTib.lunar}
                  </Text>
                  {selectedTib.auspicious && <Text style={styles.dayDetailFlower}>🌺 殊胜日</Text>}
                </View>
                {buddhaEvents(selectedTib).length > 0 && (
                  <View style={styles.dayDetailEvent}>
                    {buddhaEvents(selectedTib).map((e, i) => (
                      <Text key={i} style={styles.dayDetailEventText}>· {e}</Text>
                    ))}
                  </View>
                )}
                {selectedTib.tags.length > 0 && (
                  <View style={styles.tagRow}>
                    {selectedTib.tags.map(t => (
                      <Badge key={t} tone="gold">{t}</Badge>
                    ))}
                  </View>
                )}
                {selectedTib.publicHoliday ? (
                  <Text style={styles.dayDetailTib}>{selectedTib.publicHoliday}</Text>
                ) : null}
              </View>
            ) : (
              <View style={styles.dayDetailCard}>
                <Text style={styles.dayEmptyText}>该日无藏历数据</Text>
              </View>
            )}
          </>
        )}

      </ScrollView>

      <PosterEditModal
        poster={editingPoster}
        year={year}
        onClose={() => setEditingPoster(null)}
        onSave={(next) => upsertPoster.mutate(
          { year, month: next.month, imageUrl: next.imageUrl, caption: next.caption, isActive: next.isActive },
          { onError: (e) => notify('保存失败', (e as Error)?.message ?? '请重试,或确认有管理员权限。') },
        )}
      />
    </SafeAreaView>
  );
}

// 画报编辑:设备选图直传(posters 桶)或 粘贴链接;+ 诗句 + 启用/停用 → home_posters。
function PosterEditModal({ poster, year, onClose, onSave }: { poster: Poster | null; year: number; onClose: () => void; onSave: (p: Poster) => void }) {
  const [imageUrl, setImageUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [isActive, setIsActive] = useState(true);
  const uploadImg = useUploadPosterImage();
  useEffect(() => {
    if (poster) { setImageUrl(poster.imageUrl ?? ''); setCaption(poster.caption ?? ''); setIsActive(poster.isActive); }
  }, [poster]);
  if (!poster) return null;

  const pickAndUpload = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { notify('无法访问相册', '请在系统设置允许访问相册后重试。'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    uploadImg.mutate(
      { uri: a.uri, year, month: poster.month, contentType: a.mimeType },
      { onSuccess: (url) => setImageUrl(url), onError: (e) => notify('上传失败', (e as Error)?.message ?? '请重试,或确认有管理员权限。') },
    );
  };

  return (
    <AdminModal visible onClose={onClose} title={`${MONTH_LABEL[poster.month - 1]}画报`} dismissOnOverlay={false}>
      <View style={styles.formSection}>
        <Text style={styles.formLabel}>画报图片</Text>
        <Pressable style={styles.uploadBox} onPress={pickAndUpload} disabled={uploadImg.isPending}>
          {uploadImg.isPending ? (
            <ActivityIndicator color={SAFFRON} />
          ) : imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.uploadPreview} resizeMode="cover" />
          ) : (
            <Text style={styles.uploadHint}>＋ 点这里从设备选图上传</Text>
          )}
        </Pressable>
        {imageUrl && !uploadImg.isPending ? <Text style={styles.uploadReplace}>点图可替换</Text> : null}
      </View>
      <ModalField label="或粘贴图片链接" value={imageUrl} onChangeText={setImageUrl} placeholder="https://…" />
      <ModalField label="诗句 / 标题（可选）" value={caption} onChangeText={setCaption} placeholder="如：萨嘎达瓦 · 普门共修" />
      <View style={styles.switchRow}>
        <Text style={styles.formLabel}>启用为当月首页背景</Text>
        <Switch value={isActive} onValueChange={setIsActive} trackColor={{ true: SAFFRON, false: INK4 }} />
      </View>
      <ModalActions>
        <AdminButton variant="negative" onPress={onClose} style={{ flex: 1 }}>取消</AdminButton>
        <AdminButton variant="primary" onPress={async () => {
          // 清空链接=移除当月画报(破坏性),二次确认(审计 P2)
          if (poster.imageUrl && !imageUrl.trim() && !(await confirmAsync(`移除 ${poster.month} 月画报?`, '保存后当月首页恢复默认背景;可随时重新上传。', '移除'))) return;
          onSave({ ...poster, imageUrl: imageUrl.trim() || null, caption: caption.trim() || null, isActive });
          onClose();
        }} style={{ flex: 1 }}>保存</AdminButton>
      </ModalActions>
      <ModalFootnote>填链接即存入当月画报、立即生效;清空链接则移除当月画报。也可以用上方"从设备选图上传"直接传图,两种方式二选一。</ModalFootnote>
    </AdminModal>
  );
}

// ─── 法会期(event)/特别日(special)画报:列表 + 新增/编辑/删除(⑦·2026-07-11) ──────────
const EVENT_LABEL: Record<'event' | 'special', string> = { event: '法会期', special: '特别日' };

// 日期段是否含"今天"(todayUTC8·同藏历一套口径);两日期段是否重叠(闭区间,首尾相接也算重叠)。
function inRange(start: string, end: string, today: string): boolean { return start <= today && today <= end; }
function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean { return aStart <= bEnd && bStart <= aEnd; }

function EventPosterList({ posterType, canEdit }: { posterType: 'event' | 'special'; canEdit: boolean }) {
  const { data: items = [], isLoading, error } = useAdminEventPosters(posterType);
  const [editing, setEditing] = useState<AdminEventPoster | 'new' | null>(null);
  const del = useDeleteEventPoster();
  const label = EVENT_LABEL[posterType];
  const today = todayUTC8();

  return (
    <>
      <View style={styles.noticeBox}>
        <Text style={styles.noticeText}>
          {label}画报按起止日期覆盖;日期段内首页画报由此图【替代】当月画报(不叠加)。{posterType === 'event' ? '与特别日重叠时,特别日优先。' : '优先级高于法会期与月度画报。'}
        </Text>
      </View>

      {canEdit ? (
        <AdminButton variant="primary" onPress={() => setEditing('new')} style={{ alignSelf: 'flex-start' }}>
          ＋ 新增{label}画报
        </AdminButton>
      ) : null}

      {error ? (
        <ErrorState />
      ) : isLoading ? (
        <ActivityIndicator color={SAFFRON} style={{ paddingVertical: 30 }} />
      ) : items.length === 0 ? (
        <Text style={styles.posterCaptionEmpty}>暂无{label}画报</Text>
      ) : (
        <View style={{ gap: 10 }}>
          {items.map((it) => {
            const activeToday = it.isActive && inRange(it.startDate, it.endDate, today);
            return (
            <View key={it.id} style={styles.eventRow}>
              {it.imageUrl ? (
                <Image source={{ uri: it.imageUrl }} style={styles.eventThumb} resizeMode="cover" />
              ) : (
                <View style={[styles.eventThumb, styles.posterThumbEmpty]} />
              )}
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.posterMonthLabel}>{it.startDate} ~ {it.endDate}</Text>
                <Text style={it.caption ? styles.posterCaption : styles.posterCaptionEmpty} numberOfLines={1}>
                  {it.caption ?? '暂无诗句'}
                </Text>
                {/* 状态标记(2026-07-11 打磨):不再只显静态启用/停用——"今天生效中"才是管理员真正关心的
                    (今天首页是不是真在显示这张);已启用但不在当前日期段内,标"已启用·非当前日期"以防误解。 */}
                <Badge tone={activeToday ? 'sage' : it.isActive ? 'gold' : 'neutral'}>
                  {activeToday ? '今天生效中' : it.isActive ? '已启用 · 非当前日期' : '已停用'}
                </Badge>
              </View>
              {canEdit ? (
                <View style={{ gap: 6 }}>
                  <AdminButton variant="secondary" size="sm" onPress={() => setEditing(it)}>编辑</AdminButton>
                  <AdminButton
                    variant="danger"
                    size="sm"
                    onPress={async () => {
                      const msg = activeToday
                        ? '这条画报当前正在首页展示中,删除后首页将恢复为下一优先级的画报(法会期/月度画报或渐变兜底)。此操作不可恢复。'
                        : '删除后不可恢复;不影响其它日期段的画报。';
                      if (await confirmAsync(`删除这条${label}画报?`, msg, '删除')) {
                        del.mutate({ id: it.id, posterType });
                      }
                    }}
                  >
                    删除
                  </AdminButton>
                </View>
              ) : null}
            </View>
            );
          })}
        </View>
      )}

      <EventPosterEditModal
        key={editing === 'new' ? 'new' : editing === null ? 'closed' : editing.id}
        posterType={posterType}
        editing={editing}
        onClose={() => setEditing(null)}
      />
    </>
  );
}

function isValidYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(s + 'T00:00:00');
  return !Number.isNaN(dt.getTime()) && dt.getFullYear() === y && dt.getMonth() + 1 === m && dt.getDate() === d;
}

// editing 由外层传 key(见 EventPosterList 调用处)保证每次换选中项都是全新实例,
// 故直接用 lazy initializer 取初值即可,不需要 useEffect 同步(躲开 set-state-in-effect 连锁重渲染)。
function EventPosterEditModal({ posterType, editing, onClose }: {
  posterType: 'event' | 'special';
  editing: AdminEventPoster | 'new' | null;
  onClose: () => void;
}) {
  const initial = editing && editing !== 'new' ? editing : null;
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? '');
  const [caption, setCaption] = useState(initial?.caption ?? '');
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [startDate, setStartDate] = useState(initial?.startDate ?? '');
  const [endDate, setEndDate] = useState(initial?.endDate ?? '');
  const uploadImg = useUploadEventPosterImage();
  const upsert = useUpsertEventPoster();
  const { data: existing = [] } = useAdminEventPosters(posterType); // 复用列表同一 queryKey,不重复请求
  const label = EVENT_LABEL[posterType];

  if (!editing) return null;

  const rangeValid = isValidYmd(startDate) && isValidYmd(endDate) && startDate <= endDate;
  const canSave = !!imageUrl.trim() && rangeValid;
  // 日期重叠提醒(2026-07-11 打磨):非阻断,只警示——重叠期间按起始日期较晚的那条生效(见 home.ts)。
  const selfId = editing !== 'new' ? editing.id : null;
  const overlapping = rangeValid
    ? existing.filter((o) => o.id !== selfId && o.isActive && rangesOverlap(startDate, endDate, o.startDate, o.endDate))
    : [];

  const pickAndUpload = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { notify('无法访问相册', '请在系统设置允许访问相册后重试。'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    uploadImg.mutate(
      { uri: a.uri, posterType, contentType: a.mimeType },
      { onSuccess: (url) => setImageUrl(url), onError: (e) => notify('上传失败', (e as Error)?.message ?? '请重试,或确认有管理员权限。') },
    );
  };

  return (
    <AdminModal visible onClose={onClose} title={editing === 'new' ? `新增${label}画报` : `编辑${label}画报`} dismissOnOverlay={false}>
      <View style={styles.formSection}>
        <Text style={styles.formLabel}>画报图片</Text>
        <Pressable style={styles.uploadBox} onPress={pickAndUpload} disabled={uploadImg.isPending}>
          {uploadImg.isPending ? (
            <ActivityIndicator color={SAFFRON} />
          ) : imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.uploadPreview} resizeMode="cover" />
          ) : (
            <Text style={styles.uploadHint}>＋ 点这里从设备选图上传</Text>
          )}
        </Pressable>
        {imageUrl && !uploadImg.isPending ? <Text style={styles.uploadReplace}>点图可替换</Text> : null}
      </View>
      <ModalField label="或粘贴图片链接" value={imageUrl} onChangeText={setImageUrl} placeholder="https://…" />
      <ModalField label="开始日期" value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" />
      <ModalField label="结束日期" value={endDate} onChangeText={setEndDate} placeholder="YYYY-MM-DD" />
      {(startDate || endDate) && !rangeValid ? (
        <Text style={{ fontSize: 11, color: CRIMSON, marginTop: -8, marginBottom: 8 }}>日期需为 YYYY-MM-DD 格式,且开始 ≤ 结束。</Text>
      ) : null}
      {overlapping.length > 0 ? (
        <Text style={{ fontSize: 11, color: GOLD, marginTop: -8, marginBottom: 8, lineHeight: 17 }}>
          ⚠️ 与 {overlapping.length} 条已启用的{label}画报日期重叠({overlapping.map((o) => `${o.startDate}~${o.endDate}`).join('、')})。
          不会报错,但重叠期间只有起始日期较晚的那条会显示——仍可保存,请确认这是您想要的效果。
        </Text>
      ) : null}
      <ModalField label="诗句 / 标题(可选)" value={caption} onChangeText={setCaption} placeholder={posterType === 'event' ? '如:萨嘎达瓦月 · 共修回向' : '如:上师诞辰 · 特别共修'} />
      <View style={styles.switchRow}>
        <Text style={styles.formLabel}>启用</Text>
        <Switch value={isActive} onValueChange={setIsActive} trackColor={{ true: SAFFRON, false: INK4 }} />
      </View>
      <ModalActions>
        <AdminButton variant="negative" onPress={onClose} style={{ flex: 1 }}>取消</AdminButton>
        <AdminButton
          variant="primary"
          disabled={!canSave}
          onPress={() => {
            upsert.mutate(
              {
                id: editing !== 'new' ? editing.id : undefined,
                posterType,
                startDate,
                endDate,
                imageUrl: imageUrl.trim(),
                caption: caption.trim() || null,
                isActive,
              },
              { onSuccess: onClose, onError: (e) => notify('保存失败', (e as Error)?.message ?? '请重试,或确认有管理员权限。') },
            );
          }}
          style={{ flex: 1 }}
        >
          保存
        </AdminButton>
      </ModalActions>
      <ModalFootnote>{label}画报在起止日期内会替代当月画报作首页背景;日期段外自动恢复当月画报(或渐变兜底)。</ModalFootnote>
    </AdminModal>
  );
}

const styles = StyleSheet.create({
  posterThumbShade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(20,14,8,0.28)' },
  root: { flex: 1, backgroundColor: SCREEN_BG },
  scroll: { padding: 20, gap: 14, paddingBottom: 40 },

  // 头部
  headerCard: { backgroundColor: '#fff', borderRadius: 18, padding: 20, gap: 4, borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)', shadowColor: '#2b2218', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 2 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: INK },
  headerSub: { fontSize: 13, color: INK3 },
  tabRow: { marginTop: 12 },

  // 通用说明条
  noticeBox: { backgroundColor: GOLD_PALE, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: GOLD + '22' },
  noticeText: { fontSize: 12, color: GOLD, lineHeight: 19 },

  // 画报
  yearRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  yearLabel: { fontSize: 16, fontWeight: '700', color: INK },
  yearCount: { fontSize: 12, color: INK3 },
  posterGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  posterCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)', overflow: 'hidden' },
  posterThumb: { height: 96, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  posterThumbFilled: { backgroundColor: GOLD_PALE },
  posterThumbEmpty: { backgroundColor: 'rgba(43,34,24,0.04)', borderBottomWidth: 1, borderBottomColor: 'rgba(43,34,24,0.06)' },

  // 法会期/特别日画报列表行
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, padding: 10, borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)' },
  eventThumb: { width: 64, height: 64, borderRadius: 10 },
  posterThumbMonth: { fontSize: 20, fontWeight: '700', color: GOLD },
  posterEmptyText: { fontSize: 13, color: INK4 },
  posterBadgeWrap: { position: 'absolute', top: 6, right: 6 },
  posterMeta: { padding: 10, gap: 2 },
  posterMonthLabel: { fontSize: 13, fontWeight: '600', color: INK },
  posterCaption: { fontSize: 11, color: INK3 },
  posterCaptionEmpty: { fontSize: 11, color: INK4, fontStyle: 'italic' },
  posterBtn: { margin: 10, marginTop: 0 },

  // 导入
  importCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)' },
  importTitle: { fontSize: 14, fontWeight: '700', color: INK },
  importSub: { fontSize: 11, color: INK3, marginTop: 2 },

  // 月导航
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24, paddingVertical: 4 },
  monthNavArrow: { fontSize: 26, color: SAFFRON_DARK, fontWeight: '600' },
  monthNavLabel: { fontSize: 17, fontWeight: '700', color: INK },

  // 日历
  weekHeader: { flexDirection: 'row', width: '100%', maxWidth: 600, alignSelf: 'center', marginTop: 2 },
  weekHeaderText: { flex: 1, textAlign: 'center', fontSize: 13, color: INK3, fontWeight: '600' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', width: '100%', maxWidth: 600, alignSelf: 'center', backgroundColor: '#fff', borderRadius: 16, padding: 8, borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)' },
  dayCell: { width: `${100 / 7}%`, aspectRatio: 1.02, alignItems: 'center', justifyContent: 'center', borderRadius: 12, position: 'relative' },
  dayCellSelected: { backgroundColor: SAFFRON_LIGHT, borderWidth: 1.5, borderColor: SAFFRON },
  dayCellAuspicious: { backgroundColor: GOLD_PALE },
  dayCellCeremony: { backgroundColor: 'rgba(161,60,46,0.08)' },
  dayCellGreg: { fontSize: 18, fontWeight: '700', color: INK },
  dayCellGregSelected: { color: SAFFRON_DARK },
  dayCellGregToday: { color: SAFFRON_DARK },
  dayCellTib: { fontSize: 11, color: INK4, marginTop: 2, maxWidth: '92%' },
  dayCellFlower: { position: 'absolute', top: 4, right: 6, fontSize: 11 },
  dayCellEventDot: { position: 'absolute', top: 9, right: 10, width: 6, height: 6, borderRadius: 3, backgroundColor: SAGE_DARK },

  // 图例
  legendRow: { flexDirection: 'row', gap: 18, paddingHorizontal: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendFlower: { fontSize: 12 },
  legendDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: SAGE_DARK },
  legendText: { fontSize: 11, color: INK3 },

  // 选中日详情
  dayDetailCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, gap: 10, borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)' },
  dayDetailHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  dayDetailDate: { fontSize: 18, fontWeight: '700', color: INK },
  dayDetailTib: { fontSize: 13, color: INK3 },
  dayDetailFlower: { fontSize: 13, color: GOLD, fontWeight: '700', marginLeft: 'auto' },
  dayDetailEvent: { backgroundColor: SAGE_PALE, borderRadius: 8, padding: 10 },
  dayDetailEventText: { fontSize: 13, color: SAGE_DARK, fontWeight: '600' },
  tagRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  dayEditBtn: { alignSelf: 'flex-start' },
  dayEmptyText: { fontSize: 13, color: INK4, textAlign: 'center', paddingVertical: 8 },

  // 弹窗内业务表单（弹窗外壳/标题/操作行/脚注已统一走 admin-kit）
  formSection: { marginBottom: 14 },
  formLabel: { fontSize: 12, fontWeight: '600', color: INK3, letterSpacing: 0.5, marginBottom: 8 },
  uploadBox: { height: 130, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: SAFFRON + '66', backgroundColor: SAFFRON_LIGHT + '66', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', paddingHorizontal: 12 },
  uploadHint: { fontSize: 13, color: SAFFRON_DARK, fontWeight: '500', textAlign: 'center' },
  uploadPreview: { width: '100%', height: '100%', borderRadius: 9 },
  uploadReplace: { fontSize: 11, color: INK4, textAlign: 'center', marginTop: 4 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  importHint: { fontSize: 12, color: INK3, lineHeight: 18 },
});
