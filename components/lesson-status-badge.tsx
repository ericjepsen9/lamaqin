import type { LessonStatus } from '@/lib/queries/courses';

import { Text } from '@/components/ui/text';
// 每节圆满态小标(毕业达标·决策:已学≠达标):圆满(sage)/ 进行中(saffron)/ 未学(灰)。
// 抽自 course/[id].tsx,供 class.tsx 班级页"本周课程"复用同一视觉(D3 尾巴·2026-07-11)——
// 颜色值与两处原各自的本地色板一致(course/[id].tsx 与 class.tsx 的 SAGE/SAFFRON_DARK/INK3 完全相同)。
const SAGE = '#6f9a86';
const SAFFRON_DARK = '#b35535';
const INK3 = '#7e6d5b';

export function LessonStatusBadge({ st }: { st: LessonStatus | undefined }) {
  if (st === 'complete') return <Text style={{ fontSize: 10, fontWeight: '700', color: SAGE }}>圆满 ✓</Text>;
  if (st === 'partial') return <Text style={{ fontSize: 10, fontWeight: '700', color: SAFFRON_DARK }}>进行中</Text>;
  return <Text style={{ fontSize: 10, color: INK3 }}>未学</Text>;
}
