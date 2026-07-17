/** @type {import('tailwindcss').Config} */
// 颜色走 CSS 变量(global.css·觉学 token)。语义名给 RN Reusables;觉学品牌名(saffron/sage/crimson/gold/ink)直接用。
module.exports = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        border: 'var(--border)',
        'border-light': 'var(--border-light)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        surface: 'var(--surface)',
        primary: { DEFAULT: 'var(--primary)', foreground: 'var(--primary-foreground)' },
        secondary: { DEFAULT: 'var(--secondary)', foreground: 'var(--secondary-foreground)' },
        destructive: { DEFAULT: 'var(--destructive)', foreground: 'var(--destructive-foreground)' },
        muted: { DEFAULT: 'var(--muted)', foreground: 'var(--muted-foreground)' },
        accent: { DEFAULT: 'var(--accent)', foreground: 'var(--accent-foreground)' },
        popover: { DEFAULT: 'var(--popover)', foreground: 'var(--popover-foreground)' },
        card: { DEFAULT: 'var(--card)', foreground: 'var(--card-foreground)' },
        // 觉学 品牌色
        saffron: {
          DEFAULT: 'var(--saffron)',
          dark: 'var(--saffron-dark)',
          light: 'var(--saffron-light)',
          pale: 'var(--saffron-pale)',
        },
        sage: {
          DEFAULT: 'var(--sage)',
          dark: 'var(--sage-dark)',
          light: 'var(--sage-light)',
          pale: 'var(--sage-pale)',
        },
        crimson: {
          DEFAULT: 'var(--crimson)',
          dark: 'var(--crimson-dark)',
          light: 'var(--crimson-light)',
          pale: 'var(--crimson-pale)',
        },
        gold: {
          DEFAULT: 'var(--gold)',
          dark: 'var(--gold-dark)',
          light: 'var(--gold-light)',
          pale: 'var(--gold-pale)',
        },
        ink: {
          DEFAULT: 'var(--ink)',
          2: 'var(--ink-2)',
          3: 'var(--ink-3)',
          4: 'var(--ink-4)',
          5: 'var(--ink-5)',
        },
      },
      borderRadius: {
        pill: '9999px',
        xl: '20px',
        lg: '16px',
        md: '14px',
        DEFAULT: '12px',
        sm: '8px',
      },
      // 觉学 衬线主调(标题/日期用)。Mac/iOS 有 Songti SC 即显 CJK 衬线;web 可另加 Noto Serif SC 字体。
      fontFamily: {
        serif: ['Noto Serif SC', 'Songti SC', 'serif'],
      },
      // 全局字号整体放大约 +12%(PM 2026-06-26)。覆盖所有 text-* 类 + 基础 Text(默认 text-base)。
      //   ⚠️ 仅作用于 NativeWind 类;部分老页面用内联 fontSize 不受此影响(需各页单独调)。
      fontSize: {
        xs: ['13px', '18px'],
        sm: ['15px', '21px'],
        base: ['18px', '26px'],
        lg: ['20px', '28px'],
        xl: ['22px', '30px'],
        '2xl': ['27px', '34px'],
        '3xl': ['33px', '40px'],
        '4xl': ['40px', '46px'],
      },
    },
  },
  plugins: [],
};
