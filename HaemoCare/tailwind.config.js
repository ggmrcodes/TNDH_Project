/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './App.tsx',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0B6E6E',
          dark: '#074F4F',
          light: '#E4F5F4',
          muted: '#B2DFDB',
          grad1: '#0B6E6E',
          grad2: '#14A39A',
        },
        accent: {
          DEFAULT: '#E8755A',
          light: '#FFF0EC',
          muted: '#F5B8A8',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          elevated: '#FEFDFB',
          bg: '#F8F6F2',
        },
        ink: {
          DEFAULT: '#1B2333',
          secondary: '#5C6678',
          light: '#9BA3B2',
        },
        status: {
          normal: '#0EA572',
          'normal-bg': '#E9FBF3',
          'normal-text': '#054D35',
          monitor: '#E8933A',
          'monitor-bg': '#FFF7ED',
          'monitor-text': '#7A4510',
          urgent: '#DC3B3B',
          'urgent-bg': '#FEF0F0',
          'urgent-text': '#8B1A1A',
        },
        edge: {
          DEFAULT: '#DDD9D3',
          light: '#EEEAE5',
          card: '#E8E4DE',
        },
        gold: {
          DEFAULT: '#D4A853',
          light: '#FFF8E7',
        },
      },
      fontFamily: {
        sans: ['System'],
        serif: ['Fraunces_400Regular'],
        'serif-italic': ['Fraunces_400Regular_Italic'],
        'serif-sb': ['Fraunces_600SemiBold'],
        'serif-b': ['Fraunces_700Bold'],
        'serif-black': ['Fraunces_900Black'],
        mono: ['IBMPlexMono_400Regular'],
        'mono-m': ['IBMPlexMono_500Medium'],
        'mono-sb': ['IBMPlexMono_600SemiBold'],
      },
      fontSize: {
        'hero': ['44px', { lineHeight: '48px', letterSpacing: '-1px' }],
        'stat': ['26px', { lineHeight: '30px', letterSpacing: '-0.5px' }],
      },
      borderRadius: {
        'xs': '4px',
        'pill': '9999px',
      },
      spacing: {
        'xs': '4px',
        'sm': '8px',
        'md': '16px',
        'lg': '24px',
        'xl': '32px',
        'xxl': '48px',
      },
    },
  },
  plugins: [],
};
