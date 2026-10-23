import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../lib/auth';
import { PIXEL, FOCUS_RING } from '../../lib/oracleTheme';
import { TERROR_CLUB, fetchSecretRoomAccess, fetchSecretRoomPortal, roomPath, type SecretRoomAccess, type SecretRoomPortal as PortalState } from '../../lib/secretRooms';
import { ASH, BONE } from './terrorTheme';
import { PortalSpiral } from './TerrorPortal';

// O portal no perfil (23/10/2026): quem está usando a tag de uma sala
// secreta (a Deadly Sleeping abre o Clube do Terror) ganha, no cartão do
// perfil, uma espiral com o nome do clube. Tocar leva direto para dentro da
// sala — no perfil de outra pessoa, como convidado dela (?via=), mesmo sem a
// tag e mesmo depois do evento.
// No próprio perfil, com a tag mas sem usar, o portal aparece fechado
// (parado e apagado); tocar abre a escolha de tags.

const PORTAL_SIZE = 84;
const LABEL_SHADOW = '0 1px 2px rgba(0,0,0,0.85), 0 0 14px rgba(255,181,71,0.5)';

const SecretRoomPortal: React.FC<{
  userId: string;
  username: string;
  isSelf: boolean;
  // muda quando a tag em uso muda (refaz a consulta)
  activeTagName?: string | null;
  onChooseTag?: () => void;
}> = ({ userId, username, isSelf, activeTagName, onChooseTag }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { session } = useAuth();
  const viewerId = session?.user?.id;
  const [portal, setPortal] = useState<PortalState | null>(null);
  const [ownAccess, setOwnAccess] = useState<SecretRoomAccess | null>(null);

  useEffect(() => {
    if (!viewerId) return;
    let alive = true;
    fetchSecretRoomPortal(userId)
      .then((result) => alive && setPortal(result?.open ? result : null))
      .catch(() => alive && setPortal(null));
    if (isSelf) {
      fetchSecretRoomAccess(TERROR_CLUB)
        .then((result) => alive && setOwnAccess(result))
        .catch(() => undefined);
    }
    return () => {
      alive = false;
    };
  }, [viewerId, userId, isSelf, activeTagName]);

  if (!viewerId) return null;

  const button = `group flex flex-col items-center gap-2 rounded-2xl px-2 pt-1 pb-1.5 ${FOCUS_RING}`;
  const spiralMotion = 'transition-transform duration-500 ease-out group-hover:scale-[1.07] group-active:scale-95 motion-reduce:transition-none';

  // Tem a chave, mas o perfil ainda não é um portal: o portal fechado.
  if (!portal) {
    if (!isSelf || !ownAccess?.has_tag || ownAccess.tag_in_use || !onChooseTag) return null;
    const tag = ownAccess.tag?.name ?? 'Deadly Sleeping';
    return (
      <button type="button" onClick={onChooseTag} className={button} aria-label={t('secretRoom.portal.closedAria', { tag })}>
        <PortalSpiral size={PORTAL_SIZE} dormant className={spiralMotion} />
        <span style={{ ...PIXEL, color: ASH, textShadow: '0 1px 2px rgba(0,0,0,0.85)' }} className="text-[15px] leading-none whitespace-nowrap">
          {t('secretRoom.terror.name')}
        </span>
        <span className="max-w-[10rem] text-center text-xs leading-snug" style={{ color: ASH }}>
          {t('secretRoom.portal.closedHint', { tag })}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => navigate(roomPath(portal.room, isSelf ? null : username))}
      className={button}
      aria-label={isSelf ? t('secretRoom.portal.enterAria') : t('secretRoom.portal.enterViaAria', { username })}
    >
      <PortalSpiral size={PORTAL_SIZE} className={spiralMotion} />
      <span style={{ ...PIXEL, color: BONE, textShadow: LABEL_SHADOW }} className="text-[15px] leading-none whitespace-nowrap">
        {t('secretRoom.terror.name')}
      </span>
    </button>
  );
};

export default SecretRoomPortal;
