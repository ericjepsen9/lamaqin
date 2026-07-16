// 通用分页取全量(2026-07-11 一致性调研发现:多处管理端列表查询没有 .range()/.limit(),
//   PostgREST 单次封顶(常见 1000 行)会静默截断,数据涨过这个数就查不全、还不自知)。
// 按 range 循环拉到拿不满一页为止,供"列表理论上可能超过单页上限"的查询复用——
// 单一真源:同一模式已在 lib/queries/admin/quiz.ts 的 useAdminQuestions 验证过,这里抽成共享函数
// 供其余几处同类查询复用,不再各写一份。
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw error;
    const page = data ?? [];
    all.push(...page);
    if (page.length < pageSize) break;
  }
  return all;
}
