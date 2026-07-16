import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** 合并 className(条件类 + Tailwind 冲突消解),RNR 组件统一用它。 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 课/书名加书名号。库里两类名混存:原文类自带《》(如「《心经》」)、讲记类不带(如「入行论广解」),
 *  界面无条件包一层会出《《心经》》——已带就原样返回,没带才包(PM 2026-07-02)。 */
export function bookTitle(name: string | null | undefined): string {
  if (!name) return '';
  return name.startsWith('《') ? name : `《${name}》`;
}

/** 一次性提交凭证(弱网幂等用,同 components/quick-count-sheet.tsx 既有先例):调用方在表单/弹层
 *  打开时生成一个、提交(含重试)全程复用同一个,成功后或表单关闭再换新的——不是每次渲染都生成。 */
export function genClientToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
