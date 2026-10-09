"""Bateria v5: python3 experiments/run_v5.py [pasta_de_dados]

Ajuste (k, pesos, regra de decisão) sempre no lado oposto (u % 2) — com TODOS os alvos daquele lado (pessoas reais e bots);
a medida sai separada: pessoas reais (prateleira, filmes, séries) e bots (filmes, séries).
"""
import sys, os, math, time
LAB = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, LAB)
import numpy as np
from lab import load, DATA
from fast import Engine
from evaluate import fold_of, bootstrap_ci, metrics, fmt
import v5

path = sys.argv[1] if len(sys.argv) > 1 else DATA
D = load(path)
E = Engine(D)
t0 = time.time()
T, X = v5.collect(D, E)
print(f'alvos: {len(T)}  ({time.time() - t0:.1f}s)')
bots = {u for u, x in D.users.items() if x.get('bot')}
y = np.array([r for (u, k, r) in T], dtype=float)
fold = np.array([fold_of(u) for (u, k, r) in T])
is_bot = np.array([u in bots for (u, k, r) in T])
is_tv = np.array([k[0] == 't' for (u, k, r) in T])
is_shelf = np.array([(k[0] == 'm' and D.titles[k].mood is not None) for (u, k, r) in T])
H, Pg = v5.user_hists(D, T)

GROUPS = {
    'reais prateleira': (~is_bot) & is_shelf,
    'reais filmes': (~is_bot) & ~is_tv,
    'reais séries': (~is_bot) & is_tv,
    'bots filmes': is_bot & ~is_tv,
    'bots séries': is_bot & is_tv,
}


def show(label, disp, mu=None, ref=None):
    print(f'== {label}')
    for g, m in GROUPS.items():
        if m.sum() == 0:
            continue
        idx = np.where(m)[0]
        Tg = [T[i] for i in idx]
        mm = metrics(Tg, [int(disp[i]) for i in idx], [float(mu[i]) for i in idx] if mu is not None else None)
        s = f'   {g:17s} {fmt(mm)}'
        if ref is not None:
            d, lo, hi = bootstrap_ci(Tg, [int(ref[i]) for i in idx], [int(disp[i]) for i in idx], 'exact', B=1000)
            s += f'  Δexata {d:+.1f}pp [{lo:+.1f},{hi:+.1f}]'
        print(s)


def crossfit(fit_fn, apply_fn):
    out = np.zeros(len(T)); info = {}
    for f in (0, 1):
        tr = np.where(fold != f)[0]; te = np.where(fold == f)[0]
        p = fit_fn(tr)
        info[f] = p
        out[te] = apply_fn(p, te)
    return out, info


sub = lambda idx: ([T[i] for i in idx], [X[i] for i in idx])

# V0 — v4 exata
mu0 = np.array([E.v4_mu(x) for x in X])
d0 = np.clip(np.floor(mu0 + 0.5), 0, 10)
show('V0 v4 (arredondar μ)', d0, mu0)

variants = [
    ('V1 v4, pesos reajustados', ['dir', 'mood', 'kw', 'comm'], False),
    ('V2 v4, pesos e k reajustados', ['dir', 'mood', 'kw', 'comm'], True),
    ('V3 + gênero, elenco, década', ['dir', 'mood', 'kw', 'comm', 'genre', 'cast', 'decade'], True),
    ('V4 + inclinação TMDB, oráculo, origem', ['dir', 'mood', 'kw', 'comm', 'genre', 'cast', 'decade', 'slope', 'oracle', 'origin'], True),
]
best_mu = {}
for label, terms, tune_k in variants:
    def fit_fn(tr, terms=terms, tune_k=tune_k):
        Tt, Xt = sub(tr)
        if tune_k:
            return v5.fit_model(Tt, Xt, terms)
        base, yy = v5.base_and_y(Tt, Xt)
        M = v5.design(Xt, v5.V4_K, terms)
        return dict(v5.V4_K), v5.fit_w(M, yy - base)
    def apply_fn(p, te, terms=terms):
        K, w = p
        return v5.predict_mu([X[i] for i in te], K, w, terms)
    mu, info = crossfit(fit_fn, apply_fn)
    best_mu[label] = (mu, terms)
    disp = np.clip(np.floor(mu + 0.5), 0, 10)
    show(label, disp, mu, ref=d0)
    for f in (0, 1):
        K, w = info[f]
        print(f'   lado {f} ←', ' '.join(f'{c}:w={wi:.2f},k={K[c]:g}' for c, wi in zip(terms, w)))

# regra de decisão por cima da melhor μ (e da v4)
for label in ['V0', list(best_mu)[-1]]:
    mu = mu0 if label == 'V0' else best_mu[label][0]
    def fit_d(tr, mu=mu):
        return v5.fit_decide(mu[tr], H[tr], Pg[tr], y[tr])[0]
    def app_d(p, te, mu=mu):
        return v5.decide(mu[te], H[te], Pg[te], *p)
    disp, info = crossfit(fit_d, app_d)
    show(f'{label} + regra de decisão (histograma pessoal)', disp, mu, ref=d0)
    print('   params (c, α, β, s):', info)
