import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../lib/auth';
import { PIXEL, FOCUS_RING } from '../../lib/oracleTheme';
import { fetchSecretRoomPortal, roomForTagName, roomPath } from '../../lib/secretRooms';
import { BONE } from './terrorTheme';
import { PortalSpiral } from './TerrorPortal';

// O portal no perfil (23/10/2026): quem está usando a tag de uma sala
// secreta (a Deadly Sleeping abre o Clube do Terror) ganha, no cartão do
// perfil, uma espiral com o nome do clube. Tocar leva direto para dentro da
// sala — no perfil de outra pessoa, como convidado dela (?via=), mesmo sem a
// tag e mesmo depois do evento.
//
// 02/11/2026, dois ajustes pedidos pelo Bruno:
//   • O portal só existe no perfil de quem está USANDO a tag. Antes, no
//     próprio perfil de quem tinha a Deadly Sleeping mas usava outra tag,
//     aparecia um portal fechado (parado, apagado, "Use a Deadly Sleeping
//     para abrir") — saiu.
//   • Sem o "estica" ao abrir o perfil. A espiral só entrava no cartão quando
//     a consulta ao servidor voltava, e o cartão (com o banner) crescia na
//     frente da pessoa. Agora a decisão vem da tag em uso, que chega junto com
//     o perfil: o portal ocupa o seu lugar já no primeiro quadro, no tamanho
//     final. A consulta (get_secret_room_portal) só confirma — se o servidor
//     disser que aquele perfil não é portal (a tag em uso não é mesmo da
//     pessoa), ele sai.

const PORTAL_SIZE = 84;
const LABEL_SHADOW = '0 1px 2px rgba(0,0,0,0.85), 0 0 14px rgba(255,181,71,0.5)';

const SecretRoomPortal: React.FC<{
  userId: string;
  username: string;
  isSelf: boolean;
  // A tag em uso no perfil ("Deadly Sleeping", "Deadly Sleeping II"…): é ela
  // que decide, na hora, se o perfil é um portal.
  activeTagName?: string | null;
}> = ({ userId, username, isSelf, activeTagName }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { session } = useAuth();
  const viewerId = session?.user?.id;
  const expectedRoom = roomForTagName(activeTagName);
  // null = ainda não confirmou (vale o que a tag diz); false = o servidor
  // disse que não é portal.
  const [confirmed, setConfirmed] = useState<{ room: string } | false | null>(null);

  useEffect(() => {
    setConfirmed(null);
    if (!viewerId || !expectedRoom) return;
    let alive = true;
    fetchSecretRoomPortal(userId)
      .then((result) => alive && setConfirmed(result?.open ? { room: result.room } : false))
      // Falhou a consulta: fica o que a tag diz (o clube ainda confere na porta).
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [viewerId, userId, expectedRoom]);

  if (!viewerId || !expectedRoom || confirmed === false) return null;
  const room = confirmed ? confirmed.room : expectedRoom;

  return (
    <button
      type="button"
      onClick={() => navigate(roomPath(room, isSelf ? null : username))}
      className={`group flex flex-col items-center gap-2 rounded-2xl px-2 pt-1 pb-1.5 ${FOCUS_RING}`}
      aria-label={isSelf ? t('secretRoom.portal.enterAria') : t('secretRoom.portal.enterViaAria', { username })}
    >
      <PortalSpiral
        size={PORTAL_SIZE}
        className="transition-transform duration-500 ease-out group-hover:scale-[1.07] group-active:scale-95 motion-reduce:transition-none"
      />
      <span style={{ ...PIXEL, color: BONE, textShadow: LABEL_SHADOW }} className="text-[15px] leading-none whitespace-nowrap">
        {t('secretRoom.terror.name')}
      </span>
    </button>
  );
};

export default SecretRoomPortal;
