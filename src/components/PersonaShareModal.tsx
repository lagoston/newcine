import React, { useEffect, useRef, useState } from 'react';
import { Download, Share2, Loader2, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import OracleSheet from './OracleSheet';
import { personaText, type UserPersona } from '../lib/persona';
import { showCode } from '../lib/moods';
import { levelText, worldState, type PersonaWorld } from '../lib/personaWorld';
import { renderStudioStory } from '../lib/studioCard';
import { NIGHT, PAPER, MIST, FOCUS_RING } from '../lib/oracleTheme';
import { shareImageFile, downloadImageFile } from '../lib/shareImage';
import { NO_EXTRAS, type StudioExtras } from './personaWorld/studio';

// Compartilhar a Persona: uma imagem 9:16 (pros stories). A arte é desenhada
// num canvas e a prévia mostra exatamente a imagem que vai ser
// baixada/compartilhada.
//
// 14/11/2026 (noite), pedido do Bruno: "adapte o que é compartilhado, o
// conteúdo do stories, com base nas novas implementações". O story deixou de
// ser a foto do personagem com as três prateleiras (lib/personaCard, apagado)
// e passou a ser o estúdio da pessoa com a mariposa dela (lib/studioCard): o
// que ela vê quando abre a gaveta.
//
// Compartilhar/baixar passam por lib/shareImage (13/10/2026): no app
// Android abre a folha de compartilhar do sistema (antes nada acontecia);
// no navegador, Web Share com o arquivo ou download.

interface Props {
  isOpen: boolean;
  onClose: () => void;
  persona: UserPersona;
  // o estúdio que vai no story (e a sala de estar como a pessoa vê)
  world: PersonaWorld;
  extras?: StudioExtras;
  username?: string | null;
}

const PersonaShareModal: React.FC<Props> = ({ isOpen, onClose, persona, world, extras = NO_EXTRAS, username }) => {
  const { t, i18n } = useTranslation();
  // A imagem pronta (JPEG, resolução cheia) e a prévia (blob URL).
  const blobRef = useRef<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [done, setDone] = useState(false);

  const code = persona.code;
  const entry = persona.persona;
  const { jackpot, poker } = extras;

  // Desenha a arte sempre que a gaveta abre (ou muda idioma/personalidade).
  useEffect(() => {
    if (!isOpen || !code || !entry) return;
    let cancelled = false;
    setDone(false);
    setPreview(null);
    blobRef.current = null;
    const text = personaText(entry, i18n.language);
    const st = worldState(world);
    renderStudioStory({
      world,
      extras: { jackpot, poker },
      title: text.title,
      subtitle: text.sameAsFilm ? text.filmWithYear : t('oracle.persona.characterIn', { character: text.character, film: text.filmWithYear }),
      gauge: levelText(t, st),
      rated: t('oracle.share.cardRated', { count: world.rated }),
      username,
      cta: t('oracle.share.cardCta'),
    })
      .then((blob) => {
        if (cancelled) return;
        blobRef.current = blob;
        setPreview(URL.createObjectURL(blob));
      })
      .catch((err) => {
        console.error('Error drawing studio story:', err);
        if (!cancelled) toast.error(t('oracle.share.error'));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, code, entry, world, jackpot, poker, i18n.language, username]);

  // Libera a prévia anterior quando troca ou a gaveta some.
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview]
  );

  if (!code || !entry) return null;
  const title = personaText(entry, i18n.language).title;

  const fileName = `cineoracle-${showCode(code)}.jpg`;

  const handleShare = async () => {
    const blob = blobRef.current;
    if (!blob) return;
    setGenerating(true);
    try {
      const route = await shareImageFile(blob, fileName, {
        title: `${showCode(code)} — ${title}`,
        text: t('oracle.share.shareText', { code, name: title }),
        dialogTitle: t('oracle.share.title'),
      });
      if (route !== 'cancelled') setDone(true);
      if (route === 'download') toast.success(t('oracle.share.downloadedStories'));
    } catch (err: unknown) {
      console.error('Error sharing persona card:', err);
      toast.error(t('oracle.share.error'));
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async () => {
    const blob = blobRef.current;
    if (!blob) return;
    setGenerating(true);
    try {
      const route = await downloadImageFile(blob, fileName, { dialogTitle: t('oracle.share.title') });
      if (route !== 'cancelled') setDone(true);
      if (route === 'download') toast.success(t('oracle.share.downloaded'));
    } catch (err: unknown) {
      console.error('Error saving persona card:', err);
      toast.error(t('oracle.share.error'));
    } finally {
      setGenerating(false);
    }
  };

  const busy = generating || !preview;

  return (
    <OracleSheet
      open={isOpen}
      onClose={onClose}
      title={t('oracle.share.title')}
      subtitle={t('oracle.share.hint')}
      size="md"
      zIndexClass="z-[9995]"
      bodyClassName="px-5 sm:px-7 py-6"
      footer={
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleDownload}
            disabled={busy}
            className={`gap-2 h-12 rounded-xl border border-white/15 hover:border-white/35 hover:bg-white/5 text-sm font-semibold transition disabled:opacity-50 ${FOCUS_RING}`}
            style={{ color: PAPER }}
          >
            {generating ? <Loader2 className="w-[18px] h-[18px] animate-spin" aria-hidden /> : done ? <Check className="w-[18px] h-[18px] text-emerald-300" aria-hidden /> : <Download className="w-[18px] h-[18px] text-violet-300" aria-hidden />}
            {t('oracle.share.download')}
          </button>
          <button
            onClick={handleShare}
            disabled={busy}
            className={`gap-2 h-12 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-sm font-semibold shadow-lg shadow-fuchsia-900/30 transition disabled:opacity-50 ${FOCUS_RING}`}
          >
            {generating ? <Loader2 className="w-[18px] h-[18px] animate-spin" aria-hidden /> : <Share2 className="w-[18px] h-[18px]" aria-hidden />}
            {t('oracle.share.share')}
          </button>
        </div>
      }
    >
      <div className="flex justify-center">
        <div className="relative rounded-2xl overflow-hidden ring-1 ring-white/15 shadow-2xl shadow-black/60" style={{ width: 270, height: 480, background: NIGHT }}>
          {preview ? (
            <img src={preview} alt={`${showCode(code)} — ${title}`} width={270} height={480} className="block w-full h-full" />
          ) : (
            <span className="absolute inset-0 grid place-items-center" role="status">
              <Loader2 className="w-7 h-7 animate-spin" style={{ color: MIST }} aria-hidden />
              <span className="sr-only">{t('common.loading')}</span>
            </span>
          )}
        </div>
      </div>
    </OracleSheet>
  );
};

export default PersonaShareModal;
