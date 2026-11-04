import React from 'react';
import { useTranslation } from 'react-i18next';
import { Armchair, Feather, Users } from 'lucide-react';
import type { Movie } from '../../lib/tmdb';
import { FOCUS_RING, MIST, PAPER, PIXEL, VELVET, ratingTone, withAlpha } from '../../lib/oracleTheme';
import { connectionTone, formatConnection, tierLabelKey, tierLineKey } from '../../lib/connection';
import StoryRing from '../feed/StoryRing';
import { ExampleTag, SectionHeading } from './LandingBits';
import { demoPanel, asMovie, ORACLE_SHELF, titleName, titlePoster, type LandingTitle } from './landingData';

// Melhor com amigos (04/11/2026). O "Match Movie: escolha até três amigos"
// de antes não existe mais nesse formato: hoje o lado social é
//   • o Feed dos Amigos — stories do que os amigos avaliaram, querem ver,
//     escreveram (feed.kind), com curtidas e comentários (FriendsFeed);
//   • os Sussurros — indicar um título a um amigo; também avisam episódio
//     novo de série acompanhada (indications.emptyHint);
//   • a Conexão — a % de sintonia entre duas pessoas, com as faixas de
//     lib/connection (Mesma Poltrona … Contraplano) e o "Assistam juntos"
//     (o antigo Match Movie, para a dupla).
// A demonstração à direita usa as peças reais (o anel dos stories, a cor da
// nota, a faixa da Conexão); os amigos são de exemplo, e a página diz isso.

const FRIENDS = [
  { name: 'ana', unseen: [true, true] },
  { name: 'leo', unseen: [true] },
  { name: 'bia', unseen: [false, true, true] },
  { name: 'teo', unseen: [false] },
];
const DEMO_CONNECTION = 82;

const MiniPoster: React.FC<{ title: LandingTitle; onOpen: (title: LandingTitle) => void; className?: string }> = ({ title, onOpen, className = '' }) => {
  const { t, i18n } = useTranslation();
  return (
    <button
      type="button"
      onClick={() => onOpen(title)}
      className={`relative block shrink-0 aspect-[2/3] rounded-md overflow-hidden ring-1 ring-white/10 ${FOCUS_RING} ${className}`}
      style={{ background: VELVET }}
      aria-label={t('guestHome.openTitle', { title: titleName(title, i18n.language) })}
    >
      <img src={`https://image.tmdb.org/t/p/w185${titlePoster(title, i18n.language)}`} alt="" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
    </button>
  );
};

const FriendsDemo: React.FC<{ onOpen: (title: LandingTitle) => void }> = ({ onOpen }) => {
  const { t, i18n } = useTranslation();
  const rated = ORACLE_SHELF.fincher[2]; // Paris, Texas
  const whispered = ORACLE_SHELF.cypher[1]; // Amor à Flor da Pele
  const tone10 = ratingTone(10);
  const connTone = connectionTone(DEMO_CONNECTION);

  return (
    <div className="relative rounded-3xl p-4 sm:p-5" style={demoPanel('#FB923C')}>
      {/* O selo "Exemplo" fica montado na borda de cima, como uma aba: assim
          não disputa espaço com a fileira dos stories no celular. */}
      <ExampleTag className="absolute -top-2.5 right-5" />
      {/* A fileira dos stories, como no topo da home. */}
      <ul className="flex items-start gap-3 sm:gap-4" aria-label={t('feed.title')}>
        <li className="flex flex-col items-center gap-1.5 w-[58px]">
          <StoryRing size={46} segments={[false]} avatarUrl={null} username={t('feed.you')} still />
          <span className="text-[11px] leading-none truncate max-w-full" style={{ color: MIST }}>{t('feed.you')}</span>
        </li>
        {FRIENDS.map((friend, i) => (
          <li key={friend.name} className={`flex flex-col items-center gap-1.5 w-[58px] ${i > 2 ? 'hidden sm:flex' : ''}`}>
            <StoryRing size={46} segments={friend.unseen} avatarUrl={null} username={friend.name} />
            <span className="text-[11px] leading-none truncate max-w-full" style={{ color: PAPER }}>{friend.name}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 grid gap-3">
        {/* Um story: avaliou */}
        <div className="flex items-center gap-3 rounded-2xl p-2.5 pr-3.5" style={{ background: 'rgba(18,13,34,0.6)', boxShadow: 'inset 0 0 0 1px rgba(243,234,211,0.08)' }}>
          <MiniPoster title={rated} onOpen={onOpen} className="w-[46px]" />
          <p className="min-w-0 flex-1 text-sm leading-snug" style={{ color: MIST }}>
            <span className="font-semibold" style={{ color: PAPER }}>@ana</span> {t('feed.kind.rate')}{' '}
            <span className="font-semibold" style={{ color: PAPER }}>{titleName(rated, i18n.language)}</span>
          </p>
          <span
            style={{ ...PIXEL, color: tone10.color, background: withAlpha(tone10.color, 0.14), boxShadow: `inset 0 0 0 1px ${tone10.ring}` }}
            className="grid place-items-center w-10 h-10 shrink-0 rounded-xl text-xl leading-none"
          >
            10
          </span>
        </div>

        {/* Um sussurro */}
        <div className="flex items-center gap-3 rounded-2xl p-2.5 pr-3.5" style={{ background: 'rgba(18,13,34,0.6)', boxShadow: 'inset 0 0 0 1px rgba(243,234,211,0.08)' }}>
          <MiniPoster title={whispered} onOpen={onOpen} className="w-[46px]" />
          <p className="min-w-0 flex-1 text-sm leading-snug" style={{ color: MIST }}>
            <span className="font-semibold" style={{ color: PAPER }}>@leo</span> {t('guestHome.whisperDemo')}{' '}
            <span className="font-semibold" style={{ color: PAPER }}>{titleName(whispered, i18n.language)}</span>
          </p>
          <Feather className="w-5 h-5 shrink-0 text-violet-300" aria-hidden />
        </div>

        {/* A Conexão */}
        <div className="flex items-center gap-3.5 rounded-2xl p-3 pr-3.5" style={{ background: 'rgba(18,13,34,0.6)', boxShadow: `inset 0 0 0 1px ${withAlpha(connTone.color, 0.3)}` }}>
          <span style={{ ...PIXEL, color: connTone.color }} className="text-[34px] leading-none tabular-nums shrink-0">
            {formatConnection(DEMO_CONNECTION)}
          </span>
          <span className="min-w-0">
            <span className="block text-xs" style={{ color: MIST }}>{t('connection.subtitle', { username: 'bia' })}</span>
            <span className="block mt-0.5 text-sm font-semibold" style={{ color: PAPER }}>{t(tierLabelKey(DEMO_CONNECTION))}</span>
            <span className="block text-xs" style={{ color: MIST }}>{t(tierLineKey(DEMO_CONNECTION))}</span>
          </span>
        </div>
      </div>
    </div>
  );
};

const ITEMS = [
  { key: 'feed', Icon: Users, color: '#FB923C' },
  { key: 'whispers', Icon: Feather, color: '#C4B5FD' },
  { key: 'connection', Icon: Armchair, color: '#86EFAC' },
] as const;

const LandingFriends: React.FC<{ onMovieClick: (movie: Movie) => void }> = ({ onMovieClick }) => {
  const { t, i18n } = useTranslation();
  const open = (title: LandingTitle) => onMovieClick(asMovie(title, i18n.language));
  return (
    <section className="border-t border-white/[0.07]" aria-labelledby="lp-friends">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-14 sm:py-24 grid gap-10 lg:grid-cols-12 lg:gap-12 items-center">
        <div className="min-w-0 lg:col-span-6">
          <SectionHeading id="lp-friends" eyebrow={t('guestHome.friendsEyebrow')} title={t('guestHome.friendsTitle')} accent="#FDBA74" />
          <ul className="mt-9 flex flex-col gap-6">
            {ITEMS.map(({ key, Icon, color }) => (
              <li key={key} className="flex gap-4">
                <span
                  className="grid place-items-center w-11 h-11 shrink-0 rounded-xl"
                  style={{ background: withAlpha(color, 0.12), boxShadow: `inset 0 0 0 1px ${withAlpha(color, 0.38)}`, color }}
                  aria-hidden
                >
                  <Icon className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold leading-snug" style={{ color: PAPER }}>{t(`guestHome.${key}Title`)}</h3>
                  <p className="mt-1 text-sm sm:text-[15px] leading-relaxed" style={{ color: MIST }}>{t(`guestHome.${key}Desc`)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="min-w-0 lg:col-span-6">
          <FriendsDemo onOpen={open} />
        </div>
      </div>
    </section>
  );
};

export default LandingFriends;
