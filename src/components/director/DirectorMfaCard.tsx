import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { useDirector } from '../../contexts/DirectorContext';
import { NIGHT, PAPER, MIST, VELVET, FOCUS_RING } from '../../lib/oracleTheme';
import type { Lang } from '../../lib/directorTools';

// O app autenticador da Conta Diretor (16/11/2026).
//
// Mudar o site para todos (prateleiras, pôsteres) pede o nível 2 do papel: o
// código de um app autenticador (Google Authenticator, 1Password, Authy…)
// digitado nesta sessão. Tirar coisas (um título da prateleira, um pôster que
// alguém já tem do sorteio) pede o nível 3: o código digitado há menos de 15
// minutos. O banco confere pelo token da sessão (aal2 e o horário do código);
// este cartão só cadastra o app e pede o código.

const BRASS = '#F5C451';

const COPY = {
  pt: {
    title: 'App autenticador',
    loading: 'Conferindo…',
    none: 'Ainda não cadastrado. As ferramentas que mudam o site para todos pedem o código de um app autenticador.',
    start: 'Cadastrar o app',
    scan: 'Leia o código com o app autenticador (ou digite a chave) e escreva os 6 números que ele mostrar.',
    secret: 'Chave',
    code: 'Código de 6 números',
    confirm: 'Confirmar',
    needCode: 'Cadastrado. Digite o código do app para usar as ferramentas nesta sessão.',
    needRecent: 'Para tirar coisas do site, digite o código de novo (vale 15 minutos).',
    ready: 'Código conferido nesta sessão. Tirar coisas do site pede o código de novo depois de 15 minutos.',
    readyRecent: 'Código recente: pode pôr e tirar por 15 minutos.',
    again: 'Digitar o código de novo',
    wrong: 'Código errado ou vencido. Tente o próximo.',
    failed: 'Não deu para falar com o servidor. Tente de novo.',
    done: 'Código conferido.',
  },
  en: {
    title: 'Authenticator app',
    loading: 'Checking…',
    none: 'Not set up yet. Tools that change the site for everyone ask for a code from an authenticator app.',
    start: 'Set up the app',
    scan: 'Scan the code with your authenticator app (or type the key) and enter the 6 digits it shows.',
    secret: 'Key',
    code: '6-digit code',
    confirm: 'Confirm',
    needCode: 'Set up. Enter the app code to use the tools in this session.',
    needRecent: 'To remove things from the site, enter the code again (good for 15 minutes).',
    ready: 'Code checked in this session. Removing things asks for the code again after 15 minutes.',
    readyRecent: 'Recent code: you can add and remove for 15 minutes.',
    again: 'Enter the code again',
    wrong: 'Wrong or expired code. Try the next one.',
    failed: "Couldn't reach the server. Try again.",
    done: 'Code checked.',
  },
} as const;

type Phase =
  | { kind: 'loading' }
  | { kind: 'none' }
  | { kind: 'enrolling'; factorId: string; qr: string; secret: string }
  | { kind: 'enrolled'; factorId: string };

export default function DirectorMfaCard({ lang, need = 2, style, className = '' }: { lang: Lang; need?: 2 | 3; style?: React.CSSProperties; className?: string }) {
  const c = COPY[lang];
  const director = useDirector();
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      const verified = data?.totp?.find((factor) => factor.status === 'verified');
      setPhase(verified ? { kind: 'enrolled', factorId: verified.id } : { kind: 'none' });
    } catch (error) {
      console.error('MFA factors:', error);
      setPhase({ kind: 'none' });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const startEnroll = async () => {
    setBusy(true);
    try {
      // um cadastro começado e largado no meio atrapalha o novo: sai primeiro
      const { data: list } = await supabase.auth.mfa.listFactors();
      const stale = (list?.all || []).filter((factor) => factor.factor_type === 'totp' && factor.status !== 'verified');
      for (const factor of stale) await supabase.auth.mfa.unenroll({ factorId: factor.id });
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'CineOracle Diretor' });
      if (error || !data) throw error;
      setPhase({ kind: 'enrolling', factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
      setCode('');
    } catch (error) {
      console.error('MFA enroll:', error);
      toast.error(c.failed);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (factorId: string) => {
    const clean = code.replace(/\D/g, '');
    if (clean.length !== 6) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: clean });
      if (error) {
        toast.error(c.wrong);
        return;
      }
      toast.success(c.done);
      setCode('');
      setAsking(false);
      setPhase({ kind: 'enrolled', factorId });
      await director.refresh();
    } catch (error) {
      console.error('MFA verify:', error);
      toast.error(c.failed);
    } finally {
      setBusy(false);
    }
  };

  const codeForm = (factorId: string) => (
    <form
      className="mt-3 flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        verify(factorId);
      }}
    >
      <label className="sr-only" htmlFor="director-mfa-code">
        {c.code}
      </label>
      <input
        id="director-mfa-code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={7}
        value={code}
        onChange={(event) => setCode(event.target.value)}
        placeholder="000000"
        className={`w-36 h-11 px-3 rounded-xl text-lg tracking-[0.3em] tabular-nums ${FOCUS_RING}`}
        style={{ background: VELVET, color: PAPER, border: '1px solid rgba(243,234,211,0.14)' }}
      />
      <button
        type="submit"
        disabled={busy || code.replace(/\D/g, '').length !== 6}
        className={`inline-flex items-center gap-2 h-11 px-4 rounded-full text-sm font-semibold disabled:opacity-50 ${FOCUS_RING}`}
        style={{ background: BRASS, color: NIGHT }}
      >
        {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
        {c.confirm}
      </button>
    </form>
  );

  let body: React.ReactNode;
  if (phase.kind === 'loading') {
    body = <p className="mt-2 text-sm" style={{ color: MIST }}>{c.loading}</p>;
  } else if (phase.kind === 'none') {
    body = (
      <>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: MIST }}>{c.none}</p>
        <button
          type="button"
          onClick={startEnroll}
          disabled={busy}
          className={`mt-3 inline-flex items-center gap-2 h-11 px-4 rounded-full text-sm font-semibold disabled:opacity-50 ${FOCUS_RING}`}
          style={{ background: BRASS, color: NIGHT }}
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
          {c.start}
        </button>
      </>
    );
  } else if (phase.kind === 'enrolling') {
    body = (
      <>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: MIST }}>{c.scan}</p>
        <div className="mt-3 flex flex-wrap items-start gap-4">
          <img src={phase.qr} alt="" width={160} height={160} className="rounded-lg bg-white p-2" />
          <div className="min-w-0">
            <p className="text-xs" style={{ color: MIST }}>{c.secret}</p>
            <code className="block mt-1 text-sm break-all select-all" style={{ color: PAPER }}>{phase.secret}</code>
          </div>
        </div>
        {codeForm(phase.factorId)}
      </>
    );
  } else {
    const needsCode = !director.mfa || (need === 3 && !director.recent) || asking;
    body = needsCode ? (
      <>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: MIST }}>{!director.mfa ? c.needCode : c.needRecent}</p>
        {codeForm(phase.factorId)}
      </>
    ) : (
      <>
        <p className="mt-2 text-sm leading-relaxed flex items-start gap-2" style={{ color: MIST }}>
          <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#4ADE80' }} aria-hidden />
          {director.recent ? c.readyRecent : c.ready}
        </p>
        {!director.recent && (
          <button
            type="button"
            onClick={() => setAsking(true)}
            className={`mt-2 text-sm underline underline-offset-4 min-h-[44px] ${FOCUS_RING}`}
            style={{ color: PAPER }}
          >
            {c.again}
          </button>
        )}
      </>
    );
  }

  return (
    <div className={`rounded-2xl p-5 ${className}`} style={style}>
      <h2 className="flex items-center gap-2 text-base font-semibold" style={{ color: PAPER }}>
        <KeyRound className="w-4 h-4" style={{ color: BRASS }} aria-hidden />
        {c.title}
      </h2>
      {body}
    </div>
  );
}
