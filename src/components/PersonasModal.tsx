import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowLeft, Users, Crown, Loader2, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import ArchetypeSymbol from './ArchetypeSymbol';
import { useTranslation } from 'react-i18next';

interface PersonaStat {
  archetype_id: string;
  subcategory_id: string;
  persona_code: string;
  archetype_name: string;
  archetype_name_en: string;
  subcategory_name: string;
  subcategory_name_en: string;
  primary_spectrum: string;
  secondary_spectrum: string;
  pair_name: string;
  user_count: number;
}

interface MatchingUser {
  user_id: string;
  username: string;
  avatar_url: string | null;
  avatar_frame: string | null;
  plan_type: string | null;
  is_followed: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  viewerId: string;
  viewerPersonaCode?: string | null;
  onUserClick?: (username: string) => void;
}

const SPECTRUM_PT: Record<string, string> = {
  E: 'Emocional', I: 'Intelectual', C: 'Cultural', S: 'Sensorial', R: 'Recreativo',
};
const SPECTRUM_EN: Record<string, string> = {
  E: 'Emotional', I: 'Intellectual', C: 'Cultural', S: 'Sensorial', R: 'Recreational',
};

const SPECTRUM_GRADIENT: Record<string, string> = {
  E: 'from-rose-500 via-pink-500 to-rose-600',
  I: 'from-blue-500 via-cyan-500 to-blue-600',
  C: 'from-amber-500 via-orange-500 to-amber-600',
  S: 'from-emerald-500 via-teal-500 to-emerald-600',
  R: 'from-orange-500 via-red-500 to-orange-600',
};

const SPECTRUM_RING: Record<string, string> = {
  E: 'ring-rose-400/40', I: 'ring-blue-400/40', C: 'ring-amber-400/40',
  S: 'ring-emerald-400/40', R: 'ring-orange-400/40',
};

const SUBCATEGORY_COLOR: Record<string, string> = {
  A: '#fbbf24', B: '#64748b', K: '#ef4444', X: '#3b82f6', D: '#9ca3af', L: '#10b981',
};

const SUBCATEGORY_ORDER = ['A', 'B', 'K', 'X', 'D', 'L'];

function getFrameStyle(frame: string | null | undefined): string {
  if (!frame) return '';
  if (frame === 'gold') return 'ring-2 ring-amber-400 ring-offset-1 ring-offset-transparent';
  if (frame === 'silver') return 'ring-2 ring-gray-300 ring-offset-1 ring-offset-transparent';
  if (frame === 'bronze') return 'ring-2 ring-orange-400 ring-offset-1 ring-offset-transparent';
  return '';
}

const PersonasModal: React.FC<Props> = ({ isOpen, onClose, viewerId, viewerPersonaCode, onUserClick }) => {
  const { i18n } = useTranslation();
  const isPt = i18n.language.startsWith('pt');

  const [stats, setStats] = useState<PersonaStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PersonaStat | null>(null);
  const [matching, setMatching] = useState<MatchingUser[]>([]);
  const [matchingLoading, setMatchingLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    supabase.rpc('get_personas_global_stats').then(({ data, error }) => {
      if (cancelled) return;
      if (!error && Array.isArray(data)) setStats(data as PersonaStat[]);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [isOpen]);

  useEffect(() => {
    if (!selected) { setMatching([]); return; }
    let cancelled = false;
    setMatchingLoading(true);
    supabase.rpc('get_persona_matching_users', {
      persona_code: selected.persona_code,
      viewer_id: viewerId,
    }).then(({ data, error }) => {
      if (cancelled) return;
      if (!error && Array.isArray(data)) setMatching(data as MatchingUser[]);
      setMatchingLoading(false);
    });
    return () => { cancelled = true; };
  }, [selected, viewerId]);

  const totalUsers = useMemo(() => stats.reduce((sum, s) => sum + Number(s.user_count), 0), [stats]);
  const populatedCount = useMemo(() => stats.filter(s => Number(s.user_count) > 0).length, [stats]);

  const groupedBySpectrum = useMemo(() => {
    const m: Record<string, Record<string, PersonaStat[]>> = {};
    for (const s of stats) {
      if (!m[s.primary_spectrum]) m[s.primary_spectrum] = {};
      const archKey = s.archetype_id;
      if (!m[s.primary_spectrum][archKey]) m[s.primary_spectrum][archKey] = [];
      m[s.primary_spectrum][archKey].push(s);
    }
    for (const spec in m) {
      for (const arch in m[spec]) {
        m[spec][arch].sort((a, b) => SUBCATEGORY_ORDER.indexOf(a.subcategory_id) - SUBCATEGORY_ORDER.indexOf(b.subcategory_id));
      }
    }
    return m;
  }, [stats]);

  const orderedSpectra = ['E', 'I', 'C', 'S', 'R'];

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="personas-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-stretch justify-center"
        onClick={onClose}
      >
        <motion.div
          key="personas-panel"
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 280 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-6xl my-2 sm:my-6 mx-2 sm:mx-4 rounded-2xl bg-gradient-to-br from-gray-900 via-gray-950 to-black border border-white/10 shadow-2xl overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/10 bg-gradient-to-r from-gray-900/90 to-gray-950/90 backdrop-blur-xl flex-shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              {selected && (
                <button
                  onClick={() => setSelected(null)}
                  className="p-2 rounded-lg hover:bg-white/10 transition text-gray-300"
                  aria-label="Voltar"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              )}
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-bold text-white truncate">
                  {selected
                    ? (isPt ? 'Detalhes da Persona' : 'Persona Details')
                    : (isPt ? 'As 120 Personas' : 'The 120 Personas')}
                </h2>
                <p className="text-[11px] text-gray-400 truncate">
                  {selected
                    ? `${selected.persona_code} · ${isPt ? selected.archetype_name : selected.archetype_name_en}`
                    : (isPt
                        ? `${populatedCount} de 120 ativas · ${totalUsers} pessoas`
                        : `${populatedCount} of 120 active · ${totalUsers} people`)}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/10 transition text-gray-300"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
              </div>
            ) : selected ? (
              <PersonaDetail
                persona={selected}
                isPt={isPt}
                matching={matching}
                matchingLoading={matchingLoading}
                isViewerPersona={selected.persona_code === viewerPersonaCode}
                onUserClick={(uname) => { onClose(); onUserClick?.(uname); }}
                totalUsersGlobal={totalUsers}
              />
            ) : (
              <PersonaGrid
                grouped={groupedBySpectrum}
                spectra={orderedSpectra}
                isPt={isPt}
                viewerPersonaCode={viewerPersonaCode}
                onSelect={setSelected}
              />
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

const PersonaGrid: React.FC<{
  grouped: Record<string, Record<string, PersonaStat[]>>;
  spectra: string[];
  isPt: boolean;
  viewerPersonaCode?: string | null;
  onSelect: (p: PersonaStat) => void;
}> = ({ grouped, spectra, isPt, viewerPersonaCode, onSelect }) => {
  return (
    <div className="px-4 sm:px-6 py-5 space-y-7">
      {spectra.map((spec) => {
        const archetypes = grouped[spec] || {};
        const archKeys = Object.keys(archetypes).sort();
        const totalInSpec = archKeys.reduce((sum, ak) =>
          sum + archetypes[ak].reduce((s, p) => s + Number(p.user_count), 0), 0);

        return (
          <section key={spec}>
            <div className={`relative rounded-2xl overflow-hidden mb-4 bg-gradient-to-r ${SPECTRUM_GRADIENT[spec]} p-4 sm:p-5 shadow-lg`}>
              <div className="absolute inset-0 bg-black/20" />
              <div className="relative flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="text-4xl sm:text-5xl font-black text-white/95 leading-none drop-shadow">
                    {spec}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-white/70">
                      {isPt ? 'Espectro' : 'Spectrum'}
                    </div>
                    <div className="text-base sm:text-lg font-bold text-white truncate">
                      {isPt ? SPECTRUM_PT[spec] : SPECTRUM_EN[spec]}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/15 backdrop-blur-sm text-white">
                  <Users className="w-3.5 h-3.5" />
                  <span className="text-xs font-bold">{totalInSpec}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {archKeys.map((archKey) => {
                const personas = archetypes[archKey];
                if (!personas?.length) return null;
                const archName = isPt ? personas[0].archetype_name : personas[0].archetype_name_en;
                return (
                  <div
                    key={archKey}
                    className={`rounded-2xl bg-white/5 hover:bg-white/8 border border-white/10 p-3 transition`}
                  >
                    <div className="flex items-center gap-2.5 mb-3 px-1">
                      <ArchetypeSymbol archetypeId={archKey} size={28} animated={false} />
                      <div className="min-w-0">
                        <div className="text-xs font-mono font-bold text-gray-300 tracking-widest">{archKey}</div>
                        <div className="text-sm font-semibold text-white truncate">{archName}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                      {personas.map((p) => {
                        const isMine = p.persona_code === viewerPersonaCode;
                        const color = SUBCATEGORY_COLOR[p.subcategory_id];
                        return (
                          <motion.button
                            key={p.persona_code}
                            whileHover={{ y: -2, scale: 1.04 }}
                            whileTap={{ scale: 0.96 }}
                            onClick={() => onSelect(p)}
                            className={`relative aspect-square rounded-xl border transition group ${
                              isMine
                                ? 'bg-white/15 border-white/40 shadow-lg'
                                : 'bg-white/5 border-white/10 hover:border-white/25 hover:bg-white/10'
                            }`}
                            style={isMine ? { boxShadow: `0 0 0 2px ${color}` } : undefined}
                            title={`${p.persona_code} — ${isPt ? p.subcategory_name : p.subcategory_name_en} (${p.user_count})`}
                          >
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
                              <ArchetypeSymbol
                                archetypeId={p.archetype_id}
                                subcategoryId={p.subcategory_id}
                                size={20}
                                animated={false}
                              />
                              <span
                                className="text-[9px] font-bold tracking-tight"
                                style={{ color }}
                              >
                                {p.subcategory_id}
                              </span>
                            </div>
                            {Number(p.user_count) > 0 && (
                              <span className="absolute -top-1 -right-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gray-900 text-white border border-white/20 shadow">
                                {p.user_count}
                              </span>
                            )}
                            {isMine && (
                              <Crown className="absolute -top-1 -left-1 w-3 h-3 text-amber-300 drop-shadow" />
                            )}
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
};

const PersonaDetail: React.FC<{
  persona: PersonaStat;
  isPt: boolean;
  matching: MatchingUser[];
  matchingLoading: boolean;
  isViewerPersona: boolean;
  totalUsersGlobal: number;
  onUserClick: (username: string) => void;
}> = ({ persona, isPt, matching, matchingLoading, isViewerPersona, totalUsersGlobal, onUserClick }) => {
  const color = SUBCATEGORY_COLOR[persona.subcategory_id];
  const spectrumName = isPt ? SPECTRUM_PT[persona.primary_spectrum] : SPECTRUM_EN[persona.primary_spectrum];
  const secondaryName = isPt ? SPECTRUM_PT[persona.secondary_spectrum] : SPECTRUM_EN[persona.secondary_spectrum];
  const pct = totalUsersGlobal > 0 ? ((Number(persona.user_count) / totalUsersGlobal) * 100) : 0;

  return (
    <div className="px-4 sm:px-6 py-6 space-y-5">
      <div
        className="relative rounded-3xl overflow-hidden border border-white/10 p-6 sm:p-8"
        style={{
          background: `radial-gradient(circle at 30% 20%, ${color}33, transparent 60%), linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))`,
        }}
      >
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
          <div
            className="flex-shrink-0 rounded-2xl p-5 border"
            style={{ borderColor: `${color}50`, background: `${color}15` }}
          >
            <ArchetypeSymbol
              archetypeId={persona.archetype_id}
              subcategoryId={persona.subcategory_id}
              size={96}
              animated={true}
            />
          </div>
          <div className="flex-1 min-w-0 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-2 mb-2 flex-wrap">
              <span className="text-3xl sm:text-4xl font-black tracking-wider" style={{ color }}>
                {persona.persona_code}
              </span>
              {isViewerPersona && (
                <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30 inline-flex items-center gap-1">
                  <Crown className="w-3 h-3" />
                  {isPt ? 'Sua persona' : 'Your persona'}
                </span>
              )}
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-white mb-1">
              {isPt ? persona.archetype_name : persona.archetype_name_en}
              <span className="text-gray-300 font-medium"> · {isPt ? persona.subcategory_name : persona.subcategory_name_en}</span>
            </h3>
            <p className="text-xs text-gray-400 mb-4">
              {spectrumName} <span className="text-gray-600">+</span> {secondaryName} <span className="text-gray-600">·</span> {persona.pair_name}
            </p>

            <div className="grid grid-cols-2 gap-2 max-w-md mx-auto sm:mx-0">
              <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">
                  {isPt ? 'Pessoas' : 'People'}
                </div>
                <div className="text-2xl font-black text-white tabular-nums">
                  {persona.user_count}
                </div>
              </div>
              <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">
                  {isPt ? 'Do total' : 'Of total'}
                </div>
                <div className="text-2xl font-black text-white tabular-nums">
                  {pct.toFixed(1)}<span className="text-base text-gray-400">%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white/5 border border-white/10 p-4 sm:p-5">
        <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
          <Users className="w-4 h-4 text-gray-400" />
          {isPt ? 'Pessoas com essa persona' : 'People with this persona'}
        </h4>
        {matchingLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
          </div>
        ) : matching.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">
            {isPt
              ? 'Nenhuma pessoa que você segue ou pública compartilha essa persona ainda.'
              : 'No followed or public user shares this persona yet.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {matching.map((u) => (
              <button
                key={u.user_id}
                onClick={() => onUserClick(u.username)}
                className="flex items-center gap-3 p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition text-left group"
              >
                <div className={`relative w-10 h-10 rounded-full overflow-hidden bg-gray-700 flex-shrink-0 ${getFrameStyle(u.avatar_frame)}`}>
                  {u.avatar_url ? (
                    <img src={u.avatar_url} alt={u.username} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300 text-sm font-bold">
                      {u.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-white truncate">{u.username}</span>
                    {u.plan_type === 'premium' && (
                      <Crown className="w-3 h-3 text-amber-300 flex-shrink-0" />
                    )}
                  </div>
                  <div className="text-[10px] text-gray-500">
                    {u.is_followed ? (isPt ? 'Seguindo' : 'Following') : (isPt ? 'Público' : 'Public')}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-gray-300 transition flex-shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PersonasModal;
