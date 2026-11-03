import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useReducedMotion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Check, ChevronLeft, Copy, Crown, Loader2, Share2, UserPlus, AlertTriangle } from 'lucide-react';
import type { PokerHome } from '../../../lib/poker/client/apiTypes';
import type { Rarity } from '../../../lib/poker/types';
import { PokerClientError } from '../../../lib/poker/client/apiTypes';
import { friendsApi, type FriendsHome, type FriendsMember, type FriendsPosterCard, type FriendsRoom } from '../../../lib/poker/client/friends';
import { groupEffects } from '../../../lib/poker/client/useFriendsMatch';
import { langOf } from '../../../lib/poker/client/format';
import PosterArt from '../../posterJackpot/PosterArt';
import { BLEFE_ROUTES } from '../jackpot/pokerMeta';
import { Sheet } from '../table/Overlays';
import { Stage } from '../game/TitleScreen';
import Layer from '../game/PpLayer';
import { loadPosterPokerFont } from '../game/font';
import PersonAvatar from './PersonAvatar';
import '../../../styles/poker.css';
import '../../../styles/posterPoker.css';

// "Com amigos" (03/11/2026, fase 3 — G3): o 3º modo do Pôster Poker. Sem sala: os
// convites recebidos, criar sala, entrar com código e o placar entre amigos. Na sala: o
// ingresso com o código, a fileira de 4 poltronas (cada lugar vazio fica com um
// oráculo), convidar amigos, os pôsteres de efeito de cada um (até 2; repetidos se
// somam), a aposta (sem aposta / valendo pôster de uma raridade, escolhida por quem
// criou) e o "pronto" / "começar". O servidor (F3) confere tudo; a tela só pede.

const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'legendary'];

const errText = (t: (k: string, o?: Record<string, unknown>) => string, e: unknown) => {
  const err = e as PokerClientError;
  const code = err?.code ?? 'error';
  return t(`poker.friends.errors.${code}`, { defaultValue: t('poker.friends.errors.error') });
};

const posterName = (c: FriendsPosterCard, lang: 'pt' | 'en') => (lang === 'en' && c.titleEn) || c.title || '';

// ---------------------------------------------------------------------------
// Peças
// ---------------------------------------------------------------------------

/** O ingresso com o código da sala (o momento forte da tela). */
const CodeTicket: React.FC<{ code: string }> = ({ code }) => {
  const { t } = useTranslation();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(t('poker.friends.room.copied'));
    } catch {
      toast(code);
    }
  };
  const share = async () => {
    try {
      await navigator.share({ text: t('poker.friends.room.shareText', { code }) });
    } catch {
      // cancelado
    }
  };
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  return (
    <div className="pf-ticket">
      <span className="pf-ticket-label">{t('poker.friends.room.code')}</span>
      <span className="pf-ticket-code pk-num" aria-label={t('poker.friends.room.codeAria', { code: code.split('').join(' ') })}>
        {code}
      </span>
      <span className="pf-ticket-actions">
        <button type="button" className="pf-ticket-btn" onClick={copy} aria-label={t('poker.friends.room.copy')}>
          <Copy className="w-4 h-4" aria-hidden />
        </button>
        {canShare && (
          <button type="button" className="pf-ticket-btn" onClick={share} aria-label={t('poker.friends.room.share')}>
            <Share2 className="w-4 h-4" aria-hidden />
          </button>
        )}
      </span>
    </div>
  );
};

/** As 4 poltronas: quem está, quem foi convidado e os lugares que ficam com oráculos. */
const SeatRow: React.FC<{ room: FriendsRoom }> = ({ room }) => {
  const { t } = useTranslation();
  const list = room.members
    .filter((m) => m.status === 'joined' || m.status === 'invited')
    .sort((a, b) => Number(b.isHost) - Number(a.isHost) || Number(b.status === 'joined') - Number(a.status === 'joined'))
    .slice(0, 4);
  const seats: (FriendsMember | null)[] = [...list, ...Array.from({ length: Math.max(0, 4 - list.length) }, () => null)];
  return (
    <ul className="pf-seats" aria-label={t('poker.friends.room.seatsAria', { count: list.filter((m) => m.status === 'joined').length })}>
      {seats.map((m, i) => {
        if (!m)
          return (
            <li key={`o${i}`} className="pf-seat is-oracle">
              <span className="pf-seat-back" aria-hidden>
                <span className="pf-seat-card" />
              </span>
              <span className="pf-seat-name">{t('poker.friends.room.oracle')}</span>
              <span className="pf-seat-state">{t('poker.friends.room.oracleSeat')}</span>
            </li>
          );
        const me = m.userId === room.me.userId;
        const state = m.status === 'invited' ? t('poker.friends.room.invited') : m.ready ? t('poker.friends.room.ready') : t('poker.friends.room.choosing');
        return (
          <li key={m.userId} className={`pf-seat ${m.status === 'invited' ? 'is-invited' : ''} ${m.ready ? 'is-ready' : ''}`}>
            <span className="pf-seat-back" aria-hidden>
              <PersonAvatar name={m.username} url={m.avatarUrl} size={44} />
              {m.isHost && (
                <span className="pf-seat-host" title={t('poker.friends.room.host')}>
                  <Crown className="w-3 h-3" />
                </span>
              )}
            </span>
            <span className="pf-seat-name">{me ? t('poker.friends.room.you') : m.username}</span>
            <span className="pf-seat-state">
              {m.ready && m.status === 'joined' && <Check className="w-3 h-3" aria-hidden />}
              {state}
            </span>
            {m.effectPosters.length > 0 && (
              <span className="pf-seat-fx" aria-label={t('poker.friends.room.seatFx', { count: m.effectPosters.length })}>
                {m.effectPosters.map((c) => (
                  <i key={c.itemId} />
                ))}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
};

/** Efeitos que vão para a mesa (agrupados; ×2, ×3 quando repetem). */
const TableEffects: React.FC<{ effects: FriendsRoom['effects'] }> = ({ effects }) => {
  const { t } = useTranslation();
  const list = groupEffects(effects);
  if (!list.length) return <p className="pf-muted">{t('poker.friends.room.noTableFx')}</p>;
  return (
    <ul className="pf-chips">
      {list.map((x) => (
        <li key={x.effect} className="pf-chip">
          <span>{t(`poker.effects.${x.effect}.name`)}</span>
          {x.level > 1 && <b className="pk-num">×{x.level}</b>}
        </li>
      ))}
    </ul>
  );
};

/** O aviso da sala valendo pôster, e a escolha da raridade (quem cria). */
const StakeModeSheet: React.FC<{
  initial: Rarity | null;
  title: string;
  confirm: string;
  busy: boolean;
  reduced: boolean;
  onClose: () => void;
  onConfirm: (r: Rarity | null) => void;
}> = ({ initial, title, confirm, busy, reduced, onClose, onConfirm }) => {
  const { t } = useTranslation();
  const [stake, setStake] = useState<boolean>(initial !== null);
  const [rarity, setRarity] = useState<Rarity>(initial ?? 'common');
  return (
    <Layer>
      <Sheet title={title} onClose={onClose} reduced={reduced}>
        <div className="pf-mode" role="radiogroup" aria-label={t('poker.friends.create.modeAria')}>
          <button type="button" role="radio" aria-checked={!stake} className="pf-mode-opt" onClick={() => setStake(false)}>
            <b>{t('poker.friends.create.noStake')}</b>
            <span>{t('poker.friends.create.noStakeHint')}</span>
          </button>
          <button type="button" role="radio" aria-checked={stake} className="pf-mode-opt" onClick={() => setStake(true)}>
            <b>{t('poker.friends.create.stake')}</b>
            <span>{t('poker.friends.create.stakeHint')}</span>
          </button>
        </div>
        {stake && (
          <>
            <p className="mt-3 text-[13px]" style={{ color: '#e9d9c4' }}>{t('poker.friends.create.rarity')}</p>
            <span className="pk-seg pk-seg-full mt-1.5" role="group" aria-label={t('poker.friends.create.rarity')}>
              {RARITIES.map((r) => (
                <button key={r} type="button" aria-pressed={rarity === r} onClick={() => setRarity(r)}>
                  {t(`poker.rarity.${r}`)}
                </button>
              ))}
            </span>
          </>
        )}
        <button type="button" className="pp-ticket is-gold pp-font mt-4" disabled={busy} onClick={() => onConfirm(stake ? rarity : null)}>
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : confirm}
        </button>
      </Sheet>
    </Layer>
  );
};

const InviteSheet: React.FC<{
  home: Extract<FriendsHome, { enabled: true }>;
  room: FriendsRoom;
  busy: boolean;
  reduced: boolean;
  onClose: () => void;
  onInvite: (ids: string[]) => void;
}> = ({ home, room, busy, reduced, onClose, onInvite }) => {
  const { t } = useTranslation();
  const [pick, setPick] = useState<string[]>([]);
  const inRoom = new Set(room.members.filter((m) => m.status === 'joined' || m.status === 'invited').map((m) => m.userId));
  const free = 4 - inRoom.size;
  const list = home.friends.filter((f) => !inRoom.has(f.userId));
  return (
    <Layer>
      <Sheet title={t('poker.friends.invite.title')} onClose={onClose} reduced={reduced}>
        {list.length === 0 ? (
          <p className="text-[14px] py-2" style={{ color: '#e9d9c4' }}>{home.friends.length ? t('poker.friends.invite.allIn') : t('poker.friends.invite.none')}</p>
        ) : (
          <>
            <p className="text-[13px] mb-1" style={{ color: '#c9b3ae' }}>{t('poker.friends.invite.hint', { count: free })}</p>
            <ul className="pf-friend-list">
              {list.map((f) => {
                const on = pick.includes(f.userId);
                const blocked = !on && pick.length >= free;
                return (
                  <li key={f.userId}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      disabled={blocked || f.inRoom}
                      className="pf-friend"
                      onClick={() => setPick((p) => (on ? p.filter((x) => x !== f.userId) : [...p, f.userId]))}
                    >
                      <PersonAvatar name={f.username} url={f.avatarUrl} size={36} />
                      <span className="min-w-0 flex-1 truncate text-left">{f.username}</span>
                      {f.inRoom ? <span className="pf-muted text-[12px]">{t('poker.friends.invite.busy')}</span> : <span className={`pf-check ${on ? 'is-on' : ''}`} aria-hidden>{on && <Check className="w-4 h-4" />}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
            <button type="button" className="pp-ticket is-gold pp-font mt-3" disabled={!pick.length || busy} onClick={() => onInvite(pick)}>
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : t('poker.friends.invite.send', { count: pick.length })}
            </button>
          </>
        )}
      </Sheet>
    </Layer>
  );
};

// ---------------------------------------------------------------------------
// A tela
// ---------------------------------------------------------------------------

const FriendsScreen: React.FC<{ home: PokerHome }> = () => {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const reduce = !!useReducedMotion();
  const api = useMemo(() => friendsApi(), []);
  const [fh, setFh] = useState<FriendsHome | null>(null);
  const [room, setRoom] = useState<FriendsRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | 'create' | 'invite' | 'leave' | 'mode'>(null);
  const [code, setCode] = useState(() => (params.get('codigo') ?? '').toUpperCase().slice(0, 6));
  const roomRef = useRef<FriendsRoom | null>(null);
  roomRef.current = room;

  useEffect(() => {
    loadPosterPokerFont();
  }, []);

  const showRoom = useCallback(
    (r: FriendsRoom | null) => {
      if (r && r.status === 'playing') {
        navigate(BLEFE_ROUTES.friendsTable(r.id), { replace: true });
        return;
      }
      setRoom(r && (r.status === 'lobby' || r.status === 'playing') && r.me.status === 'joined' ? r : null);
    },
    [navigate],
  );

  const loadAll = useCallback(async () => {
    if (!api) return;
    try {
      const h = await api.home();
      setFh(h);
      if (h.enabled && h.room) {
        const reply = await api.sync(h.room.id);
        showRoom(reply.room);
      } else setRoom(null);
    } catch (e) {
      toast.error(errText(t, e));
    } finally {
      setLoading(false);
    }
  }, [api, showRoom, t]);

  useEffect(() => {
    if (!api) {
      setLoading(false);
      return;
    }
    void loadAll();
  }, [api, loadAll]);

  // Na sala: cada aviso de mudança relê a sala (quem entrou, pronto, efeitos, começou).
  const roomId = room?.id ?? null;
  useEffect(() => {
    if (!api || !roomId) return;
    let alive = true;
    const pull = () =>
      api.sync(roomId).then(
        (reply) => alive && showRoom(reply.room),
        () => {},
      );
    const off = api.subscribe(roomId, () => void pull());
    // Rede de segurança: sem aviso, relê de 8 em 8 s.
    const id = window.setInterval(() => document.visibilityState === 'visible' && void pull(), 8000);
    return () => {
      alive = false;
      off();
      window.clearInterval(id);
    };
  }, [api, roomId, showRoom]);

  const run = async (key: string, fn: () => Promise<FriendsRoom | null | void>) => {
    if (busy) return;
    setBusy(key);
    try {
      const r = await fn();
      if (r !== undefined) showRoom(r);
    } catch (e) {
      toast.error(errText(t, e));
      const err = e as PokerClientError;
      if (err?.code === 'in_room' || err?.code === 'room_closed' || err?.code === 'no_room') void loadAll();
    } finally {
      setBusy(null);
    }
  };

  const enabled = !!api && fh?.enabled === true;
  const home = fh && fh.enabled ? fh : null;
  const me = room?.members.find((m) => m.userId === room.me.userId) ?? null;
  const isHost = !!room && room.hostId === room.me.userId;

  // ---- Sem sala ----
  const lobby = home && (
    <>
      {home.invites.length > 0 && (
        <section className="pf-section" aria-labelledby="pf-inv-h">
          <h2 id="pf-inv-h" className="pf-h2">{t('poker.friends.home.invites')}</h2>
          <ul className="grid gap-2.5">
            {home.invites.map((inv) => (
              <li key={inv.roomId} className="pf-invite">
                <PersonAvatar name={inv.host.username} url={inv.host.avatarUrl} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] leading-snug">{t('poker.friends.home.inviteLine', { name: inv.host.username })}</span>
                  <span className="block text-[12.5px] mt-0.5" style={{ color: '#c9b3ae' }}>
                    {inv.stakeRarity ? t('poker.friends.stakeLine', { rarity: t(`poker.rarity.${inv.stakeRarity}`).toLowerCase() }) : t('poker.friends.noStakeLine')}
                  </span>
                </span>
                <span className="pf-invite-actions">
                  <button type="button" className="pf-btn is-gold" disabled={!!busy} onClick={() => run(`acc-${inv.roomId}`, async () => (await api!.respond(inv.roomId, true)).room)}>
                    {busy === `acc-${inv.roomId}` ? <Loader2 className="w-4 h-4 animate-spin" /> : t('poker.friends.home.accept')}
                  </button>
                  <button
                    type="button"
                    className="pf-btn"
                    disabled={!!busy}
                    onClick={() =>
                      run(`dec-${inv.roomId}`, async () => {
                        await api!.respond(inv.roomId, false);
                        await loadAll();
                      })
                    }
                  >
                    {t('poker.friends.home.decline')}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="pf-section">
        <button type="button" className="pp-ticket is-gold pp-font" onClick={() => setSheet('create')}>
          {t('poker.friends.home.create')}
        </button>
        <form
          className="pf-join"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.length < 6) return;
            void run('join', async () => (await api!.join(code)).room);
          }}
        >
          <label htmlFor="pf-code" className="pf-join-label">{t('poker.friends.home.haveCode')}</label>
          <span className="pf-join-row">
            <input
              id="pf-code"
              className="pf-code-input pk-num"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
              placeholder="ABC123"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              inputMode="text"
              maxLength={6}
            />
            <button type="submit" className="pf-btn is-gold" disabled={code.length < 6 || !!busy}>
              {busy === 'join' ? <Loader2 className="w-4 h-4 animate-spin" /> : t('poker.friends.home.join')}
            </button>
          </span>
        </form>
      </div>

      {home.scoreboard.some((s) => s.matches > 0) && (
        <section className="pf-section" aria-labelledby="pf-score-h">
          <h2 id="pf-score-h" className="pf-h2">{t('poker.friends.home.scoreboard')}</h2>
          <ol className="pf-board">
            {[...home.scoreboard].sort((a, b) => b.wins - a.wins || b.matches - a.matches).map((s, i) => (
              <li key={s.userId}>
                <span className="pk-num pf-board-pos">{i + 1}</span>
                <PersonAvatar name={s.username} url={s.avatarUrl} size={30} />
                <span className="min-w-0 flex-1 truncate">{s.username}</span>
                <span className="pk-num pf-board-n">{t('poker.friends.home.wins', { count: s.wins, matches: s.matches })}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <p className="pf-foot">{t('poker.friends.home.free')}</p>
    </>
  );

  // ---- Na sala ----
  const myFx = new Set(me?.effectPosters.map((c) => c.itemId) ?? []);
  const toggleFx = (c: FriendsPosterCard) => {
    if (!room || !me) return;
    const next = myFx.has(c.itemId) ? [...myFx].filter((x) => x !== c.itemId) : [...myFx, c.itemId];
    if (next.length > 2) {
      toast(t('poker.friends.room.fxMax'));
      return;
    }
    void run(`fx-${c.itemId}`, async () => (await api!.setEffects(room.id, next)).room);
  };
  const blockText = (() => {
    if (!room || !me) return '';
    if (!me.ready && !isHost) return '';
    const b = isHost ? room.blockers : [];
    if (isHost && b.includes('need_players')) return t('poker.friends.room.needPlayers');
    if (isHost && b.includes('stake_problem')) return t('poker.friends.room.stakeBlocked');
    if (isHost && b.includes('not_ready')) return t('poker.friends.room.waitReady');
    if (!isHost) return t('poker.friends.room.waitHost', { name: room.members.find((m) => m.isHost)?.username ?? '' });
    return '';
  })();

  const roomView = room && me && (
    <>
      <CodeTicket code={room.code} />
      <p className="pf-stake-line">
        <span>{room.stakeRarity ? t('poker.friends.stakeLine', { rarity: t(`poker.rarity.${room.stakeRarity}`).toLowerCase() }) : t('poker.friends.noStakeLine')}</span>
        {isHost && (
          <button type="button" className="pf-link" onClick={() => setSheet('mode')}>
            {t('poker.friends.room.change')}
          </button>
        )}
      </p>

      <SeatRow room={room} />
      {isHost && room.members.filter((m) => m.status === 'joined' || m.status === 'invited').length < 4 && (
        <button type="button" className="pf-btn is-wide" onClick={() => setSheet('invite')}>
          <UserPlus className="w-4 h-4" aria-hidden />
          {t('poker.friends.room.invite')}
        </button>
      )}

      <section className="pf-section" aria-labelledby="pf-fx-h">
        <h2 id="pf-fx-h" className="pf-h2">{t('poker.friends.room.myFx')}</h2>
        <p className="pf-muted">{t('poker.friends.room.myFxHint')}</p>
        {room.options?.effects.length ? (
          <ul className="pf-fx-list">
            {room.options.effects.map((c) => {
              const on = myFx.has(c.itemId);
              return (
                <li key={c.itemId}>
                  <button type="button" role="checkbox" aria-checked={on} className={`pf-fx ${on ? 'is-on' : ''}`} disabled={!!busy} onClick={() => toggleFx(c)}>
                    <span className="pf-fx-art">
                      <PosterArt filePath={c.filePath} effect="gold" size="w185" animated={false} className="absolute inset-0 rounded-[5px]" />
                    </span>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="pf-fx-name pp-font">{t(`poker.effects.${c.effectId}.name`)}</span>
                      <span className="pf-fx-rule">{t(`poker.effects.${c.effectId}.rule`)}</span>
                    </span>
                    <span className={`pf-check ${on ? 'is-on' : ''}`} aria-hidden>
                      {busy === `fx-${c.itemId}` ? <Loader2 className="w-4 h-4 animate-spin" /> : on && <Check className="w-4 h-4" />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="pf-empty">{t('poker.friends.room.noFx')}</p>
        )}
        <h3 className="pf-h3">{t('poker.friends.room.tableFx')}</h3>
        <TableEffects effects={room.effects} />
      </section>

      {room.stakeRarity && (
        <section className="pf-section" aria-labelledby="pf-stake-h">
          <h2 id="pf-stake-h" className="pf-h2">{t('poker.friends.room.myStake')}</h2>
          <p className="pf-warn">
            <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden />
            <span>{t('poker.friends.room.stakeWarn')}</span>
          </p>
          {room.options?.stakes.length ? (
            <ul className="pf-stakes">
              {room.options.stakes.map((c) => {
                const on = me.stake?.itemId === c.itemId && me.stake?.effect === c.effect;
                return (
                  <li key={`${c.itemId}-${c.effect}`}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={on}
                      className={`pf-stake ${on ? 'is-on' : ''}`}
                      disabled={!!busy}
                      onClick={() => run(`st-${c.itemId}`, async () => (await api!.setStake(room.id, on ? null : c.itemId, c.effect)).room)}
                    >
                      <span className="pf-stake-art">
                        <PosterArt filePath={c.filePath} effect={c.effect as never} size="w185" animated={false} className="absolute inset-0 rounded-[6px]" />
                        {on && (
                          <span className="pf-stake-on" aria-hidden>
                            <Check className="w-4 h-4" />
                          </span>
                        )}
                      </span>
                      <span className="pf-stake-title">{posterName(c, lang)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="pf-empty">{t('poker.friends.room.noStakeOptions', { rarity: t(`poker.rarity.${room.stakeRarity}`).toLowerCase() })}</p>
          )}
          {me.stakeProblem && me.stakeProblem !== 'missing' && (
            <p className="pf-problem" role="alert">{t(`poker.friends.stakeProblem.${me.stakeProblem}`, { defaultValue: t('poker.friends.stakeProblem.other') })}</p>
          )}
        </section>
      )}

      <div className="pf-section pf-go">
        {isHost ? (
          // Quem criou conta sempre como pronto (F3): o botão é o de começar.
          <button
            type="button"
            className="pp-ticket is-gold pp-font"
            disabled={!!busy || !room.canStart}
            onClick={() =>
              run('start', async () => {
                const r = await api!.start(room.id);
                navigate(BLEFE_ROUTES.friendsTable(r.room.id));
                return null;
              })
            }
          >
            {busy === 'start' ? <Loader2 className="w-5 h-5 animate-spin" /> : t('poker.friends.room.start')}
          </button>
        ) : !me.ready ? (
          <button
            type="button"
            className="pp-ticket is-gold pp-font"
            disabled={!!busy || (!!room.stakeRarity && (!me.stake || !!me.stakeProblem))}
            onClick={() => run('ready', async () => (await api!.setReady(room.id, true)).room)}
          >
            {busy === 'ready' ? <Loader2 className="w-5 h-5 animate-spin" /> : t('poker.friends.room.ready_cta')}
          </button>
        ) : (
          <button type="button" className="pp-ticket" disabled={!!busy} onClick={() => run('unready', async () => (await api!.setReady(room.id, false)).room)}>
            {t('poker.friends.room.unready')}
          </button>
        )}
        {room.stakeRarity && !me.stake && <p className="pf-muted text-center">{t('poker.friends.stakeProblem.missing')}</p>}
        {blockText && (
          <p className="pf-wait" role="status">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
            {blockText}
          </p>
        )}
        <button type="button" className="pf-link mx-auto" onClick={() => setSheet('leave')}>
          {t('poker.friends.room.leave')}
        </button>
      </div>
    </>
  );

  return (
    <Stage className="pf-stage">
      <header className="pp-topbar">
        <button type="button" className="pp-icon-btn" onClick={() => (room ? setSheet('leave') : navigate(BLEFE_ROUTES.title))} aria-label={room ? t('poker.friends.room.leave') : t('poker.game.back')}>
          <ChevronLeft className="w-6 h-6" />
        </button>
        {room && <span className="pf-badge">{isHost ? t('poker.friends.room.yourRoom') : t('poker.friends.room.friendRoom', { name: room.members.find((m) => m.isHost)?.username ?? '' })}</span>}
      </header>

      <h1 className="text-center pp-font pp-gold-letters text-[32px] leading-tight">{t('poker.friends.title')}</h1>
      {!room && <p className="mt-1.5 text-center text-[13.5px] leading-snug" style={{ color: '#e9d9c4' }}>{t('poker.friends.intro')}</p>}

      {loading ? (
        <div className="grid place-items-center py-16" role="status" aria-label={t('common.loading')}>
          <Loader2 className="w-7 h-7 animate-spin" style={{ color: '#FFE7A1' }} />
        </div>
      ) : !enabled ? (
        <p className="pf-empty mt-8 text-center">{api ? t('poker.friends.closed') : t('poker.friends.soon')}</p>
      ) : room ? (
        roomView
      ) : (
        lobby
      )}

      {sheet === 'create' && (
        <StakeModeSheet
          initial={null}
          title={t('poker.friends.create.title')}
          confirm={t('poker.friends.create.confirm')}
          busy={busy === 'create'}
          reduced={reduce}
          onClose={() => setSheet(null)}
          onConfirm={(r) =>
            void run('create', async () => {
              const reply = await api!.create(r);
              setSheet(null);
              return reply.room;
            })
          }
        />
      )}
      {sheet === 'mode' && room && (
        <StakeModeSheet
          initial={room.stakeRarity}
          title={t('poker.friends.create.change')}
          confirm={t('poker.friends.create.save')}
          busy={busy === 'mode'}
          reduced={reduce}
          onClose={() => setSheet(null)}
          onConfirm={(r) =>
            void run('mode', async () => {
              const reply = await api!.configure(room.id, r);
              setSheet(null);
              return reply.room;
            })
          }
        />
      )}
      {sheet === 'invite' && room && home && (
        <InviteSheet
          home={home}
          room={room}
          busy={busy === 'invite'}
          reduced={reduce}
          onClose={() => setSheet(null)}
          onInvite={(ids) =>
            void run('invite', async () => {
              const reply = await api!.invite(room.id, ids);
              setSheet(null);
              if (reply.skipped?.length) toast(t('poker.friends.invite.skipped', { count: reply.skipped.length }));
              else toast.success(t('poker.friends.invite.sent', { count: reply.invited?.length ?? ids.length }));
              return reply.room;
            })
          }
        />
      )}
      {sheet === 'leave' && room && (
        <Layer>
          <Sheet title={t('poker.friends.room.leaveTitle')} onClose={() => setSheet(null)} reduced={reduce}>
            <p className="text-[14.5px] mb-4" style={{ color: '#ECDCCF' }}>{isHost ? t('poker.friends.room.leaveHost') : t('poker.friends.room.leaveGuest')}</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="pk-cta-ghost" onClick={() => setSheet(null)} autoFocus>{t('poker.leave.stay')}</button>
              <button
                type="button"
                className="pk-cta-paper"
                onClick={() =>
                  void run('leave', async () => {
                    await api!.leave(room.id);
                    setSheet(null);
                    setRoom(null);
                    await loadAll();
                  })
                }
              >
                {t('poker.friends.room.leaveConfirm')}
              </button>
            </div>
          </Sheet>
        </Layer>
      )}
    </Stage>
  );
};

export default FriendsScreen;
