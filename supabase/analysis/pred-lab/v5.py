"""v5 — família de fórmulas sobre o motor rápido (fast.Engine).

μ = TMDB + viés + Σ_c w_c · S_c/(N_c + k_c)   [pistas: diretor, humor, palavras-chave(idf), gênero, elenco, década, oráculo, origem]
      + w_comm · comunidade/(n + k_comm)
      + w_slope · (va − média_va) · Sxy/(Sxx + λ)        [inclinação pessoal no TMDB]
Com os k fixos, μ é linear nos pesos w → mínimos quadrados (com leve ridge) no lado de treino. Os k e λ saem de uma busca
por coordenadas, também só no lado de treino. Depois, a regra de decisão (inteiro exibido) — ver decide().
"""
from __future__ import annotations

import math
import numpy as np

from fast import Engine, CUES
from evaluate import targets, fold_of

TERMS = ['dir', 'mood', 'kw', 'genre', 'cast', 'decade', 'oracle', 'origin', 'comm', 'slope']
V4_K = dict(dir=1.0, mood=8.0, kw=20.0, genre=20.0, cast=3.0, decade=10.0, oracle=10.0, origin=10.0, comm=4.0, slope=50.0)
V4_W = dict(dir=0.70, mood=0.60, kw=0.75, comm=0.80)


def collect(D, E: Engine, kinds=('movies', 'series')):
    """Features de todos os alvos (LOO). Devolve (T, Xs) com T = [(u, key, r)]."""
    T, X = [], []
    for kind in kinds:
        for (u, key, r) in targets(D, kind):
            T.append((u, key, r))
            X.append(E.features(u, key))
    return T, X


def design(X, K, terms):
    """Matriz (n × len(terms)) dos termos com as constantes K."""
    M = np.zeros((len(X), len(terms)))
    for i, x in enumerate(X):
        for j, c in enumerate(terms):
            if c == 'comm':
                M[i, j] = x['comm_s'] / (x['comm_n'] + K['comm'])
            elif c == 'slope':
                M[i, j] = (x['va'] - x['va_mean']) * x['slope_sxy'] / (x['slope_sxx'] + K['slope'])
            else:
                M[i, j] = x[c + '_s'] / (x[c + '_n'] + K[c])
    return M


def base_and_y(T, X):
    base = np.array([x['va'] + x['bias'] for x in X])
    y = np.array([r for (u, k, r) in T], dtype=float)
    return base, y


def fit_w(M, resid, ridge=1.0, loss='l2', iters=30):
    """Pesos por mínimos quadrados (ridge) ou por erro absoluto (IRLS)."""
    p = M.shape[1]
    w = np.linalg.solve(M.T @ M + ridge * np.eye(p), M.T @ resid)
    if loss == 'l1':
        for _ in range(iters):
            e = np.abs(resid - M @ w)
            wt = 1.0 / np.maximum(e, 0.25)
            Mw = M * wt[:, None]
            w = np.linalg.solve(M.T @ Mw + ridge * np.eye(p), Mw.T @ resid)
    return w


def fit_model(T, X, terms, K0=None, grid=None, ridge=1.0, loss='l2', rounds=2):
    """Busca por coordenadas dos k (no conjunto dado) + pesos lineares. Devolve (K, w)."""
    K = dict(V4_K if K0 is None else K0)
    base, y = base_and_y(T, X)
    resid = y - base
    grid = grid or {c: [0.5, 1, 2, 4, 8, 16, 32, 64] for c in terms}

    def score(Kc):
        M = design(X, Kc, terms)
        w = fit_w(M, resid, ridge, loss)
        e = resid - M @ w
        return (np.abs(e).mean() if loss == 'l1' else (e ** 2).mean()), w

    best, w = score(K)
    for _ in range(rounds):
        for c in terms:
            for v in grid.get(c, []):
                Kc = dict(K); Kc[c] = v
                s, wc = score(Kc)
                if s < best - 1e-12:
                    best, K, w = s, Kc, wc
    return K, w


def predict_mu(X, K, w, terms):
    base = np.array([x['va'] + x['bias'] for x in X])
    return base + design(X, K, terms) @ w


# ---------------------------------------------------------------------------
# Regra de decisão
# ---------------------------------------------------------------------------
KK = np.arange(11)


def user_hists(D, T):
    """Histograma LOO das notas da pessoa (todas com âncora, menos o alvo) e histograma global LOO, por alvo."""
    by_u = {}
    G = np.zeros(11)
    for r in D.anchored:
        by_u.setdefault(r.u, np.zeros(11))[int(r.r)] += 1
        G[int(r.r)] += 1
    H = np.zeros((len(T), 11)); P = np.zeros((len(T), 11))
    for i, (u, k, r) in enumerate(T):
        H[i] = by_u[u]; H[i, int(r)] -= 1
        P[i] = G; P[i, int(r)] -= 1
    return H, P / P.sum(1, keepdims=True)


def decide(mu, H, Pg, c=0.0, alpha=10.0, beta=0.0, s=1.0):
    """argmax_k  −(k − μ − c)²/(2s²) + β·log((H_k + α·Pg_k)/(n + α)).  β = 0 → arredondar μ + c."""
    m = mu + c
    ll = -0.5 * ((KK[None, :] - m[:, None]) / s) ** 2
    if beta > 0:
        prior = (H + alpha * Pg) / (H.sum(1, keepdims=True) + alpha)
        ll = ll + beta * np.log(prior + 1e-9)
    return ll.argmax(1)


def fit_decide(mu, H, Pg, y, grid=None):
    grid = grid or [(c, a, b, s) for c in (-0.2, -0.1, 0, 0.1, 0.2) for a in (2, 5, 10, 20, 50)
                    for b in (0, 0.25, 0.5, 0.75, 1.0) for s in (0.8, 1.0, 1.2, 1.5)]
    best, bp = -1, None
    for p in grid:
        acc = (decide(mu, H, Pg, *p) == y).mean()
        if acc > best + 1e-12:
            best, bp = acc, p
    return bp, best
