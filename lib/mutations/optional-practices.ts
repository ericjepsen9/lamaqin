import { useMutation, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

// 自选经候选清单写库(PD-20/决策052)。写权 = is_system_admin()(program_optional_practices_write)。

function useInvalidateOptional() {
  const qc = useQueryClient();
  return (programId: string) => qc.invalidateQueries({ queryKey: ['optional-practices', programId] });
}

// 幂等:UNIQUE(program_id, practice_id) → upsert 重复勾选不报错
export function useAddOptionalPractice() {
  const inval = useInvalidateOptional();
  return useMutation({
    mutationFn: async (p: { programId: string; practiceId: string }) => {
      const { error } = await supabase
        .from('program_optional_practices')
        .upsert({ program_id: p.programId, practice_id: p.practiceId }, { onConflict: 'program_id,practice_id' });
      if (error) throw error;
    },
    onSuccess: (_d, p) => inval(p.programId),
  });
}

export function useRemoveOptionalPractice() {
  const inval = useInvalidateOptional();
  return useMutation({
    mutationFn: async (p: { programId: string; practiceId: string }) => {
      const { error } = await supabase
        .from('program_optional_practices')
        .delete()
        .eq('program_id', p.programId)
        .eq('practice_id', p.practiceId);
      if (error) throw error;
    },
    onSuccess: (_d, p) => inval(p.programId),
  });
}
