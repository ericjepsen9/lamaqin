import { Check, Pencil, Play, Presentation } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Linking, Modal, Platform, Pressable, StyleSheet, Text as RNText, TextInput, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { SlideViewer } from '@/components/slide-viewer';
import { Text } from '@/components/ui/text';
import { YouTubeFacade } from '@/components/youtube-facade';
import { useLogMeditationSession } from '@/lib/mutations/meditation';
import { MEDITATION_SESSION_MIN_MINUTES, useMeditationSummary } from '@/lib/queries/meditation';
import { testIds } from '@/lib/testids';
import { genClientToken } from '@/lib/utils';

// 观修「修」步正文(决策161·并进闻思流程,顶部=闻辅答修步骤条,本组件只渲染正文)。
// 交互:媒体切换(视频/课件,PM 2026-07-01 从 4 选项精简·音频/引导文去掉——引导文从未接过数据、音频接了但不留)+
//   单按钮(开始观修⇄完成并计时)+ 满 30 分钟自动显示「圆满」(不需手点)+「填写时间」手动补一笔(更新环与已完成)。
// 媒体切换控件挪到父组件(lesson/[id].tsx)顶部进度轴同一行,与闻思/法师辅导排布一致(PM 2026-07-01);本组件不再自持 media 状态。
// 大纲:每修法 ≥3 座 × ≥30 分钟(276 座 / 138 小时,升学硬条件,按具体愿在"修持"页记录);
//   本组件计时环的 ≥30 分钟「完成」记 1 座,落 meditation_sessions 个人历史(C8·2026-07-10 已接线,
//   两套不混·见 lib/queries/meditation.ts 头注)。
const INK = '#2b2218';
const INK2 = '#55463a';
const INK3 = '#7e6d5b';
const SAFFRON = '#e07856';
const SAFFRON_DARK = '#b35535';
const SAGE = '#6f9a86';
const MIN_SEC = MEDITATION_SESSION_MIN_MINUTES * 60;
export type GuanMedia = 'video' | 'ppt';

// 接真实观修资源(lesson_resources 里 speaker_name='观修' 那条:videoId/downloadUrl/slideImageUrls)。
// 课件:有逐页图片(运营/ETL 回填 slide_image_urls·2026-07-10)用 SlideViewer 幻灯浏览;
//   没有图片但有下载链接=旧数据兜底;两者都没有才显示"暂无课件"。
// 座次持久化(C8·2026-07-10 接线):落 meditation_sessions 个人历史(不接入愿状态机/升学统计,
//   两套不混——见 lib/queries/meditation.ts 头注);「累计」现读真实历史,不再随刷新/离开页面清零。
export function GuanStep({ lessonId, media, videoId, downloadUrl, slideImageUrls }: {
  lessonId: string; media: GuanMedia; videoId?: string; downloadUrl?: string | null; slideImageUrls?: string[] | null;
}) {
  const [sec, setSec] = useState(0);
  const [running, setRunning] = useState(false);
  const { data: summary } = useMeditationSummary(lessonId);
  const logSession = useLogMeditationSession();
  const [manualOpen, setManualOpen] = useState(false);
  const [manualVal, setManualVal] = useState('30');
  // 弱网幂等(2026-07-13):凭证跟"这一次计时"绑在一起(开始计时/填写时间时换新),不是每次点
  // "完成"都换新——这样即使双击/弱网重试让 onMain 在 sec 归零前被连叫两次,两次读到的都是
  // 同一个凭证,DB侧唯一索引才挡得住重复(逻辑同 quick-count-sheet.tsx 既有的 getToken 写法)。
  const [sessionToken, setSessionToken] = useState(() => genClientToken());

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  const reached = sec >= MIN_SEC;
  const pct = Math.min(sec / MIN_SEC, 1);
  const R = 84;
  const C = 2 * Math.PI * R;
  const mm = String(Math.floor(sec / 60)).padStart(2, '0');
  const ss = String(sec % 60).padStart(2, '0');
  const idle = sec === 0 && !running;

  const onMain = () => {
    if (idle) { setRunning(true); setSessionToken(genClientToken()); return; }
    const m = Math.round(sec / 60); // 完成并计时:满 30 计 1 座(落库·get 累计读时算)
    if (m > 0) logSession.mutate({ lessonId, durationMinutes: m, clientToken: sessionToken });
    setSec(0); setRunning(false);
  };
  const onManual = () => {
    const m = parseInt(manualVal, 10) || 0;
    if (m > 0) { setSec(m * 60); setRunning(false); setSessionToken(genClientToken()); } // 填写后:环更新到该时间,再点「完成」记入
    setManualOpen(false);
  };

  return (
    <View style={{ gap: 12 }}>
      {/* 观修媒体(真实:观修讲者资源)——视频接库;课件优先幻灯图片,无图退回下载链接;切换控件在父组件顶部进度轴行 */}
      {media === 'video' ? (
        <YouTubeFacade videoId={videoId ?? undefined} title="上师念修引导" />
      ) : slideImageUrls && slideImageUrls.length > 0 ? (
        <SlideViewer imageUrls={slideImageUrls} title="观修课件" />
      ) : downloadUrl ? (
        <Pressable style={styles.dlBtn} onPress={() => Linking.openURL(downloadUrl)}>
          <Presentation size={16} color={SAFFRON_DARK} /><RNText style={{ color: SAFFRON_DARK, fontWeight: '700' }}>下载课件</RNText>
        </Pressable>
      ) : (
        <RNText style={styles.empty}>本课观修暂无课件</RNText>
      )}

      {/* 计时打坐 = 一张卡(环 + 按钮 + 数据,无分割线;与视频之间加大间距) */}
      <View style={styles.guanCard}>
        <View style={{ width: 196, height: 196, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={196} height={196} style={StyleSheet.absoluteFill}>
            <Circle cx={98} cy={98} r={R} stroke="rgba(43,34,24,0.08)" strokeWidth={10} fill="none" />
            <Circle cx={98} cy={98} r={R} stroke={reached ? SAGE : SAFFRON} strokeWidth={10} fill="none" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} transform="rotate(-90 98 98)" />
          </Svg>
          <Text className="font-serif" style={{ fontSize: 42, fontWeight: '700', color: INK, letterSpacing: 1 }}>{mm}:{ss}</Text>
          {reached ? (
            <View style={styles.yuanman}><Check size={13} color="#fff" /><RNText style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>本座圆满</RNText></View>
          ) : (
            <RNText style={{ fontSize: 12, color: INK3, marginTop: 2 }}>建议每座 ≥ 30 分钟</RNText>
          )}
        </View>

        <View className="flex-row" style={{ gap: 12, marginTop: 16 }}>
          <Pressable testID={testIds.guan.mainButton} style={[styles.mainBtn, { backgroundColor: SAFFRON }, logSession.isPending && { opacity: 0.5 }]} disabled={logSession.isPending} onPress={onMain}>
            {idle ? <Play size={18} color="#fff" /> : <Check size={18} color="#fff" />}
            <RNText style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{logSession.isPending ? '记录中…' : idle ? '开始观修' : '完成并计时'}</RNText>
          </Pressable>
          <Pressable testID={testIds.guan.manualOpenButton} style={styles.editBtn} onPress={() => setManualOpen(true)}>
            <Pencil size={16} color={SAFFRON_DARK} /><RNText style={{ color: SAFFRON_DARK, fontWeight: '700', fontSize: 14 }}>填写时间</RNText>
          </Pressable>
        </View>

        <View style={styles.statsRow}>
          <Stat label="累计" value={`${summary?.sessionCount ?? 0} 座 · ${summary?.totalMinutes ?? 0} 分`} />
        </View>
      </View>
      <RNText style={{ fontSize: 11, color: INK3, textAlign: 'center' }}>计时仅辅助打坐(满 30 分钟为 1 座);正式座次与升学统计仍按「修持」页具体愿记录</RNText>

      {/* 填写时间 */}
      <Modal visible={manualOpen} transparent animationType="fade" onRequestClose={() => setManualOpen(false)}>
        {/* KeyboardAvoidingView(2026-07-17·PM真机反馈键盘挡住弹层输入框,全app排查后补齐) */}
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalRoot}>
          <View style={styles.dialog}>
            <Text className="font-serif" style={{ fontSize: 16, fontWeight: '700', color: INK }}>填写打坐时间</Text>
            <RNText style={{ fontSize: 12, color: INK3, marginTop: 4 }}>忘了计时 / 线下已打坐,直接填本座分钟数</RNText>
            <View style={styles.inputRow}>
              <TextInput testID={testIds.guan.manualInput} value={manualVal} onChangeText={setManualVal} keyboardType="number-pad" style={styles.input} />
              <RNText style={{ fontSize: 15, color: INK2 }}>分钟</RNText>
            </View>
            <View className="flex-row" style={{ gap: 10, marginTop: 16 }}>
              <Pressable style={[styles.dlgBtn, styles.dlgGhost]} onPress={() => setManualOpen(false)}><RNText style={{ color: INK2, fontWeight: '700' }}>取消</RNText></Pressable>
              <Pressable testID={testIds.guan.manualConfirmButton} style={[styles.dlgBtn, { backgroundColor: SAFFRON }]} onPress={onManual}><RNText style={{ color: '#fff', fontWeight: '700' }}>确认</RNText></Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <RNText style={{ fontSize: 11, color: INK3 }}>{label}</RNText>
      <Text className="font-serif" style={{ fontSize: 15, fontWeight: '700', color: INK, marginTop: 2 }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { fontSize: 13, color: INK3, paddingVertical: 24, textAlign: 'center' },
  dlBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(224,120,86,0.5)' },
  guanCard: { backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(43,34,24,0.06)', alignItems: 'center', paddingVertical: 20, paddingHorizontal: 16, marginTop: 10 },
  yuanman: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 9999, backgroundColor: SAGE },
  mainBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 9999 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 9999, borderWidth: 1, borderColor: 'rgba(224,120,86,0.5)' },
  statsRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', marginTop: 18 },
  modalRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  dialog: { width: '100%', backgroundColor: '#FBF4E9', borderRadius: 18, padding: 20 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  input: { flex: 1, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(43,34,24,0.12)', paddingHorizontal: 14, paddingVertical: 10, fontSize: 18, fontWeight: '700', color: INK },
  dlgBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12 },
  dlgGhost: { backgroundColor: 'rgba(43,34,24,0.06)' },
});
