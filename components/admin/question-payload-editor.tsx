import { useState } from 'react';
import { Pressable, StyleSheet, Text as RNText, TextInput, View } from 'react-native';

import { type QuestionPayload, type QuestionType } from '@/lib/queries/admin/quiz';

// 客观题选项/答案编辑器(单选/判断/填空/记忆卡/颂词组句/颂词续接)。
// 产出 payload 与学员端 lesson/[id].tsx → QuestionCard 映射一致(options/answer/back/tokens/distractors/hint/previousLine)。
// 列表类(选项/词块)用「每行一个」文本框,顺序=行序(颂词/续接的 tokens 必须按正确顺序输入)。
const INK = '#2b2218';
const INK2 = '#55463a';
const INK3 = '#7e6d5b';
const SAFFRON = '#e07856';
const SAFFRON_DARK = '#b35535';

type Local = {
  optionsText: string;
  answer: string;
  back: string;
  tokensText: string;
  distractorsText: string;
  hint: string;
  previousLine: string;
};

const toLines = (t: string) => t.split('\n').map((s) => s.trim()).filter(Boolean);

export function QuestionPayloadEditor({ type, initial, onChange }: {
  type: QuestionType;
  initial: QuestionPayload;
  onChange: (p: QuestionPayload) => void;
}) {
  const [local, setLocal] = useState<Local>(() => ({
    optionsText: (initial.options ?? []).join('\n'),
    answer: initial.answer ?? '',
    back: initial.back ?? '',
    tokensText: (initial.tokens ?? []).join('\n'),
    distractorsText: (initial.distractors ?? []).join('\n'),
    hint: initial.hint ?? '',
    previousLine: initial.previousLine ?? '',
  }));

  const compute = (l: Local): QuestionPayload => {
    switch (type) {
      case 'single': return { options: toLines(l.optionsText), answer: l.answer.trim() };
      case 'judge': return { answer: l.answer };
      case 'fill': return { answer: l.answer.trim() };
      case 'flip': return { back: l.back.trim() };
      case 'verse': return { tokens: toLines(l.tokensText), ...(toLines(l.distractorsText).length ? { distractors: toLines(l.distractorsText) } : {}), ...(l.hint.trim() ? { hint: l.hint.trim() } : {}) };
      case 'chain': return { tokens: toLines(l.tokensText), ...(toLines(l.distractorsText).length ? { distractors: toLines(l.distractorsText) } : {}), ...(l.previousLine.trim() ? { previousLine: l.previousLine.trim() } : {}) };
      default: return {};
    }
  };
  const emit = (patch: Partial<Local>) => { const next = { ...local, ...patch }; setLocal(next); onChange(compute(next)); };

  if (type === 'open') return null;

  return (
    <View style={{ gap: 8 }}>
      {type === 'single' ? (
        <>
          <RNText style={styles.label}>选项(每行一个)</RNText>
          <TextInput style={styles.area} multiline value={local.optionsText} onChangeText={(t) => emit({ optionsText: t })} placeholder={'选项A\n选项B\n选项C'} placeholderTextColor={INK3} textAlignVertical="top" />
          <RNText style={styles.label}>正确答案(点选)</RNText>
          <View style={styles.chips}>
            {toLines(local.optionsText).map((opt, i) => (
              <Pressable key={`${opt}-${i}`} onPress={() => emit({ answer: opt })} style={[styles.chip, local.answer === opt && styles.chipOn]}>
                <RNText style={{ fontSize: 13, color: local.answer === opt ? '#fff' : INK2 }}>{opt}</RNText>
              </Pressable>
            ))}
            {toLines(local.optionsText).length === 0 ? <RNText style={styles.hint}>先在上方填选项</RNText> : null}
          </View>
        </>
      ) : null}

      {type === 'judge' ? (
        <>
          <RNText style={styles.label}>正确答案</RNText>
          <View style={styles.chips}>
            {['正确', '错误'].map((opt) => (
              <Pressable key={opt} onPress={() => emit({ answer: opt })} style={[styles.chip, local.answer === opt && styles.chipOn]}>
                <RNText style={{ fontSize: 13, color: local.answer === opt ? '#fff' : INK2 }}>{opt}</RNText>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      {type === 'fill' ? (
        <>
          <RNText style={styles.label}>正确答案(题干里用 ____ 表示空格)</RNText>
          <TextInput style={styles.input} value={local.answer} onChangeText={(t) => emit({ answer: t })} placeholder="填空正确答案" placeholderTextColor={INK3} />
          <RNText style={styles.hint}>判分忽略标点/空格;单空。</RNText>
        </>
      ) : null}

      {type === 'flip' ? (
        <>
          <RNText style={styles.label}>背面/答案(正面=题干)</RNText>
          <TextInput style={styles.area} multiline value={local.back} onChangeText={(t) => emit({ back: t })} placeholder="点击翻看时显示的内容" placeholderTextColor={INK3} textAlignVertical="top" />
        </>
      ) : null}

      {type === 'verse' || type === 'chain' ? (
        <>
          {type === 'chain' ? (
            <>
              <RNText style={styles.label}>已给上一句</RNText>
              <TextInput style={styles.input} value={local.previousLine} onChangeText={(t) => emit({ previousLine: t })} placeholder="提供给师兄的上一句" placeholderTextColor={INK3} />
            </>
          ) : (
            <>
              <RNText style={styles.label}>上文提示(可选)</RNText>
              <TextInput style={styles.input} value={local.hint} onChangeText={(t) => emit({ hint: t })} placeholder="可留空" placeholderTextColor={INK3} />
            </>
          )}
          <RNText style={styles.label}>正确词块(每行一个,按正确顺序)</RNText>
          <TextInput style={styles.area} multiline value={local.tokensText} onChangeText={(t) => emit({ tokensText: t })} placeholder={'第一块\n第二块\n第三块'} placeholderTextColor={INK3} textAlignVertical="top" />
          <RNText style={styles.label}>干扰词块(可选,每行一个)</RNText>
          <TextInput style={styles.area} multiline value={local.distractorsText} onChangeText={(t) => emit({ distractorsText: t })} placeholder="混在词池里的错误选项" placeholderTextColor={INK3} textAlignVertical="top" />
        </>
      ) : null}
    </View>
  );
}

// 校验:payload 是否够格保存(用于禁用保存按钮)
export function isPayloadComplete(type: QuestionType, p: QuestionPayload): boolean {
  switch (type) {
    case 'open': return true;
    case 'single': return (p.options?.length ?? 0) >= 2 && !!p.answer && (p.options ?? []).includes(p.answer);
    case 'judge': return p.answer === '正确' || p.answer === '错误';
    case 'fill': return !!p.answer?.trim();
    case 'flip': return !!p.back?.trim();
    case 'verse': case 'chain': return (p.tokens?.length ?? 0) >= 1;
    default: return false;
  }
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '700', color: INK3, marginTop: 6 },
  hint: { fontSize: 12, color: INK3 },
  input: { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: INK, borderWidth: 1, borderColor: 'rgba(43,34,24,0.12)' },
  area: { backgroundColor: '#fff', borderRadius: 10, padding: 14, fontSize: 15, color: INK, minHeight: 84, borderWidth: 1, borderColor: 'rgba(43,34,24,0.12)' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9999, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(43,34,24,0.14)' },
  chipOn: { backgroundColor: SAFFRON, borderColor: SAFFRON_DARK },
});
