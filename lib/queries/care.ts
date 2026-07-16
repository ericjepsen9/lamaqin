import { useQuery } from '@tanstack/react-query';

import { todayInTzOrLocal } from '@/lib/date-tz';
import { supabase } from '@/lib/supabase';

// 关怀清单数据层 · 管理端 only(决策035/107:师兄端零呈现)。
// 单一真源(DEF-4 / SD-1):5 维滞后由 DB 状态机计算——
//   get_vow_status → get_care_dims(逐人) / get_cohort_care_dims(整班批量)。
//   前端不再自行在线算(旧版在线算是 v1.0 占位:漏「净土断签」、观修维恒 na、
//   且把师兄自选功课误计入掉队——2026-07-08 一致性检查两处 bug，改由 DB 单一真源修正)。
// 维度含义:attendance=共修出勤率档;task=日常功课维(念诵/顶礼/读经·worst-of·仅必修 source=auto);
//   meditation=观修维(座上观修);content/quiz=听课/答题维(本轮无数据流→na)。
// flagged(进关怀名单)= 任一【可算维】为 high。care_followups 真读真写。
// 时区(CLAUDE.md §1:禁用 DB CURRENT_DATE):p_today 按该班 cohort.timezone 取"今天"显式传入 RPC。

export type LagLevel = 'low' | 'medium' | 'high' | 'na';
export type FollowStatus = 'active' | 'resolved' | 'pending';

export type CareDims = {
  attendance: LagLevel; task: LagLevel; content: LagLevel; quiz: LagLevel; meditation: LagLevel;
};
export type CareStudent = {
  userId: string;
  cohortId: string;
  name: string;
  cohortName: string;
  dims: CareDims;
  flagged: boolean;
  lastFollowup: string | null;     // YYYY-MM-DD
  followStatus: FollowStatus | null;
};

// DB get_care_dims 返回的 jsonb 形状（值为 'low'|'medium'|'high'|'na'；flagged boolean）
type CareDimsRpc = {
  attendance?: string; task?: string; content?: string; quiz?: string; meditation?: string; flagged?: boolean;
};

const asLevel = (x: string | undefined): LagLevel =>
  x === 'low' || x === 'medium' || x === 'high' ? x : 'na';

function parseDims(d: CareDimsRpc | null | undefined): { dims: CareDims; flagged: boolean } {
  return {
    dims: {
      attendance: asLevel(d?.attendance), task: asLevel(d?.task), content: asLevel(d?.content),
      quiz: asLevel(d?.quiz), meditation: asLevel(d?.meditation),
    },
    flagged: !!d?.flagged,
  };
}

const NA_DIMS: CareDims = { attendance: 'na', task: 'na', content: 'na', quiz: 'na', meditation: 'na' };

const key = (u: string, c: string) => u + '|' + c;

// ── 关怀名单(列表)──────────────────────────────────────────────────
export function useCareRoster() {
  return useQuery({
    queryKey: ['care-roster'],
    staleTime: 60 * 1000,
    queryFn: async (): Promise<CareStudent[]> => {
      // profiles!inner:注销保留期账号不再列入关怀清单(决策078+B1待办收口;!inner 才会剔除
      //   整行,非 inner 只把 profiles 置 null——已用种子账号临时标记+还原实测过,见 classes.ts 同款注释)。
      const { data: members, error } = await supabase
        .from('class_members')
        .select('user_id, cohort_id, status, profiles!inner!class_members_user_id_fkey(full_name), cohorts(name, timezone)')
        .eq('status', 'active')
        .is('profiles.deletion_requested_at', null);
      if (error) throw error;
      const rows = (members ?? []) as unknown as {
        user_id: string; cohort_id: string; profiles: { full_name?: string | null } | null; cohorts: { name?: string | null; timezone?: string | null } | null;
      }[];
      if (rows.length === 0) return [];
      const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
      const cohortIds = Array.from(new Set(rows.map((r) => r.cohort_id)));
      // 每班时区（§1：按 cohort.timezone 取"今天"，禁用 DB CURRENT_DATE）
      const tzByCohort = new Map<string, string | null>();
      for (const r of rows) if (!tzByCohort.has(r.cohort_id)) tzByCohort.set(r.cohort_id, r.cohorts?.timezone ?? null);

      // 5 维滞后：整班批量 RPC（DB 单一真源），每个 cohort 一次，today 按该班时区
      const dimsByKey = new Map<string, { dims: CareDims; flagged: boolean }>();
      const perCohort = await Promise.all(
        cohortIds.map((cid) =>
          supabase.rpc('get_cohort_care_dims', { p_cohort: cid, p_today: todayInTzOrLocal(tzByCohort.get(cid)) })
        )
      );
      cohortIds.forEach((cid, i) => {
        const { data, error: rpcErr } = perCohort[i];
        // 单个班的 RPC 失败不再拖垮整份名单(其余班照常显示)——该班学员自然落到下方
        // dimsByKey.get() 的 NA_DIMS 兜底,和"该维确实无数据"用同一视觉语言(审计2026-07-10)。
        if (rpcErr) return;
        for (const row of (data ?? []) as { user_id: string; dims: CareDimsRpc }[]) {
          dimsByKey.set(key(row.user_id, cid), parseDims(row.dims));
        }
      });

      // 最近跟进(每人)
      const fu = new Map<string, { at: string; status: FollowStatus }>();
      const { data: fus } = await supabase
        .from('care_followups').select('student_id, contacted_at, follow_up_status')
        .in('student_id', userIds).order('contacted_at', { ascending: false });
      for (const f of (fus ?? []) as { student_id: string; contacted_at: string | null; follow_up_status: string | null }[]) {
        if (!fu.has(f.student_id)) fu.set(f.student_id, { at: (f.contacted_at ?? '').slice(0, 10), status: (f.follow_up_status as FollowStatus) ?? 'pending' });
      }

      return rows.map((r) => {
        const cd = dimsByKey.get(key(r.user_id, r.cohort_id)) ?? { dims: NA_DIMS, flagged: false };
        const f = fu.get(r.user_id);
        return {
          userId: r.user_id, cohortId: r.cohort_id,
          name: r.profiles?.full_name ?? '未命名', cohortName: r.cohorts?.name ?? '—',
          dims: cd.dims, flagged: cd.flagged,
          lastFollowup: f?.at ?? null, followStatus: f?.status ?? null,
        };
      });
    },
  });
}

// ── 学员关怀详情 ──────────────────────────────────────────────────────
export type Followup = { id: string; contactedAt: string; summary: string; status: FollowStatus; workerName: string | null };
export type CareDetail = {
  userId: string; name: string; cohortId: string | null; cohortName: string;
  dims: CareDims; flagged: boolean; snapshotNote: string;
  dimsError: boolean; // 5维RPC真失败(非"该维本无数据")时置true;跟进记录表单不因此不可用(审计2026-07-10)
  followups: Followup[];
};

export function useStudentCare(userId: string | undefined) {
  return useQuery({
    queryKey: ['care-detail', userId ?? 'none'],
    enabled: !!userId,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<CareDetail | null> => {
      if (!userId) return null;
      const { data: prof, error: profErr } = await supabase.from('profiles').select('full_name').eq('id', userId).maybeSingle();
      if (profErr) throw profErr; // 查询本身失败(网络/权限)≠"真没这个学员",不能静默当空
      if (!prof) return null;
      const { data: mem, error: memErr } = await supabase
        .from('class_members').select('cohort_id, cohorts(name, timezone)')
        .eq('user_id', userId).order('joined_at').limit(1).maybeSingle();
      if (memErr) throw memErr;
      const m = mem as unknown as { cohort_id: string; cohorts: { name?: string | null; timezone?: string | null } | null } | null;
      const cohortId = m?.cohort_id ?? null;

      // 5 维滞后：逐人 RPC（DB 单一真源），today 按该班时区（§1：禁用 DB CURRENT_DATE）
      // 这条 RPC 失败不再 throw 拖垮整个详情页——本页下方"添加跟进记录"和这条 RPC 无关,
      // 之前一 throw 就整页判"找不到该学员"、连带跟进表单都渲染不出来(审计2026-07-10发现)。
      // 改为:降级成 na(和"该维确实无数据"用同一视觉语言),但用 dimsError 标记真失败,页面上要有别的方式提示。
      let dims: CareDims = NA_DIMS;
      let flagged = false;
      let dimsError = false;
      if (cohortId) {
        const { data: d, error: rpcErr } = await supabase.rpc('get_care_dims', {
          p_user: userId, p_cohort: cohortId, p_today: todayInTzOrLocal(m?.cohorts?.timezone),
        });
        if (rpcErr) {
          dimsError = true;
        } else {
          const parsed = parseDims(d as CareDimsRpc | null);
          dims = parsed.dims;
          flagged = parsed.flagged;
        }
      }

      // 跟进记录 + 记录人名
      const { data: fus } = await supabase
        .from('care_followups').select('id, contacted_at, summary, follow_up_status, care_worker_id')
        .eq('student_id', userId).order('contacted_at', { ascending: false });
      const fuRows = (fus ?? []) as { id: string; contacted_at: string | null; summary: string | null; follow_up_status: string | null; care_worker_id: string | null }[];
      const workerIds = Array.from(new Set(fuRows.map((f) => f.care_worker_id).filter((x): x is string => !!x)));
      const nameById = new Map<string, string>();
      if (workerIds.length > 0) {
        const { data: ws } = await supabase.from('profiles').select('id, full_name').in('id', workerIds);
        for (const w of (ws ?? []) as { id: string; full_name: string | null }[]) nameById.set(w.id, w.full_name ?? '');
      }
      const followups: Followup[] = fuRows.map((f) => ({
        id: f.id, contactedAt: (f.contacted_at ?? '').slice(0, 10), summary: f.summary ?? '',
        status: (f.follow_up_status as FollowStatus) ?? 'pending',
        workerName: f.care_worker_id ? (nameById.get(f.care_worker_id) ?? null) : null,
      }));

      return {
        userId, name: prof.full_name ?? '未命名', cohortId, cohortName: m?.cohorts?.name ?? '—',
        dims, flagged, dimsError,
        snapshotNote: '5 维滞后由状态机实时计算(单一真源);听课/答题维待接入数据流。',
        followups,
      };
    },
  });
}
