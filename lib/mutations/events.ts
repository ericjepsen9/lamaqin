import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { createNotificationForCohort } from '@/lib/mutations/notifications';
import { supabase } from '@/lib/supabase';

// 法会管理写库。events 写 = is_system_admin();cohort_announcements 写 = 本班主麦/admin。
// 注:法会 = 展示 + 发愿 + 集体回向(决策140:不做平台级场次、不改 DB);"每天几场"写说明文本。

export function useCreateEvent() {
  const { session } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { name: string; eventType: string; startDate: string; endDate: string; description: string | null; defaultPracticeId?: string | null; defaultTargetCount?: number | null; clientToken?: string }) => {
      const { error } = await supabase.from('events').insert({
        name: p.name.trim(), event_type: p.eventType.trim() || '法会',
        start_date: p.startDate, end_date: p.endDate,
        description: p.description?.trim() || null, is_active: true,
        created_by: session?.user.id ?? undefined,
        // 法会默认共修功课(§3.12 愿模板·PM 2026-07-02):不配=纯讲座,学员端无发愿区
        default_practice_id: p.defaultPracticeId ?? null,
        default_target_count: p.defaultTargetCount ?? null,
        client_token: p.clientToken ?? null,
      });
      // 弱网幂等(2026-07-13):同一凭证重复提交(网络重试/双击)当已成功处理,不当报错。
      if (error && !(error.code === '23505' && p.clientToken)) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-events'] }),
  });
}

// 法会场次(决策②·PM 2026-06-30):逐场添加(每天几场不固定 → 一场一行,admin 自由排)。纯排期、不记出勤。
export function useAddEventSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      eventId: string; sessionDate: string; startTime: string | null; title: string | null;
      mode: 'online' | 'offline' | 'hybrid'; onlineUrl: string | null; location: string | null; displayOrder?: number; clientToken?: string;
    }) => {
      const { error } = await supabase.from('event_sessions').insert({
        event_id: p.eventId, session_date: p.sessionDate, start_time: p.startTime || null,
        title: p.title?.trim() || null, mode: p.mode, online_url: p.onlineUrl?.trim() || null,
        location: p.location?.trim() || null, display_order: p.displayOrder ?? 0,
        client_token: p.clientToken ?? null,
      });
      if (error && !(error.code === '23505' && p.clientToken)) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['event-sessions'] }),
  });
}

export function useDeleteEventSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase.from('event_sessions').delete().eq('id', sessionId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['event-sessions'] }),
  });
}

export function useToggleEventActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { id: string; isActive: boolean }) => {
      const { error } = await supabase.from('events').update({ is_active: p.isActive }).eq('id', p.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-events'] }),
  });
}

export function useCreateAnnouncement() {
  const { session } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { cohortId: string; title: string | null; content: string; isPinned: boolean; clientToken?: string }) => {
      // 前置查重(2026-07-13,不用insert后catch23505):这里插入成功后还有第二步副作用
      // (给全班扇出通知),重复提交若只挡住insert、通知还是会再发一遍——必须在动手前就整体
      // 短路,插入+发通知要么都不做、要么都做(同useRecordAdvancement的"前置查重"理由)。
      if (p.clientToken) {
        const { data: existing } = await supabase.from('cohort_announcements').select('id').eq('client_token', p.clientToken).maybeSingle();
        if (existing) return;
      }
      const { data, error } = await supabase.from('cohort_announcements').insert({
        cohort_id: p.cohortId, title: p.title?.trim() || null, content: p.content.trim(),
        is_pinned: p.isPinned, posted_by: session?.user.id ?? undefined,
        posted_at: new Date().toISOString(), client_token: p.clientToken ?? null,
      }).select('id').single();
      if (error) throw error;
      // 通知(C2·决策170 班级类:班级公告),给本班全部 active 成员(除发布者本人)扇出一条
      await createNotificationForCohort({
        cohortId: p.cohortId,
        excludeUserId: session?.user.id ?? null,
        category: 'class',
        title: p.title?.trim() || '班级新公告',
        body: p.content.trim().slice(0, 60),
        link: `/announcement/${data.id}`,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-announcements'] }),
  });
}

// ── 学员端:加入法会发愿(D-8·2026-07-02;决策054-057 愿挂 event_id,目标自设·056)──
// target_period='until_complete'+截止=法会尾日(vows 的 CHECK 不含 'event',那是模板枚举);
// 归属靠 event_id 列;计数走现成愿系统(practice_logs 触发器累加);#193 集体只出总和。
export function useJoinEventVow() {
  const qc = useQueryClient();
  const { session } = useAuth();
  const uid = session?.user.id;
  return useMutation({
    mutationFn: async (input: { eventId: string; practiceId: string; targetCount: number | null; endDate: string; clientToken?: string }) => {
      if (!uid) throw new Error('未登录');
      const { error } = await supabase.from('user_practice_vows').insert({
        user_id: uid,
        source: 'custom',
        practice_id: input.practiceId,
        event_id: input.eventId,
        target_count: input.targetCount,
        target_period: 'until_complete',
        current_end_date: input.endDate,
        original_end_date: input.endDate,
        start_date: new Date().toLocaleDateString('en-CA'),
        status: 'active',
        client_token: input.clientToken ?? null,
      });
      if (error && !(error.code === '23505' && input.clientToken)) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['event-detail'] });
      qc.invalidateQueries({ queryKey: ['my-vows'] });
      qc.invalidateQueries({ queryKey: ['coreview-timeline'] });
    },
  });
}

// 改法会默认共修功课(已建法会补配/改配;§3.12)
export function useSetEventPractice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { eventId: string; practiceId: string | null; targetCount: number | null }) => {
      const { error } = await supabase.from('events')
        .update({ default_practice_id: p.practiceId, default_target_count: p.targetCount })
        .eq('id', p.eventId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-events'] });
      qc.invalidateQueries({ queryKey: ['event-detail'] });
    },
  });
}
