import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Lock } from 'lucide-react';
import PosterArt, { RarityTag } from '../../posterJackpot/PosterArt';
import { SerialLine, formatSerial } from '../../posterJackpot/CollectorMark';
import type { PokerHome } from '../../../lib/poker/client/apiTypes';
import { langOf } from '../../../lib/poker/client/format';
import { collectionOf, nextWeekOf, POSTER_POKER, posterTitle, tournamentOf, weekOf, type CollectionEntry } from '../../../lib/poker/client/tournament';
import { BLEFE_ROUTES } from '../jackpot/pokerMeta';
import { Sheet } from '../table/Overlays';
import { Stage } from './TitleScreen';

// A coleção do Pôster Poker (03/11/2026): os 9 pôsteres do torneio. Os que a pessoa
// tem aparecem com o brilho dourado e o número; os outros, em silhueta, com a
// quinta em que voltam ao torneio. Embaixo, a vitrine dos itens da Cobra (vazia por
// enquanto: "em breve").

const RANK: Record<string, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };

// Sem a lista do servidor (ainda sem o torneio, ou sem rede): o catálogo local, tudo trancado.
function fallbackList(): CollectionEntry[] {
  const week = weekOf();
  return POSTER_POKER.map((p) => ({
    id: p.id,
    item_id: 0,
    rarity: p.rarity,
    serial: p.serial,
    title: p.titlePt,
    title_en: p.titleEn,
    year: p.year,
    file_path: p.filePath,
    effect_id: p.effect,
    owned: false,
    next_week: nextWeekOf(p.effect, week),
  }));
}

const CollectionScreen: React.FC<{ home: PokerHome }> = ({ home }) => {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const navigate = useNavigate();
  const reduce = !!useReducedMotion();
  const [open, setOpen] = useState<CollectionEntry | null>(null);
  const server = collectionOf(home);
  const list = (server.length ? server : fallbackList()).slice().sort((a, b) => RANK[a.rarity] - RANK[b.rarity] || a.serial - b.serial);
  const week = tournamentOf(home)?.week ?? weekOf();
  const have = list.filter((x) => x.owned).length;
  const date = (iso: string | null) => {
    if (!iso) return '';
    const d = new Date(`${iso}T12:00:00Z`);
    return d.toLocaleDateString(lang === 'pt' ? 'pt-BR' : 'en-US', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
  };
  const thisWeek = (x: CollectionEntry) => (x as CollectionEntry & { this_week?: boolean }).this_week ?? x.next_week === week;

  return (
    <Stage>
      <header className="pp-topbar">
        <button type="button" className="pp-icon-btn" onClick={() => navigate(BLEFE_ROUTES.title)} aria-label={t('poker.game.back')}>
          <ChevronLeft className="w-6 h-6" />
        </button>
        <span className="pk-num text-[14px]" style={{ color: '#FFE7A1' }}>{t('poker.collection.count', { have, total: list.length })}</span>
      </header>

      <h1 className="text-center pp-font pp-gold-letters text-[30px] leading-tight">{t('poker.game.collection')}</h1>
      <p className="mt-1.5 text-center text-[13.5px] leading-snug" style={{ color: '#e9d9c4' }}>{t('poker.collection.intro')}</p>

      <ul className="pp-shelf">
        {list.map((x) => {
          const title = posterTitle(x, lang);
          const now = thisWeek(x);
          return (
            <li key={x.id}>
              <button
                type="button"
                className="block w-full text-left"
                onClick={() => setOpen(x)}
                aria-label={x.owned ? t('poker.collection.ownedAria', { title, n: formatSerial(x.serial) }) : t('poker.collection.lockedAria', { title, date: date(x.next_week) })}
              >
                {x.owned ? (
                  <span className="pp-slot-art is-owned">
                    <PosterArt filePath={x.file_path} effect="gold" size="w185" animated={!reduce} className="absolute inset-0" mark={{ rarity: x.rarity, serial: x.serial, size: 'xs' }} />
                  </span>
                ) : (
                  <span className="pp-slot-art is-locked" style={now ? { boxShadow: 'inset 0 0 0 1.5px #E8B54A, 0 0 22px -6px rgba(232,181,74,0.6)' } : undefined}>
                    <img src={`https://image.tmdb.org/t/p/w185${x.file_path}`} alt="" loading="lazy" decoding="async" draggable={false} />
                    <span className="pp-lock">
                      <b className="pk-num">{formatSerial(x.serial)}</b>
                      {now ? <span style={{ color: '#FFE7A1' }}>{t('poker.collection.thisWeek')}</span> : <span>{t('poker.collection.returns', { date: date(x.next_week) })}</span>}
                    </span>
                  </span>
                )}
                <span className="pp-slot-title">{x.owned ? title : now ? title : t('poker.collection.unknown')}</span>
                <span className="pp-slot-sub">{t(`poker.rarity.${x.rarity}`)}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* A vitrine dos itens da Cobra: o espaço pronto, por enquanto vazio. */}
      <section className="pp-vitrine" aria-labelledby="pp-cobra-h">
        <h2 id="pp-cobra-h" className="pp-font text-[20px]" style={{ color: '#F4ECC0' }}>{t('poker.collection.cobraTitle')}</h2>
        <div className="pp-vitrine-row" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <p className="text-[13px] leading-snug" style={{ color: '#d8d2b0' }}>{t('poker.collection.cobraSoon')}</p>
      </section>

      {open && (
        <div className="fixed inset-0 z-[80]">
          <Sheet title={open.owned || thisWeek(open) ? posterTitle(open, lang) : t('poker.collection.unknown')} onClose={() => setOpen(null)} reduced={reduce}>
            <div className="grid grid-cols-[96px_1fr] gap-4 items-start">
              {open.owned ? (
                <PosterArt filePath={open.file_path} effect="gold" size="w342" animated={!reduce} className="w-[96px] aspect-[2/3] rounded-[8px]" />
              ) : (
                <span className="pp-slot-art is-locked" style={{ width: 96 }}>
                  <img src={`https://image.tmdb.org/t/p/w185${open.file_path}`} alt="" />
                  <span className="pp-lock">
                    <Lock className="w-5 h-5" aria-hidden />
                  </span>
                </span>
              )}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <RarityTag rarity={open.rarity} />
                  <SerialLine rarity={open.rarity} serial={open.serial} />
                </div>
                <p className="mt-2 pp-font pp-gold-letters text-[18px]">{t(`poker.effects.${open.effect_id}.name`)}</p>
                <p className="mt-1 text-[13.5px] leading-snug" style={{ color: '#ECDCCF' }}>{t(`poker.effects.${open.effect_id}.rule`)}</p>
                <p className="mt-2 text-[12.5px]" style={{ color: '#c9b3ae' }}>
                  {open.owned
                    ? t('poker.collection.ownedNote')
                    : thisWeek(open)
                      ? t('poker.collection.thisWeekNote')
                      : t('poker.collection.returnsNote', { date: date(open.next_week) })}
                </p>
              </div>
            </div>
            {!open.owned && thisWeek(open) && (
              <button type="button" className="pp-ticket is-gold pp-font mt-4" onClick={() => navigate(BLEFE_ROUTES.tournament)}>
                {t('poker.collection.goTourney')}
              </button>
            )}
          </Sheet>
        </div>
      )}
    </Stage>
  );
};

export default CollectionScreen;
