import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { MIST, NIGHT, PIXEL, ratingBarColor, withAlpha } from '../lib/oracleTheme';
import { DEFAULT_SIGMA, formatChance, ratingSpectrum } from '../lib/prediction';

// O medidor da nota prevista (14/11/2026). Pedido do Bruno: "Troque as notas
// previstas e chance de 10 em algarismos por uma barra colorida indicando o
// espectro das notas previstas e uma agulha oscilando na região onde a nota
// impera."
//
//   • A barra são as onze notas, de 0 a 10, nas cores das caixas de nota do
//     site (cinza, vermelho, amarelo, verde e o rosa do 10). Cada nota cresce
//     e acende conforme a chance de a pessoa dar aquela nota: a mais provável
//     fica alta e cheia, as improváveis ficam baixas e apagadas, como num
//     analisador de espectro. O rosa do fim é a chance de 10.
//   • A agulha fica na expectativa do modelo e balança em volta dela. O
//     balanço é do tamanho da incerteza: quem dá notas mais previsíveis vê a
//     agulha quase parada; quem varia mais vê ela passear.
//   • Quando a previsão chega, as notas acendem em fila e a agulha sobe do
//     zero até o lugar dela. Com "reduzir movimento", fica parada no centro.
//
// Os números não somem para quem precisa deles: estão no texto para leitores
// de tela e na dica ao passar o mouse.

const NOTES = Array.from({ length: 11 }, (_, rating) => rating);
// quanto do balanço é o vaivém lento; o resto é o tremor por cima (index.css)
const WOBBLE = 0.28;

interface PredictionGaugeProps {
  // a nota dos selos (inteira, já com o corte de 9 e 10)
  predicted: number | null;
  // a expectativa e a largura (ruído pessoal) do modelo
  mu: number | null;
  sigma: number | null;
  // a chance de nota 10 (0 a 1)
  tenChance: number | null;
  // a previsão ainda não chegou: a barra apagada, a agulha no zero
  pending?: boolean;
}

const PredictionGauge: React.FC<PredictionGaugeProps> = ({ predicted, mu, sigma, tenChance, pending = false }) => {
  const { t } = useTranslation();
  const center = mu ?? predicted;
  const ready = !pending && center !== null;
  const width = sigma !== null && sigma > 0 ? sigma : DEFAULT_SIGMA;

  const spectrum = useMemo(() => (ready && center !== null ? ratingSpectrum(center, width, tenChance) : null), [ready, center, width, tenChance]);
  const peak = spectrum ? Math.max(...spectrum) : 1;

  // A régua vai de -0,5 a 10,5 (cada nota ocupa uma casa inteira). O balanço é
  // meia largura da curva, entre 0,4 e 1 nota, e a agulha nunca sai da barra.
  const sway = Math.min(1, Math.max(0.4, width * 0.5));
  const reach = sway * (1 + WOBBLE);
  const at = ready && center !== null ? Math.min(11 - 0.2 - reach, Math.max(0.2 + reach, center + 0.5)) : 0.5;

  const label = !ready
    ? t('movieModal.score.gaugePending')
    : tenChance !== null && predicted !== null && predicted <= 9
      ? t('movieModal.score.gaugeAria', { rating: predicted ?? Math.round(center ?? 0), chance: formatChance(tenChance) })
      : t('movieModal.score.gaugeAriaPlain', { rating: predicted ?? Math.round(center ?? 0) });

  return (
    <span role="img" aria-label={label} title={ready ? label : undefined} className="flex items-center gap-1.5 w-full">
      <span aria-hidden style={{ ...PIXEL, color: withAlpha(MIST, 0.75) }} className="text-[11px] leading-none">
        0
      </span>
      <span className="relative flex-1 h-[30px]">
        <span className={`absolute inset-x-0 top-[7px] flex items-center gap-[2px] h-[18px] ${pending ? 'animate-pulse' : ''}`}>
          {NOTES.map((rating) => {
            // de 0 (sem chance) a 1 (a nota mais provável); a raiz deixa as
            // chances pequenas ainda visíveis
            const share = spectrum ? Math.pow(spectrum[rating] / peak, 0.7) : 0;
            const color = ratingBarColor(rating);
            return (
              <span
                key={rating}
                className="flex-1 rounded-[3px] transition-[height,background-color,box-shadow] duration-500 ease-out motion-reduce:transition-none"
                style={{
                  // a chance aparece duas vezes: na altura e no brilho (não só na cor)
                  height: `${6 + 12 * share}px`,
                  background: withAlpha(color, 0.17 + 0.83 * share),
                  boxShadow: share > 0.7 ? `0 0 10px ${withAlpha(color, 0.4 * share)}` : undefined,
                  transitionDelay: ready ? `${rating * 40}ms` : undefined,
                }}
              />
            );
          })}
        </span>
        {/* A agulha, em três camadas: a posição (entra com um salto), o vaivém e o tremor. */}
        <span
          aria-hidden
          className="absolute inset-0 transition-transform duration-[900ms] ease-[cubic-bezier(0.34,1.4,0.64,1)] motion-reduce:transition-none"
          style={{ transform: `translateX(${(at / 11) * 100}%)` }}
        >
          <span className={`absolute inset-0 ${ready ? 'gauge-sway' : ''}`} style={{ '--gauge-swing': `${(sway / 11) * 100}%` } as React.CSSProperties}>
            <span className={`absolute inset-0 ${ready ? 'gauge-wobble' : ''}`}>
              <svg width="12" height="30" viewBox="0 0 12 30" className="absolute top-0 left-0 -translate-x-1/2 overflow-visible" style={{ filter: 'drop-shadow(0 0 5px rgba(167,139,250,0.85))', opacity: ready ? 1 : 0.5 }}>
                <rect x="4.75" y="5" width="2.5" height="24" rx="1.25" fill="#EDE9FE" stroke={NIGHT} strokeWidth="1" />
                <path d="M6 9 L1.8 1.4 H10.2 Z" fill="#EDE9FE" stroke={NIGHT} strokeWidth="1.1" strokeLinejoin="round" />
              </svg>
            </span>
          </span>
        </span>
      </span>
      <span aria-hidden style={{ ...PIXEL, color: withAlpha(MIST, 0.75) }} className="text-[11px] leading-none">
        10
      </span>
    </span>
  );
};

export default PredictionGauge;
