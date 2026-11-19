import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, Check, Film, Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import OracleSheet from '../OracleSheet';
import { MOOD_BY_LETTER, withMoodAlpha } from '../../lib/moods';
import { fetchMyMoodTitles, myMoodPick, saveMoodPick, worldState, type PersonaWorld, type WorldTitle } from '../../lib/personaWorld';
import { getFullTitle } from '../../lib/titleCards';
import { PROGRESSION_TAGS } from '../../lib/tags';
import { FOCUS_RING, MIST, PAPER, PIXEL, VELVET, ratingTone } from '../../lib/oracleTheme';
import { formatOne } from '../profile/observatoryKit';
import { fmtRating, studioItemArt } from './draw';
import { MOOD_ITEM_GOAL, moodItemOf, type MoodItemId } from './moodItems';
import type { StudioExtras } from './studio';

// 19/11/2026 (Reborn, onda 2b): o menu do título é uma camada do host
// (src/overlays); aqui não se guarda mais o filme aberto nem se monta o menu.
import { openTitle } from '../../overlays';

// O cartão de um móvel de humor (17/11/2026).
//
// Ideia do Bruno, ao escolher os móveis: "o estúdio do usuário é pra ser uma
// representação dele, então nada mais justo que essas coisas terem ao toque
// coisas que remetam as estatísticas ou filmes do usuário, (ou até mesmo o
// @nome) só uma dica, algo para que o cidadão médio não precise scrollar
// todas as informações [...] mas simplificá-las".
//
// Então o cartão diz pouco, e só daquele humor: quantos títulos da prateleira
// a pessoa avaliou, a média dela ali e o favorito dela (o pôster abre o
// título). No estúdio de outra pessoa as frases levam o @ dela ("O favorito de
// @fulano"): vira uma indicação de amigo. O fim leva à prateleira no Acervo.
// Tudo já vem com o estúdio (get_persona_world): a contagem e a soma das
// notas de cada prateleira (worldState) e os mais bem avaliados (world.best).
//
// 17/11/2026 (noite), pedido do Bruno: "Troque 'Seu Favorito da Prateleira'
// por 'Sua Recomendação'. Adicione um botão para o usuário escolher um título
// avaliado dessa prateleira." O favorito virou a recomendação: a que a pessoa
// escolheu (world.picks) ou, sem escolha, o mais bem avaliado. No próprio
// estúdio, "Escolher" abre os títulos que ela avaliou naquela prateleira, do
// mais bem avaliado para baixo; tocar num grava (saveMoodPick). Quem visita
// vê "A recomendação de @fulano".

interface Props {
  id: MoodItemId;
  world: PersonaWorld;
  isOwn: boolean;
  // o nome de usuário do dono, sem "@"
  ownerUsername: string | null;
  extras: StudioExtras;
  onClose: () => void;
  // sair da tela (ao seguir para o Acervo): fecha também a gaveta de baixo
  onLeave?: () => void;
}

// o desenho do móvel, ampliado em escala inteira
const Portrait: React.FC<{ source: HTMLCanvasElement; label: string }> = ({ source, label }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const k = Math.max(2, Math.min(5, Math.floor(Math.min(132 / source.width, 132 / source.height))));
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, source.width, source.height);
    ctx.drawImage(source, 0, 0);
  }, [source]);
  return <canvas ref={ref} width={source.width} height={source.height} role="img" aria-label={label} className="block" style={{ width: source.width * k, height: source.height * k, imageRendering: 'pixelated' }} />;
};

const MoodObjectCard: React.FC<Props> = ({ id, world, isOwn, ownerUsername, extras, onClose, onLeave }) => {
  const { t, i18n } = useTranslation();
  const item = moodItemOf(id);
  const mood = MOOD_BY_LETTER[item.letter];
  const st = useMemo(() => worldState(world), [world]);
  const art = useMemo(() => studioItemArt(world, st, extras, id), [world, st, extras, id]);
  const tag = PROGRESSION_TAGS.find((entry) => entry.name === item.tag);
  const pt = i18n.language.startsWith('pt');
  const name = ownerUsername ? `@${ownerUsername}` : '';

  const films = st.films[item.letter] ?? 0;
  const average = films > 0 ? (st.score[item.letter] ?? 0) / films : null;
  // a recomendação: a escolhida agora mesmo, a escolhida antes, ou o mais bem avaliado
  const [chosen, setChosen] = useState<WorldTitle | null>(() => (isOwn ? myMoodPick(item.letter) : null));
  const favorite: WorldTitle | null = chosen ?? world.picks[item.letter] ?? world.best[item.letter]?.[0] ?? null;
  const favoriteName = favorite ? (pt ? favorite.titlePt || favorite.titleEn : favorite.titleEn || favorite.titlePt) || t('personaWorld.untitled') : '';
  // o estúdio completo da Conta Diretor mostra o móvel antes da tag
  const previewOnly = Boolean(world.preview) && films < MOOD_ITEM_GOAL;

  // escolher a recomendação (só no próprio estúdio): os títulos da prateleira
  const [picking, setPicking] = useState(false);
  const [options, setOptions] = useState<WorldTitle[] | null>(null);
  const [optionsFailed, setOptionsFailed] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const keyOf = (title: WorldTitle) => `${title.type}:${title.id}`;
  const nameOf = (title: WorldTitle) => (pt ? title.titlePt || title.titleEn : title.titleEn || title.titlePt) || t('personaWorld.untitled');
  useEffect(() => {
    if (!picking || options) return;
    let alive = true;
    setOptionsFailed(false);
    fetchMyMoodTitles(mood.key)
      .then((list) => alive && setOptions(list))
      .catch((error) => {
        console.error('Mood titles:', error);
        if (alive) setOptionsFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [picking, options, mood.key]);
  const choose = async (title: WorldTitle) => {
    if (saving) return;
    setSaving(keyOf(title));
    try {
      await saveMoodPick(mood.key, title);
      setChosen({ ...title, letter: item.letter });
      setPicking(false);
      toast.success(t('studio.moodCard.saved'));
    } catch (error) {
      console.error('Mood pick:', error);
      toast.error(t('studio.moodCard.saveError'));
    } finally {
      setSaving(null);
    }
  };

  // o favorito abre por cima do cartão
  const [opening, setOpening] = useState(false);
  const openFavorite = async () => {
    if (!favorite || opening) return;
    setOpening(true);
    try {
      openTitle(await getFullTitle({ id: favorite.id, media_type: favorite.type }));
    } catch (error) {
      console.error('Mood object favorite:', error);
    } finally {
      setOpening(false);
    }
  };

  const moodLabel = t(mood.labelKey);
  const cells = [
    { label: t('studio.moodCard.films'), value: String(films), color: PAPER },
    {
      label: isOwn ? t('studio.moodCard.average') : t('studio.moodCard.averageOf', { name }),
      value: average === null ? '–' : formatOne(average, i18n.language),
      color: average === null ? MIST : ratingTone(Math.round(average)).color,
    },
  ];

  return (
    <>
      <OracleSheet
        open
        onClose={onClose}
        size="md"
        zIndexClass="z-[9995]"
        title={t(`studio.inventory.names.${id}`)}
        subtitle={
          <span style={{ color: mood.color }}>
            {tag ? `${tag.emoji} ${tag.name} · ` : ''}
            {moodLabel}
          </span>
        }
      >
        <div className="space-y-4">
          {/* o móvel, num palco escuro com a luz do humor no chão */}
          <div className="flex items-center gap-4">
            <div
              className="grid place-items-center shrink-0 w-[148px] h-[148px] rounded-2xl"
              style={{ background: `radial-gradient(ellipse 70% 38% at 50% 78%, ${withMoodAlpha(mood, 0.28)}, transparent 70%), #0D0919`, boxShadow: `inset 0 0 0 1px ${withMoodAlpha(mood, 0.35)}` }}
            >
              {art && <Portrait source={art} label={t(`studio.inventory.names.${id}`)} />}
            </div>
            <p className="min-w-0 text-[15px] leading-relaxed" style={{ color: 'rgba(243,234,211,0.88)' }}>
              {t(`studio.moodCard.what.${id}`)}
            </p>
          </div>

          {previewOnly && (
            <p className="text-xs leading-snug" style={{ color: '#FDE68A' }}>
              {t('studio.moodCard.preview', { goal: MOOD_ITEM_GOAL })}
            </p>
          )}

          <dl className="grid grid-cols-2 gap-2">
            {cells.map((cell) => (
              <div key={cell.label} className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <dd style={{ ...PIXEL, color: cell.color }} className="text-2xl leading-none tabular-nums">
                  {cell.value}
                </dd>
                <dt className="mt-1 text-[12px] leading-tight" style={{ color: MIST }}>
                  {cell.label}
                </dt>
              </div>
            ))}
          </dl>

          {favorite && (
            <div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-[12px] font-medium" style={{ color: MIST }}>
                  {isOwn ? t('studio.moodCard.favorite') : t('studio.moodCard.favoriteOf', { name })}
                </p>
                {isOwn && films > 0 && (
                  <button
                    type="button"
                    onClick={() => setPicking((open) => !open)}
                    aria-expanded={picking}
                    aria-label={t('studio.moodCard.chooseAria', { mood: moodLabel })}
                    className={`inline-flex items-center gap-1.5 h-9 min-h-0 px-3 rounded-full text-[13px] font-semibold transition hover:bg-white/[0.06] ${FOCUS_RING}`}
                    style={{ color: mood.color, boxShadow: `inset 0 0 0 1px ${withMoodAlpha(mood, 0.45)}` }}
                  >
                    <Pencil className="w-3.5 h-3.5" aria-hidden />
                    {picking ? t('studio.moodCard.cancel') : t('studio.moodCard.choose')}
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={openFavorite}
                className={`mt-2 w-full flex items-center gap-3 rounded-xl p-2 text-left transition hover:bg-white/[0.05] ${FOCUS_RING}`}
                style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }}
                aria-label={`${favoriteName}, ${fmtRating(favorite.rating)}`}
              >
                <span className="relative block w-14 shrink-0 aspect-[2/3] overflow-hidden rounded-md" style={{ background: VELVET }}>
                  {favorite.poster ? (
                    <img src={`https://image.tmdb.org/t/p/w185${favorite.poster}`} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <span className="absolute inset-0 grid place-items-center" style={{ color: MIST }}>
                      <Film className="w-5 h-5" aria-hidden />
                    </span>
                  )}
                  {opening && <span className="absolute inset-0 bg-black/50 animate-pulse" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold leading-snug line-clamp-2" style={{ color: PAPER }}>
                    {favoriteName}
                  </span>
                  <span className="mt-1 inline-flex items-center gap-1.5 text-[13px]" style={{ color: MIST }}>
                    {t('studio.moodCard.rating')}
                    <span style={{ ...PIXEL, color: ratingTone(Math.round(favorite.rating)).color }} className="text-[15px] leading-none">
                      {fmtRating(favorite.rating)}
                    </span>
                  </span>
                </span>
              </button>

              {/* escolher: os títulos avaliados da prateleira, do mais bem avaliado para baixo */}
              {picking && (
                <div className="mt-3 rounded-xl p-3" style={{ background: 'rgba(0,0,0,0.28)', boxShadow: `inset 0 0 0 1px ${withMoodAlpha(mood, 0.3)}` }}>
                  <p className="text-[13px] leading-snug" style={{ color: PAPER }}>
                    {t('studio.moodCard.pickTitle', { mood: moodLabel })}
                  </p>
                  {optionsFailed ? (
                    <p className="mt-2 text-xs" style={{ color: '#FCA5A5' }} role="status">
                      {t('studio.moodCard.pickError')}
                    </p>
                  ) : !options ? (
                    <div className="mt-3 grid grid-cols-4 sm:grid-cols-5 gap-2" aria-busy="true" aria-label={t('studio.moodCard.pickLoading')}>
                      {Array.from({ length: 5 }, (_, i) => (
                        <span key={i} className="block aspect-[2/3] rounded-lg bg-white/[0.06] animate-pulse" />
                      ))}
                    </div>
                  ) : options.length === 0 ? (
                    <p className="mt-2 text-xs" style={{ color: MIST }}>
                      {t('studio.moodCard.pickEmpty')}
                    </p>
                  ) : (
                    <ul className="mt-3 grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-[300px] overflow-y-auto pr-1">
                      {options.map((title) => {
                        const key = keyOf(title);
                        const current = favorite && keyOf(favorite) === key;
                        const tone = ratingTone(Math.round(title.rating));
                        return (
                          <li key={key} className="min-w-0">
                            <button
                              type="button"
                              onClick={() => choose(title)}
                              disabled={Boolean(saving)}
                              aria-pressed={Boolean(current)}
                              aria-label={`${nameOf(title)}, ${fmtRating(title.rating)}`}
                              title={nameOf(title)}
                              className={`relative block w-full aspect-[2/3] min-h-0 overflow-hidden rounded-lg transition hover:brightness-110 disabled:opacity-60 ${FOCUS_RING}`}
                              style={{ background: VELVET, boxShadow: current ? `0 0 0 2px ${mood.color}` : 'inset 0 0 0 1px rgba(255,255,255,0.1)' }}
                            >
                              {title.poster ? (
                                <img src={`https://image.tmdb.org/t/p/w185${title.poster}`} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
                              ) : (
                                <span className="absolute inset-0 grid place-items-center px-1 text-center text-[10px] leading-tight" style={{ color: MIST }}>
                                  {nameOf(title)}
                                </span>
                              )}
                              <span
                                className="absolute bottom-1 right-1 h-5 min-w-[20px] px-1 grid place-items-center rounded-md text-[12px] leading-none"
                                style={{ ...PIXEL, background: 'rgba(18,13,34,0.86)', color: tone.color, boxShadow: `inset 0 0 0 1px ${tone.ring}` }}
                              >
                                {fmtRating(title.rating)}
                              </span>
                              {current && (
                                <span className="absolute top-1 left-1 grid h-5 w-5 place-items-center rounded-full" style={{ background: mood.color, color: '#120D22' }}>
                                  <Check className="w-3.5 h-3.5" aria-hidden />
                                </span>
                              )}
                              {saving === key && (
                                <span className="absolute inset-0 grid place-items-center bg-black/55">
                                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: PAPER }} aria-hidden />
                                </span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          {/* a prateleira no Acervo (a página única da Mesa dos Oráculos) */}
          <Link
            to={`/oracle/acervo?mood=${mood.key}`}
            onClick={() => {
              onClose();
              onLeave?.();
            }}
            className={`inline-flex items-center gap-1.5 text-sm font-medium rounded ${FOCUS_RING}`}
            style={{ color: mood.color }}
          >
            {t('studio.moodCard.openShelf', { mood: moodLabel })}
            <ArrowUpRight className="w-4 h-4" aria-hidden />
          </Link>
        </div>
      </OracleSheet>
    </>
  );
};

export default MoodObjectCard;
