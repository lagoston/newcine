import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface QuestionOption {
  option_id: number;
  option_text: string;
  option_order: number;
}

interface Question {
  question_id: number;
  question_text: string;
  options: QuestionOption[];
}

interface SubcategoryQuestionnaireProps {
  userId: string;
  onComplete: (result: any) => void;
}

export default function SubcategoryQuestionnaire({ userId, onComplete }: SubcategoryQuestionnaireProps) {
  const { t, i18n } = useTranslation();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [sessionId] = useState(() => crypto.randomUUID());
  const [loading, setLoading] = useState(true);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswering, setIsAnswering] = useState(false);

  useEffect(() => {
    loadQuestions();
  }, []);

  const loadQuestions = async () => {
    try {
      setLoading(true);
      const lang = i18n.language?.startsWith('en') ? 'en' : 'pt';
      const { data, error } = await supabase.rpc('start_subcategory_questionnaire', { p_language: lang });

      if (error) throw error;

      setQuestions(data || []);
    } catch (error) {
      console.error('Error loading questions:', error);
      toast.error(t('oracle.questionnaire.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const handleAnswer = async (optionId: number) => {
    if (isAnswering) return;

    try {
      setIsAnswering(true);
      setSelectedOption(optionId);

      const currentQuestion = questions[currentQuestionIndex];
      const isLastQuestion = currentQuestionIndex === questions.length - 1;
      const isTiebreakerQuestion = questions.length === 13 && isLastQuestion;

      if (isTiebreakerQuestion) {
        await resolveTiebreaker(optionId);
      } else {
        const { error } = await supabase.rpc('record_subcategory_response', {
          p_user_id: userId,
          p_session_id: sessionId,
          p_question_id: currentQuestion.question_id,
          p_option_id: optionId
        });

        if (error) throw error;

        await new Promise(resolve => setTimeout(resolve, 600));

        if (currentQuestionIndex < questions.length - 1) {
          setCurrentQuestionIndex(prev => prev + 1);
          setSelectedOption(null);
        } else {
          await calculateResult();
        }
      }
    } catch (error) {
      console.error('Error recording answer:', error);
      toast.error(t('oracle.questionnaire.answerError'));
    } finally {
      setIsAnswering(false);
    }
  };

  const resolveTiebreaker = async (optionId: number) => {
    try {
      const { data, error } = await supabase.rpc('resolve_tiebreaker', {
        p_user_id: userId,
        p_session_id: sessionId,
        p_option_id: optionId
      });

      if (error) throw error;

      await new Promise(resolve => setTimeout(resolve, 600));

      onComplete(data);
    } catch (error) {
      console.error('Error resolving tiebreaker:', error);
      toast.error(t('oracle.questionnaire.tiebreakerError'));
    }
  };

  const calculateResult = async () => {
    try {
      const { data, error } = await supabase.rpc('calculate_subcategory_result', {
        p_user_id: userId,
        p_session_id: sessionId
      });

      if (error) throw error;

      if (data.requires_tiebreaker) {
        await handleTiebreaker(data.tied_categories);
      } else {
        onComplete(data);
      }
    } catch (error) {
      console.error('Error calculating result:', error);
      toast.error(t('oracle.questionnaire.calculateError'));
    }
  };

  const handleTiebreaker = async (tiedCategories: string[]) => {
    try {
      const lang = i18n.language?.startsWith('en') ? 'en' : 'pt';
      const { data, error } = await supabase.rpc('get_tiebreaker_question', {
        p_tied_categories: tiedCategories,
        p_language: lang
      });

      if (error) throw error;

      if (data && data.length > 0) {
        const tiebreakerQuestion = {
          question_id: data[0].question_id,
          question_text: data[0].question_text,
          options: Array.isArray(data[0].options) ? data[0].options : []
        };

        setQuestions(prev => {
          const updatedQuestions = [...prev, tiebreakerQuestion];
          setCurrentQuestionIndex(updatedQuestions.length - 1);
          return updatedQuestions;
        });
        setSelectedOption(null);
        setIsAnswering(false);
      }
    } catch (error) {
      console.error('Error loading tiebreaker:', error);
      toast.error(t('oracle.questionnaire.tiebreakerLoadError'));
    }
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-blue-50/80 via-purple-50/50 to-pink-50/80 dark:from-gray-900 dark:via-blue-950/50 dark:to-purple-950/50 flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-10 w-96 h-96 bg-gradient-to-br from-blue-400/20 to-cyan-400/20 dark:from-blue-600/10 dark:to-cyan-600/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute top-60 right-20 w-80 h-80 bg-gradient-to-br from-purple-400/20 to-pink-400/20 dark:from-purple-600/10 dark:to-pink-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center relative z-10"
        >
          <Loader2 className="w-12 h-12 text-blue-500 dark:text-blue-400 animate-spin mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">{t('oracle.questionnaire.preparing')}</p>
        </motion.div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-blue-50/80 via-purple-50/50 to-pink-50/80 dark:from-gray-900 dark:via-blue-950/50 dark:to-purple-950/50 flex items-center justify-center">
        <p className="text-gray-600 dark:text-gray-400">{t('oracle.questionnaire.loadFailed')}</p>
      </div>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];
  const progress = ((currentQuestionIndex + 1) / questions.length) * 100;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-blue-50/80 via-purple-50/50 to-pink-50/80 dark:from-gray-900 dark:via-blue-950/50 dark:to-purple-950/50 py-12 px-4 overflow-hidden relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-96 h-96 bg-gradient-to-br from-blue-400/20 to-cyan-400/20 dark:from-blue-600/10 dark:to-cyan-600/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute top-60 right-20 w-80 h-80 bg-gradient-to-br from-purple-400/20 to-pink-400/20 dark:from-purple-600/10 dark:to-pink-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute bottom-20 left-1/3 w-72 h-72 bg-gradient-to-br from-pink-400/15 to-rose-400/15 dark:from-pink-600/8 dark:to-rose-600/8 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <div className="absolute inset-0 opacity-[0.015] dark:opacity-[0.02]" style={{
        backgroundImage: 'linear-gradient(rgba(99, 102, 241, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(99, 102, 241, 0.1) 1px, transparent 1px)',
        backgroundSize: '50px 50px'
      }} />

      <div className="max-w-3xl mx-auto relative z-10">
        <motion.div
          className="mb-8"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">
              {t('oracle.questionnaire.progress', { current: currentQuestionIndex + 1, total: questions.length })}
            </span>
            <span className="text-sm text-blue-500 dark:text-blue-400 font-semibold">
              {Math.round(progress)}%
            </span>
          </div>
          <div className="h-2.5 bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl rounded-full overflow-hidden border border-white/60 dark:border-gray-700/60 shadow-inner">
            <motion.div
              className="h-full bg-gradient-to-r from-blue-500 via-cyan-500 to-blue-500"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>
        </motion.div>

        <AnimatePresence mode="wait">
          <motion.div
            key={currentQuestionIndex}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.4 }}
            className="mb-8"
          >
            <div className="relative rounded-3xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-2xl p-6 sm:p-8">
              <div className="absolute inset-0 pointer-events-none rounded-3xl">
                <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-blue-400/10 to-cyan-500/10 rounded-full blur-3xl" />
                <div className="absolute bottom-0 left-0 w-40 h-40 bg-gradient-to-tr from-purple-400/10 to-pink-500/10 rounded-full blur-3xl" />
              </div>

              <div className="relative z-10">
                <motion.h2
                  className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-white mb-8 leading-relaxed"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  {currentQuestion.question_text}
                </motion.h2>

                <div className="space-y-3">
                  {currentQuestion.options.map((option, index) => {
                    const isSelected = selectedOption === option.option_id;

                    return (
                      <motion.button
                        key={option.option_id}
                        onClick={() => handleAnswer(option.option_id)}
                        disabled={isAnswering}
                        className={`w-full p-5 text-left rounded-2xl transition-all relative overflow-hidden group border-2 backdrop-blur-sm ${
                          isSelected
                            ? 'border-blue-500 bg-blue-500/20 dark:bg-blue-500/30'
                            : 'border-white/60 dark:border-gray-700/60 bg-white/30 dark:bg-gray-800/30 hover:border-blue-400/50 hover:bg-white/50 dark:hover:bg-gray-800/50'
                        } ${isAnswering ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 + index * 0.1 }}
                        whileHover={!isAnswering ? { scale: 1.02, y: -2 } : {}}
                        whileTap={!isAnswering ? { scale: 0.98 } : {}}
                      >
                        <div className={`absolute inset-0 bg-gradient-to-r from-blue-500/0 to-cyan-500/0 group-hover:from-blue-500/10 group-hover:to-cyan-500/10 transition-all duration-300 ${
                          isSelected ? 'from-blue-500/20 to-cyan-500/20' : ''
                        }`} />

                        <div className="relative flex items-start gap-4">
                          <div className={`flex-shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all ${
                            isSelected
                              ? 'border-blue-500 bg-blue-500'
                              : 'border-gray-400 dark:border-gray-500 group-hover:border-blue-400'
                          }`}>
                            {isSelected && (
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="w-2.5 h-2.5 rounded-full bg-white"
                              />
                            )}
                          </div>

                          <p className="text-base text-gray-700 dark:text-gray-200 leading-relaxed pr-4">
                            {option.option_text}
                          </p>
                        </div>

                        {isSelected && isAnswering && (
                          <motion.div
                            className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-cyan-500"
                            initial={{ scaleX: 0 }}
                            animate={{ scaleX: 1 }}
                            transition={{ duration: 0.6 }}
                          />
                        )}
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="text-center"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60">
            <Sparkles className="w-4 h-4 text-blue-500 dark:text-blue-400" />
            <p className="text-blue-600 dark:text-blue-300 text-sm italic">
              {t('oracle.questionnaire.watching')}
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
