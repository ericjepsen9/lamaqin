# lib/queries · 数据访问层(服务层)

> 配套 App `CLAUDE.md §6.5 逻辑落位`。这一层是 App 与 Supabase 之间**唯一的缝**。

- **组件永不直连 `supabase`**——所有查询/写库只调本层导出的函数(也是将来好换实现的缝)。
- **一域一文件**:`courses.ts` / `progress.ts` / `checkins.ts` …,各导出有类型的函数(如 `getCurrentWeekLessons()`,内部包 RPC `get_current_week_lessons`)。
- 边界校验走 `lib/schemas/`(Zod);类型走 `lib/types/`;TanStack Query 的 hook 架在本层之上(或就放本层)。
- **这是组织层,不是安全层**:红线/权限仍在 DB 的 RLS,不靠这里(见 `CLAUDE.md §3 / §6`)。
- 查询变复杂往哪走,看**性质**不看行数(§6.5):数据形状 → DB 视图/RPC;流程/副作用/密钥 → Edge Function。

Phase 1/2 起填充。
