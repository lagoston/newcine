"""Perfis "ou 8 ou 80": a regra de decisão com histograma pessoal ajuda quem dá muito 1 e 10?
python3 experiments/run_polar.py <pasta>"""
import sys, os
LAB = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, LAB)
import numpy as np
from lab import load
from fast import Engine
from evaluate import fold_of
import v5

D = load(sys.argv[1]); E = Engine(D)
T, X = v5.collect(D, E)
y = np.array([r for (u, k, r) in T]); U = np.array([u for (u, k, r) in T])
fold = np.array([fold_of(u) for u in U])
H, Pg = v5.user_hists(D, T)
mu = np.array([E.v4_mu(x) for x in X]); d0 = np.clip(np.floor(mu + 0.5), 0, 10)
# polarização: fração de notas nos extremos (1-2 ou 9-10)
ext = {u: np.mean([(r.r <= 2 or r.r >= 9) for r in D.anchored if r.u == u]) for u in D.users}
dd = np.zeros(len(T))
for f in (0, 1):
    tr = fold != f; te = fold == f
    p, _ = v5.fit_decide(mu[tr], H[tr], Pg[tr], y[tr])
    dd[te] = v5.decide(mu[te], H[te], Pg[te], *p)
    print('lado', f, 'params', p)
print(' quem  n    %extremos  v4   +histograma')
for u in sorted(D.users, key=lambda u: -ext[u]):
    m = U == u
    if m.sum() < 30:
        continue
    print(f" {'bot' if D.users[u]['bot'] else 'real'} {u:3d} {m.sum():5d}  {100*ext[u]:5.0f}%   {100*(d0[m]==y[m]).mean():5.1f}%  {100*(dd[m]==y[m]).mean():5.1f}%")
for lo, hi in ((0, .3), (.3, .5), (.5, 1.01)):
    m = np.array([lo <= ext[u] < hi for u in U])
    print(f'extremos {100*lo:.0f}–{100*hi:.0f}%: n={m.sum()} v4 {100*(d0[m]==y[m]).mean():.1f}% → {100*(dd[m]==y[m]).mean():.1f}%')
