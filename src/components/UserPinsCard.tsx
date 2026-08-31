import React from 'react';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUnlockedTagPins } from '../hooks/useUnlockedTagPins';

interface UserPinsCardProps {
  userId: string;
}

// Cores por categoria — mesma paleta usada no TagPinsModal, sem o nome da
// tag aqui (só o card do próprio usuário, em "Meus Pins", mostra nome).
// Nesse card de perfil de terceiros, os pins ficam só pequenos, lado a
// lado, coloridos pela categoria, sem texto — mesmo espírito visual de
// "Favorite Directors"/"Favorite Decade".
const getCategoryBg = (category: string) => {
  switch (category) {
    case 'basic': return 'bg-green-100 dark:bg-green-900/30';
    case 'theme': return 'bg-yellow-100 dark:bg-yellow-900/30';
    case 'community': return 'bg-blue-100 dark:bg-blue-900/30';
    case 'oracle': return 'bg-pink-100 dark:bg-pink-900/30';
    case 'special': return 'bg-black dark:bg-black';
    default: return 'bg-gray-100 dark:bg-gray-900/30';
  }
};

const UserPinsCard: React.FC<UserPinsCardProps> = ({ userId }) => {
  const { t } = useTranslation();
  const { pins, loading } = useUnlockedTagPins(userId);

  // Mesmo padrão dos outros cards da página (Favorite Directors, Favorite
  // Decade) — se não há nada pra mostrar, o card simplesmente não
  // aparece, em vez de mostrar um estado vazio.
  if (!loading && pins.length === 0) return null;

  return (
    <div className="relative rounded-2xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-400">
          {t('profile.tagPins', { defaultValue: 'Tag Pins' })}
        </h2>
        <Sparkles className="w-5 h-5 text-blue-500" />
      </div>

      {loading ? (
        <div className="flex flex-wrap gap-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="w-9 h-9 rounded-lg bg-gray-200/60 dark:bg-gray-700/40 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {pins.map((pin, idx) => (
            <div
              key={`${pin.name}-${idx}`}
              title={pin.name}
              className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg ${getCategoryBg(pin.category)}`}
            >
              {pin.emoji}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default UserPinsCard;