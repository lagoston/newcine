import React from 'react';
import { useTranslation } from 'react-i18next';
import { Crown } from 'lucide-react';
import { PAPER, MIST, PIXEL, NIGHT, glassPanel, oracleCardImage, type OracleCardStyle } from '../../lib/oracleTheme';
import { frames } from '../../lib/frames';
import { banners } from '../../lib/banners';
import { textEffects } from '../../lib/textEffects';
import ProfileIdentityCard from '../ProfileIdentityCard';
import { BODY_CLASS, ChapterHeader, H3_CLASS, PREMIUM_GOLD } from './parts';
import './premium.css';

// Rolo 3 da página Premium (04/11/2026): as peças do perfil. Conferido em
// cosmetic_requirements (banco) e em lib/frames.ts, lib/banners.ts,
// lib/textEffects.tsx e CustomizeModal (cartas):
//   • 11 molduras e 11 banners Premium — o Ouro sem tag; os outros 10 de
//     cada pedem também a tag do tema (Matrix → trilogia Matrix etc.);
//   • cartas Yu-Gi-Oh! (tag Trailblazer: 50 títulos de Aventuras) e Horror
//     (tag Bloody Mary: 50 de Sombrio e Assustador);
//   • efeitos no nome: Typewriter, Technicolor e Marquee Lights, com 1, 10
//     e 30 resenhas escritas;
//   • avatar animado (GIF ou WebP animado até 2 MB) — pages/Profile.tsx;
//   • a coroa ao lado do nome (ProfileIdentityCard, Comunidade, seguidores).
// As contagens saem das próprias listas, para não ficarem velhas quando
// entrar uma moldura nova.
const PREMIUM_FRAMES = Object.values(frames).filter((f) => f.isPremium).length;
const PREMIUM_BANNERS = Object.values(banners).filter((b) => b.isPremium).length;

// O que aparece nas amostras (os retratos são os dos próprios oráculos).
const FRAME_SAMPLES: { frame: string; avatar: string }[] = [
  { frame: frames.gold.className, avatar: '/avatar-sapo.webp' },
  { frame: frames.matrix.className, avatar: '/avatar-cobra.webp' },
  { frame: frames.potter.className, avatar: '/avatar-raposa.webp' },
  { frame: frames.avengers.className, avatar: '/avatar-sapo.webp' },
];
const BANNER_SAMPLES: { className: string; labelKey: string }[] = [
  { className: banners.gold.className, labelKey: 'premium.page.profile.banners.gold' },
  { className: banners.matrix.className, labelKey: 'premium.page.profile.banners.matrix' },
  { className: banners.potter.className, labelKey: 'premium.page.profile.banners.potter' },
];
const CARD_STYLES: { style: OracleCardStyle; labelKey: string }[] = [
  { style: 'default', labelKey: 'premium.page.profile.cards.default' },
  { style: 'yugioh', labelKey: 'premium.page.profile.cards.yugioh' },
  { style: 'horror', labelKey: 'premium.page.profile.cards.horror' },
];
const EFFECT_SAMPLES = [
  { effect: textEffects.typewriter, reviews: 1 },
  { effect: textEffects.technicolor, reviews: 10 },
  { effect: textEffects.marqueeLights, reviews: 30 },
];

// Um bloco da vitrine. prm-pause deixa as animações paradas até o mouse
// (ou o foco) chegar nele — ver premium.css.
const Tile: React.FC<{ title: string; body: string; children: React.ReactNode; accent: string }> = ({ title, body, children, accent }) => (
  <article className="prm-tile rounded-2xl p-5 flex flex-col" style={glassPanel(accent)}>
    <div className="min-h-[104px] flex items-center" aria-hidden>
      {children}
    </div>
    <h3 style={{ ...PIXEL, color: PAPER }} className={`mt-4 ${H3_CLASS}`}>
      {title}
    </h3>
    <p className="mt-1.5 text-sm leading-relaxed" style={{ color: MIST }}>
      {body}
    </p>
  </article>
);

const PremiumProfile: React.FC = () => {
  const { t } = useTranslation();

  return (
    <section aria-labelledby="prm-profile" className="py-12 sm:py-16">
      <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <ChapterHeader
          id="prm-profile"
          reel={t('premium.page.reel', { n: 3, label: t('premium.page.profile.kicker') })}
          title={t('premium.page.profile.title')}
          lead={t('premium.page.profile.lead')}
        />

        {/* O cartão de perfil de verdade, montado com as peças douradas. */}
        <figure>
          <div aria-hidden>
            <ProfileIdentityCard
              username={t('premium.page.profile.previewName')}
              avatarUrl="/avatar-raposa.webp"
              avatarFrame="gold"
              banner="gold"
              textEffect="technicolor"
              isPremium
              realReviewCount={30}
              friendsCount={0}
              editor={
                <div className="text-center sm:text-left">
                  <p className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
                    <span style={PIXEL} className={`text-[30px] sm:text-[40px] leading-none break-all ${textEffects.technicolor.nameClassName}`}>
                      @{t('premium.page.profile.previewName')}
                    </span>
                    <Crown className="w-6 h-6 shrink-0 text-amber-300" />
                  </p>
                  <p className={`mt-3 text-[15px] leading-relaxed ${textEffects.technicolor.secondaryClassName}`}>{t('premium.page.profile.previewBio')}</p>
                </div>
              }
            />
          </div>
          <figcaption className="sr-only">{t('premium.page.profile.previewBio')}</figcaption>
        </figure>
      </div>

      <div className="prm-pause mt-8 grid gap-4 sm:gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <Tile title={t('premium.page.profile.frames.title', { count: PREMIUM_FRAMES })} body={t('premium.page.profile.frames.body')} accent="#FBBF24">
          {/* Sobrepostas, como fichas na mesa: cabem as quatro em qualquer largura. */}
          <span className="flex items-center -space-x-2">
            {FRAME_SAMPLES.map((s, i) => (
              <span key={i} className={`relative block shrink-0 w-[54px] h-[54px] rounded-full overflow-hidden ${s.frame}`} style={{ background: NIGHT, zIndex: FRAME_SAMPLES.length - i }}>
                <img src={s.avatar} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
              </span>
            ))}
          </span>
        </Tile>

        <Tile title={t('premium.page.profile.banners.title', { count: PREMIUM_BANNERS })} body={t('premium.page.profile.banners.body')} accent="#4ADE80">
          <span className="grid w-full gap-2">
            {BANNER_SAMPLES.map((b) => (
              <span key={b.className} className={`flex items-center h-[32px] px-3 rounded-lg overflow-hidden ${b.className}`}>
                <span className="relative z-10 text-[12px] font-semibold" style={{ color: PAPER }}>
                  {t(b.labelKey)}
                </span>
              </span>
            ))}
          </span>
        </Tile>

        <Tile title={t('premium.page.profile.cards.title')} body={t('premium.page.profile.cards.body')} accent="#EE7A3E">
          <span className="grid w-full grid-cols-3 gap-2">
            {CARD_STYLES.map((c) => (
              <span key={c.style} className="flex flex-col items-center gap-1.5">
                <img
                  src={oracleCardImage('fincher', c.style)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="w-full max-w-[64px] aspect-[774/1141] object-cover rounded-[4px] shadow-lg"
                />
                <span className="text-[11px] leading-none whitespace-nowrap" style={{ color: c.style === 'default' ? MIST : PREMIUM_GOLD }}>
                  {t(c.labelKey)}
                </span>
              </span>
            ))}
          </span>
        </Tile>

        <Tile title={t('premium.page.profile.effects.title')} body={t('premium.page.profile.effects.body')} accent="#F472B6">
          <span className="grid w-full gap-2.5">
            {EFFECT_SAMPLES.map(({ effect, reviews }) => (
              <span key={effect.id} className="flex items-baseline justify-between gap-2">
                <span
                  style={effect.nameClassName.includes('font-[') ? undefined : PIXEL}
                  className={`text-[18px] leading-tight whitespace-nowrap ${effect.nameClassName}`}
                >
                  {effect.name}
                </span>
                <span className="text-[11px] whitespace-nowrap" style={{ color: MIST }}>
                  {t('premium.page.profile.effects.reviews', { count: reviews })}
                </span>
              </span>
            ))}
          </span>
        </Tile>
      </div>

      {/* Avatar animado e a coroa: uma linha só, sem vitrine. */}
      <div className="mt-4 sm:mt-5 grid gap-4 sm:gap-5 sm:grid-cols-2">
        <div className="rounded-2xl px-5 py-4 flex items-start gap-4" style={glassPanel('#38BDF8')}>
          <span
            aria-hidden
            style={{ ...PIXEL, color: '#38BDF8' }}
            className="shrink-0 grid place-items-center w-12 h-12 rounded-xl ring-1 ring-sky-400/40 bg-sky-400/10 text-[15px]"
          >
            GIF
          </span>
          <div>
            <h3 style={{ ...PIXEL, color: PAPER }} className="text-[20px] leading-tight">
              {t('premium.page.profile.avatar.title')}
            </h3>
            <p className={`mt-1 ${BODY_CLASS} !text-sm`} style={{ color: MIST }}>
              {t('premium.page.profile.avatar.body')}
            </p>
          </div>
        </div>
        <div className="rounded-2xl px-5 py-4 flex items-start gap-4" style={glassPanel('#FCD34D')}>
          <span aria-hidden className="shrink-0 grid place-items-center w-12 h-12 rounded-xl ring-1 ring-amber-300/40 bg-amber-300/10">
            <Crown className="w-6 h-6 text-amber-300" />
          </span>
          <div>
            <h3 style={{ ...PIXEL, color: PAPER }} className="text-[20px] leading-tight">
              {t('premium.page.profile.crown.title')}
            </h3>
            <p className={`mt-1 ${BODY_CLASS} !text-sm`} style={{ color: MIST }}>
              {t('premium.page.profile.crown.body')}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PremiumProfile;
