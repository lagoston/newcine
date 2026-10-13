import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Share2, Loader2, Check, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import OracleSheet from '../OracleSheet';
import { NIGHT, PAPER, MIST, FOCUS_RING } from '../../lib/oracleTheme';
import { formatConnection, tierLabelKey, type ConnectionDetail, type ConnectionSide } from '../../lib/connection';
import { renderConnectionStory, connectionStoryFileName } from '../../lib/connectionCard';
import { shareImageFile, downloadImageFile, CAN_DOWNLOAD_IMAGE } from '../../lib/shareImage';

// Compartilhar a conexão nos stories (13/10/2026). Ao abrir, a gaveta já
// desenha o story 1080×1920 (lib/connectionCard) e mostra a prévia — que é
// exatamente o arquivo que vai sair. Com a imagem pronta antes do toque, o
// "Compartilhar" chama a folha de compartilhar na hora (o navegador só
// deixa compartilhar logo depois de um toque).
//
// No app (Android), "Compartilhar" abre a folha do sistema (Instagram,
// WhatsApp, salvar no Fotos…) e não há botão de baixar: o WebView não
// baixa arquivos. No navegador, os dois botões.

export interface ConnectionShareSheetProps {
  open: boolean;
  onClose: () => void;
  detail: ConnectionDetail;
  me: ConnectionSide;
  other: ConnectionSide;
}

type Story = { status: 'loading' } | { status: 'error' } | { status: 'ready'; blob: Blob; url: string };

const ConnectionShareSheet: React.FC<ConnectionShareSheetProps> = ({ open, onClose, detail, me, other }) => {
  const { t, i18n } = useTranslation();
  const language = i18n.language || 'pt';
  const [story, setStory] = useState<Story>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<'share' | 'download' | null>(null);
  const [done, setDone] = useState(false);
  const [imgShown, setImgShown] = useState(false);

  const hasScore = detail.pct !== null && detail.confidence !== 'none';
  // O que muda a arte. Comparar por valor (e não pelo objeto) evita
  // redesenhar quando quem abre a gaveta recria os objetos a cada render.
  const signature = [
    detail.pct,
    detail.confidence,
    detail.shared_count,
    (detail.loves || []).map((l) => `${l.media_type}:${l.movie_id}`).join(','),
    me.username,
    me.avatar_url,
    me.avatar_frame,
    me.is_premium,
    me.persona_code,
    other.username,
    other.avatar_url,
    other.avatar_frame,
    other.is_premium,
    other.persona_code,
    language,
  ].join('|');

  // Último story pronto (para não redesenhar ao reabrir com os mesmos dados).
  const readyKey = useRef<string | null>(null);
  const storyRef = useRef(story);
  storyRef.current = story;

  useEffect(() => {
    if (!open || !hasScore) return;
    const key = `${signature}#${attempt}`;
    if (readyKey.current === key && storyRef.current.status === 'ready') return;
    let cancelled = false;
    setStory({ status: 'loading' });
    setImgShown(false);
    const pct = detail.pct as number;
    renderConnectionStory({
      detail,
      me,
      other,
      language,
      copy: {
        label: t('connection.title'),
        tier: t(tierLabelKey(pct)),
        shared: t('connection.story.shared', { count: detail.shared_count }),
        confidence: t(`connection.confidence.${detail.confidence}`),
        loved: t('connection.story.loved'),
        cta: t('connection.story.cta'),
      },
    })
      .then((blob) => {
        if (cancelled) return;
        readyKey.current = key;
        setStory({ status: 'ready', blob, url: URL.createObjectURL(blob) });
      })
      .catch((err) => {
        console.error('Error drawing connection story:', err);
        if (!cancelled) setStory({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
    // `detail`, `me` e `other` entram pela assinatura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hasScore, signature, attempt]);

  // Cada vez que a gaveta abre, o "feito" (✓) recomeça.
  useEffect(() => {
    if (open) setDone(false);
  }, [open]);

  // Libera a prévia anterior (blob URL) quando troca ou a gaveta some.
  const previewUrl = story.status === 'ready' ? story.url : null;
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl]
  );

  const fileName = connectionStoryFileName(me, other);

  const handleShare = async () => {
    if (story.status !== 'ready' || busy) return;
    setBusy('share');
    try {
      // Sem texto junto: nos stories a imagem vai sozinha.
      const route = await shareImageFile(story.blob, fileName, {
        title: t('connection.share.shareTitle'),
        dialogTitle: t('connection.share.dialogTitle'),
      });
      if (route === 'download') toast.success(t('connection.share.downloaded'));
      if (route !== 'cancelled') setDone(true);
    } catch (err) {
      console.error('Error sharing connection story:', err);
      toast.error(t('connection.share.shareError'));
    } finally {
      setBusy(null);
    }
  };

  const handleDownload = async () => {
    if (story.status !== 'ready' || busy) return;
    setBusy('download');
    try {
      const route = await downloadImageFile(story.blob, fileName, { dialogTitle: t('connection.share.dialogTitle') });
      if (route === 'download') toast.success(t('connection.share.downloaded'));
      if (route !== 'cancelled') setDone(true);
    } catch (err) {
      console.error('Error saving connection story:', err);
      toast.error(t('connection.share.shareError'));
    } finally {
      setBusy(null);
    }
  };

  const ready = story.status === 'ready';
  const pctText = hasScore ? formatConnection(detail.pct as number) : '';
  const alt = hasScore
    ? t('connection.share.previewAlt', { me: me.username, other: other.username, pct: pctText, tier: t(tierLabelKey(detail.pct as number)) })
    : '';

  return (
    <OracleSheet
      open={open}
      onClose={onClose}
      title={t('connection.share.title')}
      subtitle={t('connection.share.subtitle', { username: other.username })}
      size="md"
      zIndexClass="z-[10002]"
      bodyClassName="px-5 sm:px-7 py-5"
      footer={
        hasScore ? (
          <div className={`grid gap-2 ${CAN_DOWNLOAD_IMAGE ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {CAN_DOWNLOAD_IMAGE && (
              <button
                type="button"
                onClick={handleDownload}
                disabled={!ready || busy !== null}
                className={`gap-2 h-12 rounded-xl border border-white/15 hover:border-white/35 hover:bg-white/5 text-sm font-semibold transition disabled:opacity-50 ${FOCUS_RING}`}
                style={{ color: PAPER }}
              >
                {busy === 'download' ? (
                  <Loader2 className="w-[18px] h-[18px] animate-spin" aria-hidden />
                ) : done ? (
                  <Check className="w-[18px] h-[18px] text-emerald-300" aria-hidden />
                ) : (
                  <Download className="w-[18px] h-[18px] text-violet-300" aria-hidden />
                )}
                {t('connection.share.download')}
              </button>
            )}
            <button
              type="button"
              onClick={handleShare}
              disabled={!ready || busy !== null}
              className={`gap-2 h-12 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-sm font-semibold shadow-lg shadow-fuchsia-900/30 transition disabled:opacity-50 ${FOCUS_RING}`}
            >
              {busy === 'share' ? <Loader2 className="w-[18px] h-[18px] animate-spin" aria-hidden /> : <Share2 className="w-[18px] h-[18px]" aria-hidden />}
              {t('connection.share.share')}
            </button>
          </div>
        ) : undefined
      }
    >
      {/* Prévia 9:16: a altura acompanha a tela (cabe com o cabeçalho e os
          botões) e a largura sai da proporção. */}
      <div
        className="relative mx-auto rounded-2xl overflow-hidden ring-1 ring-white/15 shadow-2xl shadow-black/60"
        style={{ height: 'min(512px, calc(92dvh - 236px))', aspectRatio: '9 / 16', background: NIGHT }}
      >
        {!hasScore ? (
          <p className="absolute inset-0 grid place-items-center px-6 text-center text-sm leading-relaxed" style={{ color: MIST }}>
            {t('connection.share.noScore')}
          </p>
        ) : story.status === 'error' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center" role="alert">
            <p className="text-sm leading-relaxed" style={{ color: MIST }}>
              {t('connection.share.error')}
            </p>
            <button
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
              className={`gap-2 h-11 px-4 rounded-xl border border-white/15 hover:border-white/35 hover:bg-white/5 text-sm font-semibold transition ${FOCUS_RING}`}
              style={{ color: PAPER }}
            >
              <RotateCcw className="w-4 h-4 text-violet-300" aria-hidden />
              {t('connection.share.retry')}
            </button>
          </div>
        ) : (
          <>
            {story.status === 'ready' && (
              <img
                src={story.url}
                alt={alt}
                onLoad={() => setImgShown(true)}
                className={`absolute inset-0 block w-full h-full object-cover transition-opacity duration-300 motion-reduce:transition-none ${imgShown ? 'opacity-100' : 'opacity-0'}`}
              />
            )}
            {!imgShown && (
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-3" role="status">
                <Loader2 className="w-7 h-7 animate-spin" style={{ color: MIST }} aria-hidden />
                <span className="text-sm" style={{ color: MIST }}>
                  {t('connection.share.generating')}
                </span>
              </span>
            )}
          </>
        )}
      </div>
    </OracleSheet>
  );
};

export default ConnectionShareSheet;
