"""Comunidade ponderada por afinidade: python3 experiments/run_commsim.py <pasta>

Hoje o termo da comunidade da v4 é a média simples do desvio de TODO mundo que viu o título. Com os bots ele piorou as
pessoas reais (~−1,3pp). Aqui cada outro usuário v pesa w = max(0, corr(u, v))·n/(n + 10), com a correlação dos desvios
(nota − TMDB − viés) nos títulos que os dois avaliaram — sem o título-alvo (deixa um de fora).
"""
import sys, os, math
LAB = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, LAB)
from collections import defaultdict
import numpy as np
from lab import load
from fast import Engine
from evaluate import fold_of, bootstrap_ci, metrics, fmt
import v5

D = load(sys.argv[1])
E = Engine(D)
T, X = v5.collect(D, E)
bots = {u for u, x in D.users.items() if x.get('bot')}
y = np.array([r for (u, k, r) in T], dtype=float)
fold = np.array([fold_of(u) for (u, k, r) in T])
is_bot = np.array([u in bots for (u, k, r) in T])
is_tv = np.array([k[0] == 't' for (u, k, r) in T])
is_shelf = np.array([(k[0] == 'm' and D.titles[k].mood is not None) for (u, k, r) in T])

# desvio de cada nota com o viés da pessoa (dados completos)
g = E.G_sum / E.G_n
bias = {u: E._bias(E.sres.get(u, 0.0), E.n.get(u, 0), g) for u in D.users}
e = {(r.u, r.key): r.r - D.titles[r.key].va - bias[r.u] for r in D.anchored}
raters = defaultdict(list)
for r in D.anchored:
    raters[r.key].append(r.u)
P = defaultdict(lambda: np.zeros(6))          # (u, v) -> n, Sx, Sy, Sxx, Syy, Sxy
for key, us in raters.items():
    for a in us:
        xa = e[(a, key)]
        for b in us:
            if a == b:
                continue
            yb = e[(b, key)]
            P[(a, b)] += (1, xa, yb, xa * xa, yb * yb, xa * yb)


def corr(s):
    n, sx, sy, sxx, syy, sxy = s
    if n < 3:
        return 0.0, n
    vx, vy = sxx - sx * sx / n, syy - sy * sy / n
    if vx <= 1e-9 or vy <= 1e-9:
        return 0.0, n
    return (sxy - sx * sy / n) / math.sqrt(vx * vy), n


def add_commsim(shrink=10.0, signed=False):
    for (u, key, r), x in zip(T, X):
        S = W = 0.0
        xu = e.get((u, key))
        for v, dv_bv in x['comm_list']:          # outros que viram o título, desvio já relativo ao viés deles
            s = P.get((u, v))
            if s is None:
                continue
            s = s.copy()
            if xu is not None:                   # tira o título-alvo do par
                yv = e[(v, key)]
                s -= (1, xu, yv, xu * xu, yv * yv, xu * yv)
            c, n = corr(s)
            w = c * n / (n + shrink)
            if not signed:
                w = max(0.0, w)
            S += w * dv_bv; W += abs(w)
        x['commsim_s'], x['commsim_n'] = S, W


GROUPS = {'reais prateleira': (~is_bot) & is_shelf, 'reais filmes': (~is_bot) & ~is_tv,
          'reais séries': (~is_bot) & is_tv, 'bots filmes': is_bot & ~is_tv, 'bots séries': is_bot & is_tv}


def show(label, disp, mu, ref):
    print(f'== {label}')
    for gname, m in GROUPS.items():
        idx = np.where(m)[0]
        Tg = [T[i] for i in idx]
        mm = metrics(Tg, [int(disp[i]) for i in idx], [float(mu[i]) for i in idx])
        d, lo, hi = bootstrap_ci(Tg, [int(ref[i]) for i in idx], [int(disp[i]) for i in idx], 'exact', B=1000)
        print(f'   {gname:17s} {fmt(mm)}  Δexata {d:+.1f}pp [{lo:+.1f},{hi:+.1f}]')


def crossfit(terms, K0=None, grid=None):
    mu = np.zeros(len(T)); info = {}
    for f in (0, 1):
        tr = np.where(fold != f)[0]; te = np.where(fold == f)[0]
        K, w = v5.fit_model([T[i] for i in tr], [X[i] for i in tr], terms, K0=K0, grid=grid)
        info[f] = (K, w)
        mu[te] = v5.predict_mu([X[i] for i in te], K, w, terms)
    return mu, info


mu0 = np.array([E.v4_mu(x) for x in X]); d0 = np.clip(np.floor(mu0 + 0.5), 0, 10)
K0 = dict(v5.V4_K); K0['commsim'] = 2.0
grid = {c: [0.5, 1, 2, 4, 8, 16, 32, 64] for c in v5.TERMS + ['commsim']}
for shrink, signed in ((10.0, False), (10.0, True), (30.0, False)):
    add_commsim(shrink, signed)
    tag = f'afinidade (encolhe {shrink:g}, {"com sinal" if signed else "só positiva"})'
    # v4 com a comunidade trocada (pesos v4 fixos, só o k da afinidade ajustado)
    for terms in (['dir', 'mood', 'kw', 'commsim'], ['dir', 'mood', 'kw', 'comm', 'commsim'],
                  ['dir', 'mood', 'kw', 'genre', 'cast', 'decade', 'slope', 'oracle', 'origin', 'commsim']):
        mu, info = crossfit(terms, K0=K0, grid=grid)
        disp = np.clip(np.floor(mu + 0.5), 0, 10)
        show(f'{tag}: {"+".join(terms)}', disp, mu, d0)
        for f in (0, 1):
            K, w = info[f]
            print(f'   lado {f} ←', ' '.join(f'{c}:w={wi:.2f},k={K[c]:g}' for c, wi in zip(terms, w)))
