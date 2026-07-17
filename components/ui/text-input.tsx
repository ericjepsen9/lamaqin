import * as React from 'react';
import { StyleSheet, TextInput as RNTextInput } from 'react-native';

import { DEFAULT_FONT_SIZE, useFontScale } from '@/lib/font-scale';

// 字号联动(2026-07-17 重做,详见 lib/font-scale.ts 顶部注释):全 app 唯一的 TextInput 落点
// (裸 TextInput 已批量替换成这个组件),跟 components/ui/text.tsx 的 Text 同一套逻辑。
// TextInput 全 app 都是走 style 内联设 fontSize(没有走 NativeWind className 的用法),
// 逻辑比 Text 简单些,不需要处理 className 合并。
function TextInput({ style, ...props }: React.ComponentProps<typeof RNTextInput>) {
  const scale = useFontScale((s) => s.scale);
  const flat = StyleSheet.flatten(style) as { fontSize?: number } | undefined;
  const hasExplicitFontSize = typeof flat?.fontSize === 'number';
  const scaledStyle = scale !== 1
    ? [style, { fontSize: (hasExplicitFontSize ? (flat!.fontSize as number) : DEFAULT_FONT_SIZE) * scale }]
    : style;
  return <RNTextInput style={scaledStyle} {...props} />;
}

export { TextInput };
