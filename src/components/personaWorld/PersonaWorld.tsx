import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useReducedMotion } from 'framer-motion';
import { ArrowUpRight, Film, Scroll } from 'lucide-react';
import { MOOD_BY_LETTER } from '../../lib/moods';
import { personaText } from '../../lib/persona';
import { fetchPersonaNames, worldState, FURNITURE, PHASE_MIN, PHASE_WINDOW, type PersonaName, type PersonaWorld as World, type WorldState, type WorldTitle } from '../../lib/personaWorld';
import { FOCUS_RING, INK, MIST, PAPER, PIXEL, VELVET, ratingTone, withAlpha } from '../../lib/oracleTheme';
import { PersonaCard, PersonaCode } from '../PersonaBits';
import { MothCloseUp, PersonaScene } from './PersonaScene';
import { GOLD, type SceneHit } from './draw';

// O corpo do modal "Sua Persona" (13/11/2026): a Persona viva.
//
// De cima para baixo: a cena (a cabine com a mariposa), a placa (quem é), a
// bitola (o quanto cresceu) e três botões que explicam a cena:
//   • Sempre — a cabine: tudo o que foi avaliado (o texto da Persona, as nove
//     prateleiras, os pôsteres da parede, as mudas);
//   • Agora — a mariposa: o que a pessoa anda vendo (as asas, os olhos, os
//     últimos títulos);
//   • Por vir — a envergadura que vem e a forma vizinha.
// Pouco texto, e todo título que aparece abre o título (pedido do Bruno: o
// refúgio dos filmes sempre em evidência). Nada aqui é meta nem cobrança: o
// "Por vir" descreve o que está perto, não manda assistir nada.

type Tab = 'always' | 'now' | 'next';
const TABS: Tab[] = ['always', 'now', 'next'];
const STAGE_BG = '#0D0919';

const fmtRating = (rating: number): string => (Number.isInteger(rating) ? String(rating) : rating.toFixed(1));

const Heading: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <h3 style={{ ...PIXEL, color: PAPER }} className={`text-lg leading-tight ${className}`}>
    {children}
  </h3>
);
const Lead: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[15px] leading-relaxed" style={{ color: MIST }}>
    {children}
  </p>
);
const Note: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[13px] leading-relaxed" style={{ color: MIST }}>
    {children}
  </p>
);

// a letra do humor num quadradinho (o "+" creme é o Arquivo, os títulos de fora)
const Tile: React.FC<{ letter: string | null; small?: boolean }> = ({ letter, small = false }) => {
  const color = letter ? (MOOD_BY_LETTER[letter]?.color ?? MIST) : PAPER;
  return (
    <span
      aria-hidden
      className={`grid place-items-center shrink-0 leading-none ${small ? 'w-[22px] h-[22px] rounded-[5px] text-[13px]' : 'w-7 h-7 rounded-[7px] text-[17px]'}`}
      style={{ ...PIXEL, color, background: '#130D24', boxShadow: `inset 0 0 0 1.5px ${color}` }}
    >
      {letter ?? '+'}
    </span>
  );
};

const Bar: React.FC<{ value: number; color?: string; tall?: boolean; label?: string }> = ({ value, color = GOLD, tall = false, label }) => (
  <span
    className={`block flex-1 overflow-hidden rounded-[3px] ${tall ? 'h-3' : 'h-2'}`}
    style={{ background: 'rgba(243,234,211,0.1)' }}
    role={label ? 'progressbar' : undefined}
    aria-valuemin={label ? 0 : undefined}
    aria-valuemax={label ? 100 : undefined}
    aria-valuenow={label ? Math.floor(value * 100) : undefined}
    aria-label={label}
  >
    <span className="block h-full" style={{ width: `${Math.floor(value * 100)}%`, background: color }} />
  </span>
);

interface PersonaWorldProps {
  world: World;
  isOwn: boolean;
  onOpenTitle: (title: WorldTitle) => void;
  // o título que está abrindo (o pôster dele pisca)
  openingKey?: string | null;
  onOpenRevelation: () => void;
  // ao seguir um link para outra página (fecha a gaveta)
  onNavigate?: () => void;
}

const PersonaWorldView: React.FC<PersonaWorldProps> = ({ world, isOwn, onOpenTitle, openingKey = null, onOpenRevelation, onNavigate }) => {
  const { t, i18n } = useTranslation();
  const reduceMotion = useReducedMotion();
  const st: WorldState = useMemo(() => worldState(world), [world]);
  const [tab, setTab] = useState<Tab>(st.hasTrio ? 'always' : 'next');
  const [openShelf, setOpenShelf] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, PersonaName>>({});
  const tabsRef = useRef<HTMLDivElement>(null);
  const pt = i18n.language.startsWith('pt');

  const entry = st.hasTrio ? (world.persona?.persona ?? null) : null;
  const text = entry ? personaText(entry, i18n.language) : null;
  const moodName = (letter: string | null) => (letter && MOOD_BY_LETTER[letter] ? t(MOOD_BY_LETTER[letter].labelKey) : '');
  const titleName = (title: WorldTitle) => (pt ? title.titlePt || title.titleEn : title.titleEn || title.titlePt) || t('personaWorld.untitled');
  const gaugeName = (key: string | null) => (key ? t(`personaWorld.gauges.${key}`) : '');
  const codeName = (code: string | null) => {
    const hit = code ? names[code] : undefined;
    return hit ? (pt ? hit.titlePt || hit.titleEn : hit.titleEn || hit.titlePt) : '';
  };

  // os nomes das outras formas (as mudas e a vizinha)
  const codesKey = [st.nextCode ?? '', ...world.molts.map((m) => m.to)].join(',');
  useEffect(() => {
    let alive = true;
    fetchPersonaNames(codesKey.split(','))
      .then((value) => alive && setNames(value))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [codesKey]);

  const showTab = (next: Tab, fromScene = false) => {
    setTab(next);
    // tocou na cena: traz os botões (e o painel) para a tela
    if (fromScene) window.requestAnimationFrame(() => tabsRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' }));
  };
  const pickScene = (hit: SceneHit) => {
    if (hit.kind === 'poster') onOpenTitle(hit.title);
    else if (hit.kind === 'screen') onOpenRevelation();
    else if (hit.kind === 'creature') showTab('now', true);
    else if (hit.kind === 'cocoon') showTab('next', true);
    else if (hit.kind === 'shelf') {
      setOpenShelf(hit.letter);
      showTab('always', true);
    }
  };
  const onTabKey = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const index = TABS.indexOf(tab);
    const next = event.key === 'ArrowRight' ? TABS[(index + 1) % 3] : event.key === 'ArrowLeft' ? TABS[(index + 2) % 3] : null;
    if (!next) return;
    event.preventDefault();
    setTab(next);
    document.getElementById(`persona-tab-${next}`)?.focus();
  };

  // um pôster pequeno que abre o título, com a nota no canto
  const thumb = (title: WorldTitle) => {
    const tone = ratingTone(Math.round(title.rating));
    const name = titleName(title);
    return (
      <button
        type="button"
        onClick={() => onOpenTitle(title)}
        className={`group relative block w-full aspect-[2/3] min-w-0 min-h-0 rounded-lg overflow-hidden ring-1 ring-white/10 hover:ring-white/30 transition ${FOCUS_RING}`}
        style={{ background: VELVET }}
        aria-label={`${name}, ${fmtRating(title.rating)}`}
        title={name}
      >
        {title.poster ? (
          <img src={`https://image.tmdb.org/t/p/w185${title.poster}`} alt="" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <span className="absolute inset-0 grid place-items-center" style={{ color: MIST }}>
            <Film className="w-5 h-5" aria-hidden />
          </span>
        )}
        <span
          className="absolute bottom-1 right-1 h-5 min-w-[20px] px-1 grid place-items-center rounded-md text-[12px] leading-none"
          style={{ ...PIXEL, background: 'rgba(18,13,34,0.86)', color: tone.color, boxShadow: `inset 0 0 0 1px ${tone.ring}` }}
        >
          {fmtRating(title.rating)}
        </span>
        {openingKey === `${title.type}:${title.id}` && <span className="absolute inset-0 bg-black/50 animate-pulse" />}
      </button>
    );
  };
  const thumbRow = (titles: WorldTitle[], columns: 4 | 6) => (
    <ul className={`grid gap-2 ${columns === 6 ? 'grid-cols-6 max-w-[440px]' : 'grid-cols-4 max-w-[300px]'}`}>
      {titles.map((title) => (
        <li key={`${title.type}:${title.id}`} className="min-w-0">
          {thumb(title)}
        </li>
      ))}
    </ul>
  );

  // ---------- Sempre: a cabine ----------
  const always = () => {
    const strongest = Math.max(1, ...st.rank.map((l) => st.score[l]));
    return (
      <>
        {text?.blurb && (
          <div>
            <p className="text-[15px] leading-relaxed" style={{ color: 'rgba(243,234,211,0.86)' }}>
              {text.blurb}
            </p>
            <button type="button" onClick={onOpenRevelation} className={`mt-1 inline-flex items-center justify-start gap-1.5 text-[13px] font-medium rounded ${FOCUS_RING}`} style={{ color: '#F9A8D4' }}>
              <Scroll className="w-4 h-4" aria-hidden />
              {t('profile.observatory.readRevelation')}
            </button>
          </div>
        )}
        <Lead>{t('personaWorld.always.lead', { count: st.rated })}</Lead>
        <ul className="grid gap-1.5">
          {st.rank.map((letter) => {
            const mood = MOOD_BY_LETTER[letter];
            const position = st.trio.indexOf(letter);
            const open = openShelf === letter;
            const best = world.best[letter] ?? [];
            return (
              <li key={letter}>
                <button
                  type="button"
                  onClick={() => setOpenShelf(open ? null : letter)}
                  aria-expanded={open}
                  className={`w-full grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1 text-left px-2.5 py-2 rounded-[10px] transition hover:bg-white/[0.05] ${FOCUS_RING}`}
                  style={position >= 0 ? { background: withAlpha(mood.color, 0.09), boxShadow: `inset 0 0 0 1px ${withAlpha(mood.color, 0.5)}` } : { background: 'rgba(243,234,211,0.03)' }}
                >
                  <span className="row-span-2">
                    <Tile letter={letter} />
                  </span>
                  <span className="min-w-0 font-semibold leading-snug" style={{ color: PAPER }}>
                    {t(mood.labelKey)}
                    {position >= 0 && (
                      <span className="ml-2 text-[12px] font-normal" style={{ color: MIST }}>
                        {t('personaWorld.always.trioRank', { rank: position + 1 })}
                      </span>
                    )}
                  </span>
                  <span className="text-[13px] tabular-nums" style={{ color: MIST }}>
                    {t('oracle.persona.films', { count: st.films[letter] })}
                  </span>
                  <span className="col-span-2 flex">
                    <Bar value={st.score[letter] / strongest} color={mood.color} />
                  </span>
                </button>
                {open && (
                  <div className="pl-[38px] pr-1 pt-2 pb-3 space-y-2">
                    {best.length > 0 ? thumbRow(best, 4) : <Note>{t('personaWorld.always.emptyShelf')}</Note>}
                    {isOwn && (
                      <Link to={`/oracle/acervo?mood=${mood.key}`} onClick={onNavigate} className={`inline-flex items-center justify-start gap-1.5 text-sm font-medium rounded ${FOCUS_RING}`} style={{ color: mood.color }}>
                        {t('personaWorld.always.openShelf')}
                        <ArrowUpRight className="w-4 h-4" aria-hidden />
                      </Link>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {st.out > 0 && (
          <p className="flex items-center gap-2.5 text-sm" style={{ color: MIST }}>
            <Tile letter={null} />
            <span>{t('personaWorld.always.archive', { count: st.out })}</span>
          </p>
        )}
        <Note>{t('personaWorld.always.legend')}</Note>
        {world.tens.length > 0 && (
          <section className="space-y-2 pt-2">
            <Heading>{t('personaWorld.always.wall')}</Heading>
            <Note>{t('personaWorld.always.wallHint')}</Note>
            {thumbRow(world.tens, 4)}
          </section>
        )}
        {world.molts.length > 1 && (
          <section className="space-y-2 pt-2">
            <Heading>{t('personaWorld.always.molts')}</Heading>
            <Note>{t('personaWorld.always.moltsHint')}</Note>
            <ol className="grid gap-1.5">
              {world.molts.map((molt, index) => {
                const date = molt.at ? new Date(molt.at) : null;
                const when = date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString(i18n.language, { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
                const what = molt.no ? t(molt.from ? 'personaWorld.always.changed' : 'personaWorld.always.born', { no: molt.no }) : t(molt.from ? 'personaWorld.always.changedPlain' : 'personaWorld.always.bornPlain');
                return (
                  <li
                    key={`${molt.at}-${molt.to}-${index}`}
                    className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 px-2.5 py-2 rounded-[10px]"
                    style={{ background: 'rgba(243,234,211,0.03)', boxShadow: index === world.molts.length - 1 ? 'inset 0 0 0 1px rgba(243,234,211,0.14)' : undefined }}
                  >
                    <PersonaCode code={molt.to} className="row-span-2 text-xl leading-none tracking-[0.04em]" />
                    <span className="min-w-0 font-semibold leading-snug" style={{ color: PAPER }}>
                      {codeName(molt.to) || molt.to}
                    </span>
                    <span className="text-[12.5px]" style={{ color: MIST }}>
                      {when ? `${what}, ${when}` : what}
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>
        )}
      </>
    );
  };

  // ---------- Agora: a mariposa ----------
  // as duas faixas (sempre × agora) na mesma ordem, a de força das prateleiras
  const strip = (dist: Record<string, number>, label: string) => {
    const list = st.rank.filter((l) => dist[l] > 0.005);
    const spoken = list
      .slice()
      .sort((a, b) => dist[b] - dist[a])
      .slice(0, 4)
      .map((l) => `${moodName(l)} ${Math.round(dist[l] * 100)}%`)
      .join(', ');
    return (
      <div className="grid grid-cols-[56px_minmax(0,1fr)] items-center gap-2.5">
        <span style={{ ...PIXEL, color: MIST }} className="text-[13px] leading-none">
          {label}
        </span>
        <span className="flex h-[22px] gap-[2px] rounded overflow-hidden" role="img" aria-label={`${label}: ${spoken}`}>
          {list.map((l) => (
            <span
              key={l}
              className="grid place-items-center min-w-0 text-[12px] leading-none"
              style={{ ...PIXEL, flex: `${dist[l]} 1 0%`, background: MOOD_BY_LETTER[l].color, color: '#1A1230' }}
              title={`${moodName(l)} ${Math.round(dist[l] * 100)}%`}
            >
              {dist[l] >= 0.09 ? l : ''}
            </span>
          ))}
        </span>
      </div>
    );
  };
  const now = () => {
    const creatureLabel = st.hasTrio ? t('personaWorld.mothLabel') : world.rated === 0 ? t('personaWorld.eggLabel') : t('personaWorld.larvaLabel');
    return (
      <>
        <div className="rounded-2xl p-2" style={{ background: STAGE_BG }}>
          <MothCloseUp world={world} state={st} onOpenTitle={onOpenTitle} label={creatureLabel} />
        </div>
        {!st.hasTrio ? (
          <Lead>{world.rated === 0 ? t('personaWorld.now.egg') : t('personaWorld.now.larva')}</Lead>
        ) : (
          <>
            <Lead>
              {st.phaseDistinct
                ? t('personaWorld.now.distinct', { code: st.code, mood: moodName(st.phaseMood) })
                : st.phaseAvailable
                  ? t('personaWorld.now.same')
                  : t('personaWorld.now.early', { min: PHASE_MIN, window: PHASE_WINDOW, left: st.phaseLeft })}
            </Lead>
            <div className="grid gap-1.5">
              {st.phaseAvailable ? (
                <>
                  {strip(st.essence, t('personaWorld.now.stripAlways'))}
                  {strip(st.now, t('personaWorld.now.stripNow'))}
                </>
              ) : (
                strip(st.now, t('personaWorld.now.stripWings'))
              )}
            </div>
            {world.eyes.length > 0 && (
              <div className="space-y-2">
                <Note>{t('personaWorld.now.eyes')}</Note>
                {thumbRow(world.eyes, 6)}
              </div>
            )}
          </>
        )}
        {world.last.length > 0 && (
          <section className="space-y-1 pt-2">
            <Heading>{t('personaWorld.now.last')}</Heading>
            <ol>
              {world.last.map((title) => (
                <li key={`${title.type}:${title.id}`}>
                  <button
                    type="button"
                    onClick={() => onOpenTitle(title)}
                    className={`w-full flex items-center justify-start gap-2.5 text-left px-2 -mx-2 rounded-lg transition hover:bg-white/[0.05] ${FOCUS_RING}`}
                  >
                    <span style={{ ...PIXEL, color: ratingTone(Math.round(title.rating)).color }} className="w-7 shrink-0 text-right text-[15px] leading-none tabular-nums">
                      {fmtRating(title.rating)}
                    </span>
                    <span className="flex-1 min-w-0 text-[14px] leading-snug break-words" style={{ color: PAPER }}>
                      {titleName(title)}
                    </span>
                    <Tile letter={title.letter} small />
                    <span className="sr-only">{title.letter ? moodName(title.letter) : t('personaWorld.archive')}</span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        )}
      </>
    );
  };

  // ---------- Por vir: a envergadura e a forma vizinha ----------
  const next = () => {
    if (!st.hasTrio) {
      const threshold = world.persona?.threshold || 10;
      return (
        <>
          <Heading>{t('personaWorld.next.birth')}</Heading>
          <Lead>{t('personaWorld.next.birthLead')}</Lead>
          <div className="flex items-center gap-2.5">
            <Bar value={Math.min(1, st.counted / threshold)} tall label={t('oracle.intro.progressLabel')} />
            <span style={{ ...PIXEL, color: MIST }} className="text-[13px] leading-none tabular-nums">
              {Math.min(st.counted, threshold)} / {threshold}
            </span>
          </div>
        </>
      );
    }
    const degree = st.neighbor === 'cocoon' ? 2 : st.neighbor === 'near' ? 1 : 0;
    const degrees = [t('personaWorld.next.far'), t('personaWorld.next.near'), t('personaWorld.next.cocoon')];
    const item = FURNITURE[st.stage + 1] ? t(`personaWorld.furniture.${FURNITURE[st.stage + 1]}`) : '';
    return (
      <>
        <Heading>{t('personaWorld.next.wingspan')}</Heading>
        {st.nextGaugeKey ? (
          <>
            <Lead>{t('personaWorld.next.wingspanLead', { from: gaugeName(st.gaugeKey), to: gaugeName(st.nextGaugeKey) })}</Lead>
            <div className="flex items-center gap-2.5">
              <Bar value={st.gaugeBar} tall label={t('personaWorld.plate.gaugeAria', { pct: Math.floor(st.gaugeBar * 100), next: gaugeName(st.nextGaugeKey) })} />
              <span style={{ ...PIXEL, color: MIST }} className="text-[13px] leading-none tabular-nums">
                {Math.floor(st.gaugeBar * 100)}%
              </span>
            </div>
            {item && <Note>{t(st.stage + 1 <= 7 ? 'personaWorld.next.arrives' : 'personaWorld.next.arrivesRoom', { to: gaugeName(st.nextGaugeKey), item })}</Note>}
          </>
        ) : (
          <Lead>{t('personaWorld.next.max')}</Lead>
        )}

        <Heading className="pt-3">{t('personaWorld.next.neighbor')}</Heading>
        {st.nextCode && st.challenger && st.weakest ? (
          <>
            <div className="flex items-center gap-3.5">
              <PersonaCode code={st.nextCode} className="text-[30px] leading-none tracking-[0.04em]" />
              <span className="min-w-0 font-semibold leading-snug" style={{ color: PAPER }}>
                {codeName(st.nextCode)}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5" role="img" aria-label={t('personaWorld.next.degreesAria', { degree: degrees[degree] })}>
              {degrees.map((label, index) => (
                <span
                  key={label}
                  className="grid place-items-center h-8 rounded-lg text-[13px] leading-none"
                  style={index === degree ? { ...PIXEL, background: PAPER, color: INK } : { ...PIXEL, color: 'rgba(243,234,211,0.45)', boxShadow: 'inset 0 0 0 1px rgba(243,234,211,0.14)' }}
                >
                  {label}
                </span>
              ))}
            </div>
            <Lead>
              {t(degree === 2 ? 'personaWorld.next.cocoonLead' : degree === 1 ? 'personaWorld.next.nearLead' : 'personaWorld.next.farLead', {
                challenger: moodName(st.challenger),
                weakest: moodName(st.weakest),
              })}
            </Lead>
            <Note>{t('personaWorld.next.rule')}</Note>
          </>
        ) : (
          <Lead>{t('personaWorld.next.noNeighbor')}</Lead>
        )}
      </>
    );
  };

  const threshold = world.persona?.threshold || 10;
  return (
    <div className="space-y-4">
      {/* No celular a cena vai de borda a borda da gaveta (o -mx-5 desfaz o
          px-5 do corpo da OracleSheet): numa tela de 320 px ela ainda cabe em
          escala 2; com a margem, cairia para escala 1 e ficaria miúda. */}
      <div className="-mx-5 sm:mx-0 sm:rounded-2xl py-1.5" style={{ background: STAGE_BG }}>
        <PersonaScene world={world} state={st} onPick={pickScene} label={st.hasTrio ? t('personaWorld.sceneLabel', { code: st.code }) : t('personaWorld.sceneLabelEmpty')} />
      </div>

      {/* a placa: quem é */}
      <div className="flex items-center gap-3.5 min-w-0">
        {entry && st.code && text ? (
          <>
            <button
              type="button"
              onClick={onOpenRevelation}
              className={`block shrink-0 w-[54px] min-w-0 min-h-0 rounded-xl ${FOCUS_RING}`}
              aria-label={`${t('oracle.revelation')}: ${text.title}`}
              title={t('oracle.revelation')}
            >
              <PersonaCard persona={entry} code={st.code} compact eager className="w-full" />
            </button>
            <div className="min-w-0">
              <PersonaCode code={st.code} className="block text-[2.5rem] leading-[0.95] tracking-[0.04em]" />
              <p className="text-lg font-semibold leading-snug" style={{ color: PAPER }}>
                {text.title}
              </p>
              <p className="text-[13px] leading-snug" style={{ color: MIST }}>
                {text.sameAsFilm ? text.filmWithYear : t('oracle.persona.characterIn', { character: text.character, film: text.filmWithYear })}
              </p>
            </div>
          </>
        ) : (
          <>
            <span style={{ ...PIXEL, color: 'rgba(243,234,211,0.25)' }} className="shrink-0 text-[2.5rem] leading-[0.95] tracking-[0.04em]" aria-hidden>
              ???
            </span>
            <div className="min-w-0">
              <p className="text-lg font-semibold leading-snug" style={{ color: PAPER }}>
                {world.rated === 0 ? t('personaWorld.plate.egg') : t('personaWorld.plate.larva')}
              </p>
              <p className="text-[13px] leading-snug" style={{ color: MIST }}>
                {st.counted >= threshold ? t('personaWorld.plate.needShelves') : t('personaWorld.plate.progress', { counted: st.counted, threshold })}
              </p>
            </div>
          </>
        )}
      </div>

      {/* a bitola: o quanto cresceu */}
      <div className="flex items-center gap-2.5">
        <span style={{ ...PIXEL, background: PAPER, color: INK }} className="shrink-0 px-2 py-[5px] rounded-md text-[13px] leading-none">
          {gaugeName(st.gaugeKey)}
        </span>
        {st.nextGaugeKey && (
          <>
            <Bar value={st.gaugeBar} label={t('personaWorld.plate.gaugeAria', { pct: Math.floor(st.gaugeBar * 100), next: gaugeName(st.nextGaugeKey) })} />
            <span style={{ ...PIXEL, color: MIST }} className="shrink-0 text-[13px] leading-none">
              {gaugeName(st.nextGaugeKey)}
            </span>
          </>
        )}
      </div>

      {/* os três botões */}
      <div ref={tabsRef} role="tablist" aria-label={t('personaWorld.tabs.label')} className="grid grid-cols-3 gap-2 pt-1 scroll-mt-3">
        {TABS.map((key) => {
          const selected = tab === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              id={`persona-tab-${key}`}
              aria-selected={selected}
              aria-controls="persona-tabpanel"
              tabIndex={selected ? 0 : -1}
              onClick={() => showTab(key)}
              onKeyDown={onTabKey}
              className={`h-11 rounded-xl text-[15px] leading-none transition-colors ${FOCUS_RING}`}
              style={
                selected
                  ? { ...PIXEL, background: PAPER, color: INK, boxShadow: '0 3px 0 #9D9381' }
                  : { ...PIXEL, background: '#261B45', color: PAPER, boxShadow: 'inset 0 0 0 1px rgba(243,234,211,0.14), 0 3px 0 #0B0716' }
              }
            >
              {t(`personaWorld.tabs.${key}`)}
            </button>
          );
        })}
      </div>
      <div id="persona-tabpanel" role="tabpanel" aria-labelledby={`persona-tab-${tab}`} className="space-y-3 min-w-0">
        {tab === 'always' ? always() : tab === 'now' ? now() : next()}
      </div>
    </div>
  );
};

export default PersonaWorldView;
