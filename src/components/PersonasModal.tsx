import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Users, Crown, Loader2, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import OracleSheet, { SheetFade } from './OracleSheet';
import { PersonaCode, PersonaPoster, MoodChip } from './PersonaBits';
import { getFrameClass } from '../lib/frames';
import { MOODS, MOOD_BY_KEY, withMoodAlpha } from '../lib/moods';
import { mapPersonaEntry, personaText, type PersonaEntry } from '../lib/persona';
import { NIGHT, VELVET, PAPER, MIST, PIXEL, FOCUS_RING } from '../lib/oracleTheme';

// As 84 personalidades: todas as combinações de 3 prateleiras, cada uma com
// seu personagem e quantas pessoas vivem nela. Dá pra filtrar por
// prateleira. Tocar numa abre a ficha, com quem (entre amigos e perfis
// públicos) tem a mesma personalidade.

type CatalogEntry = PersonaEntry & { userCount: number };

interface MatchingUser {
  user_id: string;
  username: string;
  avatar_url: string | null;
  avatar_frame: string | null;
  plan_type: string | null;
  is_friend: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  viewerId: string;
  viewerPersonaCode?: string | null;
  onUserClick?: (username: string) => void;
}

const PersonaGrid: React.FC<{
  visible: CatalogEntry[];
  filter: string | null;
  onFilter: (key: string | null) => void;
  viewerPersonaCode: string | null;
  lastViewed: string | null;
  onSelect: (p: CatalogEntry) => void;
}> = ({ visible, filter, onFilter, viewerPersonaCode, lastViewed, onSelect }) => {
  const { t, i18n } = useTranslation();

  useEffect(() => {
    if (!lastViewed) return;
    document.getElementById(`persona-tile-${lastViewed}`)?.scrollIntoView({ block: 'center' });
  }, [lastViewed]);

  const chip = (key: string | null, label: React.ReactNode, color?: string) => {
    const active = filter === key;
    return (
      <button
        key={key ?? 'all'}
        onClick={() => onFilter(key)}
        aria-pressed={active}
        className={`shrink-0 gap-1.5 h-10 px-3.5 rounded-full text-sm font-medium transition ${FOCUS_RING} ${active ? 'bg-white/10' : 'hover:bg-white/5'}`}
        style={{ color: active ? PAPER : MIST, boxShadow: `inset 0 0 0 1.5px ${active ? color ?? PAPER : 'rgba(255,255,255,0.15)'}` }}
      >
        {label}
      </button>
    );
  };

  return (
    <>
      <div className="-mx-5 sm:-mx-7 px-5 sm:px-7 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        <div className="flex gap-2 pb-1" role="group" aria-label={t('oracle.personas.filterLabel')}>
          {chip(null, t('oracle.personas.filterAll'))}
          {MOODS.map((mood) =>
            chip(
              mood.key,
              <>
                <span style={{ ...PIXEL, color: mood.color }} className="leading-none" aria-hidden>
                  {mood.letter}
                </span>
                {t(mood.labelKey)}
              </>,
              mood.color,
            ),
          )}
        </div>
      </div>

      <ul className="mt-5 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-x-3 gap-y-5">
        {visible.map((p) => {
          const isMine = p.code === viewerPersonaCode;
          const text = personaText(p, i18n.language);
          return (
            <li key={p.code}>
              <button
                id={`persona-tile-${p.code}`}
                onClick={() => onSelect(p)}
                className={`group w-full flex flex-col items-stretch justify-start text-left rounded-xl ${FOCUS_RING}`}
                aria-label={`${p.code} — ${text.title} (${text.character}) · ${t('oracle.personas.peopleCount', { count: p.userCount })}${isMine ? ` · ${t('oracle.persona.yours')}` : ''}`}
              >
                <span className="relative block transition-transform duration-200 group-hover:-translate-y-1">
                  <PersonaPoster path={p.posterPath} className="rounded-xl shadow-xl" ring={isMine ? '#F0ABFC' : undefined} />
                  {p.userCount > 0 && (
                    <span
                      className="absolute top-1.5 right-1.5 inline-flex items-center gap-1 h-6 px-1.5 rounded-full text-[11px] font-semibold tabular-nums"
                      style={{ background: 'rgba(18,13,34,0.88)', color: PAPER }}
                      aria-hidden
                    >
                      <Users className="w-3 h-3" style={{ color: MIST }} />
                      {p.userCount}
                    </span>
                  )}
                  {isMine && (
                    <span className="absolute top-1.5 left-1.5 grid place-items-center w-6 h-6 rounded-full bg-fuchsia-300" aria-hidden>
                      <Crown className="w-3.5 h-3.5" style={{ color: NIGHT }} />
                    </span>
                  )}
                </span>
                <PersonaCode code={p.code} className="mt-2 text-xl leading-none" />
                <span className="mt-1 text-xs font-medium leading-snug line-clamp-2" style={{ color: PAPER }} aria-hidden>
                  {text.title}
                </span>
                <span className="mt-0.5 text-[11px] leading-snug truncate" style={{ color: MIST }} aria-hidden>
                  {text.character}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
};

const PersonaDetail: React.FC<{
  persona: CatalogEntry;
  matching: MatchingUser[];
  matchingLoading: boolean;
  isViewerPersona: boolean;
  totalUsersGlobal: number;
  onUserClick: (username: string) => void;
}> = ({ persona, matching, matchingLoading, isViewerPersona, totalUsersGlobal, onUserClick }) => {
  const { t, i18n } = useTranslation();
  const topRef = useRef<HTMLDivElement>(null);
  const text = personaText(persona, i18n.language);
  const pct = totalUsersGlobal > 0 ? (persona.userCount / totalUsersGlobal) * 100 : 0;

  // Abre sempre do topo, mesmo vindo do fim da grade.
  useEffect(() => {
    topRef.current?.scrollIntoView({ block: 'start' });
  }, [persona.code]);

  return (
    <div ref={topRef} className="space-y-6 scroll-mt-6">
      <div className="flex flex-col sm:flex-row gap-5">
        <PersonaPoster path={persona.posterPath} alt={text.film} size="w500" className="w-[140px] sm:w-[180px] shrink-0 rounded-xl shadow-2xl self-start" eager />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <PersonaCode code={persona.code} className="text-5xl leading-none" />
            {isViewerPersona && (
              <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-xs font-semibold bg-fuchsia-500/15 text-fuchsia-200 ring-1 ring-fuchsia-400/30">
                <Crown className="w-3.5 h-3.5" aria-hidden />
                {t('oracle.persona.yours')}
              </span>
            )}
          </div>
          <p className="mt-2 text-xl font-semibold leading-snug" style={{ color: PAPER }}>
            {text.title}
          </p>
          <p className="mt-1 text-sm" style={{ color: MIST }}>
            {text.sameAsFilm ? text.filmWithYear : t('oracle.persona.characterIn', { character: text.character, film: text.filmWithYear })}
          </p>
          <p className="mt-3 text-[15px] leading-relaxed max-w-2xl" style={{ color: 'rgba(243,234,211,0.86)' }}>
            {text.blurb}
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-2 max-w-xs">
            <div className="rounded-xl px-3 py-2.5 ring-1 ring-white/10" style={{ background: VELVET }}>
              <dt className="text-xs" style={{ color: MIST }}>
                {t('oracle.personas.people')}
              </dt>
              <dd style={{ ...PIXEL, color: PAPER }} className="mt-1 text-2xl leading-none tabular-nums">
                {persona.userCount}
              </dd>
            </div>
            <div className="rounded-xl px-3 py-2.5 ring-1 ring-white/10" style={{ background: VELVET }}>
              <dt className="text-xs" style={{ color: MIST }}>
                {t('oracle.personas.ofTotal')}
              </dt>
              <dd style={{ ...PIXEL, color: PAPER }} className="mt-1 text-2xl leading-none tabular-nums">
                {pct.toLocaleString(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* As três prateleiras dessa personalidade */}
      <section>
        <h4 className="font-semibold" style={{ color: PAPER }}>
          {t('oracle.personas.shelvesTitle')}
        </h4>
        <ul className="mt-3 grid md:grid-cols-3 gap-3">
          {persona.moodKeys.map((key) => {
            const mood = MOOD_BY_KEY[key];
            if (!mood) return null;
            return (
              <li key={key} className="rounded-xl p-4 ring-1 ring-white/10" style={{ background: `linear-gradient(180deg, ${withMoodAlpha(mood, 0.1)}, transparent 70%), ${VELVET}` }}>
                <MoodChip moodKey={key} size="sm" />
                <p className="mt-2 text-sm leading-relaxed" style={{ color: MIST }}>
                  {t(mood.readingKey)}
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Quem mais tem essa personalidade */}
      <section>
        <h4 className="flex items-center gap-2 font-semibold" style={{ color: PAPER }}>
          <Users className="w-4 h-4 text-violet-300" aria-hidden />
          {t('oracle.personas.matchingTitle')}
        </h4>
        {matchingLoading ? (
          <div className="flex justify-center py-8" role="status">
            <Loader2 className="w-5 h-5 animate-spin text-violet-300" aria-hidden />
            <span className="sr-only">{t('common.loading')}</span>
          </div>
        ) : matching.length === 0 ? (
          <p className="mt-3 rounded-xl px-4 py-4 text-sm ring-1 ring-white/10" style={{ background: VELVET, color: MIST }}>
            {t('oracle.personas.matchingEmpty')}
          </p>
        ) : (
          <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {matching.map((u) => (
              <li key={u.user_id}>
                <button
                  onClick={() => onUserClick(u.username)}
                  className={`group w-full flex items-center justify-start gap-3 p-2.5 rounded-xl ring-1 ring-white/10 hover:ring-white/25 text-left transition ${FOCUS_RING}`}
                  style={{ background: VELVET }}
                >
                  <span className={`relative shrink-0 w-10 h-10 rounded-full overflow-hidden ${getFrameClass(u.avatar_frame || undefined, u.plan_type === 'premium')}`}>
                    {u.avatar_url ? (
                      <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="w-full h-full grid place-items-center text-sm" style={{ ...PIXEL, background: NIGHT, color: PAPER }}>
                        {u.username.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold truncate group-hover:underline underline-offset-4" style={{ color: PAPER }}>
                        @{u.username}
                      </span>
                      {u.plan_type === 'premium' && <Crown className="w-3.5 h-3.5 shrink-0 text-amber-300" aria-label="Premium" />}
                    </span>
                    <span className="block text-xs" style={{ color: MIST }}>
                      {u.is_friend ? t('oracle.personas.friend') : t('oracle.personas.public')}
                    </span>
                  </span>
                  <ChevronRight className="w-4 h-4 shrink-0 transition group-hover:translate-x-0.5" style={{ color: MIST }} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

const PersonasModal: React.FC<Props> = ({ isOpen, onClose, viewerId, viewerPersonaCode = null, onUserClick }) => {
  const { t, i18n } = useTranslation();

  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<CatalogEntry | null>(null);
  // Última persona aberta — ao voltar pra grade, rola até ela.
  const [lastViewed, setLastViewed] = useState<string | null>(null);
  const [matching, setMatching] = useState<MatchingUser[]>([]);
  const [matchingLoading, setMatchingLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setSelected(null);
      setLastViewed(null);
      setFilter(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase.rpc('get_personas_global_stats').then(({ data, error }) => {
      if (cancelled) return;
      if (!error && Array.isArray(data)) {
        setCatalog((data as Record<string, unknown>[]).map((row) => ({ ...mapPersonaEntry(row), userCount: Number(row.user_count) || 0 })));
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!selected) {
      setMatching([]);
      return;
    }
    let cancelled = false;
    setMatchingLoading(true);
    supabase.rpc('get_persona_matching_users', { persona_code: selected.code, viewer_id: viewerId }).then(({ data, error }) => {
      if (cancelled) return;
      if (!error && Array.isArray(data)) setMatching(data as MatchingUser[]);
      setMatchingLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [selected, viewerId]);

  const totalUsers = useMemo(() => catalog.reduce((sum, p) => sum + p.userCount, 0), [catalog]);
  const populated = useMemo(() => catalog.filter((p) => p.userCount > 0).length, [catalog]);
  const visible = useMemo(() => (filter ? catalog.filter((p) => p.moodKeys.includes(filter)) : catalog), [catalog, filter]);

  const openPersona = (p: CatalogEntry) => {
    setSelected(p);
    setLastViewed(p.code);
  };

  const selectedText = selected ? personaText(selected, i18n.language) : null;

  return (
    <OracleSheet
      open={isOpen}
      onClose={onClose}
      size="full"
      bodyClassName="px-5 sm:px-7 py-6"
      leading={
        selected ? (
          <button onClick={() => setSelected(null)} aria-label={t('common.back')} className={`shrink-0 -ml-2 rounded-full hover:bg-white/10 transition ${FOCUS_RING}`} style={{ color: PAPER }}>
            <ArrowLeft className="w-5 h-5" aria-hidden />
          </button>
        ) : undefined
      }
      title={selected && selectedText ? selectedText.title : t('oracle.personas.title')}
      subtitle={
        selected && selectedText
          ? `${selected.code} · ${selectedText.character}`
          : !loading
            ? t('oracle.personas.summary', { active: populated, count: totalUsers })
            : undefined
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-24" role="status">
          <Loader2 className="w-6 h-6 animate-spin text-violet-300" aria-hidden />
          <span className="sr-only">{t('common.loading')}</span>
        </div>
      ) : selected ? (
        <SheetFade id={selected.code}>
          <PersonaDetail
            persona={selected}
            matching={matching}
            matchingLoading={matchingLoading}
            isViewerPersona={selected.code === viewerPersonaCode}
            totalUsersGlobal={totalUsers}
            onUserClick={(uname) => {
              onClose();
              onUserClick?.(uname);
            }}
          />
        </SheetFade>
      ) : (
        <SheetFade id="grid">
          <PersonaGrid
            visible={visible}
            filter={filter}
            onFilter={setFilter}
            viewerPersonaCode={viewerPersonaCode}
            lastViewed={lastViewed}
            onSelect={openPersona}
          />
        </SheetFade>
      )}
    </OracleSheet>
  );
};

export default PersonasModal;
