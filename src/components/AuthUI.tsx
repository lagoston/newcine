import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import OracleCardFan from './OracleCardFan';
import { NIGHT_BACKGROUND, VELVET, PAPER, MIST, PIXEL } from '../lib/oracleTheme';

// Peças visuais das telas de conta (Entrar, Criar conta, Esqueci a senha,
// Verifique seu e-mail, Nova senha). Mesma linguagem da home de visitante:
// fundo noite, títulos na fonte pixelada, o leque de cartas dos oráculos.

// Moldura: formulário à esquerda, leque de cartas à direita no desktop;
// no celular, um leque compacto acima do formulário.
export const AuthShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="relative min-h-[calc(100dvh-4rem)] overflow-x-hidden" style={{ background: NIGHT_BACKGROUND }}>
    <div className="mx-auto max-w-6xl px-5 sm:px-8 pt-6 pb-14 sm:pt-10 lg:py-12 lg:min-h-[calc(100dvh-4rem)] grid lg:grid-cols-12 items-center content-start lg:content-center gap-6 lg:gap-12">
      <div className="lg:hidden">
        <OracleCardFan className="max-w-[210px]" cardClassName="w-[35%] -ml-[17.5%]" />
      </div>
      <div className="lg:col-span-5 w-full max-w-md mx-auto lg:mx-0">{children}</div>
      <div className="hidden lg:block lg:col-span-7">
        <OracleCardFan className="max-w-[560px]" />
      </div>
    </div>
  </div>
);

export const AuthHeading: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => (
  <div>
    <h1 style={{ ...PIXEL, color: PAPER }} className="text-[2.1rem] sm:text-[2.6rem] leading-[1.08] font-semibold">
      {title}
    </h1>
    {subtitle && (
      <p className="mt-3 text-base leading-relaxed" style={{ color: MIST }}>{subtitle}</p>
    )}
  </div>
);

// Abas Entrar / Criar conta — os dois caminhos ficam visíveis logo de cara,
// em vez de o cadastro depender de um link no rodapé do formulário.
export const AuthTabs: React.FC<{
  value: 'signin' | 'signup';
  onChange: (value: 'signin' | 'signup') => void;
  disabled?: boolean;
}> = ({ value, onChange, disabled }) => {
  const { t } = useTranslation();
  const tabs: { id: 'signin' | 'signup'; label: string }[] = [
    { id: 'signin', label: t('auth.tabSignIn') },
    { id: 'signup', label: t('auth.tabSignUp') },
  ];
  return (
    <div role="tablist" className="grid grid-cols-2 p-1 rounded-xl ring-1 ring-white/10" style={{ background: VELVET }}>
      {tabs.map((tab) => {
        const active = value === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => !active && onChange(tab.id)}
            className={`py-2.5 rounded-lg text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-fuchsia-300 ${
              active ? 'bg-white/[0.09] shadow-sm' : 'hover:bg-white/[0.04]'
            }`}
            style={{ color: active ? PAPER : MIST }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};

interface AuthFieldProps {
  id: string;
  label: string;
  icon: React.ElementType;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'email' | 'password';
  placeholder?: string;
  autoComplete?: string;
  helper?: string;
  disabled?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  autoFocus?: boolean;
}

// Campo com rótulo, ícone e (para senha) botão de mostrar/ocultar.
// autoComplete certo em cada uso = gerenciador de senha e teclado do
// celular funcionando; o estilo de :-webkit-autofill evita o fundo
// amarelo/azul que o Chrome pinta por cima do tema escuro.
export const AuthField: React.FC<AuthFieldProps> = ({
  id, label, icon: Icon, value, onChange, type = 'text', placeholder, autoComplete,
  helper, disabled, minLength, maxLength, pattern, autoFocus,
}) => {
  const { t } = useTranslation();
  const [reveal, setReveal] = useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword ? (reveal ? 'text' : 'password') : type;
  const helperId = helper ? `${id}-help` : undefined;

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium mb-1.5" style={{ color: PAPER }}>
        {label}
      </label>
      <div className="relative">
        <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] pointer-events-none" style={{ color: MIST }} aria-hidden />
        <input
          id={id}
          name={id}
          type={inputType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-describedby={helperId}
          disabled={disabled}
          required
          minLength={minLength}
          maxLength={maxLength}
          pattern={pattern}
          autoFocus={autoFocus}
          inputMode={type === 'email' ? 'email' : undefined}
          autoCapitalize={type === 'password' ? undefined : 'none'}
          autoCorrect="off"
          spellCheck={false}
          className={`block w-full h-12 rounded-xl pl-11 ${isPassword ? 'pr-12' : 'pr-4'} text-base sm:text-[15px] ring-1 ring-white/[0.12] placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-violet-400/60 disabled:opacity-60 transition-shadow [&:-webkit-autofill]:[-webkit-text-fill-color:#F3EAD3] [&:-webkit-autofill]:shadow-[inset_0_0_0_1000px_#1C1433]`}
          style={{ background: VELVET, color: PAPER, caretColor: PAPER }}
        />
        {/* Centralizado por inset-y-0 + my-auto (não por translate): a regra
            global de alvo de toque do index.css força min-height 44px e
            anulava a translação, deixando o olho abaixo do centro. */}
        {isPassword && (
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            aria-label={reveal ? t('auth.hidePassword') : t('auth.showPassword')}
            aria-pressed={reveal}
            className="absolute inset-y-0 right-1 my-auto w-10 h-10 grid place-items-center rounded-lg hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-fuchsia-300"
            style={{ color: MIST }}
          >
            {reveal ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
          </button>
        )}
      </div>
      {helper && (
        <p id={helperId} className="mt-1.5 text-[13px]" style={{ color: MIST }}>{helper}</p>
      )}
    </div>
  );
};

export const AuthError: React.FC<{ message: string }> = ({ message }) => (
  <div role="alert" className="flex items-start gap-3 rounded-xl px-4 py-3 bg-red-500/10 ring-1 ring-red-400/30">
    <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0 text-red-300" aria-hidden />
    <p className="text-sm text-red-100">{message}</p>
  </div>
);

export const AuthSubmit: React.FC<{
  label: string;
  loadingLabel: string;
  loading: boolean;
  disabled?: boolean;
}> = ({ label, loadingLabel, loading, disabled }) => (
  <button
    type="submit"
    disabled={disabled || loading}
    className="w-full h-12 rounded-xl text-base font-semibold text-white bg-gradient-to-r from-violet-600 to-fuchsia-600 shadow-lg shadow-fuchsia-950/50 hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-300"
  >
    {loading ? (
      <span className="inline-flex items-center gap-2">
        <Loader2 className="w-5 h-5 animate-spin" aria-hidden />
        {loadingLabel}
      </span>
    ) : (
      label
    )}
  </button>
);

// Link/botão de texto secundário (Esqueceu a senha?, Voltar, Já confirmei)
export const AuthTextButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ className = '', children, ...props }) => (
  <button
    type="button"
    {...props}
    className={`text-sm font-medium underline-offset-4 hover:underline disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-300 rounded ${className}`}
    style={{ color: PAPER, ...props.style }}
  >
    {children}
  </button>
);