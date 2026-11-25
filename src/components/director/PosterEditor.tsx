import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ImagePlus, Loader2, RotateCw, Users } from 'lucide-react';
import { toast } from 'sonner';
import OracleSheet from '../OracleSheet';
import DirectorMfaCard from './DirectorMfaCard';
import PosterArtPicker from './PosterArtPicker';
import { useDirector } from '../../contexts/DirectorContext';
import { BRASS, PANEL } from '../../lib/directorUi';
import { NIGHT, PAPER, MIST, VELVET, FOCUS_RING } from '../../lib/oracleTheme';
import { RARITY_META, RARITIES } from '../../lib/posterJackpot';
import { tmdbImage } from '../../lib/tmdbImage';
import {
  directorErrorText,
  fetchPosterImages,
  fetchTitleInfo,
  posterUpdate,
  type Lang,
  type PosterRarity,
  type TitleCovers,
  type TmdbImage,
} from '../../lib/directorTools';
import type { TitleType } from '../../lib/tmdb';

// Editar um pôster da roleta (Sala do Diretor, /diretor/posteres; 25/11/2026).
//
// Pedido do Bruno: "Faça com que seja possível alterar raridade e inclusive a
// imagem de pôsteres já em uso na roleta, alterando para os usuários que o
// possuem." A coleção de cada pessoa aponta para o pôster, então a mudança
// vale na hora para quem o tem (coleção, pôster equipado, trocas). O histórico
// dos giros não é reescrito. Se alguém tem o pôster, o banco pede o código do
// app digitado nos últimos 15 minutos (nível 3): o cartão do código aparece
// aqui mesmo. Dá para desfazer pelo Diário.

export interface EditablePoster {
  id: number;
  media: TitleType;
  tmdbId: number;
  title: string;
  rarity: PosterRarity;
  serial: number | null;
  file_path: string;
  is_active: boolean;
  // quantas pessoas têm (0 = ninguém)
  owners: number;
}

const RARITY_NAME: Record<Lang, Record<PosterRarity, string>> = {
  pt: { common: 'Comum', rare: 'Raro', epic: 'Épico', legendary: 'Lendário' },
  en: { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' },
};

const COPY = {
  pt: {
    title: 'Editar pôster',
    inDraw: 'no sorteio',
    outDraw: 'fora do sorteio',
    owners: (n: number) => (n === 1 ? '1 pessoa tem este pôster. A mudança aparece na coleção dela na hora.' : `${n} pessoas têm este pôster. A mudança aparece na coleção delas na hora.`),
    noOwners: 'Ninguém tem este pôster ainda.',
    rarity: 'Raridade',
    rarityNote: 'Ao mudar de raridade o pôster ganha um número novo, o próximo da raridade nova.',
    art: 'A arte',
    changeArt: 'Trocar a arte',
    keepArt: 'Ficar com a arte atual',
    loadingArt: 'Trazendo as artes do título…',
    artFailed: 'Não consegui buscar as artes deste título no TMDB. Dá para colar o link da arte.',
    retry: 'Tentar de novo',
    summary: 'O que muda',
    nothing: 'Nada mudou ainda.',
    newArt: 'Arte nova',
    reason: 'Motivo (opcional, vai para o diário)',
    save: 'Salvar',
    saved: 'Pôster atualizado.',
    unchanged: 'Nada mudou.',
    needRecent: 'Como alguém tem este pôster, o banco pede o código do app digitado há menos de 15 minutos.',
    needMfa: 'Editar pede o código do app autenticador.',
    history: 'O histórico dos giros não muda: quem tirou este pôster continua com o giro registrado na raridade do dia.',
  },
  en: {
    title: 'Edit poster',
    inDraw: 'in the draw',
    outDraw: 'out of the draw',
    owners: (n: number) => (n === 1 ? '1 person has this poster. The change shows in their collection right away.' : `${n} people have this poster. The change shows in their collections right away.`),
    noOwners: 'Nobody has this poster yet.',
    rarity: 'Rarity',
    rarityNote: 'Changing rarity gives the poster a new number, the next one in the new rarity.',
    art: 'Artwork',
    changeArt: 'Change the artwork',
    keepArt: 'Keep the current artwork',
    loadingArt: "Fetching the title's artwork…",
    artFailed: "I couldn't fetch this title's artwork from TMDB. You can paste the artwork link.",
    retry: 'Try again',
    summary: 'What changes',
    nothing: 'Nothing changed yet.',
    newArt: 'New artwork',
    reason: 'Reason (optional, goes to the diary)',
    save: 'Save',
    saved: 'Poster updated.',
    unchanged: 'Nothing changed.',
    needRecent: 'Since someone has this poster, the database asks for the app code entered less than 15 minutes ago.',
    needMfa: 'Editing asks for the authenticator code.',
    history: "Pull history doesn't change: whoever drew this poster keeps the pull recorded at the rarity of that day.",
  },
} as const;

interface PosterEditorProps {
  lang: Lang;
  // null = fechado
  poster: EditablePoster | null;
  // todas as artes que já estão na roleta (a atual do pôster inclusive)
  usedPaths: Set<string>;
  onClose: () => void;
  onSaved: () => void;
}

type Art = { images: TmdbImage[]; covers: TitleCovers; failed: boolean };

export default function PosterEditor({ lang, poster, usedPaths, onClose, onSaved }: PosterEditorProps) {
  const c = COPY[lang];
  const director = useDirector();
  const [rarity, setRarity] = useState<PosterRarity>('common');
  const [image, setImage] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [picking, setPicking] = useState(false);
  const [art, setArt] = useState<Art | null>(null);
  const [busy, setBusy] = useState(false);

  // pôster novo na gaveta: tudo de volta ao que ele é hoje
  const posterId = poster?.id ?? null;
  // o pôster aberto AGORA (a lista de artes de um pôster não cai no seguinte)
  const openId = useRef(posterId);
  openId.current = posterId;
  useEffect(() => {
    if (!poster) return;
    setRarity(poster.rarity);
    setImage(null);
    setReason('');
    setPicking(false);
    setArt(null);
    // só quando troca de pôster (o objeto é recriado a cada recarga da lista)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posterId]);

  const loadArt = async () => {
    if (!poster) return;
    const id = poster.id;
    setArt(null);
    // as capas vêm junto (para a grade marcar o que o site já mostra); se as
    // capas falharem, a grade só fica sem as etiquetas
    const [images, info] = await Promise.all([
      fetchPosterImages(poster.media, poster.tmdbId).catch((error) => {
        console.error('Director poster images:', error);
        return null;
      }),
      fetchTitleInfo(poster.media, poster.tmdbId).catch(() => null),
    ]);
    if (openId.current !== id) return;
    setArt({ images: images ?? [], covers: info?.covers ?? { pt: null, en: null }, failed: images === null });
  };

  const openPicker = () => {
    setPicking(true);
    if (!art) loadArt();
  };
  const closePicker = () => {
    setPicking(false);
    setImage(null);
  };

  if (!poster) return null;

  const rarityChanged = rarity !== poster.rarity;
  const artChanged = Boolean(image && image !== poster.file_path);
  const changed = rarityChanged || artChanged;
  const owned = poster.owners > 0;
  // quem tem o pôster vê a mudança: o banco pede o código recente
  const needsRecent = owned && !director.recent;
  const canSave = changed && director.mfa && !needsRecent && !busy;
  const meta = RARITY_META[poster.rarity];

  const save = async () => {
    if (!changed) return;
    setBusy(true);
    try {
      const result = await posterUpdate(poster.id, { rarity: rarityChanged ? rarity : null, filePath: artChanged ? image : null }, reason);
      toast.success(result.changed === false ? c.unchanged : c.saved);
      onSaved();
      onClose();
    } catch (error) {
      console.error('Director poster update:', error);
      toast.error(directorErrorText(error, lang));
      director.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <OracleSheet
      open
      onClose={onClose}
      title={c.title}
      subtitle={poster.title}
      size="lg"
      escapeEnabled={!busy}
      contentKey={poster.id}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            disabled={!canSave}
            onClick={save}
            className={`inline-flex items-center gap-2 h-11 px-6 rounded-full text-sm font-semibold disabled:opacity-40 ${FOCUS_RING}`}
            style={{ background: BRASS, color: NIGHT }}
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
            {c.save}
          </button>
        </div>
      }
    >
      {/* ---------- O pôster hoje ---------- */}
      <div className="flex items-start gap-4">
        <img
          src={tmdbImage(poster.file_path, 'w185')}
          alt=""
          className="w-24 shrink-0 rounded-lg object-cover"
          style={{ aspectRatio: '2 / 3', boxShadow: `0 0 0 2px ${meta.color}`, background: VELVET }}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold" style={{ color: meta.color }}>
            {RARITY_NAME[lang][poster.rarity]}
            {poster.serial ? ` · nº ${poster.serial}` : ''}
          </p>
          <p className="mt-0.5 text-xs" style={{ color: MIST }}>{poster.is_active ? c.inDraw : c.outDraw}</p>
          <p className="mt-2 flex items-start gap-2 text-[13px] leading-snug" style={{ color: owned ? '#FCD34D' : MIST }} data-owners={poster.owners}>
            <Users className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
            {owned ? c.owners(poster.owners) : c.noOwners}
          </p>
        </div>
      </div>

      {!director.mfa && (
        <>
          <p className="mt-4 text-xs" style={{ color: MIST }}>{c.needMfa}</p>
          <DirectorMfaCard lang={lang} need={owned ? 3 : 2} className="mt-2" style={PANEL} />
        </>
      )}
      {director.mfa && needsRecent && (
        <>
          <p className="mt-4 text-xs" style={{ color: '#FCD34D' }} data-need-recent>{c.needRecent}</p>
          <DirectorMfaCard lang={lang} need={3} className="mt-2" style={PANEL} />
        </>
      )}

      {/* ---------- Raridade ---------- */}
      <h3 className="mt-6 text-sm font-semibold" style={{ color: PAPER }}>{c.rarity}</h3>
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
      {rarityChanged && <p className="mt-2 text-xs" style={{ color: MIST }}>{c.rarityNote}</p>}

      {/* ---------- Arte ---------- */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold" style={{ color: PAPER }}>{c.art}</h3>
        <button
          type="button"
          onClick={picking ? closePicker : openPicker}
          aria-expanded={picking}
          className={`inline-flex items-center gap-1.5 h-10 min-h-0 px-4 rounded-full text-xs font-semibold ${FOCUS_RING}`}
          style={{ color: PAPER, border: '1px solid rgba(243,234,211,0.2)' }}
        >
          {!picking && <ImagePlus className="w-4 h-4" aria-hidden />}
          {picking ? c.keepArt : c.changeArt}
        </button>
      </div>
      {picking &&
        (art === null ? (
          <p className="mt-3 flex items-center gap-2 text-sm" style={{ color: MIST }}>
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
            {c.loadingArt}
          </p>
        ) : (
          <>
            {art.failed && (
              <p className="mt-2 flex flex-wrap items-center gap-2 text-xs" style={{ color: '#FCA5A5' }}>
                {c.artFailed}
                <button
                  type="button"
                  onClick={loadArt}
                  className={`inline-flex items-center gap-1.5 h-8 min-h-0 px-3 rounded-full text-xs font-semibold ${FOCUS_RING}`}
                  style={{ color: PAPER, border: '1px solid rgba(243,234,211,0.25)' }}
                >
                  <RotateCw className="w-3.5 h-3.5" aria-hidden />
                  {c.retry}
                </button>
              </p>
            )}
            <PosterArtPicker
              lang={lang}
              images={art.images}
              usedPaths={usedPaths}
              value={image}
              onChange={setImage}
              accent={RARITY_META[rarity].color}
              covers={art.covers}
              currentPath={poster.file_path}
            />
          </>
        ))}

      {/* ---------- O que muda ---------- */}
      <div className="mt-6 rounded-xl p-3" style={PANEL} data-summary>
        <p className="text-sm font-semibold" style={{ color: PAPER }}>{c.summary}</p>
        {!changed ? (
          <p className="mt-1 text-xs" style={{ color: MIST }}>{c.nothing}</p>
        ) : (
          <ul className="mt-1.5 grid gap-1.5 text-[13px]" style={{ color: PAPER }}>
            {rarityChanged && (
              <li className="flex flex-wrap items-center gap-1.5">
                <span style={{ color: RARITY_META[poster.rarity].color }}>{RARITY_NAME[lang][poster.rarity]}</span>
                <ArrowRight className="w-3.5 h-3.5" style={{ color: MIST }} aria-hidden />
                <span className="font-semibold" style={{ color: RARITY_META[rarity].color }}>{RARITY_NAME[lang][rarity]}</span>
              </li>
            )}
            {artChanged && <li>{c.newArt}</li>}
          </ul>
        )}
        {changed && owned && <p className="mt-2 text-xs leading-snug" style={{ color: MIST }}>{c.history}</p>}
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
    </OracleSheet>
  );
}
