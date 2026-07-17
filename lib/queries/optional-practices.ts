import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

// 自选经/抄经/拜经候选清单(PD-20/决策052:admin 后台配置,师兄只能从清单选、不能自由输入)。
// program_optional_practices(program_id, practice_id) 映射表 → 该专业的候选修法集合。

export type OptionalPractice = { practiceId: string; name: string; unit: string; displayOrder: number };

// 学员端(设计④/A1·2026-07-08):合并师兄所在【全部】专业(班级+自学)的候选清单去重——
//   兼修/自学模式来源分裂(class_members / user_self_study_programs),调用方需合并两条 programId 后传入。
export function useOptionalPracticesForPrograms(programIds: string[]) {
  const key = [...programIds].sort().join(',');
  return useQuery({
    queryKey: ['optional-practices-multi', key],
    enabled: programIds.length > 0,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<OptionalPractice[]> => {
      if (programIds.length === 0) return [];
      const { data, error } = await supabase
        .from('program_optional_practices')
        .select('practice_id, display_order, practices(name, unit)')
        .in('program_id', programIds)
        .order('display_order');
      if (error) throw error;
      const seen = new Set<string>();
      const out: OptionalPractice[] = [];
      for (const r of (data ?? []) as unknown as { practice_id: string; display_order: number | null; practices: { name?: string; unit?: string } | null }[]) {
        if (!r.practice_id || seen.has(r.practice_id)) continue;
        seen.add(r.practice_id);
        out.push({ practiceId: r.practice_id, name: r.practices?.name ?? '未知修法', unit: r.practices?.unit ?? '遍', displayOrder: r.display_order ?? 0 });
      }
      return out;
    },
  });
}

export function useOptionalPracticesByProgram(programId: string | undefined) {
  return useQuery({
    queryKey: ['optional-practices', programId ?? 'none'],
    enabled: !!programId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<OptionalPractice[]> => {
      if (!programId) return [];
      const { data, error } = await supabase
        .from('program_optional_practices')
        .select('practice_id, display_order, practices(name, unit)')
        .eq('program_id', programId)
        .order('display_order');
      if (error) throw error;
      return ((data ?? []) as unknown as { practice_id: string; display_order: number | null; practices: { name?: string; unit?: string } | null }[])
        .filter((r) => !!r.practice_id)
        .map((r) => ({ practiceId: r.practice_id, name: r.practices?.name ?? '未知修法', unit: r.practices?.unit ?? '遍', displayOrder: r.display_order ?? 0 }));
    },
  });
}
