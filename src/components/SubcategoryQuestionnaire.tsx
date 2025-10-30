import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

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
      const { data, error } = await supabase.rpc('start_subcategory_questionnaire');

      if (error) throw error;

      setQuestions(data || []);
    } catch (error) {
      console.error('Error loading questions:', error);
      toast.error('Falha ao carregar questionário');
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
    } catch (error) {
      console.error('Error recording answer:', error);
      toast.error('Erro ao registrar resposta');
    } finally {
      setIsAnswering(false);
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
      toast.error('Erro ao calcular resultado');
    }
  };

  const handleTiebreaker = async (tiedCategories: string[]) => {
    try {
      const { data, error } = await supabase.rpc('get_tiebreaker_question', {
        p_tied_categories: tiedCategories
      });

      if (error) throw error;

      if (data && data.length > 0) {
        setQuestions(prev => [...prev, data[0]]);
        setCurrentQuestionIndex(questions.length);
        setSelectedOption(null);
      }
    } catch (error) {
      console.error('Error loading tiebreaker:', error);
      toast.error('Erro ao carregar pergunta de desempate');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <Loader2 className="w-12 h-12 text-purple-400 animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Preparando as perguntas...</p>
        </motion.div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-400">Erro ao carregar questionário</p>
      </div>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];
  const progress = ((currentQuestionIndex + 1) / questions.length) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-900/30 to-blue-900/30 py-12 px-4 overflow-hidden relative">
      {/* Background particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 30 }).map((_, i) => (
          <motion.div
            key={`particle-${i}`}
            className="absolute w-1 h-1 rounded-full bg-purple-500/30"
            initial={{
              x: Math.random() * 100 + "%",
              y: Math.random() * 100 + "%",
              opacity: 0.3 + Math.random() * 0.3
            }}
            animate={{
              y: [
                Math.random() * 100 + "%",
                Math.random() * 100 + "%",
                Math.random() * 100 + "%"
              ],
              opacity: [
                0.3 + Math.random() * 0.3,
                0.1 + Math.random() * 0.2,
                0.3 + Math.random() * 0.3
              ]
            }}
            transition={{
              duration: 15 + Math.random() * 15,
              repeat: Infinity
            }}
          />
        ))}
      </div>

      <div className="max-w-3xl mx-auto relative z-10">
        {/* Progress Bar */}
        <motion.div
          className="mb-8"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-gray-400">
              Pergunta {currentQuestionIndex + 1} de {questions.length}
            </span>
            <span className="text-sm text-purple-400 font-medium">
              {Math.round(progress)}%
            </span>
          </div>
          <div className="h-2 bg-gray-800/50 rounded-full overflow-hidden backdrop-blur-sm border border-purple-500/20">
            <motion.div
              className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>
        </motion.div>

        {/* Question Card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentQuestionIndex}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.4 }}
            className="relative group mb-8"
          >
            <div className="absolute -inset-1 bg-gradient-to-r from-purple-600/30 to-pink-600/30 rounded-2xl blur opacity-50" />
            <div className="relative p-8 bg-gray-900/90 rounded-2xl border border-purple-500/30 backdrop-blur-sm">
              <motion.h2
                className="text-2xl md:text-3xl font-bold text-white mb-8 leading-relaxed"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                {currentQuestion.question_text}
              </motion.h2>

              <div className="space-y-4">
                {currentQuestion.options.map((option, index) => {
                  const isSelected = selectedOption === option.option_id;

                  return (
                    <motion.button
                      key={option.option_id}
                      onClick={() => handleAnswer(option.option_id)}
                      disabled={isAnswering}
                      className={`w-full p-6 text-left rounded-xl transition-all relative overflow-hidden group/option border-2 ${
                        isSelected
                          ? 'border-purple-500 bg-purple-500/20'
                          : 'border-gray-700 hover:border-purple-500/50 bg-gray-800/50 hover:bg-gray-800/80'
                      } ${isAnswering ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 + index * 0.1 }}
                      whileHover={!isAnswering ? { scale: 1.02, y: -2 } : {}}
                      whileTap={!isAnswering ? { scale: 0.98 } : {}}
                    >
                      <div className={`absolute inset-0 bg-gradient-to-r from-purple-600/0 to-pink-600/0 group-hover/option:from-purple-600/10 group-hover/option:to-pink-600/10 transition-all duration-300 ${
                        isSelected ? 'from-purple-600/20 to-pink-600/20' : ''
                      }`} />

                      <div className="relative flex items-start gap-4">
                        <div className={`flex-shrink-0 w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${
                          isSelected
                            ? 'border-purple-500 bg-purple-500'
                            : 'border-gray-600 group-hover/option:border-purple-500/70'
                        }`}>
                          {isSelected && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="w-3 h-3 rounded-full bg-white"
                            />
                          )}
                        </div>

                        <p className="text-lg text-gray-200 leading-relaxed pr-4">
                          {option.option_text}
                        </p>
                      </div>

                      {isSelected && isAnswering && (
                        <motion.div
                          className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-500 to-pink-500"
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
          </motion.div>
        </AnimatePresence>

        {/* Mystical footer message */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="text-center text-purple-300/70 text-sm italic"
        >
          O Oráculo observa atentamente suas escolhas...
        </motion.div>
      </div>
    </div>
  );
}
