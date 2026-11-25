import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Pencil, RotateCw, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import DirectorPage from '../components/director/DirectorPage';
import { BRASS, PANEL, useDirectorLang } from '../lib/directorUi';
import DirectorMfaCard from '../components/director/DirectorMfaCard';
import PosterArtPicker from '../components/director/PosterArtPicker';
import PosterEditor, { type EditablePoster } from '../components/director/PosterEditor';
import { useDirector } from '../contexts/DirectorContext';
import { NIGHT, PAPER, MIST, VELVET, FOCUS_RING } from '../lib/oracleTheme';
import { RARITY_META, RARITIES } from '../lib/posterJackpot';
import { tmdbImage } from '../lib/tmdbImage';
import { fetchPosterCatalogReview, type CurationPoster } from '../lib/posterCuration';
import {
  directorErrorText,
  ensureTitleInDb,
  fetchPosterImages,
  fetchTitleInfo,
  posterCreate,
  posterDelete,
  posterSetActive,
  searchTitles,
  titleKey,
  type PosterRarity,
  type SearchHit,
  type TitleInfo,
  type TmdbImage,
} from '../lib/directorTools';
import type { TitleType } from '../lib/tmdb';

// Pôsteres da roleta (/diretor/posteres, 16/11/2026).
//
// Pedido do Bruno: pôr pôsteres novos para sair na roleta do Poster Jackpot pelo
// próprio site. Busca-se o título, escolhe-se a arte (as do TMDB, pelo
// tmdb-proxy, que só mostra as imagens para a conta diretor) e a raridade. O
// pôster entra como rascunho (fora do sorteio) no lote do dia, com o número da
// raridade dado pelo banco (desde 25/11/2026 o menor número livre: o de um
// pôster apagado ou que mudou de raridade volta a ser usado); depois, "Pôr no
// sorteio". A curadoria
// (/curadoria/posteres) mostra os rascunhos ao lado dos outros para ver o
// conjunto antes de ligar.
//
// 25/11/2026 (pedido do Bruno):
//   • apagar um rascunho: o botão "Apagar" nos pôsteres fora do sorteio que
//     ninguém tem (antes só dava pelo "Desfazer" do Diário, e a tela não dizia);
//   • "Já em uso neste título": ao escolher o título, as capas que o site já
//     mostra em português e em inglês e os pôsteres dele que já existem, e as
//     mesmas marcas na grade das artes, para o pôster novo ser uma arte nova;
//   • editar: trocar a raridade e a arte de qualquer pôster da roleta
//     (director/PosterEditor.tsx), inclusive os que já estão no sorteio: a
//     seção "Na roleta" acha o pôster pelo nome do título.

const IMG = (path: string | null, size = 'w185') => (path ? tmdbImage(path, size) : '');

const RARITY_NAME: Record<'pt' | 'en', Record<PosterRarity, string>> = {
  pt: { common: 'Comum', rare: 'Raro', epic: 'Épico', legendary: 'Lendário' },
  en: { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' },
};

const COPY = {
  pt: {
    title: 'Pôsteres da roleta',
    lead: 'O pôster novo entra como rascunho, fora do sorteio, no lote de hoje. Veja o conjunto na curadoria e, quando estiver bom, ponha no sorteio: vale na hora para todo mundo.',
    newTitle: 'Pôster novo',
    searchPh: 'Nome do filme ou da série',
    pick: 'Escolher',
    loading: 'Trazendo o título e as artes…',
    noImages: 'O TMDB não tem outras artes para este título.',
    imagesFailed: 'Não consegui buscar as artes deste título no TMDB.',
    retryImages: 'Tentar de novo',
    existing: 'Pôsteres deste título',
    noneYet: 'Ainda nenhum pôster deste título.',
    inUse: 'Já em uso neste título',
    inUseLead: 'As capas que o site já mostra e os pôsteres que o título já tem. O pôster novo deve ser uma arte diferente destas.',
    covers: 'Capas do site',
    coverPt: 'em português',
    coverEn: 'em inglês',
    coverBoth: 'em português e em inglês (o título não tem capa própria em português)',
    coverNone: 'O título não tem capa guardada no banco.',
    edit: 'Editar',
    del: 'Apagar',
    delConfirm: 'Tocar de novo apaga',
    deleted: 'Rascunho apagado. Dá para desfazer no Diário.',
    owners: (n: number) => (n === 1 ? '1 pessoa tem' : `${n} pessoas têm`),
    reel: 'Na roleta',
    reelLead: 'Para mudar a raridade ou a arte de um pôster que já está no sorteio, procure pelo nome do título. A mudança vale na hora para quem o tem.',
    reelPh: 'Nome do título',
    reelNone: 'Nenhum pôster no sorteio com esse nome.',
    reelMore: (n: number) => `E mais ${n}. Escreva mais do nome para achar.`,
    offShelf: 'Este título não está em nenhuma prateleira dos oráculos.',
    art: 'A arte',
    used: 'já na roleta',
    rarity: 'A raridade',
    reason: 'Motivo (opcional, vai para o diário)',
    create: 'Criar rascunho',
    created: (n: number | undefined) => `Rascunho criado${n ? `: nº ${n}` : ''}. Ponha no sorteio quando quiser.`,
    drafts: 'Fora do sorteio',
    draftsLead: 'Rascunhos e pôsteres tirados do sorteio (os exclusivos do Pôster Poker não aparecem aqui).',
    noDrafts: 'Nenhum pôster fora do sorteio.',
    activate: 'Pôr no sorteio',
    deactivate: 'Tirar do sorteio',
    activated: 'No sorteio.',
    deactivated: 'Fora do sorteio.',
    inDraw: 'no sorteio',
    outDraw: 'fora do sorteio',
    curation: 'Ver na curadoria',
    cancel: 'Cancelar',
    needMfa: 'Criar, editar, apagar e pôr no sorteio pedem o código do app autenticador.',
    notInDb: 'Não deu para trazer este título para o banco agora.',
  },
  en: {
    title: 'Wheel posters',
    lead: 'A new poster goes in as a draft, out of the draw, in today\'s batch. Check the set in curation and, when it looks right, put it in the draw: it counts right away for everyone.',
    newTitle: 'New poster',
    searchPh: 'Movie or series name',
    pick: 'Pick',
    loading: 'Bringing the title and the artwork…',
    noImages: 'TMDB has no other artwork for this title.',
    imagesFailed: "I couldn't fetch this title's artwork from TMDB.",
    retryImages: 'Try again',
    existing: 'Posters of this title',
    noneYet: 'No poster of this title yet.',
    inUse: 'Already in use for this title',
    inUseLead: 'The covers the site already shows and the posters this title already has. The new poster should be a different artwork from these.',
    covers: 'Site covers',
    coverPt: 'in Portuguese',
    coverEn: 'in English',
    coverBoth: 'in Portuguese and English (the title has no cover of its own in Portuguese)',
    coverNone: 'The title has no cover stored in the database.',
    edit: 'Edit',
    del: 'Delete',
    delConfirm: 'Tap again to delete',
    deleted: 'Draft deleted. You can undo it in the Diary.',
    owners: (n: number) => (n === 1 ? '1 person has it' : `${n} people have it`),
    reel: 'In the wheel',
    reelLead: "To change the rarity or the artwork of a poster that's already in the draw, search by the title's name. The change counts right away for whoever has it.",
    reelPh: "Title's name",
    reelNone: 'No poster in the draw with that name.',
    reelMore: (n: number) => `And ${n} more. Type more of the name to find it.`,
    offShelf: 'This title is not on any oracle shelf.',
    art: 'Artwork',
    used: 'already in the wheel',
    rarity: 'Rarity',
    reason: 'Reason (optional, goes to the diary)',
    create: 'Create draft',
    created: (n: number | undefined) => `Draft created${n ? `: #${n}` : ''}. Put it in the draw whenever you like.`,
    drafts: 'Out of the draw',
    draftsLead: 'Drafts and posters taken out of the draw (Poster Poker exclusives are not shown here).',
    noDrafts: 'No poster out of the draw.',
    activate: 'Put in the draw',
    deactivate: 'Take out of the draw',
    activated: 'In the draw.',
    deactivated: 'Out of the draw.',
    inDraw: 'in the draw',
    outDraw: 'out of the draw',
    curation: 'See it in curation',
    cancel: 'Cancel',
    needMfa: 'Creating, editing, deleting and putting in the draw ask for the authenticator code.',
    notInDb: "Couldn't bring this title into the database right now.",
  },
} as const;

// imagesFailed: a lista de artes não veio (rede, limite de pedidos); a tela diz e deixa tentar de novo
type Chosen = { hit: SearchHit; info: TitleInfo | null; images: TmdbImage[] | null; imagesFailed?: boolean };

export default function DirectorPosters() {
  const lang = useDirectorLang();
  const c = COPY[lang];
  const director = useDirector();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [rarity, setRarity] = useState<PosterRarity>('common');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [catalog, setCatalog] = useState<CurationPoster[] | null>(null);
  const [toggling, setToggling] = useState<number | null>(null);
  // 25/11/2026: o pôster aberto no editor, o rascunho armado para apagar (o
  // segundo toque apaga), o que está sendo apagado e a busca da seção "Na roleta"
  const [editing, setEditing] = useState<EditablePoster | null>(null);
  const [armed, setArmed] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [reelQuery, setReelQuery] = useState('');

  const loadCatalog = useCallback(async () => {
    try {
      const data = await fetchPosterCatalogReview();
      setCatalog(data.posters);
    } catch (error) {
      console.error('Director posters catalog:', error);
      setCatalog([]);
    }
  }, []);
  useEffect(() => {
    if (director.isDirector) loadCatalog();
  }, [director.isDirector, loadCatalog]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    let alive = true;
    setSearching(true);
    const timer = window.setTimeout(() => {
      searchTitles(q)
        .then((found) => alive && setHits(found))
        .catch((error) => console.error('Director search:', error))
        .finally(() => alive && setSearching(false));
    }, 350);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  const fail = (error: unknown) => {
    console.error('Director posters action:', error);
    toast.error(directorErrorText(error, lang));
    director.refresh();
  };

  const usedPaths = useMemo(() => new Set((catalog || []).map((p) => p.file_path)), [catalog]);
  const offDraw = useMemo(() => (catalog || []).filter((p) => !p.is_active && p.exclusive === null), [catalog]);

  const choose = async (hit: SearchHit) => {
    setChosen({ hit, info: null, images: null });
    setImage(null);
    setReason('');
    try {
      const inDb = await ensureTitleInDb(hit.media, hit.id);
      if (!inDb) {
        toast.error(c.notInDb);
        setChosen(null);
        return;
      }
      const [info, images] = await Promise.all([
        fetchTitleInfo(hit.media, hit.id),
        fetchPosterImages(hit.media, hit.id).catch((error) => {
          console.error('Director poster images:', error);
          return null;
        }),
      ]);
      setChosen({ hit, info, images: images ?? [], imagesFailed: images === null });
    } catch (error) {
      fail(error);
      setChosen(null);
    }
  };

  // 24/11/2026: buscar de novo só as artes (o título e os pôsteres dele ficam)
  const reloadImages = async () => {
    if (!chosen) return;
    const hit = chosen.hit;
    setChosen({ ...chosen, images: null, imagesFailed: false });
    const images = await fetchPosterImages(hit.media, hit.id).catch((error) => {
      console.error('Director poster images:', error);
      return null;
    });
    setChosen((current) => (current && current.hit === hit ? { ...current, images: images ?? [], imagesFailed: images === null } : current));
  };

  const create = async () => {
    if (!chosen || !image) return;
    setBusy(true);
    try {
      const result = await posterCreate(chosen.hit.media, chosen.hit.id, rarity, image, reason);
      toast.success(c.created(result.serial));
      const info = await fetchTitleInfo(chosen.hit.media, chosen.hit.id);
      setChosen({ ...chosen, info });
      setImage(null);
      setReason('');
      await loadCatalog();
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (id: number, active: boolean) => {
    setToggling(id);
    try {
      const result = await posterSetActive(id, active);
      if (result.changed !== false) toast.success(active ? c.activated : c.deactivated);
      await loadCatalog();
      if (chosen) setChosen({ ...chosen, info: await fetchTitleInfo(chosen.hit.media, chosen.hit.id) });
    } catch (error) {
      fail(error);
    } finally {
      setToggling(null);
    }
  };

  // depois de editar ou apagar: a lista de fora do sorteio, a busca da roleta
  // e, se houver um título escolhido, os pôsteres dele
  const reloadAll = async () => {
    await loadCatalog();
    if (chosen) {
      const hit = chosen.hit;
      const info = await fetchTitleInfo(hit.media, hit.id).catch(() => null);
      if (info) setChosen((current) => (current && current.hit === hit ? { ...current, info } : current));
    }
  };

  const remove = async (id: number) => {
    if (armed !== id) {
      setArmed(id);
      return;
    }
    setArmed(null);
    setDeleting(id);
    try {
      await posterDelete(id);
      toast.success(c.deleted);
      await reloadAll();
    } catch (error) {
      fail(error);
    } finally {
      setDeleting(null);
    }
  };

  const ownersById = useMemo(() => new Map((catalog || []).map((p) => [p.id, p.owners])), [catalog]);
  const titleName = (p: CurationPoster) => `${(lang === 'pt' ? p.title_pt || p.title_en : p.title_en || p.title_pt) ?? `#${p.tmdb_id}`}${p.year ? ` (${p.year})` : ''}`;
  // "Na roleta": os pôsteres no sorteio cujo título bate com a busca
  const reelHits = useMemo(() => {
    const q = reelQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return (catalog || []).filter((p) => p.is_active && p.exclusive === null && `${p.title_pt ?? ''} ${p.title_en ?? ''}`.toLowerCase().includes(q));
  }, [catalog, reelQuery]);
  const REEL_MAX = 12;

  const canChange = director.mfa;
  type RowPoster = { id: number; rarity: string; serial: number | null; file_path: string; is_active: boolean; exclusive: string | null; owners?: number };
  // where: a que título o pôster pertence (o editor precisa para buscar as artes)
  const posterRow = (p: RowPoster, where: { media: TitleType; tmdbId: number; title: string }, label?: string) => {
    const meta = RARITY_META[p.rarity as PosterRarity];
    const owners = typeof p.owners === 'number' ? p.owners : ownersById.get(p.id) ?? 0;
    const ghost = { color: PAPER, border: '1px solid rgba(243,234,211,0.2)' };
    return (
      <li key={p.id} data-poster={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl p-2" style={PANEL}>
        <img src={IMG(p.file_path, 'w92')} alt="" loading="lazy" className="w-12 rounded object-cover shrink-0" style={{ height: 72, boxShadow: `0 0 0 2px ${meta?.color ?? MIST}` }} />
        <div className="min-w-0 flex-1 basis-32">
          {label && <p className="text-sm font-medium truncate" style={{ color: PAPER }}>{label}</p>}
          <p className="text-xs" style={{ color: meta?.color ?? MIST }}>
            {RARITY_NAME[lang][p.rarity as PosterRarity] ?? p.rarity} {p.serial ? `· nº ${p.serial}` : ''}
          </p>
          <p className="text-xs" style={{ color: MIST }}>
            {p.exclusive ? 'Pôster Poker' : p.is_active ? c.inDraw : c.outDraw}
            {owners > 0 && ` · ${c.owners(owners)}`}
          </p>
        </div>
        {!p.exclusive && (
          <div className="flex flex-wrap items-center justify-end gap-1.5 ml-auto">
            {/* apagar: só fora do sorteio e sem dono (o banco confere de novo) */}
            {!p.is_active && owners === 0 && (
              <button
                type="button"
                disabled={!canChange || deleting === p.id}
                onClick={() => remove(p.id)}
                onBlur={() => armed === p.id && setArmed(null)}
                className={`shrink-0 inline-flex items-center gap-1 h-10 min-h-0 px-3 rounded-full text-xs font-semibold disabled:opacity-40 ${FOCUS_RING}`}
                style={armed === p.id ? { background: '#DC2626', color: '#fff' } : { color: '#FCA5A5', border: '1px solid rgba(248,113,113,0.4)' }}
              >
                {deleting === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <Trash2 className="w-3.5 h-3.5" aria-hidden />}
                {armed === p.id ? c.delConfirm : c.del}
              </button>
            )}
            <button
              type="button"
              onClick={() => setEditing({ id: p.id, media: where.media, tmdbId: where.tmdbId, title: where.title, rarity: p.rarity as PosterRarity, serial: p.serial, file_path: p.file_path, is_active: p.is_active, owners })}
              className={`shrink-0 inline-flex items-center gap-1 h-10 min-h-0 px-3 rounded-full text-xs font-semibold ${FOCUS_RING}`}
              style={ghost}
            >
              <Pencil className="w-3.5 h-3.5" aria-hidden />
              {c.edit}
            </button>
            <button
              type="button"
              disabled={!canChange || toggling === p.id}
              onClick={() => toggle(p.id, !p.is_active)}
              className={`shrink-0 inline-flex items-center gap-1 h-10 min-h-0 px-3 rounded-full text-xs font-semibold disabled:opacity-40 ${FOCUS_RING}`}
              style={p.is_active ? { color: '#FCA5A5', border: '1px solid rgba(248,113,113,0.4)' } : { background: BRASS, color: NIGHT }}
            >
              {toggling === p.id && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />}
              {p.is_active ? c.deactivate : c.activate}
            </button>
          </div>
        )}
      </li>
    );
  };
  const catalogRow = (p: CurationPoster) => posterRow(p, { media: p.media_type, tmdbId: p.tmdb_id, title: titleName(p) }, titleName(p));

  return (
    <DirectorPage title={c.title} lead={c.lead}>
      {!director.mfa && <DirectorMfaCard lang={lang} need={2} className="mt-6" style={PANEL} />}

      {/* ---------- Pôster novo ---------- */}
      <section className="mt-6 rounded-2xl p-4 sm:p-5" style={{ ...PANEL, borderColor: 'rgba(245,196,81,0.25)' }} aria-labelledby="poster-new">
        <h2 id="poster-new" className="text-base font-semibold" style={{ color: PAPER }}>{c.newTitle}</h2>
        {!canChange && <p className="mt-1 text-xs" style={{ color: MIST }}>{c.needMfa}</p>}

        {!chosen && (
          <>
            <label className="mt-3 flex items-center gap-2 h-11 px-3 rounded-xl" style={{ background: VELVET, border: '1px solid rgba(243,234,211,0.12)' }}>
              <Search className="w-4 h-4 shrink-0" style={{ color: MIST }} aria-hidden />
              <span className="sr-only">{c.searchPh}</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={c.searchPh}
                className="flex-1 min-w-0 bg-transparent outline-none text-sm"
                style={{ color: PAPER }}
              />
              {searching && <Loader2 className="w-4 h-4 animate-spin" style={{ color: MIST }} aria-hidden />}
            </label>
            {hits.length > 0 && (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {hits.map((hit) => (
                  <li key={titleKey(hit.media, hit.id)} className="flex items-center gap-3 rounded-xl p-2" style={{ background: 'rgba(18,13,34,0.6)' }}>
                    {hit.poster ? (
                      <img src={IMG(hit.poster, 'w92')} alt="" loading="lazy" className="w-10 rounded object-cover shrink-0" style={{ height: 60 }} />
                    ) : (
                      <span className="w-10 rounded shrink-0" style={{ height: 60, background: VELVET }} />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate" style={{ color: PAPER }}>{hit.title}</p>
                      <p className="text-xs" style={{ color: MIST }}>{hit.year ?? ''}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => choose(hit)}
                      className={`shrink-0 h-10 min-h-0 px-3 rounded-full text-xs font-semibold ${FOCUS_RING}`}
                      style={{ background: BRASS, color: NIGHT }}
                    >
                      {c.pick}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {chosen && (
          <div className="mt-3">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold" style={{ color: PAPER }}>
                {chosen.hit.title} {chosen.hit.year && <span style={{ color: MIST }}>({chosen.hit.year})</span>}
              </p>
              <button
                type="button"
                onClick={() => setChosen(null)}
                className={`inline-flex items-center gap-1 h-10 min-h-0 px-3 rounded-full text-xs ${FOCUS_RING}`}
                style={{ color: MIST, border: '1px solid rgba(243,234,211,0.14)' }}
              >
                <X className="w-3.5 h-3.5" aria-hidden />
                {c.cancel}
              </button>
            </div>

            {!chosen.info || !chosen.images ? (
              <p className="mt-3 flex items-center gap-2 text-sm" style={{ color: MIST }}>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                {c.loading}
              </p>
            ) : (
              <>
                {chosen.info.shelves.length === 0 && (
                  <p className="mt-2 text-xs" style={{ color: '#FCD34D' }}>{c.offShelf}</p>
                )}
                {/* 25/11/2026: o que o título já usa — as capas do site (pt e en) e os
                    pôsteres que já existem — para a arte nova ser mesmo nova */}
                <div className="mt-4 rounded-xl p-3" style={{ background: 'rgba(18,13,34,0.5)', border: '1px solid rgba(243,234,211,0.08)' }} data-in-use>
                  <h3 className="text-sm font-semibold" style={{ color: PAPER }}>{c.inUse}</h3>
                  <p className="mt-0.5 text-xs" style={{ color: MIST }}>{c.inUseLead}</p>
                  <p className="mt-3 text-xs font-semibold" style={{ color: PAPER }}>{c.covers}</p>
                  {(() => {
                    const { pt, en } = chosen.info.covers;
                    // sem capa própria em português (ou igual), o site mostra a de inglês nos dois idiomas
                    const same = Boolean(en) && (!pt || pt === en);
                    const list: { path: string; text: string; key: string }[] = same
                      ? [{ path: en as string, text: c.coverBoth, key: 'both' }]
                      : [
                          ...(pt ? [{ path: pt, text: c.coverPt, key: 'pt' }] : []),
                          ...(en ? [{ path: en, text: c.coverEn, key: 'en' }] : []),
                        ];
                    if (list.length === 0) return <p className="mt-1 text-xs" style={{ color: MIST }}>{c.coverNone}</p>;
                    return (
                      <ul className="mt-2 flex flex-wrap gap-3">
                        {list.map((cover) => (
                          <li key={cover.key} data-cover={cover.key} className="flex items-center gap-2.5 max-w-[16rem]">
                            <img src={IMG(cover.path, 'w154')} alt="" loading="lazy" className="w-16 rounded-md object-cover shrink-0" style={{ aspectRatio: '2 / 3', background: VELVET, boxShadow: '0 0 0 1px rgba(243,234,211,0.18)' }} />
                            <span className="text-xs leading-snug" style={{ color: MIST }}>{cover.text}</span>
                          </li>
                        ))}
                      </ul>
                    );
                  })()}
                  <p className="mt-4 text-xs font-semibold" style={{ color: PAPER }}>{c.existing}</p>
                  {chosen.info.posters.length === 0 ? (
                    <p className="mt-1 text-xs" style={{ color: MIST }}>{c.noneYet}</p>
                  ) : (
                    <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                      {chosen.info.posters.map((p) => posterRow(p, { media: chosen.hit.media, tmdbId: chosen.hit.id, title: `${chosen.hit.title}${chosen.hit.year ? ` (${chosen.hit.year})` : ''}` }))}
                    </ul>
                  )}
                </div>

                <h3 className="mt-5 text-sm font-semibold" style={{ color: PAPER }}>{c.art}</h3>
                {/* 24/11/2026: a grade das artes virou director/PosterArtPicker (todas as
                    artes, filtro por idioma, miniaturas com estado, prévia e o campo
                    de colar o link). Erro ao buscar a lista não é mais "sem artes". */}
                {chosen.imagesFailed && (
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs" style={{ color: '#FCA5A5' }}>
                    {c.imagesFailed}
                    <button
                      type="button"
                      onClick={reloadImages}
                      className={`inline-flex items-center gap-1.5 h-8 min-h-0 px-3 rounded-full text-xs font-semibold ${FOCUS_RING}`}
                      style={{ color: PAPER, border: '1px solid rgba(243,234,211,0.25)' }}
                    >
                      <RotateCw className="w-3.5 h-3.5" aria-hidden />
                      {c.retryImages}
                    </button>
                  </p>
                )}
                {!chosen.imagesFailed && chosen.images.length === 0 && (
                  <p className="mt-1 text-xs" style={{ color: MIST }}>{c.noImages}</p>
                )}
                <PosterArtPicker lang={lang} images={chosen.images} usedPaths={usedPaths} value={image} onChange={setImage} accent={RARITY_META[rarity].color} covers={chosen.info.covers} />

                <h3 className="mt-5 text-sm font-semibold" style={{ color: PAPER }}>{c.rarity}</h3>
                <div role="radiogroup" aria-label={c.rarity} className="mt-2 flex flex-wrap gap-2">
                  {RARITIES.slice().reverse().map((r) => (
                    <button
                      key={r}
                      type="button"
                      role="radio"
                      aria-checked={rarity === r}
                      onClick={() => setRarity(r)}
                      className={`h-10 min-h-0 px-4 rounded-full text-sm font-semibold ${FOCUS_RING}`}
                      style={rarity === r ? { background: RARITY_META[r].color, color: NIGHT } : { background: VELVET, color: RARITY_META[r].color, border: `1px solid ${RARITY_META[r].color}55` }}
                    >
                      {RARITY_NAME[lang][r]}
                    </button>
                  ))}
                </div>

                <label className="mt-4 block text-xs" style={{ color: MIST }}>
                  {c.reason}
                  <input
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    maxLength={300}
                    className={`mt-1 w-full h-10 px-3 rounded-lg text-sm ${FOCUS_RING}`}
                    style={{ background: VELVET, color: PAPER, border: '1px solid rgba(243,234,211,0.12)' }}
                  />
                </label>
                <button
                  type="button"
                  disabled={!canChange || !image || busy}
                  onClick={create}
                  className={`mt-4 inline-flex items-center gap-2 h-11 px-5 rounded-full text-sm font-semibold disabled:opacity-40 ${FOCUS_RING}`}
                  style={{ background: BRASS, color: NIGHT }}
                >
                  {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
                  {c.create}
                </button>
              </>
            )}
          </div>
        )}
      </section>

      {/* ---------- Fora do sorteio ---------- */}
      <section className="mt-6 rounded-2xl p-4 sm:p-5" style={PANEL} aria-labelledby="poster-off">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="poster-off" className="text-base font-semibold" style={{ color: PAPER }}>{c.drafts}</h2>
          <Link to="/curadoria/posteres" className={`text-sm underline underline-offset-4 min-h-[44px] inline-flex items-center ${FOCUS_RING}`} style={{ color: BRASS }}>
            {c.curation}
          </Link>
        </div>
        <p className="mt-1 text-xs" style={{ color: MIST }}>{c.draftsLead}</p>
        {catalog === null ? (
          <Loader2 className="mt-4 w-5 h-5 animate-spin" style={{ color: MIST }} aria-label="…" />
        ) : offDraw.length === 0 ? (
          <p className="mt-3 text-sm" style={{ color: MIST }}>{c.noDrafts}</p>
        ) : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">{offDraw.map(catalogRow)}</ul>
        )}
      </section>

      {/* ---------- Na roleta (25/11/2026): achar um pôster do sorteio para editar ---------- */}
      <section className="mt-6 rounded-2xl p-4 sm:p-5" style={PANEL} aria-labelledby="poster-reel">
        <h2 id="poster-reel" className="text-base font-semibold" style={{ color: PAPER }}>{c.reel}</h2>
        <p className="mt-1 text-xs" style={{ color: MIST }}>{c.reelLead}</p>
        <label className="mt-3 flex items-center gap-2 h-11 px-3 rounded-xl" style={{ background: VELVET, border: '1px solid rgba(243,234,211,0.12)' }}>
          <Search className="w-4 h-4 shrink-0" style={{ color: MIST }} aria-hidden />
          <span className="sr-only">{c.reelPh}</span>
          <input
            value={reelQuery}
            onChange={(event) => setReelQuery(event.target.value)}
            placeholder={c.reelPh}
            className="flex-1 min-w-0 bg-transparent outline-none text-sm"
            style={{ color: PAPER }}
          />
        </label>
        {reelQuery.trim().length >= 2 &&
          (reelHits.length === 0 ? (
            <p className="mt-3 text-sm" style={{ color: MIST }}>{c.reelNone}</p>
          ) : (
            <>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">{reelHits.slice(0, REEL_MAX).map(catalogRow)}</ul>
              {reelHits.length > REEL_MAX && <p className="mt-2 text-xs" style={{ color: MIST }}>{c.reelMore(reelHits.length - REEL_MAX)}</p>}
            </>
          ))}
      </section>

      <PosterEditor lang={lang} poster={editing} usedPaths={usedPaths} onClose={() => setEditing(null)} onSaved={reloadAll} />
    </DirectorPage>
  );
}
