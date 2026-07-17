import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';

// 管理端写操作统一封装。新页面的批准/确认/保存/删除等写操作都走这个：
// 传入 supabase 写函数 + 成功后要刷新的查询 key，自动 invalidate（列表/详情重新拉），
// 并暴露 isPending / error。错误处理与刷新行为全后台一致，避免每页各写一套。
//
// 用法：
//   const approve = useAdminMutation<string>({
//     mutationFn: async (userId) => {
//       const { error } = await supabase.from('profiles').update({ status: 'active' }).eq('id', userId);
//       if (error) throw error;
//     },
//     invalidateKeys: [['admin-students'], ['admin-student']],
//   });
//   <AdminButton onPress={() => approve.mutate(id)} disabled={approve.isPending}>批准</AdminButton>
export function useAdminMutation<TArgs = void, TResult = unknown>(opts: {
  mutationFn: (args: TArgs) => Promise<TResult>;
  invalidateKeys?: QueryKey[];
  onSuccess?: (result: TResult, args: TArgs) => void;
  // 弱网重试(2026-07-12):不传维持全局默认(mutations 默认不重试,见 lib/query-client.ts)——
  // 只有调用方已经用 clientToken 做到"重试不重复写"时才该传 retry:2,别的写入路径别照抄。
  retry?: number;
}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: opts.mutationFn,
    retry: opts.retry,
    onSuccess: (result, args) => {
      opts.invalidateKeys?.forEach((key) => qc.invalidateQueries({ queryKey: key }));
      opts.onSuccess?.(result, args);
    },
  });
}
