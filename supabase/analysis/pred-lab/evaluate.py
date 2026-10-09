"""Protocolo de avaliação do laboratório (ver README).

    from evaluate import targets, metrics, report, bootstrap_ci, FOLDS
    T = targets(D, 'shelf')                  # lista de (u, key, r)
    pred = [minha_previsao(u, key) for (u, key, r) in T]   # inteiros 0..10 (nota exibida)
    print(report(T, pred))

Cross-fit: ajuste no fold 0 (u % 2 == 0) e meça no fold 1, e vice-versa -> crossfit().
"""
from __future__ import annotations

import math
import random
from collections import defaultdict

FOLDS = (0, 1)


def fold_of(u: int) -> int:
    return u % 2


def targets(D, kind: str = 'shelf'):
    """kind: 'shelf' (filmes em prateleira com TMDB), 'movies' (filmes com TMDB), 'series' (séries com TMDB)."""
    out = []
    for r in D.anchored:
        t = D.titles[r.key]
        if kind == 'shelf' and (r.key[0] != 'm' or t.mood is None):
            continue
        if kind == 'movies' and r.key[0] != 'm':
            continue
        if kind == 'series' and r.key[0] != 't':
            continue
        out.append((r.u, r.key, r.r))
    return out


def metrics(T, pred, mu=None):
    n = len(T)
    if n == 0:
        return {}
    ex = sum(1 for (u, k, r), p in zip(T, pred) if p == r)
    ae = sum(abs(p - r) for (u, k, r), p in zip(T, pred))
    w1 = sum(1 for (u, k, r), p in zip(T, pred) if abs(p - r) <= 1)
    hi_pred = [(r, p) for (u, k, r), p in zip(T, pred) if p >= 9]
    hi_true = [(r, p) for (u, k, r), p in zip(T, pred) if r >= 9]
    m = dict(n=n, exact=ex / n, mae=ae / n, within1=w1 / n,
             prec9=(sum(1 for r, p in hi_pred if r >= 9) / len(hi_pred)) if hi_pred else float('nan'),
             rec9=(sum(1 for r, p in hi_true if p >= 9) / len(hi_true)) if hi_true else float('nan'),
             n_pred9=len(hi_pred))
    if mu is not None:
        m['rmse_mu'] = math.sqrt(sum((x - r) ** 2 for (u, k, r), x in zip(T, mu)) / n)
        m['mae_mu'] = sum(abs(x - r) for (u, k, r), x in zip(T, mu)) / n
    return m


def by_fold(T, pred, mu=None):
    out = {}
    for f in FOLDS:
        idx = [i for i, (u, k, r) in enumerate(T) if fold_of(u) == f]
        out[f] = metrics([T[i] for i in idx], [pred[i] for i in idx], [mu[i] for i in idx] if mu else None)
    return out


def fmt(m):
    if not m:
        return '(vazio)'
    s = f"n={m['n']:4d} exata={100 * m['exact']:5.1f}% MAE={m['mae']:.3f} ±1={100 * m['within1']:5.1f}%"
    if m.get('n_pred9'):
        s += f" 9+prec={100 * m['prec9']:4.1f}% 9+rec={100 * m['rec9']:4.1f}%"
    if 'rmse_mu' in m:
        s += f" RMSEμ={m['rmse_mu']:.3f}"
    return s


def report(T, pred, mu=None, label=''):
    lines = [f'{label} total: {fmt(metrics(T, pred, mu))}']
    bf = by_fold(T, pred, mu)
    for f in FOLDS:
        lines.append(f'{label} lado {f}: {fmt(bf[f])}')
    return '\n'.join(lines)


def bootstrap_ci(T, pred_a, pred_b, stat='exact', B=4000, seed=7):
    """IC 95% (bootstrap de USUÁRIOS, pareado) da diferença stat(pred_b) − stat(pred_a).
    stat: 'exact' (pontos percentuais), 'mae' (MAE; negativo = melhor), 'within1'."""
    per_u = defaultdict(list)
    for (u, k, r), a, b in zip(T, pred_a, pred_b):
        if stat == 'exact':
            d = int(b == r) - int(a == r)
        elif stat == 'within1':
            d = int(abs(b - r) <= 1) - int(abs(a - r) <= 1)
        else:
            d = float(abs(b - r) - abs(a - r))
        per_u[u].append(d)
    users = list(per_u)
    sums = {u: (sum(v), len(v)) for u, v in per_u.items()}
    tot = sum(s for s, n in sums.values()) / sum(n for s, n in sums.values())
    rng = random.Random(seed)
    res = []
    for _ in range(B):
        s = n = 0
        for _ in users:
            uu = users[rng.randrange(len(users))]
            s += sums[uu][0]
            n += sums[uu][1]
        res.append(s / n)
    res.sort()
    lo, hi = res[int(0.025 * B)], res[int(0.975 * B) - 1]
    scale = 100 if stat in ('exact', 'within1') else 1
    return tot * scale, lo * scale, hi * scale


def crossfit(T, fit, apply):
    """fit(T_treino) -> params; apply(params, T_teste) -> lista de previsões.
    Devolve as previsões fora da amostra para todo T (cada lado previsto com os params do outro lado) e os params."""
    pred = [None] * len(T)
    params = {}
    for f in FOLDS:
        tr = [t for t in T if fold_of(t[0]) != f]
        te_idx = [i for i, t in enumerate(T) if fold_of(t[0]) == f]
        p = fit(tr)
        params[f] = p
        out = apply(p, [T[i] for i in te_idx])
        for i, v in zip(te_idx, out):
            pred[i] = v
    return pred, params
