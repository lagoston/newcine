import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useMotionValue } from 'framer-motion';
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

// Reescrito do zero — a versão anterior usava Reorder.Group do Framer
// Motion, um componente feito especificamente para LISTAS LINEARES (um
// só eixo). Ele decide trocas de posição olhando só a coordenada Y de
// cada item — mas aqui os itens vivem numa GRADE de várias colunas, onde
// vários itens dividem a MESMA linha (mesma posição Y). Resultado: o
// algoritmo só reagia a movimento vertical entre linhas, ignorando
// completamente a coluna — exatamente o bug relatado ("só dá pra mexer
// de cima pra baixo", ordem bagunçada.
//
// Esta versão detecta colisão em DUAS dimensões: durante o arraste,
// mede o centro real do item arrastado (via getBoundingClientRect, que
// já reflete a posição visual atualizada pelo drag) e compara contra o
// centro de TODOS os outros itens, achando qual retângulo contém esse
// ponto — dessa forma um movimento puramente horizontal (mesma linha,
// coluna diferente) é detectado corretamente, assim como diagonal ou
// vertical. Ao achar colisão com um item diferente, reordena o array;
// o `layout` do Framer Motion anima todos os outros itens se
// reacomodando sozinho.
interface ReorderItemProps {
  movie: Movie;
  index: number;
  registerRef: (id: number, el: HTMLDivElement | null) => void;
  onDragPositionChange: (id: number, rect: DOMRect) => void;
  onDragEnd: () => void;
}

const ReorderItem: React.FC<ReorderItemProps> = ({ movie, index, registerRef, onDragPositionChange, onDragEnd }) => {
  const itemRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  return (
    <motion.div
      ref={(el) => { itemRef.current = el; registerRef(movie.id, el); }}
      layout
      drag
      dragMomentum={false}
      dragElastic={0}
      onDragStart={() => setIsDragging(true)}
      onDrag={() => {
        if (itemRef.current) {
          onDragPositionChange(movie.id, itemRef.current.getBoundingClientRect());
        }
      }}
      onDragEnd={() => {
        setIsDragging(false);
        onDragEnd();
      }}
      whileDrag={{ scale: 1.08, boxShadow: '0 20px 30px -8px rgba(0,0,0,0.5)', zIndex: 50 }}
      dragTransition={{ bounceStiffness: 500, bounceDamping: 40 }}
      className={`relative rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700 shadow-md border-2 touch-none ${
        isDragging ? 'border-blue-500 cursor-grabbing' : 'border-transparent cursor-grab'
      }`}
      style={{ zIndex: isDragging ? 50 : 1 }}
    >
      <div className="relative aspect-[2/3] pointer-events-none">
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

        <div className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
          <GripVertical className="w-4 h-4 text-white" />
        </div>
      </div>
    </motion.div>
  );
};

const ReorderListModal: React.FC<ReorderListModalProps> = ({ isOpen, onClose, onSave, movies, listName }) => {
  const { t } = useTranslation();
  const [reorderedMovies, setReorderedMovies] = useState<Movie[]>(movies);
  const [saving, setSaving] = useState(false);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  // Guarda a ordem "de referência" no momento em que o arraste começou —
  // a comparação de colisão sempre usa as posições ORIGINAIS (antes do
  // item começar a se mover), evitando que o cálculo fique perseguindo
  // um alvo que também está se movendo por causa da própria reordenação.
  const orderAtDragStartRef = useRef<Movie[]>([]);
  const lastSwapTargetRef = useRef<number | null>(null);

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

  const registerRef = useCallback((id: number, el: HTMLDivElement | null) => {
    if (el) itemRefs.current.set(id, el);
    else itemRefs.current.delete(id);
  }, []);

  const handleDragPositionChange = useCallback((draggedId: number, draggedRect: DOMRect) => {
    if (orderAtDragStartRef.current.length === 0) {
      orderAtDragStartRef.current = reorderedMovies;
    }

    const draggedCenterX = draggedRect.left + draggedRect.width / 2;
    const draggedCenterY = draggedRect.top + draggedRect.height / 2;

    // Acha, entre TODOS os outros itens, qual retângulo contém o centro
    // do item arrastado agora — funciona em qualquer direção (cima,
    // baixo, esquerda, direita, diagonal), diferente da versão anterior
    // que só enxergava cima/baixo.
    let targetId: number | null = null;
    itemRefs.current.forEach((el, id) => {
      if (id === draggedId) return;
      const rect = el.getBoundingClientRect();
      if (
        draggedCenterX >= rect.left &&
        draggedCenterX <= rect.right &&
        draggedCenterY >= rect.top &&
        draggedCenterY <= rect.bottom
      ) {
        targetId = id;
      }
    });

    if (targetId !== null && targetId !== lastSwapTargetRef.current) {
      lastSwapTargetRef.current = targetId;
      setReorderedMovies((current) => {
        const fromIndex = current.findIndex((m) => m.id === draggedId);
        const toIndex = current.findIndex((m) => m.id === targetId);
        if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return current;
        const updated = [...current];
        const [moved] = updated.splice(fromIndex, 1);
        updated.splice(toIndex, 0, moved);
        return updated;
      });
    }
  }, [reorderedMovies]);

  const handleItemDragEnd = useCallback(() => {
    orderAtDragStartRef.current = [];
    lastSwapTargetRef.current = null;
  }, []);

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

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                {reorderedMovies.map((movie, index) => (
                  <ReorderItem
                    key={movie.id}
                    movie={movie}
                    index={index}
                    registerRef={registerRef}
                    onDragPositionChange={handleDragPositionChange}
                    onDragEnd={handleItemDragEnd}
                  />
                ))}
              </div>
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