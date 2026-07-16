import { useAuth } from '@/lib/auth';
import { useAdminMutation } from '@/lib/queries/admin/mutations';
import { supabase } from '@/lib/supabase';

import type { ProxyActionType, ProxyTargetKind } from '@/lib/queries/admin/proxy';

// 代行 + 传承 + 暂停/恢复 + 无障碍代登记 写操作(设计①②·2026-07-08 PM)。
// RLS 已是唯一真源:proxy_action_records 写=admin/本班zhumai;user_transmissions 写=仅admin;
// user_practice_vows 改 status=自己/admin/本班zhumai·aixin(限source=auto);profiles 改=自己/admin。
// 本层不重复判权,失败时把 RLS 拒绝的错误消息透传给 UI。

// 弱网幂等(2026-07-12·同 useRecordPracticeLog 方案):单条 insert,重复键直接当成功处理即可。
export function useRecordProxyAction() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useAdminMutation<{
    userId: string;
    actionType: ProxyActionType;
    targetKind: ProxyTargetKind;
    targetRef?: string | null;
    targetNote?: string | null;
    substitutePracticeId?: string | null;
    substituteCount?: number | null;
    reason: string;
    basis?: string | null;
    clientToken?: string;
  }>({
    retry: 2,
    mutationFn: async (a) => {
      if (!uid) throw new Error('未登录');
      const { error } = await supabase.from('proxy_action_records').insert({
        user_id: a.userId, action_type: a.actionType, admin_id: uid, target_kind: a.targetKind,
        target_ref: a.targetRef ?? null, target_note: a.targetNote ?? null,
        substitute_practice_id: a.substitutePracticeId ?? null, substitute_count: a.substituteCount ?? null,
        reason: a.reason, basis: a.basis ?? null, client_token: a.clientToken ?? null,
      });
      if (error) {
        if (error.code === '23505' && a.clientToken) return; // 同一凭证已成功过,当成功处理
        throw error;
      }
    },
    invalidateKeys: [['admin-student-proxy-actions']],
  });
}

export function useRecordTransmission() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useAdminMutation<{ userId: string; transmissionId: string; obtainedAt: string; reason: string }>({
    mutationFn: async (a) => {
      if (!uid) throw new Error('未登录');
      const { error: e1 } = await supabase.from('user_transmissions').insert({
        user_id: a.userId, transmission_id: a.transmissionId, source: 'proxy_recognize',
        obtained_at: a.obtainedAt, recorded_by: uid,
      });
      if (e1) {
        if (/duplicate|unique/i.test(e1.message)) throw new Error('该传承已录入过');
        throw e1;
      }
      // 双写留痕(决策121"双方可见"):代行记录同步一条,失败不回滚已写的传承(不阻断主流程)
      await supabase.from('proxy_action_records').insert({
        user_id: a.userId, action_type: 'recognize', admin_id: uid, target_kind: 'transmission',
        target_ref: a.transmissionId, reason: a.reason,
      });
    },
    invalidateKeys: [['admin-student-transmissions'], ['admin-student-proxy-actions']],
  });
}

// 传承主清单新增(决策124管理端配置入口·2026-07-12):记事本性质,只做新增,不做改/删
// (改名会牵动已发放学员的记录展示,删除会孤立 program_required_transmissions/user_transmissions
// 关联行——虽 DB 有 ON DELETE CASCADE 兜底,但删除一条已被记录使用的传承本身是破坏性操作,
// 未被要求就不做,需要再加)。
export function useCreateTransmission() {
  return useAdminMutation<{ name: string; sourceKind: 'course' | 'assembly'; description?: string | null }>({
    mutationFn: async (a) => {
      const { error } = await supabase.from('transmissions').insert({
        name: a.name, source_kind: a.sourceKind, description: a.description ?? null,
      });
      if (error) throw error;
    },
    invalidateKeys: [['transmissions-list']],
  });
}

// 专业必需传承清单绑定(决策124):幂等 upsert,同 useAddOptionalPractice 口径
export function useAddRequiredTransmission() {
  return useAdminMutation<{ programId: string; transmissionId: string }>({
    mutationFn: async (a) => {
      const { error } = await supabase.from('program_required_transmissions')
        .upsert({ program_id: a.programId, transmission_id: a.transmissionId }, { onConflict: 'program_id,transmission_id' });
      if (error) throw error;
    },
    invalidateKeys: [['required-transmissions']],
  });
}

export function useRemoveRequiredTransmission() {
  return useAdminMutation<{ programId: string; transmissionId: string }>({
    mutationFn: async (a) => {
      const { error } = await supabase.from('program_required_transmissions')
        .delete().eq('program_id', a.programId).eq('transmission_id', a.transmissionId);
      if (error) throw error;
    },
    invalidateKeys: [['required-transmissions']],
  });
}

export function usePauseVow() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useAdminMutation<{ vowId: string }>({
    mutationFn: async ({ vowId }) => {
      const { error } = await supabase.from('user_practice_vows')
        .update({ status: 'paused', paused_at: new Date().toISOString(), paused_by: uid ?? null })
        .eq('id', vowId);
      if (error) throw error;
    },
    invalidateKeys: [['admin-student-vows']],
  });
}

export function useResumeVow() {
  return useAdminMutation<{ vowId: string }>({
    mutationFn: async ({ vowId }) => {
      const { error } = await supabase.from('user_practice_vows')
        .update({ status: 'active', resumed_at: new Date().toISOString() })
        .eq('id', vowId);
      if (error) throw error;
    },
    invalidateKeys: [['admin-student-vows']],
  });
}

export function useUpdateAccessibilityNeeds() {
  return useAdminMutation<{ userId: string; needs: ('blind' | 'deaf')[] }>({
    mutationFn: async ({ userId, needs }) => {
      const { error } = await supabase.from('profiles').update({ accessibility_needs: needs }).eq('id', userId);
      if (error) throw error;
    },
    invalidateKeys: [['admin-student']],
  });
}
