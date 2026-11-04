import React, { useId } from 'react';

// O selo de cera da Cobra (04/11/2026): cera verde-veneno com a cobra de
// capelo em relevo (de frente, como na carta dela), olhos de ouro e a língua
// vermelha. Carimba o contrato no Mercado Negro e vai na faixa "Contrato da
// Cobra" (revelação e story). Arquivo próprio para o story do Feed dos Amigos
// não carregar a aba do contrato inteira.

// A borda irregular da cera, em curvas (cera derretida não tem quina):
// pontos em volta do centro com raios diferentes, ligados por curvas que
// passam pelo meio de cada par. Calculada uma vez, fora do render.
const WAX_PATH = (() => {
  const bumps = [0, 1.6, -0.8, 1.1, -1.4, 0.6, 1.8, -0.4, 0.9, -1.2, 1.4, -0.6, 0.3, 1.7, -1.0, 0.8, -1.5, 1.2];
  const pts = bumps.map((bump, i) => {
    const a = (i / bumps.length) * Math.PI * 2;
    return [32 + Math.cos(a) * (28 + bump), 32 + Math.sin(a) * (28 + bump)];
  });
  const mid = (a: number[], b: number[]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const f = (p: number[]) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`;
  let d = `M${f(mid(pts[pts.length - 1], pts[0]))}`;
  pts.forEach((p, i) => {
    d += ` Q${f(p)} ${f(mid(p, pts[(i + 1) % pts.length]))}`;
  });
  return `${d}Z`;
})();

const WaxSeal: React.FC<{ className?: string }> = ({ className = '' }) => {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      <defs>
        <radialGradient id={`w${id}`} cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor="#5BE3A1" />
          <stop offset="0.45" stopColor="#1E8A55" />
          <stop offset="1" stopColor="#0B3D25" />
        </radialGradient>
      </defs>
      <path d={WAX_PATH} fill={`url(#w${id})`} />
      <circle cx="32" cy="32" r="20.5" fill="none" stroke="#0B3D25" strokeWidth="2.2" opacity="0.7" />
      <circle cx="32" cy="32" r="20.5" fill="none" stroke="#7DF0B9" strokeWidth="0.8" opacity="0.4" transform="translate(-0.6 -0.6)" />
      {/* A cobra de capelo em relevo: o capelo aberto, a cabeça clara com os
          olhos de ouro e a língua, o pescoço e o corpo enrolado embaixo. */}
      <path
        d="M32 15.5 C27 15.5 23.2 19.5 22.6 25 C22 30.5 25.5 34.2 29.2 36.2 L29.6 41 L34.4 41 L34.8 36.2 C38.5 34.2 42 30.5 41.4 25 C40.8 19.5 37 15.5 32 15.5Z"
        fill="#0B3D25"
        opacity="0.9"
      />
      <path d="M32 20.5 C30 20.5 28.7 22.2 28.9 24.4 C29.1 26.6 30.4 28.4 32 28.4 C33.6 28.4 34.9 26.6 35.1 24.4 C35.3 22.2 34 20.5 32 20.5Z" fill="#2FBF7A" opacity="0.9" />
      <circle cx="30.6" cy="23.6" r="0.9" fill="#F4C454" />
      <circle cx="33.4" cy="23.6" r="0.9" fill="#F4C454" />
      <path d="M32 28.4 L32 30.6 M32 30.6 L31 31.8 M32 30.6 L33 31.8" stroke="#E0233B" strokeWidth="0.7" strokeLinecap="round" fill="none" />
      <path
        d="M29.6 41 C24 41.5 21.5 44.5 24.5 46.8 C27.5 49 36.5 49 39.5 46.8 C42.5 44.5 40 41.5 34.4 41"
        fill="none"
        stroke="#0B3D25"
        strokeWidth="2.6"
        strokeLinecap="round"
        opacity="0.9"
      />
    </svg>
  );
};

export default WaxSeal;
