import React from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import UserAvatar from '../UserAvatar';
import ConnectionChip, { TonePill } from '../connection/ConnectionChip';
import { PersonaCode } from '../PersonaBits';
import { RANK_MEDALS } from '../../lib/libraryLayouts';
import { MOODS, MOOD_BY_KEY } from '../../lib/moods';
import { connectionTone, formatConnection, type ConnectionPerson } from '../../lib/connection';
import { PAPER, MIST, PIXEL, FOCUS_RING, glassPanel, withAlpha } from '../../lib/oracleTheme';

// "Suas conexões" na Comunidade (13/10/2026): seus amigos do gosto mais
// parecido ao mais distante. Os 3 primeiros num pódio — ouro no meio, prata e
// bronze dos lados, cada um no seu degrau (o mesmo pódio do "Quem você mais
// ama" do perfil) — e os seguintes (4º ao 8º) em linhas ao lado. Só entra
// quem tem número; amigos sem títulos em comum suficientes vêm por último nas
// linhas, com "Ainda sem títulos em comum". Tocar abre o perfil da pessoa já
// com a gaveta da Conexão.

interface ConnectionsPodiumProps {
  items: ConnectionPerson[];
  onSeeAll: () => void;
}

// Ordem no pódio: prata, ouro, bronze. Altura de cada degrau e do avatar.
const PODIUM_ORDER = [1, 0, 2];
const STEP_HEIGHT = [44, 30, 20];
const AVATAR = [76, 60, 60];
const MAX_ROWS = 5;

// O perfil da pessoa com a gaveta da Conexão aberta.
export const connectionHref = (username: string) => `/profile/${encodeURIComponent(username)}?conexao=1`;

// Código de 3 letras a partir dos 3 humores mais fortes (sempre na ordem dos
// MOODS, como o código da personalidade).
export const codeFromMoods = (keys: string[] | null | undefined): string | null => {
  if (!keys || keys.length < 3) return null;
  const moods = keys.map((key) => MOOD_BY_KEY[key]).filter(Boolean);
  if (moods.length < 3) return null;
  return moods
    .slice(0, 3)
    .sort((a, b) => MOODS.indexOf(a) - MOODS.indexOf(b))
    .map((m) => m.letter)
    .join('');
};

export const hasConnection = (p: ConnectionPerson) => p.pct !== null && p.pct !== undefined && Boolean(p.confidence);

// Maior % primeiro; no empate, mais títulos em comum.
const byConnection = (a: ConnectionPerson, b: ConnectionPerson) =>
  (b.pct ?? 0) - (a.pct ?? 0) || (b.shared_count ?? 0) - (a.shared_count ?? 0) || a.username.localeCompare(b.username);

const ConnectionsPodium: React.FC<ConnectionsPodiumProps> = ({ items, onSeeAll }) => {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();

  const ranked = items.filter(hasConnection).sort(byConnection);
  if (ranked.length === 0) return null;
  const podium = ranked.slice(0, 3);
  const rest = [...ranked.slice(3), ...items.filter((p) => !hasConnection(p)).sort((a, b) => a.username.localeCompare(b.username))].slice(0, MAX_ROWS);

  const seeAll = (className: string) => (
    <button
      type="button"
      onClick={onSeeAll}
      className={`gap-1.5 h-11 px-4 rounded-full border border-white/15 hover:border-white/35 hover:bg-white/5 text-sm font-medium transition ${FOCUS_RING} ${className}`}
      style={{ color: PAPER }}
    >
      {t('connection.ranking.seeAll')}
      <ChevronRight className="w-4 h-4" aria-hidden />
    </button>
  );

  return (
    <section aria-labelledby="community-connections-title" className="mt-12 border-t border-white/[0.07] pt-10">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 id="community-connections-title" style={{ ...PIXEL, color: PAPER }} className="text-2xl sm:text-3xl leading-tight">
              {t('connection.ranking.title')}
            </h2>
            <p className="mt-1 text-sm" style={{ color: MIST }}>
              {t('connection.ranking.hint')}
            </p>
          </div>
          {seeAll('hidden sm:inline-flex')}
        </div>

        <div
          className={`mt-6 rounded-3xl p-4 sm:p-6 grid grid-cols-1 gap-5 ${rest.length > 0 ? 'lg:grid-cols-2 lg:gap-8' : 'lg:max-w-xl'}`}
          style={glassPanel(RANK_MEDALS[0])}
        >
          {/* Pódio */}
          <ol className="min-w-0 grid grid-cols-3 items-end gap-2 sm:gap-4 self-end">
            {PODIUM_ORDER.map((place) => {
              const person = podium[place];
              if (!person) return <li key={place} aria-hidden />;
              const medal = RANK_MEDALS[place];
              const tone = connectionTone(person.pct!);
              const value = formatConnection(person.pct!, person.confidence);
              return (
                <motion.li
                  key={person.user_id}
                  className="min-w-0"
                  initial={reduceMotion ? false : { opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: place === 0 ? 0.05 : 0.18 + place * 0.08, type: 'spring', stiffness: 220, damping: 22 }}
                >
                  <Link
                    to={connectionHref(person.username)}
                    className={`group w-full flex flex-col items-center justify-end gap-1.5 rounded-2xl text-center ${FOCUS_RING}`}
                    aria-label={t('connection.ranking.itemAria', { place: place + 1, username: person.username, value })}
                  >
                    {/* O brilho embaixo do avatar tem a cor da medalha; a
                        moldura continua sendo a da pessoa. */}
                    <span
                      className="relative rounded-full transition-transform duration-300 group-hover:-translate-y-0.5"
                      style={{ boxShadow: `0 12px 28px -12px ${medal}` }}
                    >
                      <UserAvatar user={person} size={AVATAR[place]} />
                    </span>
                    <span className="w-full mt-1 truncate text-[12.5px] font-medium leading-tight group-hover:underline underline-offset-2" style={{ color: PAPER }}>
                      @{person.username}
                    </span>
                    <TonePill color={tone.color} size={place === 0 ? 'md' : 'sm'}>
                      {value}
                    </TonePill>
                    <span
                      className="mt-1 w-full grid place-items-center rounded-t-xl"
                      style={{
                        height: STEP_HEIGHT[place],
                        background: `linear-gradient(180deg, ${withAlpha(medal, 0.26)}, ${withAlpha(medal, 0.05)})`,
                        boxShadow: `inset 0 1.5px 0 ${withAlpha(medal, 0.75)}`,
                      }}
                      aria-hidden
                    >
                      <span style={{ ...PIXEL, color: medal }} className="text-[15px] leading-none">
                        {place + 1}
                      </span>
                    </span>
                  </Link>
                </motion.li>
              );
            })}
          </ol>

          {/* 4º ao 8º */}
          {rest.length > 0 && (
            <ol className="min-w-0 space-y-0.5 border-t border-white/[0.07] pt-3 lg:border-t-0 lg:pt-0 lg:border-l lg:pl-8" start={podium.length + 1}>
              {rest.map((person, i) => {
                const place = podium.length + i + 1;
                const code = codeFromMoods(person.top_moods);
                const numbered = hasConnection(person);
                return (
                  <li key={person.user_id}>
                    <Link
                      to={connectionHref(person.username)}
                      className={`group w-full justify-start gap-3 rounded-xl px-2 py-1.5 text-left transition hover:bg-white/[0.05] ${FOCUS_RING}`}
                      aria-label={
                        numbered
                          ? t('connection.ranking.itemAria', { place, username: person.username, value: formatConnection(person.pct!, person.confidence) })
                          : t('connection.ranking.itemNoDataAria', { username: person.username })
                      }
                    >
                      <span style={{ ...PIXEL, color: MIST }} className="w-4 shrink-0 text-center text-[13px] leading-none" aria-hidden>
                        {numbered ? place : '·'}
                      </span>
                      <UserAvatar user={person} size={36} />
                      <span className="min-w-0 flex-1" aria-hidden>
                        <span className="block truncate text-[14px] font-medium leading-tight group-hover:underline underline-offset-2" style={{ color: PAPER }}>
                          @{person.username}
                        </span>
                        {code && <PersonaCode code={code} className="block mt-0.5 text-[12px] leading-none tracking-wide" />}
                      </span>
                      {numbered ? (
                        <ConnectionChip pct={person.pct} confidence={person.confidence} className="shrink-0" />
                      ) : (
                        <span className="shrink-0 text-[11.5px] text-right leading-tight max-w-[8.5rem]" style={{ color: MIST }} aria-hidden>
                          {t('connection.ranking.noData')}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {seeAll('sm:hidden mt-4 w-full')}
      </div>
    </section>
  );
};

export default ConnectionsPodium;
