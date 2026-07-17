import * as React from 'react';
import { StyleSheet, Text as RNText } from 'react-native';

import { DEFAULT_FONT_SIZE, useFontScale } from '@/lib/font-scale';
import { cn } from '@/lib/utils';

const TextClassContext = React.createContext<string | undefined>(undefined);

// 字号联动(2026-07-17 重做,详见 lib/font-scale.ts 顶部注释):这是全 app 唯一的 Text 落点
// (裸 RNText 已批量替换成这个组件),缩放逻辑就放这一处,不再靠改写库内部。
function Text({ className, style, ...props }: React.ComponentProps<typeof RNText>) {
  const textClass = React.useContext(TextClassContext);
  const scale = useFontScale((s) => s.scale);
  // On web, CSS utility classes override inline style (NativeWind's static stylesheet vs
  // RN-Web's per-element atomic classes race for cascade priority; which wins can vary by
  // load/cache timing). Skip text-foreground/text-base when the style prop sets that
  // property explicitly, so the intended color/fontSize deterministically wins either way.
  const flat = StyleSheet.flatten(style) ?? {};
  const hasExplicitColor = 'color' in flat;
  const hasExplicitFontSize = 'fontSize' in flat;
  // scale===1(小档)时原样返回,不多包一层——维持"标准/大"两档才有实际差异的既有语义。
  const scaledStyle = scale !== 1
    ? [style, { fontSize: (hasExplicitFontSize ? (flat.fontSize as number) : DEFAULT_FONT_SIZE) * scale }]
    : style;
  return (
    <RNText
      className={cn(!hasExplicitFontSize && 'text-base', !hasExplicitColor && 'text-foreground', textClass, className)}
      style={scaledStyle}
      {...props}
    />
  );
}

export { Text, TextClassContext };
