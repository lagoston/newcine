import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Lock, Loader2, Star, BookOpen, Feather, RefreshCw, Send, Crown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Movie } from '../lib/tmdb';

interface OracleReviewSectionProps {
  movie: Movie;
  userRating: number;
  onPosted: () => void;
}

// Exemplos cíclicos mostrados ANTES da primeira geração — só pra dar
// uma ideia visual do que vai acontecer (título curto + um parágrafo),
// nunca texto real do usuário. Varia entre "personalidades" diferentes
// pra sugerir a variedade de estilos que o Oráculo consegue captar.
const EXAMPLES = [
  {
    title: 'Um soco no estômago, no bom sentido',
    content: 'Não esperava sair do cinema em silêncio, mas foi exatamente isso que aconteceu. A direção segura cada cena até o momento certo de deixar tudo desabar, e quando desaba, dói do jeito que só um bom roteiro consegue doer.',
  },
  {
    title: 'Bonito de ver, vazio de sentir',
    content: 'Tecnicamente é impecável — cada plano parece pensado a milímetros, a trilha sonora nunca erra o tom. Só que no fim das contas fiquei admirando a superfície sem nunca ser puxado pra dentro da história, e isso é uma pena.',
  },
  {
    title: 'Aquele tipo de clássico instantâneo',
    content: 'Tem filme que a gente sabe, nos primeiros dez minutos, que vai voltar a assistir daqui uns anos. Esse é um deles. Simples na superfície, generoso em camadas, e com um final que justifica cada escolha anterior.',
  },
];

type OracleStep =
  | 'checking'
  | 'locked_premium'
  | 'locked_reviews'
  | 'idle'
  | 'generating'
  | 'generated'
  | 'posting';

const OracleReviewSection: React.FC<OracleReviewSectionProps> = ({ movie, userRating, onPosted }) => {
  const { session } = useAuth();
  const { t, i18n } = useTranslation();
  const [step, setStep] = useState<OracleStep>('checking');
  const [reviewCount, setReviewCount] = useState(0);
  const [exampleIndex, setExampleIndex] = useState(0);
  const [generatedTitle, setGeneratedTitle] = useState('');
  const [generatedContent, setGeneratedContent] = useState('');

  const mediaType = movie.media_type || 'movie';
  const movieTitle = movie.title || movie.name || '';

  // Checagem de acesso — a MESMA lógica de gate que a edge function
  // aplica (premium + 10 reviews reais), só que aqui é só pra decidir o
  // que MOSTRAR na tela antes de gastar uma chamada de geração de
  // verdade; a edge function sempre reconfirma os dois no servidor.
  useEffect(() => {
    const checkAccess = async () => {
      if (!session?.user?.id) return;
      try {
        const [{ data: profile }, { count }] = await Promise.all([
          supabase.from('profiles').select('plan_type').eq('id', session.user.id).maybeSingle(),
          supabase
            .from('reviews')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', session.user.id)
            .eq('is_ai_generated', false),
        ]);

        const isPremium = profile?.plan_type === 'premium';
        const count10 = count || 0;
        setReviewCount(count10);

        if (!isPremium) {
          setStep('locked_premium');
        } else if (count10 < 10) {
          setStep('locked_reviews');
        } else {
          setStep('idle');
        }
      } catch (error) {
        console.error('Error checking oracle access:', error);
        setStep('locked_reviews');
      }
    };
    checkAccess();
  }, [session?.user?.id]);

  // Cicla os exemplos enquanto o usuário ainda não gerou nada de verdade.
  useEffect(() => {
    if (step !== 'idle') return;
    const interval = setInterval(() => {
      setExampleIndex((i) => (i + 1) % EXAMPLES.length);
    }, 3500);
    return () => clearInterval(interval);
  }, [step]);

  const handleGenerate = async () => {
    if (!session?.user?.id) return;
    setStep('generating');

    try {
      const { data, error } = await supabase.functions.invoke('generate-ai-review', {
        body: {
          userId: session.user.id,
          movieId: movie.id,
          mediaType,
          rating: userRating,
          movieTitle,
          language: i18n.language,
        },
      });

      if (error) throw error;

      if (!data.success) {
        if (data.error === 'premium_required') setStep('locked_premium');
        else if (data.error === 'not_enough_reviews') {
          setReviewCount(data.reviewCount || 0);
          setStep('locked_reviews');
        } else {
          throw new Error(data.error);
        }
        return;
      }

      setGeneratedTitle(data.title);
      setGeneratedContent(data.content);
      setStep('generated');
    } catch (error) {
      console.error('Error generating oracle review:', error);
      toast.error(t('reviews.oracle.generateError'));
      setStep('idle');
    }
  };

  const handlePost = async () => {
    if (!session?.user?.id) return;
    setStep('posting');

    try {
      const { error } = await supabase.from('reviews').insert([
        {
          user_id: session.user.id,
          movie_id: movie.id,
          media_type: mediaType,
          title: generatedTitle,
          content: generatedContent,
          has_spoilers: false,
          rating: userRating,
          is_ai_generated: true,
        },
      ]);

      if (error) throw error;

      toast.success(t('reviews.published'));
      onPosted();
    } catch (error: any) {
      console.error('Error posting oracle review:', error);
      toast.error(error.message || t('reviews.saveError'));
      setStep('generated');
    }
  };

  const oracleSteps = useMemo(
    () => [
      { icon: <Star className="w-5 h-5" />, text: t('reviews.oracle.step1', { rating: userRating }) },
      { icon: <BookOpen className="w-5 h-5" />, text: t('reviews.oracle.step2') },
      { icon: <Feather className="w-5 h-5" />, text: t('reviews.oracle.step3') },
    ],
    [t, userRating]
  );

  if (step === 'checking') {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-pink-500" />
      </div>
    );
  }

  if (step === 'locked_premium' || step === 'locked_reviews') {
    return (
      <div className="bg-pink-500/10 border border-pink-400/30 rounded-2xl p-5 text-center space-y-3">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-gradient-to-br from-pink-500/20 to-fuchsia-500/20 border border-pink-400/30 flex items-center justify-center">
          <Lock className="w-6 h-6 text-pink-500" />
        </div>
        {step === 'locked_premium' ? (
          <>
            <p className="font-medium text-gray-800 dark:text-gray-100 flex items-center justify-center gap-1.5">
              <Crown className="w-4 h-4 text-yellow-400" />
              {t('reviews.oracle.lockedPremiumTitle')}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('reviews.oracle.lockedPremiumHint')}
            </p>
          </>
        ) : (
          <>
            <p className="font-medium text-gray-800 dark:text-gray-100">
              {t('reviews.oracle.lockedReviewsTitle')}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('reviews.oracle.lockedReviewsHint', { count: reviewCount })}
            </p>
            <div className="w-full h-2 bg-gray-200/50 dark:bg-gray-700/50 rounded-full overflow-hidden max-w-xs mx-auto">
              <div
                className="h-full bg-gradient-to-r from-pink-500 to-fuchsia-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, (reviewCount / 10) * 100)}%` }}
              />
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {(step === 'idle' || step === 'generating') && (
        <div className="bg-gray-50/70 dark:bg-gray-900/40 rounded-2xl p-4 space-y-4 border border-pink-300/30 dark:border-pink-500/20">
          <div className="pointer-events-none opacity-60">
            <AnimatePresence mode="wait">
              <motion.div
                key={exampleIndex}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.4 }}
              >
                <div className="w-full px-3.5 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-white/60 dark:bg-gray-700/40 text-gray-500 dark:text-gray-400 italic text-sm mb-2">
                  {EXAMPLES[exampleIndex].title}
                </div>
                <div className="w-full px-3.5 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-white/60 dark:bg-gray-700/40 text-gray-500 dark:text-gray-400 text-sm">
                  {EXAMPLES[exampleIndex].content}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          <button
            onClick={handleGenerate}
            disabled={step === 'generating'}
            className="w-full bg-gradient-to-r from-pink-500 to-fuchsia-500 hover:from-pink-600 hover:to-fuchsia-600 text-white font-medium py-3 rounded-2xl transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {step === 'generating' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('reviews.oracle.generating')}
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                {t('reviews.oracle.generateButton')}
              </>
            )}
          </button>
        </div>
      )}

      {(step === 'generated' || step === 'posting') && (
        <div className="bg-pink-500/5 dark:bg-pink-500/10 rounded-2xl p-4 space-y-4 border border-pink-300/40 dark:border-pink-500/30">
          <div className="flex items-center gap-2 text-pink-600 dark:text-pink-400">
            <Sparkles className="w-4 h-4" />
            <span className="text-sm font-semibold">{t('reviews.oracle.readyTitle')}</span>
          </div>
          <h3 className="font-semibold text-gray-900 dark:text-white">{generatedTitle}</h3>
          <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{generatedContent}</p>
          <div className="flex gap-2">
            <button
              onClick={handlePost}
              disabled={step === 'posting'}
              className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:opacity-60 text-white font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {step === 'posting' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {t('reviews.oracle.postButton')}
            </button>
            <button
              onClick={handleGenerate}
              disabled={step === 'posting'}
              className="px-4 py-2.5 border border-pink-300 dark:border-pink-500/40 text-pink-600 dark:text-pink-400 rounded-xl hover:bg-pink-500/10 transition-colors flex items-center gap-2 disabled:opacity-60"
            >
              <RefreshCw className="w-4 h-4" />
              {t('reviews.oracle.regenerateButton')}
            </button>
          </div>
        </div>
      )}

      {/* Passo a passo ilustrado — substitui as Resenhas da Comunidade
          enquanto o modo Oráculo está ativo. */}
      <div>
        <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
          {t('reviews.oracle.howItWorks')}
        </h3>
        <div className="space-y-3">
          {oracleSteps.map((s, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-pink-500/15 to-fuchsia-500/15 border border-pink-400/25 flex items-center justify-center text-pink-500">
                {s.icon}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300">{s.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default OracleReviewSection;