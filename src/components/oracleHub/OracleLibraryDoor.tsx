import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../lib/auth';
import { PAPER, PIXEL, FOCUS_RING, ORACLES, oracleCardImage, withAlpha } from '../../lib/oracleTheme';
import { DOOR_ART, DOOR_BODY, DOOR_CLASS, DOOR_CTA, DOOR_CTA_LABEL, DOOR_FAN, DOOR_HINT } from '../home/doorLayout';
import DoorArrow from '../home/DoorArrow';

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
// 05/11/2026: a porta abre A Mesa dos Oráculos (/oracle/mesa), que tomou o
// lugar da Biblioteca. A frase pode contar o estado das cartas de hoje, lido
// do aparelho (a Mesa grava a cada virada; nenhuma consulta ao banco).

// Estado do dia que a Mesa grava neste aparelho (contrato com a Mesa, SPEC
// §7.8): { day: 'AAAA-MM-DD' de Brasília, flipped, total }.
const dayStateKey = (uid: string) => `cineoracle:mesa:day:${uid}`;

// O dia de Brasília, como a Mesa o calcula (o 'en-CA' formata AAAA-MM-DD).
const brtToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

type DoorState = { kind: 'fresh' } | { kind: 'partial'; flipped: number; total: number } | { kind: 'done' } | null;

// Só vale o estado de hoje: de ontem (ou mal formado) a porta fica com a frase fixa.
const readDoorState = (uid: string | undefined): DoorState => {
  if (!uid) return null;
  try {
    const raw = window.localStorage.getItem(dayStateKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { day?: unknown; flipped?: unknown; total?: unknown };
    if (parsed.day !== brtToday()) return null;
    const flipped = typeof parsed.flipped === 'number' ? parsed.flipped : NaN;
    const total = typeof parsed.total === 'number' ? parsed.total : NaN;
    if (!Number.isFinite(flipped) || !Number.isFinite(total) || total <= 0) return null;
    if (flipped <= 0) return { kind: 'fresh' };
    if (flipped >= total) return { kind: 'done' };
    return { kind: 'partial', flipped, total };
  } catch {
    // sem armazenamento (aba anônima etc.): a frase fixa
    return null;
  }
};

// Leque: Bogart à esquerda, Cypher à direita, Fincher no meio, na frente.
const FAN = [
  { id: 'bogart', rest: '[transform:translate(calc(-50%_-_30px),-46%)_rotate(-12deg)]', open: 'group-hover:[transform:translate(calc(-50%_-_38px),-48%)_rotate(-16deg)]', z: 1 },
  { id: 'cypher', rest: '[transform:translate(calc(-50%_+_30px),-46%)_rotate(12deg)]', open: 'group-hover:[transform:translate(calc(-50%_+_38px),-48%)_rotate(16deg)]', z: 1 },
  { id: 'fincher', rest: '[transform:translate(-50%,-52%)]', open: 'group-hover:[transform:translate(-50%,-56%)]', z: 2 },
] as const;

const OracleLibraryDoor: React.FC<{ cardStyle: string }> = ({ cardStyle }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  // Lido ao montar e ao voltar para a aba (a Mesa pode ter virado cartas).
  const [doorState, setDoorState] = useState<DoorState>(() => readDoorState(user?.id));
  useEffect(() => {
    const refresh = () => setDoorState(readDoorState(user?.id));
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [user?.id]);
  const hint =
    doorState?.kind === 'fresh'
      ? t('oracle.libraryDoor.state.fresh')
      : doorState?.kind === 'partial'
        ? t('oracle.libraryDoor.state.partial', { n: doorState.flipped, total: doorState.total })
        : doorState?.kind === 'done'
          ? t('oracle.libraryDoor.state.done')
          : t('oracle.libraryDoor.hint');

  return (
    <Link
      to="/oracle/mesa"
      className={`${DOOR_CLASS} ${FOCUS_RING}`}
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
        className="absolute left-5 right-5 top-0 h-[2px] rounded-full opacity-80 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: `linear-gradient(90deg, ${ORACLES.map((o) => o.color).join(', ')})`,
          boxShadow: `0 0 10px 1px ${withAlpha(ORACLES[1].color, 0.55)}, 0 0 22px 2px ${withAlpha(ORACLES[0].color, 0.3)}`,
        }}
      />

      {/* As três cartas em leque */}
      <span className={DOOR_ART} aria-hidden>
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

      <span className={DOOR_BODY}>
        <span
          style={{ ...PIXEL, color: PAPER, textShadow: '0 0 14px rgba(240,171,252,0.55)' }}
          className="block text-[22px] sm:text-[30px] leading-none transition-[text-shadow] duration-300 group-hover:[text-shadow:0_0_18px_rgba(240,171,252,0.9)]"
        >
          {t('oracle.libraryDoor.title')}
        </span>
        <span className={DOOR_HINT} style={{ color: '#CFC6EC' }}>
          {hint}
        </span>
      </span>

      <span className={DOOR_CTA} style={{ color: '#F0ABFC' }}>
        <span className={DOOR_CTA_LABEL}>{t('oracle.libraryDoor.enter')}</span>
        <DoorArrow colors={ORACLES.map((oracle) => oracle.color)} />
      </span>
    </Link>
  );
};

export default OracleLibraryDoor;
