import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PAPER, PIXEL, FOCUS_RING, ORACLES, oracleCardImage, withAlpha } from '../../lib/oracleTheme';
import { DOOR_ART, DOOR_BODY, DOOR_CLASS, DOOR_CTA, DOOR_CTA_LABEL, DOOR_FAN, DOOR_HINT } from '../home/doorLayout';
import DoorArrow from '../home/DoorArrow';
import type { Movie } from '../../lib/tmdb';
import { DoorTrailerLayer, useDoorTrailer } from './DoorTrailer';

// A porta da Biblioteca dos Oráculos (31/10/2026; na home desde 02/11, com a
// Central dos Oráculos extinta). Um botão do mesmo porte da porta do Poster
// Jackpot e da Persona (geometria em home/doorLayout), no mundo dos
// oráculos — o tubo de neon nas três cores, as três cartas em leque (abrem
// um pouco ao passar o mouse), o letreiro em pixel com brilho e a frase do
// que ela é.
// 02/11/2026: a frase deixou de contar prateleiras e títulos ("27 prateleiras
// e 6489 filmes…", que dependia de get_oracle_library_stats e trocava de
// texto quando a conta chegava) e passou a ser fixa: "Curadoria de filmes e
// séries personalizada para você." A porta não faz mais consulta nenhuma.
// 02/11/2026 (noite): mais minimalista — saíram as etiquetas dos três
// oráculos embaixo da frase; à direita, a seta de neon nas cores deles.
// 05/11/2026: a porta abria A Mesa dos Oráculos (/oracle/mesa), e a frase
// contava as cartas do dia. 09/11/2026: a Mesa de cartas saiu e o Acervo
// virou a página única da Mesa — a porta abre o Acervo, com a frase fixa de
// novo (nenhuma consulta, nada guardado no aparelho).
// 11/11/2026: no primeiro segundo da home, o conteúdo desliza para o lado e
// roda o trailer de um dos filmes mais recomendados das três prateleiras
// favoritas da pessoa (DoorTrailer.tsx). Tocar no trailer abre o filme e a
// porta volta ao que era; sem trailer, a porta abre o Acervo como sempre.

// Leque: Bogart à esquerda, Cypher à direita, Fincher no meio, na frente.
const FAN = [
  { id: 'bogart', rest: '[transform:translate(calc(-50%_-_30px),-46%)_rotate(-12deg)]', open: 'group-hover:[transform:translate(calc(-50%_-_38px),-48%)_rotate(-16deg)]', z: 1 },
  { id: 'cypher', rest: '[transform:translate(calc(-50%_+_30px),-46%)_rotate(12deg)]', open: 'group-hover:[transform:translate(calc(-50%_+_38px),-48%)_rotate(16deg)]', z: 1 },
  { id: 'fincher', rest: '[transform:translate(-50%,-52%)]', open: 'group-hover:[transform:translate(-50%,-56%)]', z: 2 },
] as const;

// O conteúdo da porta inteiro anda a largura da porta para a esquerda (100cqw:
// a porta é o container), e todas as peças andam juntas, como um bloco.
const SLIDE = 'transition-[transform,opacity] duration-[650ms] ease-[cubic-bezier(0.7,0,0.2,1)] motion-reduce:transition-none';
const SLID = '[transform:translateX(-100cqw)] opacity-0';

const OracleLibraryDoor: React.FC<{
  cardStyle: string;
  /** a home já acendeu (o trailer só começa depois disso) */
  active?: boolean;
  /** abre o menu expandido do filme do trailer */
  onOpenMovie?: (movie: Movie) => void;
}> = ({ cardStyle, active = false, onOpenMovie }) => {
  const { t } = useTranslation();
  const wrapRef = useRef<HTMLDivElement>(null);
  const trailer = useDoorTrailer(active && !!onOpenMovie, wrapRef);
  const showing = trailer.phase === 'showing';
  const slid = showing ? SLID : '';
  return (
    <div ref={wrapRef} className="relative h-full">
    <Link
      to="/oracle/acervo"
      onClick={(event) => {
        // Com o trailer na porta, o toque é no filme: o vídeo para, a porta
        // volta e abre o menu expandido dele.
        if (!showing) return;
        event.preventDefault();
        const movie = trailer.open();
        if (movie && onOpenMovie) onOpenMovie(movie);
      }}
      aria-label={showing && trailer.pick ? t('oracle.libraryDoor.trailer.aria', { title: trailer.pick.movie.title }) : undefined}
      className={`${DOOR_CLASS} ${FOCUS_RING} [container-type:inline-size]`}
      style={{
        background: [
          ...ORACLES.map((oracle, i) => `radial-gradient(40% 90% at ${8 + i * 9}% 100%, ${withAlpha(oracle.color, 0.2)}, transparent 70%)`),
          'radial-gradient(70% 120% at 100% 0%, rgba(240,171,252,0.14), transparent 60%)',
          'linear-gradient(135deg, #160f2c, #0e0a1a 55%, #1a0f24)',
        ].join(', '),
        boxShadow: 'inset 0 0 0 1px rgba(243,234,211,0.14), 0 18px 40px -26px rgba(240,171,252,0.5)',
      }}
    >
      {/* O tubo de neon com as cores dos três oráculos. */}
      <span
        aria-hidden
        className={`absolute left-5 right-5 top-0 h-[2px] rounded-full opacity-80 group-hover:opacity-100 ${SLIDE} ${slid}`}
        style={{
          background: `linear-gradient(90deg, ${ORACLES.map((o) => o.color).join(', ')})`,
          boxShadow: `0 0 10px 1px ${withAlpha(ORACLES[1].color, 0.55)}, 0 0 22px 2px ${withAlpha(ORACLES[0].color, 0.3)}`,
        }}
      />

      {/* As três cartas em leque */}
      <span className={`${DOOR_ART} ${SLIDE} ${slid}`} aria-hidden>
        <span className={DOOR_FAN}>
        {FAN.map((card) => {
          const oracle = ORACLES.find((o) => o.id === card.id)!;
          return (
            <img
              key={card.id}
              src={oracleCardImage(oracle.id, cardStyle)}
              alt=""
              decoding="async"
              draggable={false}
              className={`absolute left-1/2 top-1/2 w-[50px] sm:w-[60px] h-auto rounded-md transition-transform duration-300 ease-out ${card.rest} ${card.open}`}
              style={{ zIndex: card.z, boxShadow: `0 10px 20px -8px rgba(0,0,0,0.9), 0 0 16px -4px ${withAlpha(oracle.color, 0.7)}` }}
            />
          );
        })}
        </span>
      </span>

      <span className={`${DOOR_BODY} ${SLIDE} ${slid}`}>
        <span
          style={{ ...PIXEL, color: PAPER, textShadow: '0 0 14px rgba(240,171,252,0.55)' }}
          className="block text-[22px] sm:text-[30px] leading-none transition-[text-shadow] duration-300 group-hover:[text-shadow:0_0_18px_rgba(240,171,252,0.9)]"
        >
          {t('oracle.libraryDoor.title')}
        </span>
        <span className={DOOR_HINT} style={{ color: '#CFC6EC' }}>
          {t('oracle.libraryDoor.hint')}
        </span>
      </span>

      <span className={`${DOOR_CTA} ${SLIDE} ${slid}`} style={{ color: '#F0ABFC' }}>
        <span className={DOOR_CTA_LABEL}>{t('oracle.libraryDoor.enter')}</span>
        <DoorArrow colors={ORACLES.map((oracle) => oracle.color)} />
      </span>

      {trailer.pick && trailer.phase !== 'off' && (
        <DoorTrailerLayer
          pick={trailer.pick}
          showing={showing}
          leaving={trailer.phase === 'leaving'}
          iframeRef={trailer.iframeRef}
          onLoad={trailer.onIframeLoad}
        />
      )}
    </Link>
    </div>
  );
};

export default OracleLibraryDoor;
