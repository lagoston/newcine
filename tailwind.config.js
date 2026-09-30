/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      screens: {
        'xs': '375px',
        'sm': '640px',  
        'md': '768px',
        'lg': '1024px',
        'xl': '1280px',
        '2xl': '1536px',
      },
      spacing: {
        '18': '4.5rem',
        '112': '28rem',
        '128': '32rem',
        'safe': 'env(safe-area-inset-top)',
      },
      minHeight: {
        'screen-without-nav': 'calc(100vh - 4rem)',
      },
      touchTarget: {
        'loose': '2.75rem',
      },
      padding: {
        'safe-top': 'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
      },
      // Molduras e banners do perfil têm as próprias animações em
      // src/styles/cosmetics.css. Aqui ficam só o giro do Motoqueiro
      // Fantasma (componente próprio) e os efeitos de texto.
      keyframes: {
        // Ghost Rider — giro do cartão 3D. Direção única = sempre "para
        // dentro" (nunca inverte o sentido do giro entre ciclos).
        'ghost-rider-flip': {
          '0%, 70%': { transform: 'rotateY(0deg)' },
          '78%': { transform: 'rotateY(180deg)' },
          '90%': { transform: 'rotateY(180deg)' },
          '98%, 100%': { transform: 'rotateY(360deg)' },
        },
        // Tremulação do fogo da caveira (labareda viva). A centralização
        // (translate(-50%,-50%)) precisa estar DENTRO de cada etapa: um
        // transform de animação substitui o das classes utilitárias.
        'ghost-rider-fire': {
          '0%, 100%': { transform: 'translate(-50%, -50%) scale(1) translateY(0)', opacity: '0.95' },
          '25%': { transform: 'translate(-50%, -50%) scale(1.06) translateY(-2%)', opacity: '1' },
          '50%': { transform: 'translate(-50%, -50%) scale(0.97) translateY(1%)', opacity: '0.85' },
          '75%': { transform: 'translate(-50%, -50%) scale(1.04) translateY(-1%)', opacity: '1' },
        },
        // ── Efeitos de texto (Personalizar perfil) ─────────────────────────
        // Typewriter — só a borda (o cursor) pisca, não o nome inteiro.
        'typewriter-cursor-blink': {
          '0%, 49%': { borderRightColor: 'currentColor' },
          '50%, 100%': { borderRightColor: 'transparent' },
        },
        // Technicolor — o gradiente desliza continuamente pelo texto.
        'technicolor-shift': {
          '0%': { backgroundPosition: '0% 50%' },
          '100%': { backgroundPosition: '300% 50%' },
        },
        // Marquee Lights — brilho de lâmpadas de marquise acendendo e apagando.
        'marquee-glow': {
          '0%, 100%': {
            textShadow: '0 0 4px rgba(251,191,36,0.55), 0 0 10px rgba(251,191,36,0.35), 0 0 18px rgba(239,68,68,0.2)',
          },
          '50%': {
            textShadow: '0 0 8px rgba(251,191,36,0.9), 0 0 20px rgba(251,191,36,0.65), 0 0 34px rgba(239,68,68,0.45)',
          },
        },
      },
      animation: {
        'ghost-rider-flip': 'ghost-rider-flip 10s cubic-bezier(0.7, 0, 0.3, 1) infinite',
        'ghost-rider-fire': 'ghost-rider-fire 0.6s steps(3, end) infinite',
        'typewriter-cursor-blink': 'typewriter-cursor-blink 1s step-end infinite',
        'technicolor-shift': 'technicolor-shift 8s linear infinite',
        'marquee-glow': 'marquee-glow 1.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};