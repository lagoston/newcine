import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Share2, Loader2, Check } from 'lucide-react';
import html2canvas from 'html2canvas';
import ArchetypeSymbol from './ArchetypeSymbol';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  personaCode: string;        // e.g. "EIA"
  archetypeName: string;
  subcategoryName: string;
  username?: string | null;
}

const SUBCATEGORY_COLOR: Record<string, string> = {
  A: '#fbbf24', B: '#64748b', K: '#ef4444', X: '#3b82f6', D: '#9ca3af', L: '#10b981',
};

const SPECTRUM_PT: Record<string, string> = {
  E: 'Emocional', I: 'Intelectual', C: 'Cultural', S: 'Sensorial', R: 'Recreativo',
};
const SPECTRUM_EN: Record<string, string> = {
  E: 'Emotional', I: 'Intellectual', C: 'Cultural', S: 'Sensorial', R: 'Recreational',
};

const PersonaShareModal: React.FC<Props> = ({ isOpen, onClose, personaCode, archetypeName, subcategoryName, username }) => {
  const { i18n } = useTranslation();
  const isPt = i18n.language.startsWith('pt');
  const cardRef = useRef<HTMLDivElement>(null);
  const [generating, setGenerating] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => { if (!isOpen) setDone(false); }, [isOpen]);

  if (!isOpen) return null;

  const archetypeId = personaCode.slice(0, 2);
  const subcategoryId = personaCode.slice(2, 3);
  const color = SUBCATEGORY_COLOR[subcategoryId] || '#3b82f6';

  const primaryLetter = archetypeId.charAt(0);
  const secondaryLetter = archetypeId.charAt(1);
  const primaryName = isPt ? SPECTRUM_PT[primaryLetter] : SPECTRUM_EN[primaryLetter];
  const secondaryName = isPt ? SPECTRUM_PT[secondaryLetter] : SPECTRUM_EN[secondaryLetter];

  const generateBlob = async (): Promise<Blob | null> => {
    if (!cardRef.current) return null;
    const canvas = await html2canvas(cardRef.current, {
      backgroundColor: null,
      scale: 1,
      useCORS: true,
      logging: false,
      width: 1080,
      height: 1920,
    });
    return await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
  };

  const handleShare = async () => {
    setGenerating(true);
    try {
      const blob = await generateBlob();
      if (!blob) throw new Error('Falha ao gerar imagem');
      const file = new File([blob], `cineoracle-${personaCode}.png`, { type: 'image/png' });

      if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `${personaCode} — ${archetypeName}`,
          text: isPt
            ? `Minha persona cinematográfica é ${personaCode} — ${archetypeName} ${subcategoryName}`
            : `My cinematic persona is ${personaCode} — ${archetypeName} ${subcategoryName}`,
        });
        setDone(true);
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cineoracle-${personaCode}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setDone(true);
        toast.success(isPt ? 'Imagem baixada! Compartilhe nos seus stories.' : 'Image saved! Share it on your stories.');
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        toast.error(isPt ? 'Não foi possível gerar a imagem.' : 'Could not generate image.');
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async () => {
    setGenerating(true);
    try {
      const blob = await generateBlob();
      if (!blob) throw new Error();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cineoracle-${personaCode}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDone(true);
      toast.success(isPt ? 'Imagem baixada!' : 'Image downloaded!');
    } catch {
      toast.error(isPt ? 'Falha ao baixar.' : 'Download failed.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        key="share-overlay"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[110] bg-black/85 backdrop-blur-md flex items-center justify-center p-3"
        onClick={onClose}
      >
        <motion.div
          key="share-panel"
          initial={{ y: 30, opacity: 0, scale: 0.96 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 30, opacity: 0, scale: 0.96 }}
          transition={{ type: 'spring', damping: 26, stiffness: 280 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-md rounded-3xl bg-gradient-to-br from-gray-900 to-black border border-white/10 shadow-2xl overflow-hidden flex flex-col"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <h3 className="text-base font-bold text-white">
              {isPt ? 'Compartilhar Persona' : 'Share Persona'}
            </h3>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-300">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Preview (scaled-down version of the 1080x1920 card) */}
          <div className="px-4 py-5 bg-gradient-to-b from-gray-950 to-black flex items-center justify-center">
            <div
              className="rounded-2xl overflow-hidden shadow-2xl"
              style={{
                width: 270,
                height: 480,
                transform: 'translateZ(0)',
              }}
            >
              <div
                style={{
                  width: 270,
                  height: 480,
                  transform: 'scale(0.25)',
                  transformOrigin: 'top left',
                }}
              >
                <div style={{ width: 1080, height: 1920 }}>
                  <ShareCardContent
                    refEl={cardRef}
                    personaCode={personaCode}
                    archetypeId={archetypeId}
                    subcategoryId={subcategoryId}
                    color={color}
                    archetypeName={archetypeName}
                    subcategoryName={subcategoryName}
                    primaryName={primaryName}
                    secondaryName={secondaryName}
                    username={username}
                    isPt={isPt}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="px-5 pb-5 pt-2 flex gap-2 border-t border-white/10 bg-gray-950/40">
            <button
              onClick={handleDownload}
              disabled={generating}
              className="flex-1 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold text-sm flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : done ? <Check className="w-4 h-4" /> : <Download className="w-4 h-4" />}
              {isPt ? 'Baixar' : 'Download'}
            </button>
            <button
              onClick={handleShare}
              disabled={generating}
              className="flex-1 py-3 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-lg"
              style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
              {isPt ? 'Compartilhar' : 'Share'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

const ShareCardContent: React.FC<{
  refEl: React.RefObject<HTMLDivElement>;
  personaCode: string;
  archetypeId: string;
  subcategoryId: string;
  color: string;
  archetypeName: string;
  subcategoryName: string;
  primaryName: string;
  secondaryName: string;
  username?: string | null;
  isPt: boolean;
}> = ({ refEl, personaCode, archetypeId, subcategoryId, color, archetypeName, subcategoryName, primaryName, secondaryName, username, isPt }) => {
  return (
    <div
      ref={refEl}
      style={{
        width: 1080,
        height: 1920,
        position: 'relative',
        background: `radial-gradient(circle at 50% 25%, ${color}55 0%, transparent 55%), linear-gradient(180deg, #0a0a0f 0%, #000000 100%)`,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: '#fff',
        overflow: 'hidden',
      }}
    >
      {/* Decorative grid lines */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `linear-gradient(${color}10 1px, transparent 1px), linear-gradient(90deg, ${color}10 1px, transparent 1px)`,
          backgroundSize: '120px 120px',
          opacity: 0.5,
        }}
      />

      {/* Top brand */}
      <div
        style={{
          position: 'absolute',
          top: 80,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontSize: 28,
          fontWeight: 600,
          letterSpacing: 8,
          color: '#9ca3af',
          textTransform: 'uppercase',
        }}
      >
        Cine Oracle
      </div>

      {/* Symbol */}
      <div
        style={{
          position: 'absolute',
          top: 220,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 380,
          height: 380,
          borderRadius: 40,
          border: `3px solid ${color}60`,
          background: `${color}10`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: `0 0 80px ${color}40, inset 0 0 60px ${color}15`,
        }}
      >
        <ArchetypeSymbol archetypeId={archetypeId} subcategoryId={subcategoryId} size={260} animated={false} />
      </div>

      {/* Persona code */}
      <div
        style={{
          position: 'absolute',
          top: 680,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontSize: 200,
          fontWeight: 900,
          letterSpacing: 12,
          lineHeight: 1,
          color,
          textShadow: `0 0 60px ${color}60`,
        }}
      >
        {personaCode}
      </div>

      {/* Archetype name */}
      <div
        style={{
          position: 'absolute',
          top: 920,
          left: 60,
          right: 60,
          textAlign: 'center',
          fontSize: 72,
          fontWeight: 800,
          color: '#fff',
          lineHeight: 1.1,
        }}
      >
        {archetypeName}
      </div>

      {/* Subcategory */}
      <div
        style={{
          position: 'absolute',
          top: 1040,
          left: 60,
          right: 60,
          textAlign: 'center',
          fontSize: 44,
          fontWeight: 500,
          color: '#d1d5db',
        }}
      >
        {subcategoryName}
      </div>

      {/* Spectrum tags */}
      <div
        style={{
          position: 'absolute',
          top: 1180,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          gap: 16,
        }}
      >
        <div
          style={{
            padding: '14px 32px',
            borderRadius: 999,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)',
            fontSize: 28,
            fontWeight: 600,
            color: '#e5e7eb',
          }}
        >
          {primaryName}
        </div>
        <div
          style={{
            padding: '14px 32px',
            borderRadius: 999,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)',
            fontSize: 28,
            fontWeight: 600,
            color: '#e5e7eb',
          }}
        >
          {secondaryName}
        </div>
      </div>

      {/* Username block */}
      {username && (
        <div
          style={{
            position: 'absolute',
            top: 1320,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontSize: 32,
            color: '#9ca3af',
            fontWeight: 500,
          }}
        >
          @{username}
        </div>
      )}

      {/* Bottom message */}
      <div
        style={{
          position: 'absolute',
          bottom: 220,
          left: 60,
          right: 60,
          textAlign: 'center',
          fontSize: 36,
          fontWeight: 600,
          color: '#fff',
          lineHeight: 1.4,
        }}
      >
        {isPt ? 'Descubra a sua persona cinematográfica' : 'Discover your cinematic persona'}
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: 130,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontSize: 28,
          fontWeight: 700,
          letterSpacing: 4,
          color,
        }}
      >
        cineoracle.com
      </div>

      {/* Bottom accent line */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 8,
          background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
        }}
      />
    </div>
  );
};

export default PersonaShareModal;
