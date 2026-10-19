import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../lib/auth';
import { useSeasonalEvent } from '../../contexts/SeasonalEventContext';
import { PIXEL, FOCUS_RING } from '../../lib/oracleTheme';
import { TERROR_CLUB, fetchSecretRoomAccess, roomPath, type SecretRoomAccess } from '../../lib/secretRooms';
import { ASH, BONE, CANDLE, CoffinMark, CRYPT, OXBLOOD } from './terrorTheme';

// A porta do Clube do Terror na Central dos Oráculos. Durante o Halloween
// aparece para todo mundo (trancada para quem ainda não tem a Deadly
// Sleeping, com o quanto falta); fora dele, só para quem usa a tag.
const SecretRoomDoor: React.FC = () => {
  const { t } = useTranslation();
  const { session } = useAuth();
  const { event } = useSeasonalEvent();
  const userId = session?.user?.id;
  const [access, setAccess] = useState<SecretRoomAccess | null>(null);
  // a tag pode ter sido conquistada nesta visita (o evento atualiza)
  const step = event?.steps.find((s) => s.base_tag === (access?.tag?.base ?? 'deadly-sleeping'));
  const stepUnlocked = Boolean(step?.unlocked);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    fetchSecretRoomAccess(TERROR_CLUB)
      .then((result) => alive && setAccess(result))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [userId, stepUnlocked]);

  if (!access?.visible_in_oracle) return null;
  const open = access.granted;
  const tagName = access.tag?.name ?? 'Deadly Sleeping';

  return (
    <Link
      to={roomPath(TERROR_CLUB)}
      className={`group relative flex items-center gap-4 sm:gap-5 overflow-hidden rounded-2xl p-4 sm:p-5 transition hover:brightness-110 ${FOCUS_RING}`}
      style={{
        background: `radial-gradient(70% 140% at 0% 50%, rgba(255,181,71,0.16), transparent 60%), linear-gradient(100deg, rgba(142,27,43,0.38), rgba(15,8,17,0.92) 70%), ${CRYPT}`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), inset 0 0 0 1px ${open ? 'rgba(255,181,71,0.35)' : 'rgba(142,27,43,0.6)'}`,
      }}
    >
      <span className="relative shrink-0">
        <CoffinMark className="w-10 h-16 sm:w-12 sm:h-[76px] transition-transform duration-300 group-hover:-rotate-3" color={open ? CANDLE : OXBLOOD} fill={open ? 'rgba(255,181,71,0.08)' : 'rgba(142,27,43,0.18)'} />
        {!open && (
          <span className="absolute inset-0 grid place-items-center pt-1.5">
            <Lock className="w-4 h-4" style={{ color: CANDLE }} aria-hidden />
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span style={{ ...PIXEL, color: BONE }} className="block text-xl sm:text-2xl leading-tight">
          {t('secretRoom.terror.name')}
        </span>
        <span className="mt-1 block text-sm leading-snug" style={{ color: ASH }}>
          {open ? t('secretRoom.door.open') : t('secretRoom.door.locked', { tag: tagName })}
        </span>
        <span className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: CANDLE }}>
          {open
            ? t('secretRoom.door.enter')
            : step
              ? t('secretRoom.door.progress', { progress: Math.min(step.progress, step.count), count: step.count })
              : t('secretRoom.door.how')}
          <ArrowRight className="w-4 h-4 transition group-hover:translate-x-0.5" aria-hidden />
        </span>
      </span>
    </Link>
  );
};

export default SecretRoomDoor;
