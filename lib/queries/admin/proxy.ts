import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

// 代行 + 传承数据层(设计①②·2026-07-08 PM)。
// ⚠️ 灌顶/密法不做(维持决策060/112 红线决定):transmissions.source_kind 只有 course/assembly,
//   不因决策173(撤三红线)反推——173 撤的是"密法0痕迹对新功能的否决权",060/112 是独立的红线决定,
//   需 PM 另行重议才能改;本轮维持现状。

export type TransmissionOption = { id: string; name: string; sourceKind: 'course' | 'assembly'; description: string | null };

export function useTransmissions() {
  return useQuery({
    queryKey: ['transmissions-list'],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<TransmissionOption[]> => {
      const { data, error } = await supabase.from('transmissions').select('id, name, source_kind, description').order('name');
      if (error) throw error;
      return (data ?? []).map((t) => ({ id: t.id, name: t.name, sourceKind: t.source_kind as 'course' | 'assembly', description: t.description }));
    },
  });
}

// 专业必需传承清单(决策124):纯人工审核参考,不 auto-gate(017/124)。管理端配置入口·2026-07-12。
export function useRequiredTransmissionsByProgram(programId: string | undefined) {
  return useQuery({
    queryKey: ['required-transmissions', programId ?? 'none'],
    enabled: !!programId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<string[]> => {
      if (!programId) return [];
      const { data, error } = await supabase.from('program_required_transmissions').select('transmission_id').eq('program_id', programId);
      if (error) throw error;
      return (data ?? []).map((r) => r.transmission_id);
    },
  });
}

export type StudentTransmission = { id: string; name: string; obtainedAt: string | null; source: string };

export function useStudentTransmissions(userId: string | undefined) {
  return useQuery({
    queryKey: ['admin-student-transmissions', userId],
    enabled: !!userId,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<StudentTransmission[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('user_transmissions')
        .select('id, obtained_at, source, transmissions(name)')
        .eq('user_id', userId)
        .order('obtained_at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as { id: string; obtained_at: string | null; source: string; transmissions: { name?: string } | null }[])
        .map((r) => ({ id: r.id, name: r.transmissions?.name ?? '传承', obtainedAt: r.obtained_at, source: r.source }));
    },
  });
}

export type ProxyActionType = 'substitute' | 'recognize' | 'exempt';
export type ProxyTargetKind = 'vow' | 'lesson' | 'exam' | 'advancement' | 'other';

export type ProxyActionRecord = {
  id: string;
  actionType: ProxyActionType;
  targetKind: ProxyTargetKind;
  targetNote: string | null;
  substitutePracticeName: string | null;
  substituteCount: number | null;
  reason: string;
  basis: string | null;
  createdAt: string;
  adminName: string | null;
};

export function useStudentProxyActions(userId: string | undefined) {
  return useQuery({
    queryKey: ['admin-student-proxy-actions', userId],
    enabled: !!userId,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<ProxyActionRecord[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('proxy_action_records')
        .select('id, action_type, target_kind, target_note, substitute_count, reason, basis, created_at, admin:profiles!proxy_action_records_admin_id_fkey(full_name), practices(name)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return ((data ?? []) as unknown as {
        id: string; action_type: ProxyActionType; target_kind: ProxyTargetKind; target_note: string | null;
        substitute_count: number | null; reason: string; basis: string | null; created_at: string;
        admin: { full_name?: string } | null; practices: { name?: string } | null;
      }[]).map((r) => ({
        id: r.id, actionType: r.action_type, targetKind: r.target_kind, targetNote: r.target_note,
        substitutePracticeName: r.practices?.name ?? null, substituteCount: r.substitute_count,
        reason: r.reason, basis: r.basis, createdAt: r.created_at, adminName: r.admin?.full_name ?? null,
      }));
    },
  });
}
