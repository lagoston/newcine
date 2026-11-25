import { useCallback, useEffect, useRef, useState } from 'react';
import { Crown, Loader2, RotateCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import DirectorPage from '../components/director/DirectorPage';
import DirectorMfaCard from '../components/director/DirectorMfaCard';
import { BRASS, PANEL, useDirectorLang } from '../lib/directorUi';
import { useDirector } from '../contexts/DirectorContext';
import { NIGHT, PAPER, MIST, VELVET, FOCUS_RING } from '../lib/oracleTheme';
import { directorErrorText, fetchPremiumPeople, premiumSet, type PremiumPerson } from '../lib/directorTools';

// Premium Vitalício (/diretor/premium, 25/11/2026).
//
// Pedido do Bruno: "Faça com que a conta diretor possa dar e remover o Premium
// Vitalício para usuários." Até aqui o vitalício só era dado pelo console do
// banco. A tela tem duas listas: a busca por nome (para dar) e quem já tem
// (para tirar). O banco confere tudo de novo (director_premium_set):
//   - dar e tirar pedem o código do app digitado nos últimos 15 minutos, nos
//     dois sentidos (é a ferramenta que dá o que as pessoas pagam para ter);
//   - bots não recebem;
//   - ao tirar, o banco devolve ao padrão as peças Premium que a pessoa usava
//     (gatilho antigo do plano); o "Desfazer" do Diário devolve o vitalício e
//     essas peças;
//   - quem assina continua Premium pela assinatura ao perder o vitalício.
// Dar e tirar são em dois toques: a mudança cai na conta de outra pessoa.

const COPY = {
  pt: {
    title: 'Premium Vitalício',
    lead: 'Dá e tira o Premium Vitalício de uma conta. Vale na hora, no site e no app, e cada mudança fica no Diário, com desfazer.',
    needCode: 'Dar e tirar pedem o código do app autenticador digitado nos últimos 15 minutos.',
    giveTitle: 'Dar a uma conta',
    searchPh: 'Nome da conta (@)',
    searchHint: 'Escreva pelo menos 2 letras do nome.',
    none: 'Nenhuma conta com esse nome.',
    holdersTitle: (n: number) => `Quem tem (${n})`,
    holdersEmpty: 'Ninguém tem o Premium Vitalício.',
    reason: 'Motivo (opcional, fica no Diário)',
    give: 'Dar o vitalício',
    giveConfirm: 'Tocar de novo dá',
    take: 'Tirar',
    takeConfirm: 'Tocar de novo tira',
    lifetime: 'Premium Vitalício',
    subscriber: 'Premium pela assinatura',
    free: 'Sem Premium',
    bot: 'Bot',
    botNote: 'Bots não recebem.',
    given: (name: string) => `Premium Vitalício dado a @${name}.`,
    taken: (name: string) => `Vitalício tirado de @${name}. Dá para desfazer no Diário.`,
    takenStill: (name: string) => `Vitalício tirado de @${name}. A conta continua Premium pela assinatura.`,
    same: 'Nada mudou: a conta já estava assim.',
    takeNote:
      'Ao tirar, as peças Premium que a pessoa usa (moldura, banner, carta e efeito no nome) saem do perfil dela. Quem assina continua Premium pela assinatura. Desfazer no Diário devolve o vitalício e as peças.',
    loadFail: 'Não consegui buscar as contas.',
    retry: 'Tentar de novo',
  },
  en: {
    title: 'Lifetime Premium',
    lead: 'Gives and removes Lifetime Premium on an account. It takes effect right away, on the site and in the app, and every change goes to the Diary, with undo.',
    needCode: 'Giving and removing ask for the authenticator code entered in the last 15 minutes.',
    giveTitle: 'Give to an account',
    searchPh: 'Account name (@)',
    searchHint: 'Type at least 2 letters of the name.',
    none: 'No account with that name.',
    holdersTitle: (n: number) => `Who has it (${n})`,
    holdersEmpty: 'Nobody has Lifetime Premium.',
    reason: 'Reason (optional, goes to the Diary)',
    give: 'Give lifetime',
    giveConfirm: 'Tap again to give',
    take: 'Remove',
    takeConfirm: 'Tap again to remove',
    lifetime: 'Lifetime Premium',
    subscriber: 'Premium by subscription',
    free: 'No Premium',
    bot: 'Bot',
    botNote: "Bots don't get it.",
    given: (name: string) => `Lifetime Premium given to @${name}.`,
    taken: (name: string) => `Lifetime removed from @${name}. You can undo it in the Diary.`,
    takenStill: (name: string) => `Lifetime removed from @${name}. The account stays Premium by subscription.`,
    same: 'Nothing changed: the account was already like this.',
    takeNote:
      "Removing it takes the Premium pieces the person is using (frame, banner, card and name effect) off their profile. Subscribers stay Premium by subscription. Undo in the Diary gives back the lifetime and the pieces.",
    loadFail: "Couldn't load the accounts.",
    retry: 'Try again',
  },
} as const;

const DANGER = { color: '#FCA5A5', border: '1px solid rgba(248,113,113,0.4)' } as const;
const DANGER_ARMED = { background: '#DC2626', color: '#fff' } as const;

export default function DirectorPremium() {
  const lang = useDirectorLang();
  const c = COPY[lang];
  const director = useDirector();
  const [holders, setHolders] = useState<PremiumPerson[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<PremiumPerson[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [reason, setReason] = useState('');
  // o botão armado (o segundo toque faz) e a conta que está sendo mudada
  const [armed, setArmed] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // só a resposta do pedido mais novo vale (a busca muda a cada letra)
  const latest = useRef(0);

  const load = useCallback(async (text: string) => {
    const ticket = ++latest.current;
    const q = text.trim().replace(/^@+/, '');
    try {
      const data = await fetchPremiumPeople(q.length >= 2 ? q : undefined);
      if (ticket !== latest.current) return;
      setHolders(data.holders);
      setHits(q.length >= 2 ? data.hits : null);
      setFailed(false);
    } catch (error) {
      if (ticket !== latest.current) return;
      console.error('Director premium people:', error);
      setFailed(true);
    } finally {
      if (ticket === latest.current) setSearching(false);
    }
  }, []);

  // a lista de quem tem, ao abrir; a busca, 350 ms depois da última letra
  useEffect(() => {
    if (!director.isDirector) return;
    const q = query.trim().replace(/^@+/, '');
    if (q.length < 2) {
      setHits(null);
      setSearching(false);
      if (holders === null) load('');
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(() => load(query), 350);
    return () => window.clearTimeout(timer);
    // holders só decide o primeiro pedido
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [director.isDirector, query, load]);

  const canChange = director.mfa && director.recent;

  const act = async (person: PremiumPerson, on: boolean) => {
    const key = `${person.id}:${on ? 'give' : 'take'}`;
    if (armed !== key) {
      setArmed(key);
      return;
    }
    setArmed(null);
    setBusy(person.id);
    try {
      const result = await premiumSet(person.id, on, reason.trim() || undefined);
      if (result.changed === false) toast(c.same);
      else if (on) toast.success(c.given(person.username));
      else toast.success(result.premium ? c.takenStill(person.username) : c.taken(person.username));
      setReason('');
      await load(query);
    } catch (error) {
      console.error('Director premium set:', error);
      toast.error(directorErrorText(error, lang));
      // o código pode ter vencido: a tela confere de novo e pede o código
      director.refresh();
    } finally {
      setBusy(null);
    }
  };

  const row = (person: PremiumPerson, list: 'hits' | 'holders') => {
    const status = person.lifetime ? 'lifetime' : person.premium ? 'subscriber' : 'free';
    const giveKey = `${person.id}:give`;
    const takeKey = `${person.id}:take`;
    const working = busy === person.id;
    return (
      <li key={person.id} data-person={person.id} data-list={list} data-status={status} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl p-2.5" style={PANEL}>
        <span className="w-10 h-10 shrink-0 rounded-full overflow-hidden grid place-items-center text-sm font-semibold" style={{ background: VELVET, color: PAPER }} aria-hidden>
          {person.avatar_url ? <img src={person.avatar_url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" /> : (person.username.charAt(0) || '?').toUpperCase()}
        </span>
        <div className="min-w-0 flex-1 basis-32">
          <p className="text-sm font-medium truncate" style={{ color: PAPER }}>@{person.username}</p>
          <p className="text-xs flex flex-wrap items-center gap-x-1.5" style={{ color: person.lifetime ? BRASS : MIST }}>
            {person.lifetime && <Crown className="w-3 h-3 shrink-0" aria-hidden />}
            <span>{c[status]}</span>
            {person.bot && <span style={{ color: MIST }}>· {c.bot}</span>}
          </p>
        </div>
        {person.lifetime ? (
          <button
            type="button"
            data-action="take"
            disabled={!canChange || working}
            onClick={() => act(person, false)}
            onBlur={() => armed === takeKey && setArmed(null)}
            className={`shrink-0 ml-auto inline-flex items-center gap-1 h-10 min-h-0 px-3 rounded-full text-xs font-semibold disabled:opacity-40 ${FOCUS_RING}`}
            style={armed === takeKey ? DANGER_ARMED : DANGER}
          >
            {working && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />}
            {armed === takeKey ? c.takeConfirm : c.take}
          </button>
        ) : person.bot ? (
          <p className="shrink-0 ml-auto text-xs" style={{ color: MIST }} data-bot-note>{c.botNote}</p>
        ) : (
          <button
            type="button"
            data-action="give"
            disabled={!canChange || working}
            onClick={() => act(person, true)}
            onBlur={() => armed === giveKey && setArmed(null)}
            className={`shrink-0 ml-auto inline-flex items-center gap-1 h-10 min-h-0 px-3 rounded-full text-xs font-semibold disabled:opacity-40 ${FOCUS_RING}`}
            style={armed === giveKey ? { background: '#16A34A', color: '#fff' } : { background: BRASS, color: NIGHT }}
          >
            {working ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <Crown className="w-3.5 h-3.5" aria-hidden />}
            {armed === giveKey ? c.giveConfirm : c.give}
          </button>
        )}
      </li>
    );
  };

  const typed = query.trim().replace(/^@+/, '');

  return (
    <DirectorPage title={c.title} lead={c.lead}>
      {!canChange && <DirectorMfaCard lang={lang} need={director.mfa ? 3 : 2} className="mt-6" style={PANEL} />}

      {/* ---------- Dar ---------- */}
      <section className="mt-6 rounded-2xl p-4 sm:p-5" style={{ ...PANEL, borderColor: 'rgba(245,196,81,0.25)' }} aria-labelledby="premium-give">
        <h2 id="premium-give" className="text-base font-semibold" style={{ color: PAPER }}>{c.giveTitle}</h2>
        {!canChange && <p className="mt-1 text-xs" style={{ color: MIST }} data-need-code>{c.needCode}</p>}

        <label className="mt-3 flex items-center gap-2 h-11 px-3 rounded-xl" style={{ background: VELVET, border: '1px solid rgba(243,234,211,0.12)' }}>
          <Search className="w-4 h-4 shrink-0" style={{ color: MIST }} aria-hidden />
          <span className="sr-only">{c.searchPh}</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={c.searchPh}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="flex-1 min-w-0 bg-transparent outline-none text-sm"
            style={{ color: PAPER }}
          />
          {searching && <Loader2 className="w-4 h-4 animate-spin" style={{ color: MIST }} aria-hidden />}
        </label>
        <label className="mt-2 block">
          <span className="sr-only">{c.reason}</span>
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value.slice(0, 200))}
            placeholder={c.reason}
            className="w-full h-11 px-3 rounded-xl bg-transparent outline-none text-sm"
            style={{ color: PAPER, border: '1px solid rgba(243,234,211,0.12)' }}
          />
        </label>

        <div className="mt-3" aria-live="polite">
          {typed.length < 2 ? (
            <p className="text-xs" style={{ color: MIST }}>{c.searchHint}</p>
          ) : hits === null ? null : hits.length === 0 ? (
            <p className="text-sm" style={{ color: MIST }} data-none>{c.none}</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">{hits.map((person) => row(person, 'hits'))}</ul>
          )}
        </div>
      </section>

      {/* ---------- Quem tem ---------- */}
      <section className="mt-6" aria-labelledby="premium-holders">
        <h2 id="premium-holders" className="text-base font-semibold" style={{ color: PAPER }}>
          {c.holdersTitle(holders?.length ?? 0)}
        </h2>
        <p className="mt-1 text-xs leading-relaxed max-w-prose" style={{ color: MIST }}>{c.takeNote}</p>
        {failed ? (
          <p className="mt-3 flex flex-wrap items-center gap-3 text-sm" style={{ color: '#FCA5A5' }} data-load-fail>
            {c.loadFail}
            <button
              type="button"
              onClick={() => load(query)}
              className={`inline-flex items-center gap-1 h-10 min-h-0 px-3 rounded-full text-xs font-semibold ${FOCUS_RING}`}
              style={{ color: PAPER, border: '1px solid rgba(243,234,211,0.2)' }}
            >
              <RotateCw className="w-3.5 h-3.5" aria-hidden />
              {c.retry}
            </button>
          </p>
        ) : holders === null ? (
          <div className="mt-6 grid place-items-center">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: MIST }} aria-label="…" />
          </div>
        ) : holders.length === 0 ? (
          <p className="mt-3 text-sm" style={{ color: MIST }}>{c.holdersEmpty}</p>
        ) : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">{holders.map((person) => row(person, 'holders'))}</ul>
        )}
      </section>
    </DirectorPage>
  );
}
