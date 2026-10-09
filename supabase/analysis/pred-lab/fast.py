"""Motor rápido de "features" com deixa-um-de-fora exato, para a base grande (com bots).

Ideia: as evidências da v4 são somas de resíduos e = r − va − viés. Tirar o alvo muda o viés da pessoa (e o g global),
mas isso só desloca todos os resíduos dela pelo mesmo valor; então guardamos, por pista (diretor, humor, palavra-chave,
gênero, elenco, década, oráculo), a soma de (r − va) e a contagem, e na hora de prever subtraímos contagem × viés novo.
Custa O(pistas do alvo) por previsão em vez de O(histórico × pistas).

Uso:
    from fast import Engine
    E = Engine(D)                       # pré-calcula tudo
    X = E.features(u, key)              # dict com as somas (todas LOO)
    E.v4_mu(X)                          # = lab.v4_mu(v4_features(...)) (conferido em check_fast())
"""
from __future__ import annotations

import math
from collections import defaultdict

from lab import V4_PARAMS


def decade_of(t):
    return (t.year // 10) * 10 if t.year else None


CUES = ('dir', 'mood', 'kw', 'genre', 'cast', 'decade', 'oracle', 'origin')


def cues_of(t):
    """Pistas de um título: dict nome -> lista de chaves (hashable)."""
    return {
        'dir': [t.dir] if t.dir is not None else [],
        'mood': [t.mood] if t.mood is not None else [],
        'kw': list(t.kw),
        'genre': list(t.genres),
        'cast': list(t.cast),
        'decade': [decade_of(t)] if decade_of(t) is not None else [],
        'oracle': [t.oracle] if t.oracle else [],
        'origin': ['US' if 'US' in t.origin else ('BR' if 'BR' in t.origin else 'other')] if t.origin else [],
    }


class Engine:
    def __init__(self, D, kb: float = 3.0):
        self.D, self.kb = D, kb
        T = D.titles
        self.cues = {k: cues_of(t) for k, t in T.items()}
        # globais (só filmes, como a v4)
        self.G_sum, self.G_n = 0.0, 0
        self.sres, self.n = defaultdict(float), defaultdict(int)
        # histórico de filmes de cada pessoa, agregado por pista: (soma r − va, contagem)
        self.agg = defaultdict(lambda: {c: defaultdict(lambda: [0.0, 0]) for c in CUES})
        self.hist = defaultdict(list)            # u -> [Rating] (filmes com âncora)
        self.va_stats = defaultdict(lambda: [0.0, 0.0, 0.0, 0.0, 0])  # u -> Σva, Σva², Σ(r−va), Σva(r−va), n
        for r in D.anchored:
            if r.key[0] != 'm':
                continue
            va = T[r.key].va
            d = r.r - va
            self.G_sum += d
            self.G_n += 1
            self.sres[r.u] += d
            self.n[r.u] += 1
            self.hist[r.u].append(r)
            A = self.agg[r.u]
            for c, keys in self.cues[r.key].items():
                for k in keys:
                    A[c][k][0] += d
                    A[c][k][1] += 1
            s = self.va_stats[r.u]
            s[0] += va; s[1] += va * va; s[2] += d; s[3] += va * d; s[4] += 1
        # notas por título (para a comunidade)
        self.raters = defaultdict(list)          # key -> [(u, r − va)]
        for r in D.anchored:
            self.raters[r.key].append((r.u, r.r - T[r.key].va))
        self.idf = D.idf
        # nota de cada (u, key) para achar o alvo
        self.rating_of = {(r.u, r.key): r for r in D.anchored}

    # ------------------------------------------------------------------
    def _bias(self, sres, n, g):
        return (sres + self.kb * g) / (n + self.kb) if n > 0 else g

    def features(self, u, key, exclude=True):
        D, T = self.D, self.D.titles
        t = T[key]
        excl = self.rating_of.get((u, key)) if exclude else None
        G_sum, G_n = self.G_sum, self.G_n
        my_sres, my_n = self.sres.get(u, 0.0), self.n.get(u, 0)
        d_ex = None
        if excl is not None and key[0] == 'm':
            d_ex = excl.r - t.va
            G_sum -= d_ex; G_n -= 1; my_sres -= d_ex; my_n -= 1
        g = G_sum / G_n if G_n else 0.0
        bias = self._bias(my_sres, my_n, g)
        A = self.agg.get(u)
        tc = self.cues[key]
        X = dict(va=t.va, g=g, bias=bias, n_hist=my_n, key=key, u=u)

        def grp(c, k):
            """(S, N) da pista c=k no histórico, sem o alvo, resíduos relativos ao viés novo."""
            if A is None:
                return 0.0, 0
            v = A[c].get(k)
            if v is None:
                return 0.0, 0
            sr, n = v
            if d_ex is not None and k in tc[c]:
                sr -= d_ex; n -= 1
            return sr - n * bias, n

        for c in CUES:
            if c == 'kw':
                sw = cw = 0.0
                for k in tc['kw']:
                    s, n = grp('kw', k)
                    if n:
                        sw += s * self.idf[k]; cw += n * self.idf[k]
                X['kw_s'], X['kw_n'] = sw, cw
            else:
                S = N = 0.0
                for k in tc[c]:
                    s, n = grp(c, k)
                    S += s; N += n
                X[c + '_s'], X[c + '_n'] = S, N
        # comunidade (outros usuários, cada um vs o próprio viés com o g novo)
        cs, cn = 0.0, 0
        others = []
        for v, d in self.raters.get(key, []):
            if v == u:
                continue
            bv = self._bias(self.sres.get(v, 0.0), self.n.get(v, 0), g)
            cs += d - bv; cn += 1
            others.append((v, d - bv))
        X['comm_s'], X['comm_n'] = cs, cn
        X['comm_list'] = others
        # inclinação pessoal no TMDB: regressão de (r − va) em (va − média) no histórico, sem o alvo
        s = self.va_stats.get(u)
        if s is not None:
            sva, sva2, sd, svad, n = s
            if d_ex is not None:
                sva -= t.va; sva2 -= t.va ** 2; sd -= d_ex; svad -= t.va * d_ex; n -= 1
            if n > 1:
                m = sva / n
                sxx = sva2 - n * m * m
                sxy = svad - m * sd
                X['slope_sxx'], X['slope_sxy'], X['va_mean'] = sxx, sxy, m
            else:
                X['slope_sxx'], X['slope_sxy'], X['va_mean'] = 0.0, 0.0, t.va
        else:
            X['slope_sxx'], X['slope_sxy'], X['va_mean'] = 0.0, 0.0, t.va
        return X

    # ------------------------------------------------------------------
    @staticmethod
    def v4_mu(X, P=V4_PARAMS):
        return (X['va'] + X['bias']
                + P['wd'] * X['dir_s'] / (X['dir_n'] + P['kd'])
                + P['wm'] * X['mood_s'] / (X['mood_n'] + P['km'])
                + P['wk'] * X['kw_s'] / (X['kw_n'] + P['kk'])
                + P['wc'] * X['comm_s'] / (X['comm_n'] + P['kc']))


def check_fast(D, kind='movies', n=200, seed=1):
    """Confere o motor rápido contra a réplica exata da v4 (lab.v4_features)."""
    import random
    from lab import v4_features, v4_mu
    from evaluate import targets
    E = Engine(D)
    T = targets(D, kind)
    rng = random.Random(seed)
    worst = 0.0
    for (u, key, r) in rng.sample(T, min(n, len(T))):
        a = v4_mu(v4_features(D, u, key))
        b = E.v4_mu(E.features(u, key))
        worst = max(worst, abs(a - b))
    return worst
