import { useState, useEffect, useMemo } from 'react';
import { Crown, Users, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useAuth } from '../lib/auth';
import OracleSheet from './OracleSheet';
import UserAvatar from './UserAvatar';
import ConnectionChip from './connection/ConnectionChip';
import { useConnectionScores } from '../hooks/useConnection';
import { fetchConnectionScores } from '../lib/connection';
import { NIGHT, PAPER, MIST, FOCUS_RING } from '../lib/oracleTheme';

interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
  plan_type: string;
  avatar_frame: string;
}

export type FriendsSort = 'connection' | 'az';

interface FollowersModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  // Mantida por compatibilidade: a lista não altera amizades, então nada
  // aqui dispara essa função — quem desfaz amizade é o perfil do amigo.
  onFollowChange?: () => void;
  // Ordem inicial. Sem ela: "Conexão" quando houver pelo menos um número.
  initialSort?: FriendsSort;
}

// Ids de uma vez (o teto de linhas de uma consulta). Amizades são poucas
// (a maioria tem menos de 100), então dá para ordenar a lista inteira.
const MAX_FRIENDS = 1000;
// Perfis por consulta (os ids vão na URL).
const PROFILE_CHUNK = 100;
// Linhas desenhadas por vez; "Carregar mais" mostra as seguintes.
const PAGE_SIZE = 30;

const byName = (a: Profile, b: Profile) => a.username.localeCompare(b.username, undefined, { sensitivity: 'base' });

// Antes mostrava duas listas separadas (quem segue / quem é seguido).
// Amizade é mútua, então agora é uma lista única — não existe mais
// "seguidor que eu não sigo de volta".
//
// Conexão (13/10/2026): cada linha mostra a SUA conexão com a pessoa (no
// perfil de outra pessoa também: a lista dela vira descoberta). A chave
// [Conexão | A–Z] ordena a lista inteira — antes a ordem A–Z valia só dentro
// de cada página de 20, porque as páginas vinham do banco uma a uma. Agora
// os ids vêm todos de uma vez e a paginação é só de desenho.
export default function FollowersModal({ isOpen, onClose, userId, initialSort }: FollowersModalProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { session } = useAuth();
  const myId = session?.user?.id ?? null;
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(PAGE_SIZE);
  // null = automático (Conexão quando houver número).
  const [sortChoice, setSortChoice] = useState<FriendsSort | null>(initialSort ?? null);

  const ids = useMemo(() => profiles.map((p) => p.id), [profiles]);
  const scores = useConnectionScores(ids);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const fetchProfiles = async () => {
      try {
        setLoading(true);

        const { data: friendshipData, error: friendshipError } = await supabase
          .from('friendships')
          .select('requester_id, addressee_id')
          .eq('status', 'accepted')
          .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
          .range(0, MAX_FRIENDS - 1);

        if (friendshipError) throw friendshipError;

        const friendIds = Array.from(
          new Set((friendshipData || []).map((f) => (f.requester_id === userId ? f.addressee_id : f.requester_id))),
        );

        if (friendIds.length === 0) {
          if (!cancelled) setProfiles([]);
          return;
        }

        const chunks: string[][] = [];
        for (let i = 0; i < friendIds.length; i += PROFILE_CHUNK) chunks.push(friendIds.slice(i, i + PROFILE_CHUNK));

        // A conexão vem junto com os perfis: assim a lista já abre na ordem
        // certa, sem pular quando os números chegam (o gancho dos chips lê
        // do mesmo cache). Sem conexão, a lista funciona igual (A–Z).
        const [results] = await Promise.all([
          Promise.all(chunks.map((chunk) => supabase.from('profiles').select('id, username, avatar_url, plan_type, avatar_frame').in('id', chunk))),
          myId ? fetchConnectionScores(friendIds.filter((id) => id !== myId)).catch(() => null) : Promise.resolve(null),
        ]);

        const rows: Profile[] = [];
        for (const result of results) {
          if (result.error) throw result.error;
          rows.push(...((result.data || []) as Profile[]));
        }
        if (!cancelled) {
          setProfiles(rows);
          setVisible(PAGE_SIZE);
        }
      } catch (error) {
        console.error('Error fetching profiles:', error);
        if (!cancelled) toast.error(t('profile.friendsLoadError'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchProfiles();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, userId, myId]);

  const hasScores = scores.size > 0;
  const mode: FriendsSort = hasScores && sortChoice !== 'az' ? 'connection' : 'az';

  // Conexão: maior % primeiro; no empate, mais títulos em comum. Quem ainda
  // não tem número vai para o fim, em ordem alfabética.
  const sorted = useMemo(() => {
    const list = [...profiles];
    if (mode === 'az') return list.sort(byName);
    return list.sort((a, b) => {
      const sa = scores.get(a.id);
      const sb = scores.get(b.id);
      if (sa && sb) return sb.pct - sa.pct || sb.sharedCount - sa.sharedCount || byName(a, b);
      if (sa) return -1;
      if (sb) return 1;
      return byName(a, b);
    });
  }, [profiles, scores, mode]);

  const handleProfileClick = (username: string) => {
    navigate(`/profile/${username}`);
    onClose();
  };

  const isFirstLoad = loading && profiles.length === 0;
  const shown = sorted.slice(0, visible);

  return (
    <OracleSheet
      open={isOpen}
      onClose={onClose}
      title={t('profile.friendsLabel', { defaultValue: 'Amigos' })}
      subtitle={profiles.length > 0 ? t('profile.friendsSubtitle') : undefined}
      size="md"
      bodyClassName="px-3 sm:px-4 py-3"
      contentKey={mode}
    >
      {isFirstLoad ? (
        <ul className="space-y-1" aria-busy="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <li key={i} className="flex items-center gap-3 px-2 py-2.5">
              <span className="w-11 h-11 rounded-full bg-white/10 animate-pulse" />
              <span className="h-4 w-32 rounded bg-white/10 animate-pulse" />
            </li>
          ))}
        </ul>
      ) : profiles.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <span className="mx-auto grid place-items-center w-14 h-14 rounded-2xl bg-violet-500/15 ring-1 ring-violet-400/30">
            <Users className="w-7 h-7 text-violet-300" aria-hidden />
          </span>
          <p className="mt-4 font-semibold" style={{ color: PAPER }}>
            {t('profile.noFriendsYet', { defaultValue: 'Nenhum amigo ainda' })}
          </p>
          <p className="mt-1 text-sm" style={{ color: MIST }}>
            {t('profile.noFriendsHint')}
          </p>
        </div>
      ) : (
        <>
          {/* A chave só aparece quando há o que ordenar por conexão. */}
          {hasScores && profiles.length > 1 && (
            <div className="flex items-center justify-between gap-3 px-2 pb-3">
              <div
                role="radiogroup"
                aria-label={t('connection.sort.label')}
                className="inline-flex shrink-0 p-1 rounded-full ring-1 ring-white/10"
                style={{ background: 'rgba(18,13,34,0.6)' }}
              >
                {(['connection', 'az'] as const).map((id) => {
                  const active = mode === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setSortChoice(id)}
                      className={`relative h-9 min-h-[36px] px-4 rounded-full text-[13px] font-semibold transition ${FOCUS_RING}`}
                      style={{ color: active ? NIGHT : MIST }}
                    >
                      {active && (
                        <motion.span
                          layoutId="friends-sort-pill"
                          className="absolute inset-0 rounded-full"
                          style={{ background: PAPER }}
                          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                        />
                      )}
                      <span className="relative">{id === 'connection' ? t('connection.sort.connection') : t('connection.sort.az')}</span>
                    </button>
                  );
                })}
              </div>
              <span className="text-[11px] leading-snug text-right" style={{ color: MIST }}>
                {t('connection.sort.hint')}
              </span>
            </div>
          )}

          <ul className="space-y-0.5">
            {shown.map((profile) => {
              const isPremiumFriend = profile.plan_type === 'premium';
              const score = scores.get(profile.id);
              const isMe = profile.id === myId;
              return (
                <li key={profile.id}>
                  <button
                    onClick={() => handleProfileClick(profile.username)}
                    className={`group w-full justify-start gap-3 px-2 py-2 rounded-xl text-left hover:bg-white/[0.05] transition ${FOCUS_RING}`}
                  >
                    <UserAvatar user={profile} size={44} />
                    <span className="flex-1 min-w-0 flex items-center gap-1.5">
                      <span className="truncate font-medium" style={{ color: PAPER }}>
                        @{profile.username}
                      </span>
                      {isPremiumFriend && <Crown className="w-4 h-4 shrink-0 text-amber-300" aria-label={t('settings.premium')} />}
                    </span>
                    {isMe ? (
                      <span className="shrink-0 text-xs" style={{ color: MIST }}>
                        {t('community.you')}
                      </span>
                    ) : (
                      score && (
                        // Os chips chegam juntos; entram com um fade curto.
                        <span className="shrink-0 animate-[fadeIn_0.35s_ease-out] motion-reduce:animate-none">
                          <ConnectionChip pct={score.pct} confidence={score.confidence} />
                        </span>
                      )
                    )}
                    <ChevronRight className="w-4 h-4 shrink-0 opacity-50 group-hover:opacity-100 transition" style={{ color: MIST }} aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {visible < sorted.length && (
        <div className="pt-3 pb-1 flex justify-center">
          <button
            onClick={() => setVisible((prev) => prev + PAGE_SIZE)}
            className={`inline-flex items-center gap-2 h-11 px-5 rounded-full border border-white/15 hover:border-white/35 hover:bg-white/5 text-sm font-medium transition ${FOCUS_RING}`}
            style={{ color: PAPER }}
          >
            {t('common.loadMore')}
          </button>
        </div>
      )}
    </OracleSheet>
  );
}
