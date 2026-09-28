import React, { useEffect, useRef, useState } from 'react';
import { Download, Share2, Loader2, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import OracleSheet from './OracleSheet';
import { MOOD_BY_KEY, MOOD_BY_LETTER } from '../lib/moods';
import { personaText, posterUrl, topMoodKeys, type UserPersona } from '../lib/persona';
import { drawPersonaCard } from '../lib/personaCard';
import { NIGHT, PAPER, MIST, FOCUS_RING, ORACLES } from '../lib/oracleTheme';

// Compartilhar personalidade: uma imagem 9:16 (pros stories) com o pôster
// do personagem, o código de 3 letras, o título, as três prateleiras e o @.
// A arte é desenhada num canvas (lib/personaCard) e a prévia mostra
// exatamente a imagem que vai ser baixada/compartilhada.

interface Props {
  isOpen: boolean;
  onClose: () => void;
  persona: UserPersona;
  username?: string | null;
}

const PersonaShareModal: React.FC<Props> = ({ isOpen, onClose, persona, username }) => {
  const { t, i18n } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [done, setDone] = useState(false);

  const code = persona.code;
  const entry = persona.persona;

  // Desenha a arte sempre que a gaveta abre (ou muda idioma/personalidade).
  useEffect(() => {
    if (!isOpen || !code || !entry) return;
    let cancelled = false;
    setDone(false);
    setPreview(null);
    const text = personaText(entry, i18n.language);
    const shelves = topMoodKeys(persona)
      .map((key) => MOOD_BY_KEY[key])
      .filter(Boolean)
      .map((mood) => ({ letter: mood.letter, label: t(mood.labelKey), color: mood.color }));
    drawPersonaCard({
      code,
      codeColors: code.split('').map((l) => MOOD_BY_LETTER[l]?.color ?? PAPER),
      label: t('oracle.share.cardMyPersona'),
      title: text.title,
      subtitle: text.sameAsFilm ? text.filmWithYear : `${text.character} · ${text.filmWithYear}`,
      shelves,
      username,
      cta: t('oracle.share.cardCta'),
      posterUrl: posterUrl(entry.posterPath, 'w500'),
      glow: MOOD_BY_LETTER[code.charAt(0)]?.color ?? '#8B5CF6',
      oracles: ORACLES.map((o) => ({ avatar: o.avatar, color: o.color })),
    })
      .then((canvas) => {
        if (cancelled) return;
        canvasRef.current = canvas;
        setPreview(canvas.toDataURL('image/png'));
      })
      .catch((err) => {
        console.error('Error drawing persona card:', err);
        if (!cancelled) toast.error(t('oracle.share.error'));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, code, entry, i18n.language, username]);

  if (!code || !entry) return null;
  const title = personaText(entry, i18n.language).title;

  const getBlob = async (): Promise<Blob | null> => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
  };

  const saveBlob = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cineoracle-${code}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleShare = async () => {
    setGenerating(true);
    try {
      const blob = await getBlob();
      if (!blob) throw new Error('no image');
      const file = new File([blob], `cineoracle-${code}.png`, { type: 'image/png' });

      if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `${code} — ${title}`,
          text: t('oracle.share.shareText', { code, name: title }),
        });
        setDone(true);
      } else {
        saveBlob(blob);
        setDone(true);
        toast.success(t('oracle.share.downloadedStories'));
      }
    } catch (err: unknown) {
      if ((err as { name?: string })?.name !== 'AbortError') {
        toast.error(t('oracle.share.error'));
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async () => {
    setGenerating(true);
    try {
      const blob = await getBlob();
      if (!blob) throw new Error('no image');
      saveBlob(blob);
      setDone(true);
      toast.success(t('oracle.share.downloaded'));
    } catch {
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
            <img src={preview} alt={`${code} — ${title}`} width={270} height={480} className="block w-full h-full" />
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
