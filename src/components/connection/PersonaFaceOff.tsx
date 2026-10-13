import React from 'react';
import { useTranslation } from 'react-i18next';
import UserAvatar, { type AvatarUser } from '../UserAvatar';
import { PersonaPoster } from '../PersonaBits';
import { MOOD_BY_LETTER } from '../../lib/moods';
import { personaText, type PersonaEntry } from '../../lib/persona';
import { PAPER, MIST, PIXEL } from '../../lib/oracleTheme';

// As duas personalidades lado a lado (13/10/2026): o pôster do personagem,
// o código de 3 letras com as letras em comum acesas (as outras a 35%) e
// quantas letras os dois dividem. Sem disputa: nada de "vs".

export interface FaceOffSide {
  user: AvatarUser;
  name: string;
  code: string;
  entry: PersonaEntry | null;
}

const Side: React.FC<{ side: FaceOffSide; shared: Set<string>; language: string }> = ({ side, shared, language }) => {
  const title = side.entry ? personaText(side.entry, language).title : '';
  return (
    <div className="flex flex-col items-center text-center w-[132px] sm:w-[160px] min-w-0">
      <span className="flex items-center gap-1.5 max-w-full">
        <UserAvatar user={side.user} size={20} plain />
        <span className="text-[12.5px] truncate" style={{ color: MIST }}>
          {side.name}
        </span>
      </span>
      <PersonaPoster path={side.entry?.posterPath ?? null} alt="" size="w185" className="mt-2.5 w-16 rounded-lg" />
      <span className="mt-2.5 text-[24px] leading-none tracking-wide" style={PIXEL} aria-label={side.code}>
        {side.code.split('').map((letter, i) => (
          <span
            key={`${letter}-${i}`}
            style={{ color: MOOD_BY_LETTER[letter]?.color ?? MIST, opacity: shared.has(letter) ? 1 : 0.35 }}
            aria-hidden
          >
            {letter}
          </span>
        ))}
      </span>
      {title && (
        <span className="mt-1.5 text-[12.5px] leading-snug line-clamp-2" style={{ color: PAPER }}>
          {title}
        </span>
      )}
    </div>
  );
};

const PersonaFaceOff: React.FC<{ me: FaceOffSide; other: FaceOffSide }> = ({ me, other }) => {
  const { t, i18n } = useTranslation();
  const mine = new Set(me.code.split(''));
  const shared = new Set(other.code.split('').filter((letter) => mine.has(letter)));
  return (
    <div>
      <div className="flex items-start justify-center gap-4 sm:gap-10">
        <Side side={me} shared={shared} language={i18n.language} />
        <Side side={other} shared={shared} language={i18n.language} />
      </div>
      <p className="mt-4 text-center text-[13px]" style={{ color: MIST }}>
        {t('connection.persona.shared', { count: shared.size })}
      </p>
    </div>
  );
};

export default PersonaFaceOff;
