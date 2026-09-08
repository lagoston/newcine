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
        // Flash de raio — clarão branco/dourado curto e intermitente,
        // simulando o brilho do capacitor de fluxo disparando. Fica
        // apagado na maior parte do tempo, com 2 flashes rápidos
        // seguidos por ciclo (imitando um raio de verdade, que quase
        // sempre "pisca duas vezes").
        'bttf-frame-flash': {
          '0%, 70%, 100%': { opacity: '0' },
          '72%': { opacity: '0.95' },
          '74%': { opacity: '0.2' },
          '76%': { opacity: '0.85' },
          '80%': { opacity: '0' },
        },
        'potter-spin':     { to: { transform: 'rotate(360deg)' } },
        'potter-aura':     { '0%,100%': { opacity: '0.5', transform: 'scale(1)' }, '50%': { opacity: '1', transform: 'scale(1.08)' } },
        // Abandonando a ideia de engrenagem/dentes por completo — em vez
        // de decoração ao redor do avatar, o formato REAL dele muda de
        // verdade: círculo → pentágono → quadrado → triângulo → círculo,
        // 2 segundos em cada, via clip-path (que corta o elemento inteiro,
        // incluindo a foto de dentro — diferente das técnicas anteriores,
        // que só conseguiam sobrepor decoração sem afetar o formato real).
        //
        // O clip-path em si SEMPRE corta de forma abrupta entre polígonos
        // com números de pontos diferentes (círculo → pentágono → quadrado
        // → triângulo) — isso é uma limitação real do clip-path, não dá
        // pra evitar com CSS puro. Mas dá pra DISFARÇAR a percepção do
        // corte: um pulso de escala+opacidade (que SIM interpolam de
        // forma suave) encolhe e desvanece o avatar bem no instante da
        // troca, e volta a crescer/aparecer na forma nova — o corte em si
        // continua instantâneo, mas acontece "escondido" dentro do pulso,
        // lendo como uma transformação intencional, não um erro abrupto.
        'tf-shape-morph': {
          '0%, 20%': { clipPath: 'circle(50% at 50% 50%)', transform: 'scale(1)', opacity: '1' },
          '23%': { clipPath: 'circle(50% at 50% 50%)', transform: 'scale(0.8)', opacity: '0.35' },
          '25%': { clipPath: 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)', transform: 'scale(0.8)', opacity: '0.35' },
          '28%, 45%': { clipPath: 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)', transform: 'scale(1)', opacity: '1' },
          '48%': { clipPath: 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)', transform: 'scale(0.8)', opacity: '0.35' },
          '50%': { clipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)', transform: 'scale(0.8)', opacity: '0.35' },
          '53%, 70%': { clipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)', transform: 'scale(1)', opacity: '1' },
          '73%': { clipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)', transform: 'scale(0.8)', opacity: '0.35' },
          '75%': { clipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)', transform: 'scale(0.8)', opacity: '0.35' },
          '78%, 95%': { clipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)', transform: 'scale(1)', opacity: '1' },
          '98%, 100%': { clipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)', transform: 'scale(0.8)', opacity: '0.35' },
        },
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
        // Sangue + caveira consolidados numa ÚNICA animação/elemento — as
        // duas keyframes separadas de antes (sangue no "after", caveira
        // no "before") tinham um problema real: "before" nasce ATRÁS da
        // foto real do avatar no empilhamento visual (mesma lição já
        // documentada abaixo, no Casual Drinker), então a caveira nunca
        // aparecia, mesmo "rodando" tecnicamente. Como só existe 1 slot
        // que garante ficar por cima da foto ("after"), os dois efeitos
        // agora vivem juntos num ciclo de 30s: sangue inundando duas
        // vezes (marcando ~10s e ~20s), e a caveira dramática no fim do
        // ciclo (~30s). O emoji da caveira fica sempre "presente" no
        // elemento (content não anima de forma confiável via keyframe),
        // mas reduzido a uma escala minúscula durante os momentos de
        // sangue — só cresce de verdade no final.
        // Reprojetado — a versão anterior tentava esconder a caveira nos
        // momentos de "sangue" só reduzindo a escala, mas o emoji
        // continuava PERCEPTÍVEL mesmo pequeno (daí o bug relatado: uma
        // "mini caveirinha" a cada 10s, em vez de sangue de verdade).
        // Simplificado: só a entrada da caveira, sem tentar simular
        // sangue no mesmo elemento. Toca UMA VEZ só (não em loop — ver a
        // configuração de animação abaixo, com iteration-count:1 e
        // fill-mode:both), permanecendo no estado final pra sempre depois
        // de entrar aos 30s, em vez de sumir e recomeçar o ciclo.
        'deathdodger-skull-reveal': {
          '0%': { opacity: '0', transform: 'scale(0.3)' },
          '60%': { opacity: '1', transform: 'scale(1.2)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
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
        'bttf-frame-flash': 'bttf-frame-flash 4s ease-in-out infinite',
        'potter-spin':      'potter-spin 3s linear infinite',
        'potter-aura':      'potter-aura 2s ease-in-out infinite',
        'tf-shape-morph':   'tf-shape-morph 8s ease-in-out infinite',
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
        'deathdodger-skull-reveal': 'deathdodger-skull-reveal 0.8s ease-out 30s 1 both',
      },
    },
  },
  plugins: [],
};