import { useMemo } from 'react';
import { Pressable, StyleSheet, Text as RNText, TextInput, View } from 'react-native';

import { Text } from '@/components/ui/text';

// 思考题卡片 · 7 题型(决策082/105):open 问答 / single 单选 / judge 判断 / fill 填空 /
//   flip 记忆卡 / verse 颂词组句(词块拼句·Duolingo 式) / chain 颂词续接(给上句·拼下句)。
// 答案/判分:问答 submit-only·不揭示参考(师兄不见·计圆满);客观/拼句/卡片 提交后揭示参考 + 本地判分。
// ⚠️ 2026-06-20(决策173·撤克制):恢复【对错状态色】——对=sage ✓、错=crimson ✗(采觉学 Verse/Chain 标色)。
const INK = '#2b2218';
const INK2 = '#55463a';
const INK3 = '#7e6d5b';
const SAFFRON = '#e07856';
const SAFFRON_DARK = '#b35535';
const SAGE = '#6f9a86';
const SAGE_DARK = '#4f7a64';
const CRIMSON = '#a13c2e';

export type QType = 'open' | 'single' | 'judge' | 'fill' | 'flip' | 'verse' | 'chain';
export type Question = {
  id: string;
  type: QType;
  gomman: boolean; // 计入圆满(仅问答·决策142)
  prompt: string;
  options?: string[];        // single
  answer?: string;           // single / judge / fill 参考答案
  front?: string; back?: string;            // flip 正反
  tokens?: string[];         // verse / chain 正确顺序词块
  distractors?: string[];    // verse / chain 干扰词
  hint?: string;             // verse 上文提示(可选)
  previousLine?: string;     // chain 给定的上一句
};

const TYPE_LABEL: Record<QType, string> = { open: '问答', single: '单选', judge: '判断', fill: '填空', flip: '记忆卡', verse: '颂词组句', chain: '颂词续接' };
const norm = (s: string) => s.trim().replace(/\s+/g, '').replace(/[，。！？、：；""''「」『』《》〈〉,.!?;:"'()<>·\-—_]/g, '');

export function QuestionCard({ q, submitted, value, onChange, onSubmit }: {
  q: Question;
  submitted: boolean;
  value: unknown;
  onChange: (v: unknown) => void;
  onSubmit: () => void;
}) {
  const judgeOpts = ['正确', '错误'];
  const picked = Array.isArray(value) ? (value as string[]) : [];

  const canSubmit = (() => {
    if (submitted) return false;
    switch (q.type) {
      case 'open': return typeof value === 'string' && value.trim().length > 0;
      case 'single': case 'judge': case 'fill': return typeof value === 'string' && value.length > 0;
      case 'verse': case 'chain': return picked.length === (q.tokens?.length ?? 0) && picked.length > 0;
      case 'flip': return true;
      default: return false;
    }
  })();

  return (
    <View style={styles.card}>
      <View style={[styles.tag, q.gomman ? { backgroundColor: '#FBE5DA' } : { backgroundColor: 'rgba(43,34,24,0.06)' }]}>
        <RNText style={{ fontSize: 10, fontWeight: '700', color: q.gomman ? SAFFRON_DARK : INK3 }}>{TYPE_LABEL[q.type]} · {q.gomman ? '计入圆满' : '练习'}</RNText>
      </View>
      <Text className="font-serif" style={{ fontSize: 16, lineHeight: 26, color: INK, marginTop: 10 }}>{q.prompt}</Text>

      {q.type === 'open' ? (
        <OpenBody value={value} onChange={onChange} submitted={submitted} />
      ) : q.type === 'fill' ? (
        <FillBody value={value} onChange={onChange} submitted={submitted} answer={q.answer} />
      ) : q.type === 'flip' ? (
        <FlipBody front={q.front ?? q.prompt} back={q.back ?? ''} flipped={value === true || submitted} onFlip={() => onChange(true)} />
      ) : q.type === 'verse' || q.type === 'chain' ? (
        <TokenBody q={q} picked={picked} submitted={submitted} onChange={onChange} />
      ) : (
        <OptionBody options={q.type === 'judge' ? judgeOpts : q.options ?? []} value={value} answer={q.answer} submitted={submitted} onChange={onChange} />
      )}

      <Pressable
        style={[styles.submit, submitted && { backgroundColor: SAGE }, !canSubmit && !submitted && { opacity: 0.4 }]}
        disabled={!canSubmit && !submitted}
        onPress={() => { if (!submitted) onSubmit(); }}
      >
        <RNText style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
          {submitted ? '已提交 ✓（随答随存）' : q.type === 'flip' ? '我已记住' : '提交本题'}
        </RNText>
      </Pressable>

      {submitted && q.type === 'open' ? (
        <RNText style={styles.openNote}>问答以自己的思维为主,不设标准答案;已记入「答」。</RNText>
      ) : null}
    </View>
  );
}

// ---------- open 问答 ----------
function OpenBody({ value, onChange, submitted }: { value: unknown; onChange: (v: unknown) => void; submitted: boolean }) {
  return (
    <View style={styles.answerBox}>
      <TextInput
        value={typeof value === 'string' ? value : ''}
        onChangeText={onChange}
        editable={!submitted}
        multiline
        placeholder="在此作答…（问答题不判分,提交即记「答」）"
        placeholderTextColor={INK3}
        style={{ fontSize: 14, color: INK, lineHeight: 22, minHeight: 76, textAlignVertical: 'top' }}
      />
    </View>
  );
}

// ---------- single / judge 客观选项(提交后标对错色) ----------
function OptionBody({ options, value, answer, submitted, onChange }: { options: string[]; value: unknown; answer?: string; submitted: boolean; onChange: (v: unknown) => void }) {
  return (
    <View style={{ gap: 8, marginTop: 10 }}>
      {options.map((opt) => {
        const chosen = value === opt;
        const isAns = answer === opt;
        const showCorrect = submitted && isAns;
        const showWrong = submitted && chosen && !isAns;
        return (
          <Pressable key={opt} disabled={submitted} style={[styles.option, chosen && !submitted && { borderColor: SAFFRON }, showCorrect && styles.optCorrect, showWrong && styles.optWrong]} onPress={() => onChange(opt)}>
            <View style={[styles.radio, chosen && !submitted && { borderColor: SAFFRON, backgroundColor: SAFFRON }, showCorrect && { borderColor: SAGE, backgroundColor: SAGE }, showWrong && { borderColor: CRIMSON, backgroundColor: CRIMSON }]} />
            <RNText style={{ flex: 1, fontSize: 14, color: INK }}>{opt}</RNText>
            {showCorrect ? <RNText style={{ fontSize: 11, fontWeight: '700', color: SAGE_DARK }}>✓ 参考答案</RNText> : null}
            {showWrong ? <RNText style={{ fontSize: 12, fontWeight: '700', color: CRIMSON }}>✗</RNText> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------- fill 填空(提交后标对错色) ----------
function FillBody({ value, onChange, submitted, answer }: { value: unknown; onChange: (v: unknown) => void; submitted: boolean; answer?: string }) {
  const ok = submitted && answer != null && norm(typeof value === 'string' ? value : '') === norm(answer);
  return (
    <View style={{ marginTop: 10, gap: 8 }}>
      <View style={[styles.fillBox, submitted && (ok ? styles.fillCorrect : styles.fillWrong)]}>
        <TextInput
          value={typeof value === 'string' ? value : ''}
          onChangeText={onChange}
          editable={!submitted}
          placeholder="填写答案"
          placeholderTextColor={INK3}
          style={{ fontSize: 15, color: INK, paddingVertical: 0, flex: 1 }}
        />
        {submitted ? <RNText style={{ fontSize: 15, fontWeight: '700', color: ok ? SAGE_DARK : CRIMSON }}>{ok ? '✓' : '✗'}</RNText> : null}
      </View>
      {submitted && answer ? <RevealBox text={`参考答案:${answer}`} /> : null}
    </View>
  );
}

// ---------- flip 记忆卡 ----------
function FlipBody({ front, back, flipped, onFlip }: { front: string; back: string; flipped: boolean; onFlip: () => void }) {
  return (
    <Pressable style={[styles.flip, flipped && styles.flipBack]} onPress={onFlip}>
      <RNText style={{ fontSize: 11, fontWeight: '700', color: flipped ? SAGE_DARK : SAFFRON_DARK, letterSpacing: 1 }}>{flipped ? '答案' : '正面 · 点击翻看'}</RNText>
      <Text className="font-serif" style={{ fontSize: 16, lineHeight: 26, color: INK, marginTop: 8, textAlign: 'center' }}>{flipped ? back : front}</Text>
    </Pressable>
  );
}

// ---------- verse 颂词组句 / chain 颂词续接(词块拼句;提交后逐词标对错) ----------
function TokenBody({ q, picked, submitted, onChange }: { q: Question; picked: string[]; submitted: boolean; onChange: (v: unknown) => void }) {
  const tokens = q.tokens ?? [];
  const distractors = q.distractors ?? [];
  const pool = useMemo(() => scramble([...tokens, ...distractors]), [q.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const remaining = pool.filter((t) => !picked.includes(t));
  const lead = q.type === 'chain' ? q.previousLine : q.hint;

  return (
    <View style={{ marginTop: 10, gap: 10 }}>
      {lead ? (
        <View style={styles.lead}>
          {q.type === 'chain' ? <RNText style={{ fontSize: 11, color: INK3, marginBottom: 2 }}>已给上一句</RNText> : null}
          <Text className="font-serif" style={{ fontSize: 15, color: INK, lineHeight: 24 }}>{lead}</Text>
        </View>
      ) : null}

      {/* 上区:已选词块(提交后逐词标对/错色) */}
      <View style={styles.tokenSlot}>
        {picked.length === 0 ? (
          <RNText style={{ fontSize: 13, color: INK3 }}>点下方词块,按顺序拼出{q.type === 'chain' ? '下一句' : '颂词'}…</RNText>
        ) : (
          <View className="flex-row" style={{ flexWrap: 'wrap', gap: 8 }}>
            {picked.map((t, i) => {
              const ok = submitted ? t === tokens[i] : null;
              const corrected = submitted && !ok ? tokens[i] : null;
              return (
                <View key={`${t}-${i}`} className="flex-row items-center" style={{ gap: 3 }}>
                  <Pressable disabled={submitted} onPress={() => onChange(picked.filter((_, idx) => idx !== i))} style={[styles.tokenPicked, ok === true && styles.tokCorrect, ok === false && styles.tokWrong]}>
                    <Text className="font-serif" style={{ fontSize: 15, color: ok === true ? SAGE_DARK : ok === false ? CRIMSON : SAFFRON_DARK }}>{t}</Text>
                  </Pressable>
                  {corrected ? <RNText style={{ fontSize: 12, color: SAGE_DARK }}>→{corrected}</RNText> : null}
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* 下区:词池(已选隐藏) */}
      {!submitted ? (
        <View className="flex-row" style={{ flexWrap: 'wrap', gap: 8 }}>
          {remaining.map((t, i) => (
            <Pressable key={`${t}-${i}`} onPress={() => onChange([...picked, t])} style={styles.tokenPool}>
              <Text className="font-serif" style={{ fontSize: 15, color: INK2 }}>{t}</Text>
            </Pressable>
          ))}
          {picked.length > 0 ? (
            <Pressable onPress={() => onChange([])} style={styles.clearChip}><RNText style={{ fontSize: 12, color: INK3, fontWeight: '600' }}>清除</RNText></Pressable>
          ) : null}
        </View>
      ) : null}

      {submitted ? <RevealBox text={`参考:${(q.type === 'chain' && q.previousLine ? q.previousLine + ' · ' : '')}${tokens.join(' ')}`} /> : null}
    </View>
  );
}

function RevealBox({ text }: { text: string }) {
  return (
    <View style={styles.reveal}>
      <Text className="font-serif" style={{ fontSize: 14, color: INK2, lineHeight: 23 }}>{text}</Text>
    </View>
  );
}

function scramble(arr: string[]): string[] {
  if (arr.length <= 1) return [...arr];
  const a = [...arr];
  for (let i = 0; i < a.length - 1; i += 2) { const t = a[i]; a[i] = a[i + 1]; a[i + 1] = t; }
  if (a.length > 2) a.push(a.shift() as string);
  return a;
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(43,34,24,0.08)' },
  tag: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  submit: { marginTop: 14, paddingVertical: 12, borderRadius: 12, backgroundColor: SAFFRON, alignItems: 'center' },
  openNote: { fontSize: 12, color: INK3, marginTop: 10, lineHeight: 19 },
  answerBox: { minHeight: 80, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(43,34,24,0.12)', backgroundColor: 'rgba(255,255,255,0.6)', padding: 12, marginTop: 10 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(43,34,24,0.12)' },
  optCorrect: { borderColor: SAGE, backgroundColor: 'rgba(111,154,134,0.12)' },
  optWrong: { borderColor: CRIMSON, backgroundColor: 'rgba(161,60,46,0.07)' },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: 'rgba(43,34,24,0.25)' },
  fillBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(43,34,24,0.12)', backgroundColor: 'rgba(255,255,255,0.6)', paddingHorizontal: 14, paddingVertical: 12 },
  fillCorrect: { borderColor: SAGE, backgroundColor: 'rgba(111,154,134,0.10)' },
  fillWrong: { borderColor: CRIMSON, backgroundColor: 'rgba(161,60,46,0.06)' },
  flip: { minHeight: 130, borderRadius: 14, borderWidth: 1.5, borderColor: 'rgba(224,120,86,0.4)', backgroundColor: '#FBE5DA', alignItems: 'center', justifyContent: 'center', padding: 18, marginTop: 10 },
  flipBack: { borderColor: 'rgba(111,154,134,0.5)', backgroundColor: 'rgba(111,154,134,0.10)' },
  lead: { padding: 12, borderRadius: 10, backgroundColor: '#FBE5DA', borderLeftWidth: 3, borderLeftColor: SAFFRON },
  tokenSlot: { minHeight: 56, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(43,34,24,0.18)', padding: 10, justifyContent: 'center' },
  tokenPicked: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#FBE5DA', borderWidth: 1, borderColor: 'rgba(224,120,86,0.4)' },
  tokCorrect: { backgroundColor: 'rgba(111,154,134,0.12)', borderColor: SAGE },
  tokWrong: { backgroundColor: 'rgba(161,60,46,0.07)', borderColor: CRIMSON },
  tokenPool: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: 'rgba(43,34,24,0.05)', borderWidth: 1, borderColor: 'rgba(43,34,24,0.10)' },
  clearChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(43,34,24,0.14)' },
  reveal: { borderRadius: 10, backgroundColor: 'rgba(224,120,86,0.08)', padding: 12, borderWidth: 1, borderColor: 'rgba(224,120,86,0.18)' },
});
