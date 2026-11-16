/** tailwind config — 科技蓝 #1B88EE 主色 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#1B88EE',
          dark: '#0f6fce',
          soft: '#e8f2fd',
        },
        up: '#e03434',   // 红涨
        down: '#0a9e6e', // 绿跌
      },
      boxShadow: {
        card: '0 1px 3px rgba(15,23,42,.06), 0 4px 16px rgba(15,23,42,.06)',
      },
    },
  },
  plugins: [],
};
