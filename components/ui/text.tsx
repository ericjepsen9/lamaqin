import * as React from 'react';
import { StyleSheet, Text as RNText } from 'react-native';

import { cn } from '@/lib/utils';

const TextClassContext = React.createContext<string | undefined>(undefined);

function Text({ className, style, ...props }: React.ComponentProps<typeof RNText>) {
  const textClass = React.useContext(TextClassContext);
  // On web, CSS utility classes override inline style (NativeWind's static stylesheet vs
  // RN-Web's per-element atomic classes race for cascade priority; which wins can vary by
  // load/cache timing). Skip text-foreground/text-base when the style prop sets that
  // property explicitly, so the intended color/fontSize deterministically wins either way.
  const flat = StyleSheet.flatten(style) ?? {};
  const hasExplicitColor = 'color' in flat;
  const hasExplicitFontSize = 'fontSize' in flat;
  return (
    <RNText
      className={cn(!hasExplicitFontSize && 'text-base', !hasExplicitColor && 'text-foreground', textClass, className)}
      style={style}
      {...props}
    />
  );
}

export { Text, TextClassContext };
