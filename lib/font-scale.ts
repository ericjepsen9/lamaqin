import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// 全局字号联动(PM 2026-06-26,2026-07-17 重做):设置里选档 → 全 app 文字随之缩放,并持久化。
// ⚠️ 2026-07-17 以前是"猴子补丁改写 RN Text/TextInput 的 render"这条路,e2e 实测 web 端完全不生效
//   (连默认档都没缩放),往下查发现补丁自己的注释("react-native-web 把 Text 包成
//   memo(forwardRef(...))")跟实际装的 react-native-web 0.21.2 源码不符(其实是裸 forwardRef,
//   跟原生 RN 结构一样)——前提假设本身就错了,具体卡在运行时哪一步没能在沙盒里调出来
//   (没有真实浏览器调试环境)。改写第三方库内部渲染方法这条路本质上就是在赌"这个版本内部
//   实现刚好长这样",这次实测证明赌错一次,以后升级依赖/换打包方式大概率还会以别的方式坏掉。
// 现改为正规方案:components/ui/text.tsx 的 Text、components/ui/text-input.tsx 的 TextInput
//   两个包装组件各自读这个 store 的 scale、把 fontSize 乘上倍率(普通 React 组合,不碰任何库
//   内部);全 app 裸用 react-native 的 Text/TextInput 处已批量换成这两个包装组件
//   (2026-07-17 一次性替换 65 个文件、629+61 处用法)。这里只剩纯状态,不再有任何渲染副作用。
export type FontLevel = '小' | '标准' | '大';
// PM 2026-06-28「全局还是小」→ 整体上调:小=旧标准(1.0)、标准默认放大 15%、大 32%。
export const SCALE: Record<FontLevel, number> = { 小: 1.0, 标准: 1.15, 大: 1.32 };
export const FONT_LEVELS: FontLevel[] = ['小', '标准', '大'];

// Text/TextInput 包装组件共用:没显式设 fontSize 时的换算基准。
// ⚠️ 必须跟 tailwind.config.js 的 theme.fontSize.base 第一项保持一致(当前 18px)——那条
//   Tailwind class 是静态 CSS,不随这个 scale 联动,没显式 fontSize 时按这个默认值换算成
//   显式内联值才能缩放;改 tailwind.config.js 的 base 记得回来同步这个数。
export const DEFAULT_FONT_SIZE = 18;

type FontScaleState = {
  level: FontLevel;
  scale: number;
  setLevel: (level: FontLevel) => void;
};

export const useFontScale = create<FontScaleState>()(
  persist(
    (set) => ({
      // 默认档改回"小"(PM 2026-07-17,推翻上面 06-28 那次"默认调大"的决定)。
      // 只影响新用户/本地还没存过这项设置的场景——已经存了"标准"/"大"偏好的老用户不受影响。
      level: '小',
      scale: SCALE['小'], // ⚠️ 必须用算出来的默认值,而非写死 1(虽然这里刚好等于 1)
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
