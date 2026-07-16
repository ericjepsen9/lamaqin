import { useRouter } from 'expo-router';
import { ChevronDown, ChevronLeft, MessageCircle } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text as RNText, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { useSubmitFeedback, type FeedbackType } from '@/lib/mutations/feedback';
import { useMyCoaches } from '@/lib/queries/community';
import { testIds } from '@/lib/testids';
import { genClientToken } from '@/lib/utils';

// 帮助与反馈(设置 → 账号与隐私)。审计 P0「纠错走库」落地 2026-07-02:
//   意见反馈接真(feedback 表·决策117,类型可选);联系辅导员卡接真(本班 class_admins,无班则提示走反馈)。
// 守:关怀靠人工——联系辅导员是入口,不是 App 自动判别。
const INK = '#2b2218';
const INK2 = '#55463a';
const INK3 = '#7e6d5b';
const SAFFRON = '#e07856';
const SAFFRON_DARK = '#b35535';

const FAQ = [
  ['补录过去的学修记录算数吗?', '算。本应用信任师兄——填真实的过去日期即时生效、计入累计。唯一例外是内加行有 4 年限时、不跨届。'],
  ['在哪里看自己的学修进度?', '在「我的 → 学修档案」里,可以看到你的闻思 / 修持 / 观修进度、累计与里程碑。'],
  ['转正、学号怎么来的?', '入学先以旁听加入,辅导员核对后转为正式学员并发放学号,之后才计入升学。'],
  ['没打卡 / 断签了会怎样?', '系统会温和提醒你;若长时间未学修,辅导员也会主动关心你的学修。'],
  ['观修 / 计数填错了能改吗?', '能。计数记完可撤销,计数历史里也能改;观修时间可手动填写。'],
];

const FB_TYPES: { key: FeedbackType; label: string }[] = [
  { key: 'suggestion', label: '建议' },
  { key: 'bug', label: '问题' },
  { key: 'text_correction', label: '内容纠错' },
  { key: 'other', label: '其他' },
];

export default function Help() {
  const router = useRouter();
  const [open, setOpen] = useState<number | null>(0);
  const [fbType, setFbType] = useState<FeedbackType>('suggestion');
  const [feedback, setFeedback] = useState('');
  const [sent, setSent] = useState(false);
  const [token, setToken] = useState(() => genClientToken());
  const submit = useSubmitFeedback();
  const { data: coaches = [], isError: coachesError } = useMyCoaches();
  const zhumai = coaches.filter((c) => c.role === 'zhumai');

  const onSubmit = () => {
    submit.mutate(
      { type: fbType, content: feedback, clientToken: token },
      { onSuccess: () => { setSent(true); setFeedback(''); } },
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF4E9' }} edges={['top']}>
      <View style={styles.top}>
        <Pressable hitSlop={8} onPress={() => router.back()}><ChevronLeft size={24} color={INK} /></Pressable>
        <Text className="font-serif" style={{ fontSize: 17, fontWeight: '700', color: INK }}>帮助与反馈</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
        {/* 常见问题 */}
        <View style={{ gap: 8 }}>
          <Text className="font-serif" style={styles.section}>常见问题</Text>
          <View style={styles.group}>
            {FAQ.map(([q, a], i) => (
              <View key={q} style={i < FAQ.length - 1 ? styles.rowBorder : null}>
                <Pressable style={styles.qRow} onPress={() => setOpen(open === i ? null : i)}>
                  <RNText style={{ flex: 1, fontSize: 14, fontWeight: '600', color: INK }}>{q}</RNText>
                  <ChevronDown size={18} color={INK3} style={{ transform: [{ rotate: open === i ? '180deg' : '0deg' }] }} />
                </Pressable>
                {open === i ? <RNText style={styles.answer}>{a}</RNText> : null}
              </View>
            ))}
          </View>
        </View>

        {/* 联系辅导员(真数据:本班 class_admins;无班=自学师兄 → 提示走反馈) */}
        <View style={{ gap: 8 }}>
          <Text className="font-serif" style={styles.section}>联系辅导员</Text>
          {zhumai.length > 0 ? (
            zhumai.map((c) => (
              <View key={`${c.cohortName}-${c.name}`} style={styles.contactCard}>
                <View style={styles.contactIcon}><MessageCircle size={20} color={SAFFRON} /></View>
                <View style={{ flex: 1 }}>
                  <Text className="font-serif" style={{ fontSize: 15, fontWeight: '700', color: INK }}>{c.name}</Text>
                  <RNText style={{ fontSize: 12, color: INK3, marginTop: 1 }}>{c.cohortName} 辅导员 · 学修 / 关怀疑问都可以问</RNText>
                </View>
              </View>
            ))
          ) : coachesError ? (
            // 查询失败别落进"你当前自学、还没有班级辅导员"——那对有班的师兄是假消息(全文件审计 2026-07-12)
            <View style={styles.contactCard}>
              <View style={styles.contactIcon}><MessageCircle size={20} color={SAFFRON} /></View>
              <RNText style={{ flex: 1, fontSize: 13, color: INK2, lineHeight: 20 }}>
                加载失败,请检查网络后重试(不代表你没有班级辅导员)。也可直接在下方留言,管理员会看到。
              </RNText>
            </View>
          ) : (
            <View style={styles.contactCard}>
              <View style={styles.contactIcon}><MessageCircle size={20} color={SAFFRON} /></View>
              <RNText style={{ flex: 1, fontSize: 13, color: INK2, lineHeight: 20 }}>
                你当前自学、还没有班级辅导员。有任何问题可在下方留言,管理员会看到并与你联系。
              </RNText>
            </View>
          )}
        </View>

        {/* 意见反馈(决策117·写 feedback 表) */}
        <View style={{ gap: 8 }}>
          <Text className="font-serif" style={styles.section}>意见反馈</Text>
          {sent ? (
            <View style={[styles.card, { alignItems: 'center', paddingVertical: 22 }]}>
              <RNText style={{ fontSize: 15, fontWeight: '700', color: INK }}>已收到,随喜你的反馈 🙏</RNText>
              <RNText style={{ fontSize: 12, color: INK3, marginTop: 4 }}>管理员会认真查看</RNText>
              <Pressable style={{ marginTop: 12 }} onPress={() => { setToken(genClientToken()); setSent(false); }}>
                <RNText style={{ fontSize: 13, fontWeight: '700', color: SAFFRON_DARK }}>再写一条</RNText>
              </Pressable>
            </View>
          ) : (
            <View style={styles.card}>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                {FB_TYPES.map((t) => (
                  <Pressable key={t.key} style={[styles.typeChip, fbType === t.key && styles.typeChipOn]} onPress={() => setFbType(t.key)}>
                    <RNText style={{ fontSize: 13, fontWeight: '600', color: fbType === t.key ? '#fff' : INK2 }}>{t.label}</RNText>
                  </Pressable>
                ))}
              </View>
              <TextInput
                testID={testIds.help.feedbackInput}
                value={feedback}
                onChangeText={setFeedback}
                placeholder="使用上的问题、建议、内容纠错,或想对我们说的话…"
                placeholderTextColor={INK3}
                multiline
                style={styles.feedbackInput}
              />
              <Pressable
                testID={testIds.help.feedbackSubmitButton}
                style={[styles.submit, (!feedback.trim() || submit.isPending) && { opacity: 0.4 }]}
                disabled={!feedback.trim() || submit.isPending}
                onPress={onSubmit}
              >
                <RNText style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>{submit.isPending ? '提交中…' : '提交反馈'}</RNText>
              </Pressable>
              {submit.isError ? <RNText style={{ fontSize: 11, color: SAFFRON_DARK, marginTop: 8, textAlign: 'center' }}>提交失败,请检查网络后重试。</RNText> : null}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  section: { fontSize: 14, fontWeight: '700', color: INK3, marginLeft: 4 },
  group: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(43,34,24,0.06)', overflow: 'hidden' },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(43,34,24,0.06)' },
  qRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14 },
  answer: { fontSize: 13, color: INK2, lineHeight: 21, paddingHorizontal: 16, paddingBottom: 14, marginTop: -2 },
  contactCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(43,34,24,0.06)' },
  contactIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(224,120,86,0.10)', alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(43,34,24,0.06)' },
  typeChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 9999, backgroundColor: 'rgba(43,34,24,0.05)', borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)' },
  typeChipOn: { backgroundColor: SAFFRON, borderColor: SAFFRON },
  feedbackInput: { minHeight: 90, fontSize: 14, color: INK, textAlignVertical: 'top', lineHeight: 21 },
  submit: { marginTop: 12, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: SAFFRON },
});
