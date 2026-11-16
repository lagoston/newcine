import { Link, useLocation } from 'react-router-dom';
import { Clapperboard } from 'lucide-react';
import { useDirector } from '../contexts/DirectorContext';
import { FOCUS_RING } from '../lib/oracleTheme';

// Conta Diretor (16/11/2026): a claquete na barra do topo leva à Sala do
// Diretor. Só aparece para a conta diretor; um pontinho dourado avisa que a
// prévia de um evento está ligada (o site que ela vê não é o de hoje).
export default function DirectorNavButton() {
  const { isDirector, prefs } = useDirector();
  const location = useLocation();
  if (!isDirector) return null;
  const here = location.pathname === '/diretor';
  const label = prefs.eventPreview ? 'Sala do Diretor (prévia de evento ligada)' : 'Sala do Diretor';
  return (
    <Link
      to="/diretor"
      aria-label={label}
      title={label}
      aria-current={here ? 'page' : undefined}
      className={`relative grid place-items-center w-11 h-11 min-h-0 min-w-0 rounded-full transition-colors ${
        here ? 'bg-amber-300/15 text-amber-200' : 'text-gray-300 hover:text-white hover:bg-white/10'
      } ${FOCUS_RING}`}
    >
      <Clapperboard className="w-5 h-5" strokeWidth={2} aria-hidden />
      {prefs.eventPreview && (
        <span aria-hidden className="absolute top-2 right-2 w-2 h-2 rounded-full bg-amber-300 ring-2 ring-[#120D22]" />
      )}
    </Link>
  );
}
