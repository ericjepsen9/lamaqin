import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { AttendanceStatus } from '@/lib/queries/attendance';

// 共修出勤写库(管理端·RLS:group_sessions 写 + study_records group_* 写 = has_class_role(zhumai) OR is_system_admin)。
//   决策094/135:出勤只 辅导员/管理员 录,师兄不自报。

// ── 新建共修场次 ─────────────────────────────────────────────────────
export function useCreateSession() {
  const { session } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      cohortId: string; lessonId: string; scheduledAt: string; sessionEndAt: string;
      type: 'regular' | 'practice'; location?: string | null; notes?: string | null;
      tracksAttendance?: boolean; // false=场次存在但不计入出勤率(临时集会·决策2026-06-21)
    }) => {
      const { error } = await supabase.from('group_sessions').insert({
        cohort_id: p.cohortId,
        lesson_id: p.lessonId,
        scheduled_at: p.scheduledAt,
        session_end_at: p.sessionEndAt,
        cosession_type: p.type,
        tracks_attendance: p.tracksAttendance ?? true,
        location: p.location ?? null,
        notes: p.notes ?? null,
        created_by: session?.user.id ?? null,
      });
      if (error) {
        if (/duplicate key|unique/i.test(error.message)) throw new Error('该班这节课已有共修场次(每班每节唯一)。');
        throw error;
      }
    },
    onSuccess: (_r, p) => qc.invalidateQueries({ queryKey: ['cohort-sessions', p.cohortId] }),
  });
}

// ── 保存逐人出勤 ─────────────────────────────────────────────────────
// present→group_attend / absent→group_absent / none→删。每人每课唯一(partial unique index),故先查后写:
//   已有且类型变 → 改;无 → 插;none 且有 → 删。study_date 取场次日期(支持补历史)。
type GroupType = 'group_attend' | 'group_absent';
type InsertRow = { user_id: string; cohort_id: string; lesson_id: string; study_type: GroupType; group_session_id: string; study_date: string; created_by: string | null };
// 部分失败要可见(2026-07-13发现):updates循环此前遇错立即throw,已成功的行无从知晓、
// 剩下的行也不会再被尝试。failedUserIds 供调用方按名单告知管理员具体是谁没保存上。
export class PartialSaveError extends Error {
  constructor(public failedUserIds: string[]) {
    super(`${failedUserIds.length}人保存失败,其余已保存成功`);
  }
}

export function useSaveAttendance() {
  const { session } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { sessionId: string; cohortId: string; lessonId: string; studyDate: string; marks: Record<string, AttendanceStatus> }) => {
      const uid = session?.user.id ?? null;
      const { data: existing, error: selErr } = await supabase
        .from('study_records')
        .select('id, user_id, study_type')
        .eq('cohort_id', p.cohortId)
        .eq('lesson_id', p.lessonId)
        .in('study_type', ['group_attend', 'group_absent']);
      if (selErr) throw selErr;
      const byUser = new Map((existing ?? []).map((r) => [r.user_id, r as { id: string; user_id: string; study_type: string }]));

      const inserts: InsertRow[] = [];
      const updates: { id: string; userId: string; study_type: GroupType }[] = [];
      const deletes: string[] = [];
      for (const [userId, status] of Object.entries(p.marks)) {
        const ex = byUser.get(userId);
        if (status === 'none') {
          if (ex) deletes.push(ex.id);
          continue;
        }
        const want: GroupType = status === 'present' ? 'group_attend' : 'group_absent';
        if (ex) {
          if (ex.study_type !== want) updates.push({ id: ex.id, userId, study_type: want });
        } else {
          inserts.push({ user_id: userId, cohort_id: p.cohortId, lesson_id: p.lessonId, study_type: want, group_session_id: p.sessionId, study_date: p.studyDate, created_by: uid });
        }
      }

      if (inserts.length) {
        const { error } = await supabase.from('study_records').insert(inserts);
        if (error) throw error;
      }
      // 逐行UPDATE(每行独立round trip,不像insert/delete是单条SQL、天然整批原子)——
      // 跑完全部再统一报告,不在第一个失败就abort,否则后面的行永远不会被尝试。
      const failedUserIds: string[] = [];
      for (const u of updates) {
        const { error } = await supabase
          .from('study_records')
          .update({ study_type: u.study_type, group_session_id: p.sessionId, study_date: p.studyDate, created_by: uid })
          .eq('id', u.id);
        if (error) failedUserIds.push(u.userId);
      }
      if (deletes.length) {
        const { error } = await supabase.from('study_records').delete().in('id', deletes);
        if (error) throw error;
      }
      if (failedUserIds.length) throw new PartialSaveError(failedUserIds);
    },
    onSettled: (_r, _e, p) => {
      // 部分失败时也要刷新:已成功的那些行是真的落库了,缓存不能停留在失败前的旧状态。
      qc.invalidateQueries({ queryKey: ['session-detail', p.sessionId] });
      qc.invalidateQueries({ queryKey: ['cohort-sessions', p.cohortId] });
    },
  });
}
