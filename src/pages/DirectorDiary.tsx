import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import DirectorPage from '../components/director/DirectorPage';
import { BRASS, PANEL, useDirectorLang } from '../lib/directorUi';
import DirectorMfaCard from '../components/director/DirectorMfaCard';
import { useDirector } from '../contexts/DirectorContext';
import { MOOD_BY_KEY } from '../lib/moods';
import { ORACLE_BY_ID, PAPER, MIST, FOCUS_RING, type OracleId } from '../lib/oracleTheme';
import { directorErrorText, fetchAudit, fetchTitleCards, undoAudit, type AuditEntry, type TitleCard } from '../lib/directorTools';
import type { TitleType } from '../lib/tmdb';

// O diário da Conta Diretor (/diretor/diario, 16/11/2026): tudo o que esta conta
// mudou no site, do mais novo ao mais velho, com o motivo e o desfazer. O banco
// só desfaz se nada mudou depois (senão apagaria a mudança seguinte) e nunca
// apaga um pôster que alguém já teve. O diário em si só aceita linhas novas.

const COPY = {
  pt: {
    title: 'Diário',
    lead: 'Cada mudança feita por esta conta, com o antes e o depois guardados no banco. Desfazer também vira uma linha nova.',
    empty: 'Nada por aqui ainda.',
    more: 'Mais antigas',
    undo: 'Desfazer',
    undoConfirm: 'Tocar de novo desfaz',
    undone: 'Desfeito.',
    wasUndone: 'desfeito',
    actions: {
      'pool.add': 'Pôs na prateleira',
      'pool.remove': 'Tirou da prateleira',
      'pool.move': 'Mudou de prateleira',
      'poster.create': 'Criou o pôster',
      'poster.activate': 'Pôs no sorteio',
      'poster.deactivate': 'Tirou do sorteio',
      'poster.update': 'Editou o pôster',
      'poster.delete': 'Apagou o rascunho',
      'role.self_revoke': 'Largou o papel',
      undo: 'Desfez',
    } as Record<string, string>,
  },
  en: {
    title: 'Diary',
    lead: 'Every change made by this account, with the before and after kept in the database. Undoing also becomes a new line.',
    empty: 'Nothing here yet.',
    more: 'Older',
    undo: 'Undo',
    undoConfirm: 'Tap again to undo',
    undone: 'Undone.',
    wasUndone: 'undone',
    actions: {
      'pool.add': 'Added to shelf',
      'pool.remove': 'Removed from shelf',
      'pool.move': 'Moved shelf',
      'poster.create': 'Created poster',
      'poster.activate': 'Put in the draw',
      'poster.deactivate': 'Took out of the draw',
      'poster.update': 'Edited poster',
      'poster.delete': 'Deleted draft',
      'role.self_revoke': 'Gave up the role',
      undo: 'Undid',
    } as Record<string, string>,
  },
} as const;

const RARITY: Record<string, Record<'pt' | 'en', string>> = {
  common: { pt: 'comum', en: 'common' },
  rare: { pt: 'raro', en: 'rare' },
  epic: { pt: 'épico', en: 'epic' },
  legendary: { pt: 'lendário', en: 'legendary' },
};

export default function DirectorDiary() {
  const lang = useDirectorLang();
  const c = COPY[lang];
  const { t } = useTranslation();
  const director = useDirector();
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [titles, setTitles] = useState<Map<string, TitleCard>>(new Map());
  const [hasMore, setHasMore] = useState(false);
  const [armed, setArmed] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const shelfName = (value: unknown) => {
    if (typeof value !== 'string') return '';
    const [card, mood] = value.split('/');
    const oracle = ORACLE_BY_ID[card as OracleId]?.name ?? card;
    const moodLabel = MOOD_BY_KEY[mood] ? t(MOOD_BY_KEY[mood].labelKey) : mood;
    return `${oracle} · ${moodLabel}`;
  };

  const withTitles = useCallback(
    async (list: AuditEntry[]) => {
      const refs = list
        .map((e) => (e.kind === 'recommendation_pools' && e.target ? e.target.split(':') : e.kind === 'poster_items' && e.meta ? [String(e.meta.media_type), String(e.meta.tmdb_id)] : null))
        .filter((r): r is string[] => Array.isArray(r) && (r[0] === 'movie' || r[0] === 'tv') && Number(r[1]) > 0)
        .map((r) => ({ media: r[0] as TitleType, id: Number(r[1]) }));
      if (refs.length === 0) return;
      try {
        const found = await fetchTitleCards(refs, lang);
        setTitles((current) => new Map([...current, ...found]));
      } catch (error) {
        console.error('Director diary titles:', error);
      }
    },
    [lang],
  );

  const load = useCallback(
    async (beforeId?: number) => {
      try {
        const list = await fetchAudit(beforeId);
        setEntries((current) => (beforeId && current ? [...current, ...list] : list));
        setHasMore(list.length === 50);
        withTitles(list);
      } catch (error) {
        console.error('Director diary:', error);
        setEntries([]);
      }
    },
    [withTitles],
  );
  useEffect(() => {
    if (director.isDirector) load();
  }, [director.isDirector, load]);

  const titleOf = (entry: AuditEntry): string => {
    let media: string | null = null;
    let id: number | null = null;
    if (entry.kind === 'recommendation_pools' && entry.target) {
      [media] = entry.target.split(':');
      id = Number(entry.target.split(':')[1]);
    } else if (entry.kind === 'poster_items' && entry.meta) {
      media = String(entry.meta.media_type);
      id = Number(entry.meta.tmdb_id);
    }
    if (!media || !id) return entry.target ?? '';
    return titles.get(`${media}:${id}`)?.title ?? `#${id}`;
  };

  const detailOf = (entry: AuditEntry): string => {
    const meta = entry.meta || {};
    if (entry.kind === 'recommendation_pools') {
      if (entry.action === 'pool.move') return `${shelfName(meta.from)} → ${shelfName(meta.to)}`;
      return shelfName(meta.to ?? meta.from);
    }
    if (entry.kind === 'poster_items') {
      const rarity = RARITY[String(meta.rarity)]?.[lang] ?? '';
      return `${rarity}${meta.serial ? ` · nº ${meta.serial}` : ''}`;
    }
    return '';
  };

  const undo = async (entry: AuditEntry) => {
    if (armed !== entry.id) {
      setArmed(entry.id);
      return;
    }
    setBusy(entry.id);
    try {
      await undoAudit(entry.id);
      toast.success(c.undone);
      setArmed(null);
      await load();
    } catch (error) {
      console.error('Director undo:', error);
      toast.error(directorErrorText(error, lang));
      director.refresh();
    } finally {
      setBusy(null);
    }
  };

  const when = (iso: string) =>
    new Intl.DateTimeFormat(lang === 'pt' ? 'pt-BR' : 'en-US', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso));

  return (
    <DirectorPage title={c.title} lead={c.lead}>
      {(!director.mfa || !director.recent) && (
        <DirectorMfaCard lang={lang} need={director.mfa ? 3 : 2} className="mt-6" style={PANEL} />
      )}
      {entries === null ? (
        <div className="mt-10 grid place-items-center">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: MIST }} aria-label="…" />
        </div>
      ) : entries.length === 0 ? (
        <p className="mt-8 text-sm" style={{ color: MIST }}>{c.empty}</p>
      ) : (
        <ol className="mt-6 grid gap-2">
          {entries.map((entry) => {
            const canUndo = entry.reversible && !entry.undone_at && director.mfa;
            return (
              <li key={entry.id} className="rounded-xl p-3 sm:p-4 flex flex-wrap items-start gap-3" style={PANEL}>
                <div className="min-w-0 flex-1">
                  <p className="text-xs tabular-nums" style={{ color: MIST }}>
                    #{entry.id} · {when(entry.at)}
                    {entry.undone_at && <span style={{ color: '#FCA5A5' }}> · {c.wasUndone}</span>}
                  </p>
                  <p className="mt-0.5 text-sm" style={{ color: PAPER }}>
                    <span className="font-semibold" style={{ color: BRASS }}>{c.actions[entry.action] ?? entry.action}</span>{' '}
                    {entry.action !== 'role.self_revoke' && titleOf(entry)}
                  </p>
                  {detailOf(entry) && <p className="text-xs" style={{ color: MIST }}>{detailOf(entry)}</p>}
                  {entry.reason && <p className="mt-1 text-xs italic" style={{ color: MIST }}>“{entry.reason}”</p>}
                </div>
                {entry.reversible && !entry.undone_at && (
                  <button
                    type="button"
                    disabled={!canUndo || busy === entry.id}
                    onClick={() => undo(entry)}
                    onBlur={() => armed === entry.id && setArmed(null)}
                    className={`shrink-0 inline-flex items-center gap-1 h-10 min-h-0 px-3 rounded-full text-xs font-semibold disabled:opacity-40 ${FOCUS_RING}`}
                    style={armed === entry.id ? { background: '#DC2626', color: '#fff' } : { color: PAPER, border: '1px solid rgba(243,234,211,0.2)' }}
                  >
                    {busy === entry.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <RotateCcw className="w-3.5 h-3.5" aria-hidden />}
                    {armed === entry.id ? c.undoConfirm : c.undo}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {hasMore && entries && (
        <button
          type="button"
          onClick={() => load(entries[entries.length - 1]?.id)}
          className={`mt-4 h-11 px-4 rounded-full text-sm ${FOCUS_RING}`}
          style={{ color: PAPER, border: '1px solid rgba(243,234,211,0.2)' }}
        >
          {c.more}
        </button>
      )}
    </DirectorPage>
  );
}
