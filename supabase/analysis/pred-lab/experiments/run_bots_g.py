"""De onde vem a piora das pessoas reais com os bots: do g global (média nota − TMDB) ou do termo da comunidade?
python3 experiments/run_bots_g.py <pasta>"""
import sys, os
LAB = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, LAB); sys.path.insert(0, os.path.join(LAB, 'experiments'))
import numpy as np
from lab import load
from fast import Engine
from evaluate import targets, metrics, fmt, bootstrap_ci
from collections import defaultdict
from lab import Data


def subset(D, keep):
    D2 = Data(users={u: x for u, x in D.users.items() if u in keep}, titles=D.titles,
              ratings=[r for r in D.ratings if r.u in keep], watchlist=[w for w in D.watchlist if w[0] in keep],
              idf=D.idf, df=D.df, ndocs=D.ndocs)
    by_user, by_title = defaultdict(list), defaultdict(list)
    for r in D2.ratings:
        t = D2.titles.get(r.key)
        if t is None or t.va <= 0:
            continue
        D2.anchored.append(r); by_user[r.u].append(r); by_title[r.key].append(r)
    D2.by_user, D2.by_title = dict(by_user), dict(by_title)
    return D2


def rnd(x):
    return int(min(10, max(0, np.floor(x + 0.5))))

D = load(sys.argv[1])
bots = {u for u, x in D.users.items() if x.get('bot')}
real = set(D.users) - bots
E_all, E_nb = Engine(D), Engine(subset(D, real))

class GFix(Engine):
    """Comunidade com todo mundo, mas g (e o viés de cada um) calculado só com as notas das pessoas reais."""
    def __init__(self, D, Greal):
        super().__init__(D)
        self._Gs, self._Gn = Greal
    def features(self, u, key, exclude=True):
        Gs, Gn = self.G_sum, self.G_n
        self.G_sum, self.G_n = self._Gs, self._Gn     # contém a nota do alvo (pessoa real); features() a tira
        try:
            return super().features(u, key, exclude)
        finally:
            self.G_sum, self.G_n = Gs, Gn

E_gfix = GFix(D, (E_nb.G_sum, E_nb.G_n))

for kind in ('shelf', 'movies'):
    T = [t for t in targets(D, kind) if t[0] in real]
    preds = {}
    for name, E in (('sem bots', E_nb), ('com bots (hoje)', E_all), ('com bots, g só de reais', E_gfix)):
        mu = [E.v4_mu(E.features(u, k)) for (u, k, r) in T]
        preds[name] = ([rnd(m) for m in mu], mu)
    print(f'== {kind}')
    ref = preds['sem bots'][0]
    for name, (p, mu) in preds.items():
        s = f'  {name:24s} {fmt(metrics(T, p, mu))}'
        if name != 'sem bots':
            d, lo, hi = bootstrap_ci(T, ref, p, 'exact', B=2000)
            s += f'  Δexata vs sem bots {d:+.1f}pp [{lo:+.1f},{hi:+.1f}]'
        print(s)
print(f'g: só reais {E_nb.G_sum / E_nb.G_n:+.3f}, todos {E_all.G_sum / E_all.G_n:+.3f}')
