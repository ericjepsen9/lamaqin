import React from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// 全局字号联动(PM 2026-06-26):设置里选档 → 全 app 文字随之缩放,并持久化。
// 机制:补丁 RN <Text>/<TextInput> 的 render,把样式里的 fontSize × 当前倍率。
//   ⚠️ 默认「标准」=1.0 时补丁【完全无副作用】(原样返回),只有选「小/大」才激活 → 风险可控。
//   触发重渲染:根布局按 scale 给 <Stack> 加 key(见 app/_layout.tsx),改档时整树重渲染、即时全局生效。

export type FontLevel = '小' | '标准' | '大';
// PM 2026-06-28「全局还是小」→ 整体上调:小=旧标准(1.0)、标准默认放大 15%、大 32%。
//   标准≠1 后补丁常驻(改档/默认都缩放),补丁带 try/catch 兜底、风险可控。
const SCALE: Record<FontLevel, number> = { 小: 1.0, 标准: 1.15, 大: 1.32 };
export const FONT_LEVELS: FontLevel[] = ['小', '标准', '大'];

type FontScaleState = {
  level: FontLevel;
  scale: number;
  setLevel: (level: FontLevel) => void;
};

export const useFontScale = create<FontScaleState>()(
  persist(
    (set) => ({
      level: '标准',
      scale: SCALE['标准'], // ⚠️ 必须用算出来的默认值,而非写死 1,否则默认档永远不缩放
      setLevel: (level) => set({ level, scale: SCALE[level] ?? 1 }),
    }),
    {
      name: 'sss-font-scale',
      storage: createJSONStorage(() => AsyncStorage),
      // 持久化恢复后用 level 重算 scale(防 SCALE 调整后旧值不一致)
      onRehydrateStorage: () => (state) => {
        if (state) state.scale = SCALE[state.level] ?? 1;
      },
    },
  ),
);

// ── 全局补丁:Text/TextInput 的 fontSize × scale ──
// ⚠️ react-native-web 把 Text 包成 memo(forwardRef(...)),渲染函数在内层(Comp.type.render),
//   而 RN 原生是裸 forwardRef(Comp.render)。两种都要解包,否则 web 上补丁静默跳过 → 字号不变。
type RenderHolder = { render?: (...a: unknown[]) => unknown; type?: { render?: (...a: unknown[]) => unknown; __sssFontPatched?: boolean }; __sssFontPatched?: boolean };
function patchFontScaling() {
  for (const Comp of [Text, TextInput] as unknown as RenderHolder[]) {
    // 找到真正持有 render 的对象:裸 forwardRef → Comp;memo 包裹 → Comp.type
    const holder: RenderHolder | undefined =
      typeof Comp?.render === 'function' ? Comp : typeof Comp?.type?.render === 'function' ? Comp.type : undefined;
    if (!holder || holder.__sssFontPatched || typeof holder.render !== 'function') continue;
    const orig = holder.render;
    holder.render = function patched(...args: unknown[]) {
      const el = orig.apply(this, args) as React.ReactElement<{ style?: unknown }> | null;
      try {
        const scale = useFontScale.getState().scale;
        if (scale && scale !== 1 && el && el.props) {
          const flat = StyleSheet.flatten(el.props.style) as { fontSize?: number } | undefined;
          const fs = flat?.fontSize;
          if (typeof fs === 'number' && Number.isFinite(fs)) {
            return React.cloneElement(el, { style: [el.props.style, { fontSize: fs * scale }] });
          }
        }
      } catch {
        // 任何异常都退回原样,绝不影响渲染
      }
      return el;
    };
    holder.__sssFontPatched = true;
  }
}
patchFontScaling();
