import { Minus, Plus } from 'lucide-react-native';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge, EmptyState, SectionCard, ErrorState } from '@/components/ui/admin-kit';
import { Text } from '@/components/ui/text';
import { notify } from '@/lib/dialog';
import { useAdminSelfStudyStudents, useProgramPaces, useSetProgramDefaultPace } from '@/lib/queries/admin/selfstudy';
import { INK, INK2, INK3, SAFFRON } from '@/lib/theme';
import { useAdminLayout } from '../_layout';

// 自学管理(M10 屏·PRD §4.4;补审计 P0「自学生后台 0 可见」+ P1「默认节奏无配置 UI」·2026-07-02)。
// 上=专业默认节奏(决策157「管理端配」:writes programs.default_weekly_lessons,师兄端本周计划即时生效);
// 下=自学师兄名单(user_self_study_programs:谁/专业/起修日/节奏/休息周/状态)。v1 只读名单,改状态延后。
const STATUS_LABEL: Record<string, string> = { active: '在修', paused: '已暂停', completed: '已完成', abandoned: '已放弃' };

export default function AdminSelfStudy() {
  const { setTitle } = useAdminLayout();
  useEffect(() => { setTitle('自学管理'); }, [setTitle]);

  const { data: paces = [], isLoading: pacesLoading, error: pacesError } = useProgramPaces();
  const setPace = useSetProgramDefaultPace();
  const { data: students = [], isLoading, error } = useAdminSelfStudyStudents();

  const bump = (programId: string, cur: number | null, delta: number) => {
    const next = Math.min(21, Math.max(1, (cur ?? 1) + delta));
    if (next === cur) return;
    setPace.mutate({ programId, weeklyLessons: next }, { onError: (e) => notify('保存失败', (e as Error)?.message ?? '请重试') });
  };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }}>
        {/* 专业默认节奏(决策157·大纲默认;师兄未自定时按此算本周计划) */}
        <SectionCard title="专业默认节奏(节/周)">
          {pacesError ? <ErrorState /> : pacesLoading ? <ActivityIndicator color={SAFFRON} /> : (
            <View style={{ gap: 4 }}>
              {paces.map((p, i) => (
                <View key={p.id} style={[styles.paceRow, i > 0 && styles.rowBorder]}>
                  <Text style={{ flex: 1, fontSize: 14, color: INK, fontWeight: '600' }}>{p.name}</Text>
                  <View style={styles.stepper}>
                    <Pressable hitSlop={8} disabled={setPace.isPending} onPress={() => bump(p.id, p.defaultWeeklyLessons, -1)}><Minus size={16} color={INK2} /></Pressable>
                    <Text style={styles.paceNum}>{p.defaultWeeklyLessons ?? '—'}</Text>
                    <Pressable hitSlop={8} disabled={setPace.isPending} onPress={() => bump(p.id, p.defaultWeeklyLessons, 1)}><Plus size={16} color={INK2} /></Pressable>
                  </View>
                </View>
              ))}
              <Text style={{ fontSize: 11, color: INK3, marginTop: 8 }}>改动即生效:未自定节奏的自学师兄,本周计划按新默认重算。</Text>
            </View>
          )}
        </SectionCard>

        {/* 自学师兄名单 */}
        <SectionCard title={`自学师兄(${students.length})`}>
          {error ? <ErrorState /> : isLoading ? <ActivityIndicator color={SAFFRON} /> : students.length === 0 ? (
            <EmptyState>还没有自学报名——师兄在课程页「加入自学」后会出现在这里(需先授予自学资格或为正式学员)。</EmptyState>
          ) : (
            <View style={{ gap: 4 }}>
              {students.map((s, i) => (
                <View key={`${s.userId}:${s.programId}`} style={[styles.stuRow, i > 0 && styles.rowBorder]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Text style={{ fontSize: 14.5, color: INK, fontWeight: '700' }}>{s.fullName ?? '(未填姓名)'}</Text>
                      {s.dharmaName ? <Text style={{ fontSize: 12, color: INK3 }}>{s.dharmaName}</Text> : null}
                      {s.isPrimary ? <Badge tone="saffron">主修</Badge> : null}
                      <Badge tone={s.status === 'active' ? 'sage' : 'neutral'}>{STATUS_LABEL[s.status] ?? s.status}</Badge>
                    </View>
                    <Text style={{ fontSize: 12, color: INK2, marginTop: 3 }}>
                      {s.programName} · 起修 {s.startDate ?? '—'} · 节奏 {s.weeklyTarget != null ? `${s.weeklyTarget} 节/周(自定)` : '跟默认'}{s.restWeeks ? ` · 请假 ${s.restWeeks} 周` : ''}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </SectionCard>

        <Text style={{ fontSize: 11, color: INK3, paddingHorizontal: 4 }}>
          名单来自自学报名(user_self_study_programs);授予自学资格在「学员管理」学员面板操作。
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  paceRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(43,34,24,0.1)' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: 'rgba(43,34,24,0.04)', borderRadius: 9999, paddingHorizontal: 14, paddingVertical: 6 },
  paceNum: { fontSize: 16, fontWeight: '700', color: INK, minWidth: 22, textAlign: 'center' },
  stuRow: { paddingVertical: 11 },
});
