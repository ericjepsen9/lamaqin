import { StyleSheet } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';

// 顶部装饰图案 = 莲花线描(tone-on-tone 白·低透明·决策160)。配暖金渐变全宽铺底用(修持 / 班级 顶部共用)。
// viewBox 固定 390×300,slice 缩放铺满父容器;莲心居中。
export function LotusPattern() {
  const cx = 195;
  const cy = 150;
  const petals = (n: number, r0: number, r1: number, w: number, off: number, op: number, sw: number) =>
    Array.from({ length: n }, (_, i) => {
      const a = (360 / n) * i + off;
      return (
        <G key={`${r0}-${i}`} rotation={a} originX={cx} originY={cy}>
          <Path
            d={`M ${cx} ${cy - r0} Q ${cx - w} ${cy - (r0 + r1) / 2} ${cx} ${cy - r1} Q ${cx + w} ${cy - (r0 + r1) / 2} ${cx} ${cy - r0} Z`}
            fill="none"
            stroke="#FFFFFF"
            strokeOpacity={op}
            strokeWidth={sw}
          />
        </G>
      );
    });
  return (
    <Svg viewBox="0 0 390 300" preserveAspectRatio="xMidYMid slice" style={StyleSheet.absoluteFill} pointerEvents="none">
      {petals(18, 44, 128, 19, 0, 0.22, 1.2)}
      {petals(18, 28, 82, 13, 10, 0.18, 1.1)}
      <Circle cx={cx} cy={cy} r={22} fill="none" stroke="#FFFFFF" strokeOpacity={0.2} strokeWidth={1.1} />
    </Svg>
  );
}
