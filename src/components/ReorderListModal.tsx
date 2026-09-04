import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion';
import { X, Loader2, GripVertical, ArrowUpDown } from 'lucide-react';
import { Movie } from '../lib/tmdb';
import { useTranslation } from 'react-i18next';

interface ReorderListModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (newOrder: Movie[]) => Promise<void>;
  movies: Movie[];
  listName: string;
}

// Antes usava a API de drag-and-drop nativa do HTML5 (draggable,
// onDragStart/onDragEnter) — funciona mal em touch/mobile e não tem
// nenhuma animação suave durante o arraste, o item só "salta" pra nova
// posição quando solta. Reorder do Framer Motion resolve os dois
// problemas: gestos de toque funcionam nativamente, e a lista inteira
// anima suavemente enquanto o item é arrastado por cima dela.
const ReorderItem: React.FC<{ movie: Movie; index: number }> = ({ movie, index }) => {
  const dragControls = useDragControls();

  return (
    <Reorder.Item
      value={movie}
      dragListener={false}
      dragControls={dragControls}
      className="relative rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700 shadow-md border-2 border-transparent"
      whileDrag={{ scale: 1.05, boxShadow: '0 20px 30px -8px rgba(0,0,0,0.4)', zIndex: 50, borderColor: 'rgb(59 130 246)' }}
    >
      <div className="relative aspect-[2/3]">
        <img
          src={movie.poster_path ? `https://image.tmdb.org/t/p/w185${movie.poster_path}` : 'https://via.placeholder.com/185x278?text=No+Image'}
          alt={movie.title}
          className="w-full h-full object-cover"
          loading="lazy"
          draggable={false}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent">
          <div className="absolute bottom-2 left-2 right-2">
            <p className="text-white text-xs font-semibold line-clamp-2 drop-shadow">{movie.title}</p>
          </div>
        </div>

        <div className="absolute top-1.5 left-1.5 bg-blue-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shadow-lg">
          {index + 1}
        </div>

        {/* Alça de arraste — só essa área dispara o gesto (dragListener
            desligado no item inteiro), evitando conflito com o scroll
            normal da página em touch. */}
        <button
          onPointerDown={(e) => dragControls.start(e)}
          className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-sm flex items-center justify-center cursor-grab active:cursor-grabbing touch-none"
        >
          <GripVertical className="w-4 h-4 text-white" />
        </button>
      </div>
    </Reorder.Item>
  );
};

const ReorderListModal: React.FC<ReorderListModalProps> = ({ isOpen, onClose, onSave, movies, listName }) => {
  const { t } = useTranslation();
  const [reorderedMovies, setReorderedMovies] = useState<Movie[]>(movies);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) setReorderedMovies(movies);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = originalOverflow; };
    }
  }, [isOpen]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(reorderedMovies);
    } catch (error) {
      console.error('Error saving new order:', error);
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-4xl max-h-[calc(100dvh-4rem)] flex flex-col rounded-3xl bg-white/90 dark:bg-gray-800/90 backdrop-blur-2xl border border-white/60 dark:border-gray-700/60 shadow-2xl overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-56 h-56 bg-gradient-to-br from-blue-400/15 to-cyan-500/15 rounded-full blur-3xl pointer-events-none" />

            <div className="relative flex-shrink-0 flex items-center justify-between p-5 sm:p-6 border-b border-gray-200/50 dark:border-gray-700/50">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-400/30">
                  <ArrowUpDown className="w-5 h-5 text-blue-500" />
                </div>
                {t('lists.reorderTitle', { name: listName })}
              </h2>
              <button
                onClick={onClose}
                className="p-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative flex-1 overflow-y-auto p-5 sm:p-6">
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
                {t('lists.reorderInstructions')}
              </p>

              <Reorder.Group
                axis="y"
                values={reorderedMovies}
                onReorder={setReorderedMovies}
                className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4"
              >
                {reorderedMovies.map((movie, index) => (
                  <ReorderItem key={movie.id} movie={movie} index={index} />
                ))}
              </Reorder.Group>
            </div>

            <div className="relative flex-shrink-0 flex justify-end gap-3 p-5 border-t border-gray-200/50 dark:border-gray-700/50">
              <button
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg flex items-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('lists.doneReordering')}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default ReorderListModal;