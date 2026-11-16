/** 白金高奢主题 —— 象牙白 × 香槟金 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        gold: {
          DEFAULT: '#b08d57',   // 主香槟金
          light: '#d6bd8e',
          bright: '#e3d0a8',
          deep: '#8a6d3b',      // 深金（文字）
          ink: '#6b552f',       // 金棕
          soft: '#f4eee1',      // 金雾底
          hair: '#e4d8bd',      // 金色发丝线
        },
        ivory: {
          DEFAULT: '#f7f3ec',   // 象牙白页面底
          card: '#fffdf9',      // 卡片底
        },
        ink: {
          DEFAULT: '#221e17',   // 墨色标题
          soft: '#5c564c',      // 正文
          muted: '#938b7c',     // 弱化
        },
        up: '#b3403a',          // 红涨（暗红）
        down: '#1f7a58',        // 绿跌（墨绿）
      },
      fontFamily: {
        serif: ['"Noto Serif SC"', '"Songti SC"', 'STSong', 'SimSun', 'Georgia', 'serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(107,85,47,.05), 0 6px 24px rgba(107,85,47,.07)',
        lift: '0 2px 6px rgba(107,85,47,.08), 0 10px 40px rgba(107,85,47,.10)',
      },
    },
  },
  plugins: [],
};
