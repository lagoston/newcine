"""Bateria com bots: python3 experiments/run_bots.py <pasta_de_dados>

1. Efeito da comunidade: a v4 nas pessoas reais com e sem os bots na base (os bots mudam o g global — para onde o viés
   de quem tem poucas notas é puxado — e entram no termo da comunidade).
2. A v4 em cada bot, contra duas referências ingênuas (tudo "deixa um de fora"):
   - moda: sempre a nota que a pessoa mais dá;
   - TMDB + viés: arredondar va + viés (a v4 sem nenhuma pista).
"""
import sys, os
from collections import defaultdict, Counter
LAB = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, LAB)
import numpy as np
from lab import load, Data, DATA
from fast import Engine
from evaluate import targets, metrics, fmt, bootstrap_ci


def subset(D, keep):
    """Mesma base, só com as pessoas em `keep` (títulos, palavras-chave e idf iguais)."""
    D2 = Data(users={u: x for u, x in D.users.items() if u in keep}, titles=D.titles,
              ratings=[r for r in D.ratings if r.u in keep], watchlist=[w for w in D.watchlist if w[0] in keep],
              idf=D.idf, df=D.df, ndocs=D.ndocs)
    by_user, by_title = defaultdict(list), defaultdict(list)
    for r in D2.ratings:
        t = D2.titles.get(r.key)
        if t is None or t.va <= 0:
            continue
        D2.anchored.append(r)
        by_user[r.u].append(r)
        by_title[r.key].append(r)
    D2.by_user, D2.by_title = dict(by_user), dict(by_title)
    return D2


def rnd(x):
    return int(min(10, max(0, np.floor(x + 0.5))))


path = sys.argv[1] if len(sys.argv) > 1 else DATA
D = load(path)
bots = {u for u, x in D.users.items() if x.get('bot')}
real = set(D.users) - bots
print(f'pessoas reais: {len(real)}  bots: {len(bots)}  notas com âncora: {len(D.anchored)} '
      f'(reais {sum(1 for r in D.anchored if r.u in real)}, bots {sum(1 for r in D.anchored if r.u in bots)})')

E_all = Engine(D)
E_nb = Engine(subset(D, real))

# ---------------------------------------------------------------------------
print('\n## 1. Pessoas reais: v4 com e sem os bots na base (arredondando μ)')
for kind in ('shelf', 'movies', 'series'):
    T = [t for t in targets(D, kind) if t[0] in real]
    Xa = [E_all.features(u, k) for (u, k, r) in T]
    Xn = [E_nb.features(u, k) for (u, k, r) in T]
    mua = [E_all.v4_mu(x) for x in Xa]
    mun = [E_nb.v4_mu(x) for x in Xn]
    pa = [rnd(m) for m in mua]
    pn = [rnd(m) for m in mun]
    d, lo, hi = bootstrap_ci(T, pn, pa, 'exact', B=2000)
    dm, lom, him = bootstrap_ci(T, pn, pa, 'mae', B=2000)
    gained = sum(1 for xa, xn in zip(Xa, Xn) if xa['comm_n'] > xn['comm_n'])
    changed = sum(1 for a, b in zip(pa, pn) if a != b)
    print(f'  {kind:6s} sem bots: {fmt(metrics(T, pn, mun))}')
    print(f'  {kind:6s} com bots: {fmt(metrics(T, pa, mua))}')
    print(f'         Δexata {d:+.1f}pp [{lo:+.1f},{hi:+.1f}]  ΔMAE {dm:+.3f} [{lom:+.3f},{him:+.3f}]  '
          f'nota exibida mudou em {changed}/{len(T)}; {gained} alvos ganharam voto de bot na comunidade')
g_all = E_all.G_sum / E_all.G_n
g_nb = E_nb.G_sum / E_nb.G_n
print(f'  g global (média de nota − TMDB nos filmes): sem bots {g_nb:+.3f}, com bots {g_all:+.3f}')

# ---------------------------------------------------------------------------
print('\n## 2. Cada pessoa: v4 contra referências ingênuas (filmes e séries, deixa um de fora)')
T = targets(D, 'movies') + targets(D, 'series')
X = [E_all.features(u, k) for (u, k, r) in T]
mu = np.array([E_all.v4_mu(x) for x in X])
p_v4 = [rnd(m) for m in mu]
p_base = [rnd(x['va'] + x['bias']) for x in X]
# moda em 5 partes por pessoa (a moda de 80% das notas prevê os outros 20%): o "deixa um de fora" puro erra sempre
# quando há empate entre duas notas (tirar uma faz a outra ganhar), o que deixaria a moda injustamente ruim.
import random
rng = random.Random(11)
part = {}
for u in D.users:
    idx_u = [i for i, t in enumerate(T) if t[0] == u]
    rng.shuffle(idx_u)
    for j, i in enumerate(idx_u):
        part[i] = j % 5
hist5 = defaultdict(lambda: np.zeros(11))
for i, (u, k, r) in enumerate(T):
    hist5[(u, part[i])][int(r)] += 1
p_mode = []
for i, (u, k, r) in enumerate(T):
    h = sum(hist5[(u, q)] for q in range(5) if q != part[i])
    p_mode.append(int(max(range(11), key=lambda v: (h[v], -abs(v - 6)))))

rows = []
for u in sorted(D.users, key=lambda u: (u in bots, u)):
    idx = [i for i, t in enumerate(T) if t[0] == u]
    if len(idx) < 10:
        continue
    Tu = [T[i] for i in idx]
    rs = np.array([t[2] for t in Tu])
    m_v4 = metrics(Tu, [p_v4[i] for i in idx])
    m_b = metrics(Tu, [p_base[i] for i in idx])
    m_m = metrics(Tu, [p_mode[i] for i in idx])
    share_mode = max(Counter(rs.astype(int)).values()) / len(rs)
    rows.append((u, u in bots, len(idx), rs.mean(), rs.std(), share_mode, m_v4, m_b, m_m))
print('  quem      n   média  dp   %moda | v4 exata  MAE  | TMDB+viés exata MAE | moda exata MAE')
for (u, b, n, mean, sd, sm, a, bb, c) in rows:
    print(f"  {'bot' if b else 'real'} {u:3d} {n:5d}  {mean:4.1f}  {sd:4.2f}  {100*sm:4.0f}% | "
          f"{100*a['exact']:5.1f}%  {a['mae']:.2f} | {100*bb['exact']:5.1f}%  {bb['mae']:.2f} | {100*c['exact']:5.1f}%  {c['mae']:.2f}")

for label, S in (('reais', real), ('bots', bots)):
    idx = [i for i, t in enumerate(T) if t[0] in S]
    if not idx:
        continue
    Tg = [T[i] for i in idx]
    a = [p_v4[i] for i in idx]; b = [p_base[i] for i in idx]; c = [p_mode[i] for i in idx]
    print(f'\n  {label} — v4:        {fmt(metrics(Tg, a, [float(mu[i]) for i in idx]))}')
    d, lo, hi = bootstrap_ci(Tg, a, b, 'exact', B=2000)
    print(f'  {label} — TMDB+viés: {fmt(metrics(Tg, b))}  (Δexata vs v4 {d:+.1f}pp [{lo:+.1f},{hi:+.1f}])')
    d, lo, hi = bootstrap_ci(Tg, a, c, 'exact', B=2000)
    print(f'  {label} — moda:      {fmt(metrics(Tg, c))}  (Δexata vs v4 {d:+.1f}pp [{lo:+.1f},{hi:+.1f}])')

# correlação: quanto mais "concentrada" a pessoa (%moda), mais a moda ganha?
sm = np.array([r[5] for r in rows]); gain = np.array([r[8]['exact'] - r[6]['exact'] for r in rows])
print(f'\n  correlação entre %moda e (moda − v4) em acerto exato, por pessoa: {np.corrcoef(sm, gain)[0, 1]:+.2f}')
