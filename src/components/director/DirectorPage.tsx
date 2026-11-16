import { Link, Navigate } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useDirector } from '../../contexts/DirectorContext';
import { NIGHT_BACKGROUND, PAPER, MIST, FOCUS_RING } from '../../lib/oracleTheme';
import { useDirectorLang } from '../../lib/directorUi';

// A moldura das páginas de ferramenta da Conta Diretor (16/11/2026): volta para
// a Sala, título, linha de apoio e o conteúdo. Quem não é diretor volta ao Início.

export default function DirectorPage({ title, lead, children }: { title: string; lead: string; children: React.ReactNode }) {
  const director = useDirector();
  const lang = useDirectorLang();
  if (director.loading) {
    return (
      <div className="min-h-[60vh] grid place-items-center" style={{ background: NIGHT_BACKGROUND }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: MIST }} aria-label="…" />
      </div>
    );
  }
  if (!director.isDirector) return <Navigate to="/" replace />;
  return (
    <div className="min-h-screen pb-28" style={{ background: NIGHT_BACKGROUND }}>
      <div className="mx-auto max-w-5xl px-4 sm:px-6 pt-5 sm:pt-8">
        <Link
          to="/diretor"
          className={`inline-flex items-center gap-2 min-h-[44px] text-sm rounded-lg ${FOCUS_RING}`}
          style={{ color: MIST }}
        >
          <ArrowLeft className="w-4 h-4" aria-hidden />
          {lang === 'pt' ? 'Sala do Diretor' : "Director's Room"}
        </Link>
        <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight" style={{ color: PAPER }}>
          {title}
        </h1>
        <p className="mt-2 text-sm leading-relaxed max-w-prose" style={{ color: MIST }}>
          {lead}
        </p>
        {children}
      </div>
    </div>
  );
}
