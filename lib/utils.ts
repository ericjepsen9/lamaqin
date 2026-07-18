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

/** 给一个背景色(#rrggbb),判断该配浅色字还是深色字(YIQ 感知亮度公式,阈值128·业界常见做法)。
 *  画报强调色场景专用:管理员选的是一个明确的颜色值,不是要分析一整张图片的深浅,亮度可以
 *  直接算、不需要猜(2026-07-18·画报强调色/透明度)。传入格式不对时兜底按"配深色字"处理。 */
export function readableTextTone(hex: string | null | undefined): 'light' | 'dark' {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return 'dark';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? 'dark' : 'light';
}

/** #rrggbb + 0~1 透明度 → rgba() 字符串(画报强调色叠色用)。 */
export function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}
