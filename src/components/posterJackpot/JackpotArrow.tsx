import React, { useId } from 'react';

// A seta do Poster Jackpot (02/11/2026, pedido do Bruno: "uma seta
// personalizada para esse botão"). Um medalhão de ouro — o mesmo aro da
// roleta — com três setas de letreiro de cassino que acendem uma depois da
// outra, como as lâmpadas que correm numa placa de "ENTRE" (ao passar o
// mouse, correm mais rápido). O número no canto é o que está esperando a
// pessoa: missões prontas para resgatar e Giros da Sorte guardados (antes
// eram etiquetas na porta, que ficou mais limpa). Com "reduzir movimento",
// as três ficam acesas.
const JackpotArrow: React.FC<{ badge?: number }> = ({ badge = 0 }) => {
  const id = useId().replace(/:/g, '');
  return (
    <span aria-hidden className="pj-arrow relative grid place-items-center w-10 h-10 lg:w-9 lg:h-9 shrink-0">
      <svg viewBox="0 0 40 40" className="absolute inset-0 w-full h-full overflow-visible">
        <defs>
          <linearGradient id={`rim${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FFF1BF" />
            <stop offset="0.3" stopColor="#F4C454" />
            <stop offset="0.55" stopColor="#A8741A" />
            <stop offset="0.75" stopColor="#FFE8A3" />
            <stop offset="1" stopColor="#B8841F" />
          </linearGradient>
          <radialGradient id={`face${id}`} cx="40%" cy="30%" r="80%">
            <stop offset="0" stopColor="#263080" />
            <stop offset="1" stopColor="#0B0F36" />
          </radialGradient>
        </defs>
        <circle cx="20" cy="20" r="18.4" fill={`url(#face${id})`} stroke={`url(#rim${id})`} strokeWidth="2.2" />
        <circle cx="20" cy="20" r="15.2" fill="none" stroke="rgba(244,196,84,0.28)" strokeWidth="0.8" strokeDasharray="1.6 2.4" />
        {[0, 1, 2].map((i) => (
          <path
            key={i}
            className="pj-arrow-chev"
            d={`M${12.2 + i * 5.4} 13.4 L${17.6 + i * 5.4} 20 L${12.2 + i * 5.4} 26.6`}
            fill="none"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ animationDelay: `${i * 0.16}s` }}
          />
        ))}
      </svg>
      {badge > 0 && (
        <span className="absolute -top-1.5 -right-1.5 grid place-items-center min-w-[19px] h-[19px] px-1 rounded-full text-[10.5px] font-bold leading-none tabular-nums text-white bg-fuchsia-500 shadow-[0_0_0_2px_#0a0e2c,0_0_10px_rgba(217,70,239,0.7)]">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </span>
  );
};

export default JackpotArrow;
