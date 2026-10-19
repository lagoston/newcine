import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Link2, Tag } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import OracleSheet from '../OracleSheet';
import { useAuth } from '../../lib/auth';
import { PIXEL, FOCUS_RING } from '../../lib/oracleTheme';
import { TERROR_CLUB, fetchSecretRoomAccess, fetchSecretRoomPortal, roomPath, type SecretRoomAccess, type SecretRoomPortal as PortalState } from '../../lib/secretRooms';
import { ASH, BONE, CANDLE, CoffinMark, CRYPT, CRYPT_RAISED } from './terrorTheme';

// O portal no perfil: quem está usando a tag de uma sala secreta (a
// Deadly Sleeping abre o Clube do Terror) leva quem visita o perfil para
// dentro da sala, mesmo sem a tag e mesmo depois do evento. No próprio
// perfil, o aviso de que o portal está aberto (e o convite para copiar);
// se a pessoa tem a tag mas não está usando, a dica para usar.

const BUTTON = `inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl text-sm font-semibold transition ${FOCUS_RING}`;

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
  const [open, setOpen] = useState(false);

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

  // Tem a chave, mas o perfil ainda não é um portal.
  if (!portal) {
    if (!isSelf || !ownAccess?.has_tag || ownAccess.tag_in_use) return null;
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3" style={{ background: CRYPT_RAISED, boxShadow: 'inset 0 0 0 1px rgba(255,181,71,0.22)' }}>
        <CoffinMark className="w-6 h-10 shrink-0" />
        <p className="flex-1 min-w-[12rem] text-sm leading-snug" style={{ color: ASH }}>
          {t('secretRoom.portal.nudge', { tag: ownAccess.tag?.name ?? 'Deadly Sleeping' })}
        </p>
        {onChooseTag && (
          <button type="button" onClick={onChooseTag} className={BUTTON} style={{ color: BONE, boxShadow: 'inset 0 0 0 1px rgba(243,234,211,0.2)' }}>
            <Tag className="w-4 h-4" style={{ color: CANDLE }} aria-hidden />
            {t('secretRoom.portal.chooseTag')}
          </button>
        )}
      </div>
    );
  }

  const enter = () => {
    setOpen(false);
    navigate(roomPath(portal.room, isSelf ? null : username));
  };

  const copyInvite = async () => {
    const url = `${window.location.origin}${roomPath(portal.room, username)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('secretRoom.portal.copied'));
    } catch {
      toast.error(t('secretRoom.portal.copyFailed'));
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`group w-full flex items-center gap-3.5 rounded-2xl px-4 py-3 text-left transition hover:brightness-110 ${FOCUS_RING}`}
        style={{
          background: `radial-gradient(60% 160% at 0% 50%, rgba(255,181,71,0.18), transparent 65%), linear-gradient(100deg, rgba(142,27,43,0.35), rgba(15,8,17,0.9) 75%), ${CRYPT}`,
          boxShadow: 'inset 0 0 0 1px rgba(255,181,71,0.32)',
        }}
      >
        <CoffinMark className="w-7 h-11 shrink-0 transition-transform duration-300 group-hover:-rotate-6" />
        <span className="min-w-0 flex-1">
          <span style={{ ...PIXEL, color: BONE }} className="block text-lg leading-tight">
            {t('secretRoom.portal.title')}
          </span>
          <span className="mt-0.5 block text-sm leading-snug" style={{ color: ASH }}>
            {isSelf ? t('secretRoom.portal.selfLine') : t('secretRoom.portal.otherLine', { username })}
          </span>
        </span>
        <ArrowRight className="w-5 h-5 shrink-0 transition group-hover:translate-x-0.5" style={{ color: CANDLE }} aria-hidden />
      </button>

      <OracleSheet
        open={open}
        onClose={() => setOpen(false)}
        size="md"
        title={t('secretRoom.terror.name')}
        leading={<CoffinMark className="w-6 h-10" />}
        footer={
          <div className="flex flex-wrap justify-end gap-2.5">
            {isSelf && (
              <button type="button" onClick={copyInvite} className={BUTTON} style={{ color: BONE, boxShadow: 'inset 0 0 0 1px rgba(243,234,211,0.2)' }}>
                <Link2 className="w-4 h-4" style={{ color: CANDLE }} aria-hidden />
                {t('secretRoom.portal.copyInvite')}
              </button>
            )}
            <button type="button" onClick={enter} className={BUTTON} style={{ background: CANDLE, color: CRYPT }}>
              {isSelf ? t('secretRoom.portal.enterSelf') : t('secretRoom.portal.enterVia')}
            </button>
          </div>
        }
      >
        <div className="space-y-3 text-[15px] leading-relaxed" style={{ color: ASH }}>
          <p style={{ color: BONE }}>{t('secretRoom.portal.sheetLead')}</p>
          <p>{isSelf ? t('secretRoom.portal.sheetSelf', { tag: portal.tag.name }) : t('secretRoom.portal.sheetOther', { username, tag: portal.tag.name })}</p>
        </div>
      </OracleSheet>
    </>
  );
};

export default SecretRoomPortal;
