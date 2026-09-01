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
      keyframes: {
        // ── FRAMES (avatar) ──────────────────────────────────────────────────
        'gold-ring-spin':  { to: { transform: 'rotate(360deg)' } },
        'matrix-scan':     { to: { transform: 'rotate(360deg)' } },
        // O avatar "desaparece" — na maior parte do ciclo de 5s, o
        // overlay fica totalmente transparente (foto normal, visível).
        // Perto do fim de cada ciclo, um flicker rápido e concentrado
        // (~250ms) cobre e revela a foto várias vezes em sequência,
        // simulando falha de sinal digital, antes de voltar ao normal.
        'matrix-frame-glitch': {
          '0%, 92%, 100%': { opacity: '0' },
          '93%': { opacity: '0.95' },
          '94%': { opacity: '0.1' },
          '95%': { opacity: '0.9' },
          '96%': { opacity: '0' },
          '97%': { opacity: '0.85' },
          '98%': { opacity: '0' },
        },
        'saw-spin':        { to: { transform: 'rotate(-360deg)' } },
        'saw-drip':        { '0%,100%': { opacity: '0.6' }, '50%': { opacity: '1' } },
        'ice-outer-spin':  { to: { transform: 'rotate(360deg)' } },
        'ice-inner-spin':  { to: { transform: 'rotate(-360deg)' } },
        'bttf-outer-spin': { to: { transform: 'rotate(360deg)' } },
        'bttf-inner-spin': { to: { transform: 'rotate(360deg)' } },
        'potter-spin':     { to: { transform: 'rotate(360deg)' } },
        'potter-aura':     { '0%,100%': { opacity: '0.5', transform: 'scale(1)' }, '50%': { opacity: '1', transform: 'scale(1.08)' } },
        'tf-gear-outer':   { to: { transform: 'rotate(360deg)' } },
        'tf-gear-inner':   { to: { transform: 'rotate(360deg)' } },
        // ── BANNERS ──────────────────────────────────────────────────────────
        'gold-banner-sweep':     { '0%,100%': { transform: 'translateX(-40%)' }, '50%': { transform: 'translateX(40%)' } },
        'matrix-banner-rain':    { from: { backgroundPosition: '0 0' }, to: { backgroundPosition: '0 6px' } },
        'matrix-banner-scan':    { '0%': { transform: 'translateY(-100%)' }, '100%': { transform: 'translateY(100%)' } },
        'saw-banner-pulse':      { '0%,100%': { opacity: '0.6' }, '50%': { opacity: '1' } },
        'saw-banner-drip':       { '0%,100%': { opacity: '0.5', transform: 'scaleX(0.8)' }, '50%': { opacity: '1', transform: 'scaleX(1)' } },
        'ice-banner-glint':      { '0%,100%': { transform: 'translateX(-60%)' }, '50%': { transform: 'translateX(60%)' } },
        'bttf-banner-warp':  { from: { backgroundPosition: '0 0' }, to: { backgroundPosition: '20px 0' } },
'bttf-banner-flash': {
  '0%,65%':  { opacity: '0' },
  '67%':     { opacity: '1' },
  '75%':     { opacity: '0.5' },
  '80%':     { opacity: '0.9' },
  '92%':     { opacity: '0' },
  '100%':    { opacity: '0' },
},
        'potter-banner-orbs':    { '0%,100%': { transform: 'scale(1) rotate(-3deg)', opacity: '0.7' }, '50%': { transform: 'scale(1.05) rotate(3deg)', opacity: '1' } },
        'potter-banner-shimmer': { '0%,100%': { transform: 'translateX(-60%)' }, '50%': { transform: 'translateX(60%)' } },
        'tf-banner-scan':        { '0%': { transform: 'translateX(-100%)' }, '100%': { transform: 'translateX(200%)' } },
        // ── Death Dodger ────────────────────────────────────────────────────
'deathdodger-banner-laser': {
  '0%':   { top: '0%',    opacity: '0' },
  '5%':   { opacity: '1' },
  '48%':  { opacity: '1' },
  '50%':  { opacity: '0.1' },
  '52%':  { opacity: '1' },
  '95%':  { opacity: '1' },
  '100%': { top: '100%',  opacity: '0' },
},
                // ── Casual Drinker ───────────────────────────────────────────────────
        'casual-drinker-fill':{ '0%':   { height: '0%', opacity: '1' }, '100%': { height: '70%', opacity: '1' } },
        'casual-drinker-slosh':   { '0%,100%': { transform: 'translateX(0) skewX(0deg)' }, '25%':     { transform: 'translateX(-3%) skewX(-1.5deg)' }, '75%':     { transform: 'translateX(8%) skewX(1.5deg)' } },
        'casual-drinker-foam':   { '0%,100%': { transform: 'scaleY(1) translateY(0)' },
  '50%':     { transform: 'scaleY(1.15) translateY(-2px)' } },
                // Nível do copo subindo e descendo em loop — a "casual-drinker-fill"
        // original só enchia uma vez e parava (opacity/forwards), não repetia.
        'casual-drinker-liquid-level': {
          '0%, 100%': { height: '38%' },
          '50%': { height: '68%' },
        },
        // A espuma precisa se mover JUNTO com o nível do líquido (mesma
        // duração/curva do "liquid-level" acima) — antes ela ficava parada
        // numa altura fixa enquanto o líquido subia por trás dela.
                'casual-drinker-foam-level': {
          '0%, 100%': { bottom: '38%', transform: 'scaleY(1) translateY(0)' },
          '50%': { bottom: '68%', transform: 'scaleY(1.15) translateY(-2px)' },
        },
        // Pequenas "bolhas" (dois brilhos radiais) subindo dentro do líquido.
        'casual-drinker-frame-bubbles': {
          '0%, 100%': { backgroundPosition: '30% 90%, 70% 85%', opacity: '0.6' },
          '50%': { backgroundPosition: '32% 10%, 68% 15%', opacity: '1' },
        },
        // Death Dodger — substituindo "doom-flicker"/"doom-spin", que nunca
        // existiram de verdade no config (mesmo bug do Casual Drinker de antes).
        'deathdodger-frame-pulse': {
          '0%, 100%': { opacity: '0.5' },
          '50%': { opacity: '1' },
        },
        // Sangue inundando de baixo pra cima — sobe rápido, fica cheio por
        // um instante, drena de volta. Concentrado no fim de cada ciclo de
        // 10s (o resto do tempo fica em scaleY(0), invisível).
        'deathdodger-blood-flood': {
          '0%, 82%, 100%': { transform: 'scaleY(0)', opacity: '0' },
          '85%': { transform: 'scaleY(0.4)', opacity: '0.75' },
          '90%': { transform: 'scaleY(1)', opacity: '0.95' },
          '95%': { transform: 'scaleY(1)', opacity: '0.85' },
          '98%': { transform: 'scaleY(0.15)', opacity: '0.3' },
        },
        // O "toque de gênio" — um brilho dourado/branco muito breve e
        // discreto (menos de 1s de um ciclo de 60s), quase imperceptível
        // até acontecer. Não é pra "incomodar", só aparecer, girar de
        // leve, e sumir — um detalhe que ressignifica o quadro por um
        // instante antes de voltar ao normal.
        'deathdodger-genius-detail': {
          '0%, 97%, 100%': { opacity: '0', transform: 'scale(0.85) rotate(0deg)' },
          '97.5%': { opacity: '0.9', transform: 'scale(1.08) rotate(180deg)' },
          '98.5%': { opacity: '0.4', transform: 'scale(1) rotate(270deg)' },
          '99.3%': { opacity: '0', transform: 'scale(0.9) rotate(360deg)' },
        },
        // Versão para a moldura circular: uma faixa fina na base do anel que
        // sobe e desce, sem cobrir o rosto na foto do avatar.
        'casual-drinker-frame-level': {
          '0%, 100%': { clipPath: 'inset(88% 0 0 0)' },
          '50%': { clipPath: 'inset(76% 0 0 0)' },
        },
        },
      animation: {
        // ── FRAMES (avatar) ──────────────────────────────────────────────────
        'gold-ring-spin':   'gold-ring-spin 3s linear infinite',
        'matrix-scan':      'matrix-scan 1.4s linear infinite',
        'matrix-frame-glitch': 'matrix-frame-glitch 5s steps(1) infinite',
        'saw-spin':         'saw-spin 4s linear infinite',
        'saw-drip':         'saw-drip 2s ease-in-out infinite',
        'ice-outer-spin':   'ice-outer-spin 8s linear infinite',
        'ice-inner-spin':   'ice-inner-spin 3s linear infinite',
        'bttf-outer-spin':  'bttf-outer-spin 0.7s linear infinite',
        'bttf-inner-spin':  'bttf-inner-spin 0.5s linear infinite reverse',
        'potter-spin':      'potter-spin 3s linear infinite',
        'potter-aura':      'potter-aura 2s ease-in-out infinite',
        'tf-gear-outer':    'tf-gear-outer 2s steps(8) infinite',
        'tf-gear-inner':    'tf-gear-inner 3s steps(6) infinite reverse',
        // ── BANNERS ──────────────────────────────────────────────────────────
        'gold-banner-sweep':     'gold-banner-sweep 4s ease-in-out infinite',
        'matrix-banner-rain':    'matrix-banner-rain 0.7s linear infinite',
        'matrix-banner-scan':    'matrix-banner-scan 2s linear infinite',
        'saw-banner-pulse':      'saw-banner-pulse 1.2s ease-in-out infinite',
        'saw-banner-drip':       'saw-banner-drip 2.5s ease-in-out infinite',
        'ice-banner-glint':      'ice-banner-glint 4s ease-in-out infinite',
        'bttf-banner-warp':  'bttf-banner-warp 0.4s linear infinite',
        'bttf-banner-flash': 'bttf-banner-flash 3.5s ease-in-out infinite',
        'potter-banner-orbs':    'potter-banner-orbs 4s ease-in-out infinite',
        'potter-banner-shimmer': 'potter-banner-shimmer 6s ease-in-out infinite',
        'tf-banner-scan':        'tf-banner-scan 3s linear infinite',
        // ── Death Dodger ────────────────────────────────────────────────────
        'deathdodger-banner-laser': 'deathdodger-banner-laser 6s linear infinite',
                // ── Casual Drinker ───────────────────────────────────────────────────
        'casual-drinker-fill':  'casual-drinker-fill 2.5s ease-out forwards',
        'casual-drinker-slosh': 'casual-drinker-slosh 3s ease-in-out infinite',
        'casual-drinker-foam':  'casual-drinker-foam 2s ease-in-out infinite',
                'casual-drinker-liquid-level': 'casual-drinker-liquid-level 4s ease-in-out infinite',
        'casual-drinker-frame-level': 'casual-drinker-frame-level 4s ease-in-out infinite',
                'casual-drinker-foam-level': 'casual-drinker-foam-level 4s ease-in-out infinite',
        'casual-drinker-frame-bubbles': 'casual-drinker-frame-bubbles 2.5s ease-in-out infinite',
        'deathdodger-frame-pulse': 'deathdodger-frame-pulse 1.8s ease-in-out infinite',
        'deathdodger-blood-flood': 'deathdodger-blood-flood 10s ease-in-out infinite',
        'deathdodger-genius-detail': 'deathdodger-genius-detail 60s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};