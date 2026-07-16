import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { SpeakingGrade, SpeakingStatus } from '@/lib/queries/speaking';

// 讲考写库(设计③·决策067/080)。RLS:speaking_sessions 写 + study_records speaking_* 写 = 本班zhumai/admin;
//   speaking_evaluations 写 = 本班zhumai/admin(aixin 只读)。

// ── 新建讲考场次 ─────────────────────────────────────────────────────
export function useCreateSpeakingSession() {
  const { session } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { cohortId: string; lessonId: string; sessionEndAt: string; notes?: string | null; groupSessionId?: string | null; clientToken?: string }) => {
      const { error } = await supabase.from('speaking_sessions').insert({
        cohort_id: p.cohortId,
        lesson_id: p.lessonId,
        session_end_at: p.sessionEndAt,
        notes: p.notes?.trim() || null,
        group_session_id: p.groupSessionId ?? null,
        created_by: session?.user.id ?? null,
        client_token: p.clientToken ?? null,
      });
      if (error && !(error.code === '23505' && p.clientToken)) throw error;
    },
    onSuccess: (_r, p) => qc.invalidateQueries({ queryKey: ['speaking-sessions', p.cohortId] }),
  });
}

// ── 改挂/取消挂靠共修场次(决策080,留空=独立记录)────────────────────
export function useSetSpeakingSessionGroupSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { sessionId: string; cohortId: string; groupSessionId: string | null }) => {
      const { error } = await supabase.from('speaking_sessions').update({ group_session_id: p.groupSessionId }).eq('id', p.sessionId);
      if (error) throw error;
    },
    onSuccess: (_r, p) => {
      qc.invalidateQueries({ queryKey: ['speaking-session-detail', p.sessionId] });
      qc.invalidateQueries({ queryKey: ['speaking-sessions', p.cohortId] });
    },
  });
}

export function useDeleteSpeakingSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { sessionId: string; cohortId: string }) => {
      // 场次删除不动已记的 study_records(FK ON DELETE SET NULL,三态记录按人×节仍在)
      const { error } = await supabase.from('speaking_sessions').delete().eq('id', p.sessionId);
      if (error) throw error;
    },
    onSuccess: (_r, p) => qc.invalidateQueries({ queryKey: ['speaking-sessions', p.cohortId] }),
  });
}

// ── 保存逐人三态 + 等级 ─────────────────────────────────────────────
// 三态互斥(唯一索引=人×班×节),同出勤的先查后写:有且变→改;无→插;none 且有→删(评价随记录 CASCADE 删)。
// 等级(仅主讲):有值→upsert;清空/非主讲→删。study_date 取场次截止日(支持补历史)。
type SpeakingMark = { status: SpeakingStatus; grade: SpeakingGrade | null };

export function useSaveSpeaking() {
  const { session } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { sessionId: string; cohortId: string; lessonId: string; studyDate: string; marks: Record<string, SpeakingMark> }) => {
      const uid = session?.user.id ?? null;
      const { data: existing, error: selErr } = await supabase
        .from('study_records')
        .select('id, user_id, study_type')
        .eq('cohort_id', p.cohortId)
        .eq('lesson_id', p.lessonId)
        .in('study_type', ['speaking_present', 'speaking_question', 'speaking_observe']);
      if (selErr) throw selErr;
      const byUser = new Map((existing ?? []).map((r) => [r.user_id, r as { id: string; user_id: string; study_type: string }]));

      // 第一遍:三态记录增/改/删
      const deletes: string[] = [];
      for (const [userId, mark] of Object.entries(p.marks)) {
        const ex = byUser.get(userId);
        if (mark.status === 'none') {
          if (ex) { deletes.push(ex.id); byUser.delete(userId); }
          continue;
        }
        if (ex) {
          if (ex.study_type !== mark.status) {
            const { error } = await supabase
              .from('study_records')
              // is_confirmed:true——后台录入即视为已审(同094/135出勤口径),否则被记录人本人可凭
              // study_records_delete/update 的「本人+未确认」分支自删/改自己的讲考三态(见波D审查发现①)。
              .update({ study_type: mark.status, speaking_session_id: p.sessionId, study_date: p.studyDate, created_by: uid, is_confirmed: true })
              .eq('id', ex.id);
            if (error) throw error;
            ex.study_type = mark.status;
          }
        } else {
          const { data: ins, error } = await supabase
            .from('study_records')
            .insert({ user_id: userId, cohort_id: p.cohortId, lesson_id: p.lessonId, study_type: mark.status, speaking_session_id: p.sessionId, study_date: p.studyDate, created_by: uid, is_confirmed: true })
            .select('id')
            .single();
          if (error) throw error;
          byUser.set(userId, { id: ins.id, user_id: userId, study_type: mark.status });
        }
      }
      if (deletes.length) {
        const { error } = await supabase.from('study_records').delete().in('id', deletes);
        if (error) throw error;
      }

      // 第二遍:等级评价(仅主讲可有;非主讲/清空→删)
      for (const [userId, mark] of Object.entries(p.marks)) {
        const ex = byUser.get(userId);
        if (!ex) continue; // 无记录(none)→评价已随记录 CASCADE 删
        if (mark.status === 'speaking_present' && mark.grade) {
          const { error } = await supabase
            .from('speaking_evaluations')
            .upsert({ study_record_id: ex.id, grade: mark.grade, created_by: uid ?? undefined }, { onConflict: 'study_record_id' });
          if (error) throw error;
        } else {
          const { error } = await supabase.from('speaking_evaluations').delete().eq('study_record_id', ex.id);
          if (error) throw error;
        }
      }
    },
    onSuccess: (_r, p) => {
      qc.invalidateQueries({ queryKey: ['speaking-session-detail', p.sessionId] });
      qc.invalidateQueries({ queryKey: ['speaking-sessions', p.cohortId] });
    },
  });
}
