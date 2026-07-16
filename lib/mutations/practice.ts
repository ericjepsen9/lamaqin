import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { Json } from '@/lib/types/database';

// 打卡计数(决策165/167):写 practice_logs;current_count / current_session_count 由 DB 触发器原子累加。
//   count 计数型(遍数);durationMinutes 时长型(观修分钟)。logDate 可传过去日期=补录(信任师兄·原则6;
//   DB no_future_date 约束禁未来);不传则用 DB DEFAULT CURRENT_DATE(今天)。
// clientToken(弱网幂等·2026-07-12):调用方传同一个 token 重试同一笔提交时,唯一索引会拒绝
//   重复插入——这里把"重复键"当成功处理(查回原行 id 返回),而不是报错,避免弱网下网络重试
//   造成的重复计数(会被触发器错误地二次累加进愿的官方修量统计)。
export function useRecordPracticeLog() {
  const qc = useQueryClient();
  const { session } = useAuth();
  const uid = session?.user.id;
  return useMutation({
    // retry(弱网基础设施·2026-07-12):mutations 全局默认不重试(见 lib/query-client.ts),
    // 这里单独开——本 mutation 已靠 clientToken 做到"重试绝不重复计数",是为数不多可以安全
    // 自动重试的写入,别的写入路径未做同样处理前不要照抄这个 retry 配置。
    retry: 2,
    // 返回新建 log 的 id:供快速计数弹层「撤销这一笔」真删该行(审计 2026-07-09:原撤销只清 UI 不删库=假按钮)。
    mutationFn: async ({ vowId, count, durationMinutes, logDate, clientToken }: { vowId: string; count?: number; durationMinutes?: number; logDate?: string; clientToken?: string }): Promise<string> => {
      if (!uid) throw new Error('未登录');
      const row: { user_id: string; vow_id: string; count?: number; duration_minutes?: number; log_date?: string; client_token?: string } = { user_id: uid, vow_id: vowId };
      if (count != null) row.count = count;
      if (durationMinutes != null) row.duration_minutes = durationMinutes;
      if (logDate) row.log_date = logDate;
      if (clientToken) row.client_token = clientToken;
      const { data, error } = await supabase.from('practice_logs').insert(row).select('id').single();
      if (error) {
        // 23505 = unique_violation;只在"确实是我们自己这个 token 撞了"时才当幂等命中处理,
        // 避免把其它无关的唯一约束冲突也误吞掉。
        if (error.code === '23505' && clientToken) {
          const { data: existing, error: selErr } = await supabase.from('practice_logs').select('id').eq('client_token', clientToken).maybeSingle();
          if (!selErr && existing) return existing.id;
        }
        throw error;
      }
      return data.id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-vows'] });
      qc.invalidateQueries({ queryKey: ['vow-logs'] });
    },
  });
}

// 撤销一笔打卡(快速计数「记错了?撤销」·决策166"已记入可撤销"):删该 log 行,DB 触发器自动回滚累计。
// RLS 只放行本人 + 未审核(is_confirmed=false)的行——刚记的那笔必然满足;审核锁定后由管理侧处理。
export function useUndoPracticeLog() {
  const qc = useQueryClient();
  return useMutation({
    // 按 id 删除天然幂等(重试删同一行,查不到就是 0 行受影响、不报错),可安全开重试。
    retry: 2,
    mutationFn: async ({ logId }: { logId: string }) => {
      const { error } = await supabase.from('practice_logs').delete().eq('id', logId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-vows'] });
      qc.invalidateQueries({ queryKey: ['vow-logs'] });
    },
  });
}

// 加功课(自定愿·决策160 / PRD §2.4「完全自定义:项目/总数/周期/节奏全可选」/ 节奏自主原则4):师兄自行发愿,无需审批。
//   周期 target_period:lifetime 终生 / until_complete 限期完成 / daily 每日制 / weekly 每周制。
//   节奏 daily_target / weekly_target;截止 endDate→current_end_date(=original_end_date)。
//   schema 约束(20260618000060):period=daily 须 daily_target;period=weekly 须 weekly_target;
//     period≠lifetime 须有 current_end_date(vows_must_have_terminus)。下面入参组装已保证满足(UI 也会拦)。
export type CustomVowInput = {
  practiceId: string;
  customName?: string | null;
  targetCount?: number | null;
  targetPeriod: 'lifetime' | 'until_complete' | 'daily' | 'weekly';
  dailyTarget?: number | null;
  weeklyTarget?: number | null;
  endDate?: string | null; // YYYY-MM-DD;终生留空
};
export function useCreateCustomVow() {
  const qc = useQueryClient();
  const { session } = useAuth();
  const uid = session?.user.id;
  return useMutation({
    mutationFn: async (input: CustomVowInput) => {
      if (!uid) throw new Error('未登录');
      const { practiceId, customName, targetCount, targetPeriod, dailyTarget, weeklyTarget, endDate } = input;
      const end = targetPeriod === 'lifetime' ? null : (endDate || null);
      const { error } = await supabase.from('user_practice_vows').insert({
        user_id: uid,
        source: 'custom',
        practice_id: practiceId,
        custom_name: customName?.trim() || null,
        target_count: targetCount && targetCount > 0 ? targetCount : null,
        target_period: targetPeriod,
        daily_target: dailyTarget && dailyTarget > 0 ? dailyTarget : null,
        weekly_target: weeklyTarget && weeklyTarget > 0 ? weeklyTarget : null,
        current_end_date: end,
        original_end_date: end,
        start_date: new Date().toLocaleDateString('en-CA'),
        status: 'active',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-vows'] });
    },
  });
}

// 调整节奏(决策085 / 节奏自主原则4):师兄自改每日/每周目标无需审批,追加 pace_history(只读改写)。
//   auto 愿与 custom 愿均可改节奏(决策160:班级愿「仅可改节奏」);周期/总数/截止不在此改(auto 锁定,custom 走重设)。
//   vows_protect_status 触发器只锁 current_status 与 auto 的 due_date,不锁 daily/weekly_target,故本人可改。
export function useUpdateVowPace() {
  const qc = useQueryClient();
  const { session } = useAuth();
  const uid = session?.user.id;
  return useMutation({
    mutationFn: async ({ vowId, dailyTarget, weeklyTarget }: { vowId: string; dailyTarget?: number | null; weeklyTarget?: number | null }) => {
      if (!uid) throw new Error('未登录');
      // 读现有 pace_history 追加一笔(单人改自己的愿,无并发顾虑)
      const { data: cur } = await supabase.from('user_practice_vows').select('pace_history').eq('id', vowId).eq('user_id', uid).single();
      const raw = (cur as { pace_history?: unknown } | null)?.pace_history;
      const hist: Json[] = Array.isArray(raw) ? (raw as Json[]) : [];
      hist.push({ at: new Date().toLocaleDateString('en-CA'), daily_target: dailyTarget ?? null, weekly_target: weeklyTarget ?? null });
      const { error } = await supabase.from('user_practice_vows')
        .update({
          daily_target: dailyTarget && dailyTarget > 0 ? dailyTarget : null,
          weekly_target: weeklyTarget && weeklyTarget > 0 ? weeklyTarget : null,
          pace_history: hist,
        })
        .eq('id', vowId).eq('user_id', uid);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-vows'] }),
  });
}

// 删除自定功课(软删除·决策160):师兄可删自己发的愿。status→'abandoned'(出 active 列表,保留 practice_logs 历史)。
//   RLS:UPDATE 限本人(user_id=auth.uid());vows_protect_status 触发器只锁 current_status,不锁 status,故本人可改 status。
//   仅对 source='custom' 开放(班级/自学 auto 愿由系统管理,不在此删)。
export function useDeleteCustomVow() {
  const qc = useQueryClient();
  const { session } = useAuth();
  const uid = session?.user.id;
  return useMutation({
    mutationFn: async (vowId: string) => {
      if (!uid) throw new Error('未登录');
      const { error } = await supabase
        .from('user_practice_vows')
        .update({ status: 'abandoned' })
        .eq('id', vowId)
        .eq('user_id', uid)
        .eq('source', 'custom');
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-vows'] });
    },
  });
}
