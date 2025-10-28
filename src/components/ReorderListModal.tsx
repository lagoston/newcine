import React, { useRef, useState } from 'react';
import { X, Loader2, GripHorizontal } from 'lucide-react';
import { Movie } from '../lib/tmdb';
import { useTranslation } from 'react-i18next';

interface ReorderListModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (newOrder: Movie[]) => Promise<void>;
  movies: Movie[];
  listName: string;
}

const ReorderListModal: React.FC<ReorderListModalProps> = ({
  isOpen,
  onClose,
  onSave,
  movies,
  listName,
}) => {
  const { t } = useTranslation();
  const [reorderedMovies, setReorderedMovies] = useState<Movie[]>([...movies]);
  const [saving, setSaving] = useState(false);
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  if (!isOpen) return null;

  const handleDragStart = (index: number) => {
    dragItem.current = index;
  };

  const handleDragEnter = (index: number) => {
    dragOverItem.current = index;
  };

  const handleDragEnd = () => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    
    // Make a copy of the movies array
    const _movies = [...reorderedMovies];
    
    // Get the item being dragged
    const draggedItem = _movies[dragItem.current];
    
    // Remove the dragged item
    _movies.splice(dragItem.current, 1);
    
    // Insert it at the new position
    _movies.splice(dragOverItem.current, 0, draggedItem);
    
    // Update the state to reflect the new order
    setReorderedMovies(_movies);
    
    // Reset references
    dragItem.current = null;
    dragOverItem.current = null;
  };

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

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-center justify-center p-4">
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-fade-in">
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
            <GripHorizontal className="w-5 h-5 mr-2 text-blue-500" />
            {t('lists.reorderTitle', { name: listName })}
          </h2>
          <button 
            onClick={onClose}
            className="p-1 rounded-full text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
            {t('lists.reorderInstructions')}
          </p>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
            {reorderedMovies.map((movie, index) => (
              <div
                key={movie.id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragEnter={() => handleDragEnter(index)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => e.preventDefault()}
                className="bg-white dark:bg-gray-700 rounded-lg shadow-md cursor-move hover:shadow-lg transition-all group border-2 border-transparent hover:border-blue-500 relative"
              >
                <div className="relative aspect-[2/3]">
                  <img
                    src={`https://image.tmdb.org/t/p/w185${movie.poster_path}`}
                    alt={movie.title}
                    className="w-full h-full object-cover rounded-t-lg"
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.src = 'https://via.placeholder.com/185x278?text=No+Image';
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent opacity-100 rounded-t-lg">
                    <div className="absolute bottom-2 left-2 right-2">
                      <p className="text-white text-sm font-medium line-clamp-2">{movie.title}</p>
                    </div>
                  </div>
                  
                  {/* Position indicator */}
                  <div className="absolute top-1 right-1 bg-blue-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">
                    {index + 1}
                  </div>
                  
                  {/* Drag handle indicator */}
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black/70 text-white p-3 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                    <GripHorizontal className="w-6 h-6" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('common.saving')}
              </>
            ) : (
              t('lists.doneReordering')
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReorderListModal;