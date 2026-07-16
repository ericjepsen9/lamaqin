// 时区工具（CLAUDE.md §1 时区四层：班级集体按 cohort.timezone·IANA；禁用 DB CURRENT_DATE 当"今天"）。
// 单一真源：classes.ts / care.ts 等一律 import 此处，勿各自复制。

// 某 IANA 时区下的今天（YYYY-MM-DD）；无 tz / 失败 → undefined（调用方自行决定回退）。
export function todayInTz(tz?: string | null): string | undefined {
  if (!tz) return undefined;
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
  } catch {
    return undefined;
  }
}

// 某 IANA 时区下的今天；无 tz 时回退设备本地日（仍优于服务器 UTC·§1）。恒返回 YYYY-MM-DD。
export function todayInTzOrLocal(tz?: string | null): string {
  return todayInTz(tz) ?? new Date().toLocaleDateString('en-CA');
}
