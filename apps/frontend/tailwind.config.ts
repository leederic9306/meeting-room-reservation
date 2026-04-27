import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        // 브랜드 메인 컬러 — NEXT_PUBLIC_PRIMARY_COLOR 로 런타임 오버라이드 가능 (PRD UX-002)
        primary: {
          DEFAULT: 'var(--color-primary)',
          foreground: 'var(--color-primary-foreground)',
        },
        // === Design Tokens (docs/07-design.md §1.2) ===
        brand: {
          50: 'var(--brand-50)',
          100: 'var(--brand-100)',
          200: 'var(--brand-200)',
          300: 'var(--brand-300)',
          400: 'var(--brand-400)',
          500: 'var(--brand-500)',
          600: 'var(--brand-600)',
          700: 'var(--brand-700)',
          800: 'var(--brand-800)',
          900: 'var(--brand-900)',
        },
        neutral: {
          0: 'var(--neutral-0)',
          50: 'var(--neutral-50)',
          100: 'var(--neutral-100)',
          200: 'var(--neutral-200)',
          300: 'var(--neutral-300)',
          400: 'var(--neutral-400)',
          500: 'var(--neutral-500)',
          600: 'var(--neutral-600)',
          700: 'var(--neutral-700)',
          800: 'var(--neutral-800)',
          900: 'var(--neutral-900)',
        },
        success: {
          50: 'var(--success-50)',
          500: 'var(--success-500)',
          700: 'var(--success-700)',
        },
        warning: {
          50: 'var(--warning-50)',
          500: 'var(--warning-500)',
          700: 'var(--warning-700)',
        },
        danger: {
          50: 'var(--danger-50)',
          500: 'var(--danger-500)',
          700: 'var(--danger-700)',
        },
        room: {
          1: 'var(--room-1)',
          2: 'var(--room-2)',
          3: 'var(--room-3)',
          4: 'var(--room-4)',
          5: 'var(--room-5)',
          6: 'var(--room-6)',
          7: 'var(--room-7)',
          8: 'var(--room-8)',
          9: 'var(--room-9)',
          10: 'var(--room-10)',
        },

        // shadcn/ui 표준 토큰 (HSL 트리플릿)
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        // 디자인 토큰 (§1.2)
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        xl: 'var(--shadow-xl)',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      fontSize: {
        // 타입 스케일 (§2.2) — Tailwind 기본 xs/sm/base 등은 유지하고, 디자인 전용 토큰만 추가
        display: ['2.25rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        h1: ['1.75rem', { lineHeight: '1.2', letterSpacing: '-0.02em' }],
        h2: ['1.375rem', { lineHeight: '1.3', letterSpacing: '-0.015em' }],
        h3: ['1.125rem', { lineHeight: '1.4' }],
        body: ['0.875rem', { lineHeight: '1.5' }],
        micro: ['0.6875rem', { lineHeight: '1.4', letterSpacing: '0.02em' }],
      },
    },
  },
  plugins: [animate],
};

export default config;
