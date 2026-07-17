import { useLocalSearchParams, useRouter } from 'expo-router';
import { Calendar, ChevronLeft, Headphones, Video } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text as RNText, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AudioPlayer } from '@/components/audio-player';
import { Text } from '@/components/ui/text';
import { YouTubeFacade } from '@/components/youtube-facade';
import { useRecordSelfStudyMark, useSelfStudyArticleProgress, useSelfStudyCohortIds } from '@/lib/mutations/study';
import { useCurrentUser } from '@/lib/queries/profile';
import { speechCompleteDerive, useSpeechDetail, useSpeechLibrary, type SpeechBlock } from '@/lib/queries/self_study';
import { bookTitle } from '@/lib/utils';

// 大学演讲详情(D-15 改版·2026-07-02)。学修流=restricted 模式:看视频 + 读正文,免答题、不计考试
//   (大纲:限制性课=「至少听一遍上师传法的音视频、看一遍法本」+「不纳入考试范围」)。
// 打卡=看/读分项落库(record_self_study_mark,补录支持),圆满按 B 判定线应用层派生
//   (speechCompleteDerive:有视频=双条件;纯文字=读即圆满;盲=免读/聋=免听)。
// 归属路由不变(决策183):本书属在读专业 → self_study_records(扇出);否则 → personal 个人足迹。
// 上一篇/下一篇=跨册线性(useSpeechLibrary.flat),与课程「上一课/下一课」同手感(router.replace)。
const INK = '#2b2218';
const INK2 = '#55463a';
const INK3 = '#7e6d5b';
const SAFFRON = '#e07856';
const SAFFRON_DARK = '#b35535';
const CRIMSON = '#9f3a2e'; // 颂词专用色(对齐课程页 FaBen)
const SAGE = '#4d6e3d';

// 正文块渲染:对齐课程页 FaBen 样式(正文 18px / 颂词红色韵文+左竖线 / 小标题)。直接铺背景,无卡片。
function Block({ b }: { b: SpeechBlock }) {
  if (!b.text) return null;
  if (b.blockType === 'title' || b.blockType === 'inline_heading') {
    return (
      <Text className="font-serif" style={[styles.heading, b.headingLevel && b.headingLevel > 1 ? styles.headingSub : null]}>
        {b.headingMark ? `${b.headingMark} ` : ''}{b.text}
      </Text>
    );
  }
  if (b.blockType === 'verse') {
    return (
      <View style={styles.verseBlock}>
        <Text className="font-serif" style={styles.verse}>{b.text}</Text>
      </View>
    );
  }
  if (b.blockType === 'footnote') {
    return <RNText style={styles.footnote}>{b.text}</RNText>;
  }
  return <Text className="font-serif" style={styles.body}>{b.text}</Text>;
}

function Toggle({ active, onPress, icon, label }: { active: boolean; onPress: () => void; icon: ReactNode; label: string }) {
  return (
    <Pressable onPress={onPress} style={[styles.toggleBtn, active && { backgroundColor: SAFFRON }]}>
      {icon}
      <RNText style={{ fontSize: 13, fontWeight: '600', color: active ? '#fff' : INK2 }}>{label}</RNText>
    </Pressable>
  );
}

function CheckRow({ checked, onPress, label }: { checked: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable style={styles.checkRow} onPress={onPress}>
      <View style={[styles.checkBox, checked && { backgroundColor: SAFFRON, borderColor: SAFFRON }]}>
        {checked ? <RNText style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✓</RNText> : null}
      </View>
      <RNText style={{ fontSize: 14, color: INK, fontWeight: '600' }}>{label}</RNText>
    </Pressable>
  );
}

export default function SpeechDetail() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, error } = useSpeechDetail(id);
  const { data: library } = useSpeechLibrary();
  const { data: me } = useCurrentUser();

  // 归班解析(undefined=解析中 / []=无班或课外浏览 / 非空=在读专业本书的所有班)→ 决定落哪张表、扇出几条。
  const { data: resolvedCohortIds } = useSelfStudyCohortIds(data?.bookId);
  const { data: prog } = useSelfStudyArticleProgress(id, resolvedCohortIds);
  const mark = useRecordSelfStudyMark();

  const blind = (me?.accessibilityNeeds ?? []).includes('blind');
  const deaf = (me?.accessibilityNeeds ?? []).includes('deaf');

  // 标记弹层
  const [markOpen, setMarkOpen] = useState(false);
  const [markW, setMarkW] = useState(false);
  const [markR, setMarkR] = useState(false);
  const [backdate, setBackdate] = useState(false);
  const todayStr = new Date().toLocaleDateString('en-CA'); // 设备本地今天(时区跟手机·CLAUDE.md 个人打卡口径)
  const [backDate, setBackDate] = useState(todayStr);
  // 补录日期校验:格式合法(非 2/31 假日期)且不晚于今天(信任师兄,只挡未来与乱填;同 lesson 页)
  const backDateValid = (() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(backDate)) return false;
    const [y, m, d] = backDate.split('-').map(Number);
    const dt = new Date(backDate + 'T00:00:00');
    if (Number.isNaN(dt.getTime()) || dt.getFullYear() !== y || dt.getMonth() + 1 !== m || dt.getDate() !== d) return false;
    return backDate <= todayStr;
  })();

  // 读后感弹层
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');

  // 媒体:视频/音频标签切换 + 同类型多段标签(与课程页一致)。
  const [mediaType, setMediaType] = useState<'video' | 'audio'>('video');
  const [videoIdx, setVideoIdx] = useState(0);
  const [audioIdx, setAudioIdx] = useState(0);

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF4E9' }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={SAFFRON} /></View>
      </SafeAreaView>
    );
  }
  if (error || !data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF4E9' }} edges={['top']}>
        <View style={styles.top}>
          <Pressable hitSlop={8} onPress={() => router.back()}><ChevronLeft size={24} color={INK} /></Pressable>
          <Text className="font-serif" style={styles.topTitle} numberOfLines={1}>大学演讲</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <RNText style={{ color: SAFFRON_DARK, textAlign: 'center' }}>未找到这篇演讲,或暂无权限。</RNText>
        </View>
      </SafeAreaView>
    );
  }

  // 视频 / 音频 资源;媒体类型 + 段落索引(同类型有多段时用标签切换)。
  const videos = data.resources.filter((r) => r.kind === 'video' && r.videoId);
  const audios = data.resources.filter((r) => r.kind === 'audio');
  const hasVideo = videos.length > 0;
  const hasAudio = audios.length > 0;
  const hasMedia = hasVideo || hasAudio;
  const type: 'video' | 'audio' = mediaType === 'audio' && hasAudio ? 'audio' : hasVideo ? 'video' : 'audio';
  const list = type === 'video' ? videos : audios;
  const idx = Math.min(type === 'video' ? videoIdx : audioIdx, Math.max(0, list.length - 1));
  const cur = list[idx];

  // 圆满态与两维度既有标记(库端 status 为准;分维日期展示)
  const watched = !!prog?.watchedAt;
  const read = !!prog?.readAt;
  const done = prog?.status === 'completed';
  // 该篇需要哪些维度(B判定线口径下的展示;纯文字=只读一项)
  const needWatch = hasMedia && !deaf;
  const needRead = !blind || !hasMedia; // 盲人有媒体时免读;纯文字篇仍显示读(盲人客观无法完成,不臆造豁免)
  const capText = !hasMedia
    ? '本篇为纯文字 · 读完即圆满(免答题、不计考试)'
    : blind
      ? '看/听演讲即圆满(免读、免答题、不计考试)'
      : deaf
        ? '读文字稿即圆满(免听、免答题、不计考试)'
        : '看演讲 + 读文字稿即圆满(免答题、不计考试)';

  // 上一篇/下一篇:跨册线性(册尾直接翻到下一册第一篇)
  const flat = library?.flat ?? [];
  const flatIdx = flat.findIndex((a) => a.id === data.id);
  const prevArt = flatIdx > 0 ? flat[flatIdx - 1] : null;
  const nextArt = flatIdx >= 0 && flatIdx < flat.length - 1 ? flat[flatIdx + 1] : null;

  const effectiveDate = backdate ? backDate : undefined;
  const submitMarks = () => {
    // 依勾选逐项落库;圆满判定线(B口径)按提交后的最终状态派生,挂在最后一次调用上。
    const finalWatched = watched || markW;
    const finalRead = read || markR;
    const completed = speechCompleteDerive({ hasVideo: hasMedia, watched: finalWatched, read: finalRead, blind, deaf });
    const calls: { kind: 'watched' | 'read'; completed: boolean }[] = [];
    if (markW && !watched) calls.push({ kind: 'watched', completed: false });
    if (markR && !read) calls.push({ kind: 'read', completed: false });
    if (calls.length === 0) { setMarkOpen(false); return; }
    calls[calls.length - 1].completed = completed;
    for (const c of calls) {
      mark.mutate({ bookId: data.bookId, articleId: data.id, kind: c.kind, completed: c.completed, date: effectiveDate });
    }
    setMarkOpen(false);
  };

  const openMark = () => {
    setMarkW(needWatch && !watched);
    setMarkR(needRead && !read);
    setBackdate(false);
    setBackDate(todayStr);
    setMarkOpen(true);
  };

  const saveNotes = () => {
    mark.mutate({ bookId: data.bookId, articleId: data.id, notes: notesDraft.trim() || null });
    setNotesOpen(false);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF4E9' }} edges={['top']}>
      <View style={styles.top}>
        <Pressable hitSlop={8} onPress={() => router.back()}><ChevronLeft size={24} color={INK} /></Pressable>
        <Text className="font-serif" style={styles.topTitle} numberOfLines={1}>
          {data.bookTitle ? bookTitle(data.bookTitle) : '大学演讲'}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28, gap: 14 }}>
        <Text className="font-serif" style={styles.title}>{data.title}</Text>
        <RNText style={styles.caption}>大学演讲 · {capText}</RNText>

        {/* 媒体:视频/音频切换 + 多段标签 + 单个播放器 */}
        {hasMedia ? (
          <View style={{ gap: 10 }}>
            {hasVideo && hasAudio ? (
              <View style={styles.toggle}>
                <Toggle active={type === 'video'} onPress={() => setMediaType('video')} icon={<Video size={15} color={type === 'video' ? '#fff' : INK2} />} label="视频" />
                <Toggle active={type === 'audio'} onPress={() => setMediaType('audio')} icon={<Headphones size={15} color={type === 'audio' ? '#fff' : INK2} />} label="音频" />
              </View>
            ) : null}
            {list.length > 1 ? (
              <View style={styles.tabRow}>
                {list.map((r, i) => (
                  <Pressable key={r.id} onPress={() => (type === 'video' ? setVideoIdx(i) : setAudioIdx(i))} style={[styles.tab, i === idx && styles.tabOn]}>
                    <RNText style={{ fontSize: 12, fontWeight: '600', color: i === idx ? '#fff' : INK2 }}>{r.label || `${type === 'video' ? '视频' : '音频'}${i + 1}`}</RNText>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {cur ? (
              type === 'video' ? (
                <YouTubeFacade videoId={cur.videoId ?? undefined} title={cur.label ?? data.title} />
              ) : (
                <AudioPlayer url={cur.url} title={cur.label ?? data.title} subtitle={data.bookTitle ? bookTitle(data.bookTitle) : undefined} />
              )
            ) : null}
          </View>
        ) : null}

        {/* 法本正文(self_study_blocks)——直接铺背景,无矩形框 */}
        {data.blocks.length === 0 ? (
          <RNText style={{ fontSize: 13, color: INK3 }}>本篇暂无正文</RNText>
        ) : (
          <View style={{ gap: 4 }}>
            {data.blocks.map((b) => <Block key={b.id} b={b} />)}
          </View>
        )}

        {/* 完成进度(分维,库端为准) */}
        <View style={styles.progressRow}>
          {needWatch ? (
            <View style={[styles.dimBox, watched && styles.dimBoxOn]}>
              <RNText style={[styles.dimText, watched && styles.dimTextOn]}>{watched ? '✓ 已看演讲' : '○ 看演讲'}</RNText>
              {prog?.watchedAt ? <RNText style={styles.dimDate}>{prog.watchedAt}</RNText> : null}
            </View>
          ) : null}
          {needRead ? (
            <View style={[styles.dimBox, read && styles.dimBoxOn]}>
              <RNText style={[styles.dimText, read && styles.dimTextOn]}>{read ? '✓ 已读文字稿' : '○ 读文字稿'}</RNText>
              {prog?.readAt ? <RNText style={styles.dimDate}>{prog.readAt}</RNText> : null}
            </View>
          ) : null}
        </View>

        {done ? (
          <View style={{ gap: 10 }}>
            <View style={[styles.mark, styles.markDone]}>
              <RNText style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>✓ 本篇已圆满</RNText>
            </View>
            <Pressable style={styles.notesBtn} onPress={() => { setNotesDraft(prog?.notes ?? ''); setNotesOpen(true); }}>
              <RNText style={{ fontSize: 13, fontWeight: '600', color: SAFFRON_DARK }}>{prog?.notes ? '查看 / 修改读后感' : '写读后感(可选)'}</RNText>
            </Pressable>
            {prog?.notes ? <RNText style={styles.notesPreview} numberOfLines={3}>{prog.notes}</RNText> : null}
          </View>
        ) : (
          <Pressable style={[styles.mark, mark.isPending && styles.markDisabled]} disabled={mark.isPending} onPress={openMark}>
            <RNText style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{mark.isPending ? '记录中…' : '标记完成'}</RNText>
          </Pressable>
        )}
        {mark.isError ? (
          <RNText style={{ fontSize: 11, color: SAFFRON_DARK, textAlign: 'center' }}>记录失败,请重试。</RNText>
        ) : null}
        <RNText style={{ fontSize: 11, color: INK3, textAlign: 'center' }}>
          {resolvedCohortIds && resolvedCohortIds.length > 0
            ? resolvedCohortIds.length > 1
              ? `本书属你在读专业,完成计入 ${resolvedCohortIds.length} 个班级学修。`
              : '本书属你在读专业,完成计入班级学修。'
            : '自学按你的节奏走,完成计入个人足迹(不计班级)。'}
        </RNText>

        {/* 上一篇 / 下一篇(跨册线性) */}
        {flat.length > 0 ? (
          <View style={styles.navRow}>
            <Pressable
              style={[styles.navBtn, !prevArt && { opacity: 0.35 }]}
              disabled={!prevArt}
              onPress={() => { if (prevArt) router.replace(`/speech/${prevArt.id}` as never); }}
            >
              <RNText style={styles.navBtnText} numberOfLines={1}>‹ 上一篇</RNText>
              {prevArt ? <RNText style={styles.navTitle} numberOfLines={1}>{prevArt.title}</RNText> : null}
            </Pressable>
            <Pressable
              style={[styles.navBtn, styles.navBtnNext, !nextArt && { opacity: 0.35 }]}
              disabled={!nextArt}
              onPress={() => { if (nextArt) router.replace(`/speech/${nextArt.id}` as never); }}
            >
              <RNText style={[styles.navBtnText, { color: '#fff', textAlign: 'right' }]} numberOfLines={1}>下一篇 ›</RNText>
              {nextArt ? <RNText style={[styles.navTitle, { color: 'rgba(255,255,255,0.85)', textAlign: 'right' }]} numberOfLines={1}>{nextArt.title}</RNText> : null}
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      {/* 标记完成(看/读 + 补录日期,镜像 lesson 页完成确认) */}
      <Modal visible={markOpen} transparent animationType="slide" onRequestClose={() => setMarkOpen(false)}>
        {/* KeyboardAvoidingView(2026-07-17·PM真机反馈键盘挡住弹层输入框,全app排查后补齐) */}
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <Pressable style={styles.backdrop} onPress={() => setMarkOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} onPress={() => {}}>
            <View style={styles.handle} />
            <Text className="font-serif" style={{ fontSize: 17, fontWeight: '700', color: INK }}>标记完成</Text>
            <RNText style={{ fontSize: 12, color: INK3, marginTop: 2, marginBottom: 12 }}>勾选这次完成的项目</RNText>
            {needWatch && !watched ? <CheckRow checked={markW} onPress={() => setMarkW((v) => !v)} label="看 / 听演讲(视频或音频)" /> : null}
            {needRead && !read ? <CheckRow checked={markR} onPress={() => setMarkR((v) => !v)} label="读文字稿" /> : null}
            <Pressable style={styles.backRow} onPress={() => setBackdate((v) => !v)}>
              <Calendar size={14} color={backdate ? SAFFRON_DARK : INK3} /><RNText style={{ fontSize: 12, color: backdate ? SAFFRON_DARK : INK3 }}>完成日期:{backdate ? '补录(填真实过去日期)' : '今天'}</RNText>
            </Pressable>
            {backdate ? (
              <View style={{ marginTop: 8 }}>
                <TextInput
                  value={backDate}
                  onChangeText={setBackDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={INK3}
                  autoCapitalize="none"
                  keyboardType="numbers-and-punctuation"
                  maxLength={10}
                  style={[styles.dateInput, !backDateValid && { borderColor: CRIMSON }]}
                />
                <RNText style={{ fontSize: 11, color: backDateValid ? INK3 : CRIMSON, marginTop: 4 }}>
                  {backDateValid ? '填实际完成那天(不晚于今天),即时计入对应日。' : '日期需为 YYYY-MM-DD 且不晚于今天。'}
                </RNText>
              </View>
            ) : null}
            <Pressable
              style={[styles.mark, { marginTop: 12 }, ((!markW && !markR) || (backdate && !backDateValid)) && { opacity: 0.4 }]}
              disabled={(!markW && !markR) || (backdate && !backDateValid)}
              onPress={submitMarks}
            >
              <RNText style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>确认</RNText>
            </Pressable>
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* 读后感(可选·PRD 5.10.11 保留) */}
      <Modal visible={notesOpen} transparent animationType="slide" onRequestClose={() => setNotesOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <Pressable style={styles.backdrop} onPress={() => setNotesOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} onPress={() => {}}>
            <View style={styles.handle} />
            <Text className="font-serif" style={{ fontSize: 17, fontWeight: '700', color: INK }}>读后感(可选)</Text>
            <RNText style={{ fontSize: 12, color: INK3, marginTop: 2, marginBottom: 12 }}>只对你本人可见,随时可改。</RNText>
            <TextInput
              value={notesDraft}
              onChangeText={setNotesDraft}
              placeholder="这篇演讲带给你的收获…"
              placeholderTextColor={INK3}
              multiline
              style={styles.notesInput}
            />
            <Pressable style={[styles.mark, { marginTop: 12 }]} onPress={saveNotes}>
              <RNText style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>保存</RNText>
            </Pressable>
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  topTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: INK },
  title: { fontSize: 20, fontWeight: '700', color: INK, lineHeight: 30 },
  caption: { fontSize: 12, color: INK3, marginTop: -6 },

  toggle: { flexDirection: 'row', gap: 8 },
  toggleBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: 'rgba(43,34,24,0.06)' },
  tabRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9999, backgroundColor: 'rgba(43,34,24,0.06)' },
  tabOn: { backgroundColor: SAFFRON_DARK },

  // 正文样式(对齐课程页 FaBen)
  heading: { fontSize: 18, fontWeight: '700', color: INK2, marginTop: 8, lineHeight: 27 },
  headingSub: { fontSize: 16, color: SAFFRON_DARK },
  body: { fontSize: 18, lineHeight: 31, color: INK },
  verseBlock: { marginVertical: 4, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: 'rgba(224,120,86,0.45)' },
  verse: { fontSize: 19, lineHeight: 34, color: CRIMSON, fontWeight: '600' },
  footnote: { fontSize: 12, lineHeight: 20, color: INK3, marginTop: 4 },

  progressRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  dimBox: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(43,34,24,0.12)', alignItems: 'center', gap: 2 },
  dimBoxOn: { backgroundColor: '#f1f6ec', borderColor: SAGE },
  dimText: { fontSize: 14, fontWeight: '600', color: INK2 },
  dimTextOn: { color: SAGE },
  dimDate: { fontSize: 10, color: INK3 },
  mark: { paddingVertical: 13, borderRadius: 12, backgroundColor: SAFFRON, alignItems: 'center' },
  markDisabled: { backgroundColor: '#d9b8ab' },
  markDone: { backgroundColor: SAGE },
  notesBtn: { paddingVertical: 11, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(197,95,61,0.35)', alignItems: 'center' },
  notesPreview: { fontSize: 13, color: INK2, lineHeight: 20, backgroundColor: 'rgba(43,34,24,0.04)', borderRadius: 10, padding: 12 },

  navRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  navBtn: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(43,34,24,0.1)', gap: 2 },
  navBtnNext: { backgroundColor: SAFFRON, borderColor: SAFFRON },
  navBtnText: { fontSize: 13, fontWeight: '700', color: SAFFRON_DARK },
  navTitle: { fontSize: 11, color: INK3 },

  backdrop: { flex: 1, backgroundColor: 'rgba(20,14,8,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FBF4E9', borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingTop: 10 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(43,34,24,0.18)', marginBottom: 12 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  checkBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: 'rgba(43,34,24,0.25)', alignItems: 'center', justifyContent: 'center' },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10 },
  dateInput: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(43,34,24,0.15)', paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: INK },
  notesInput: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(43,34,24,0.12)', padding: 12, fontSize: 15, color: INK, minHeight: 120, textAlignVertical: 'top' },
});
