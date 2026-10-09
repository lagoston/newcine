"""Réplica fiel da v4 (predict_ratings) + avaliação "deixa um de fora".

python3 baseline_v4.py            -> relatório da v4 (com e sem a promoção a 9/10)
from baseline_v4 import all_features, v4_preds
"""
from __future__ import annotations

import os
import pickle

from lab import load, v4_features, v4_predict, V4_PARAMS
from evaluate import targets, report

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, 'cache')


def all_features(D, kind='shelf', kb=3.0):
    """Features v4 (LOO) para todos os alvos de `kind`, com cache em disco."""
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, f'v4feat_{kind}_kb{kb:g}.pkl')
    T = targets(D, kind)
    if os.path.exists(path):
        with open(path, 'rb') as f:
            cached_T, F = pickle.load(f)
        if cached_T == T:
            return T, F
    F = [v4_features(D, u, key, exclude=True, kb=kb) for (u, key, r) in T]
    with open(path, 'wb') as f:
        pickle.dump((T, F), f)
    return T, F


def v4_preds(F, P=V4_PARAMS, promote=True):
    out = [v4_predict(x, P, promote) for x in F]
    return [o['disp'] for o in out], [o['mu'] for o in out], out


if __name__ == '__main__':
    D = load()
    for kind in ('shelf', 'movies', 'series'):
        T, F = all_features(D, kind)
        for promote in (True, False):
            disp, mu, _ = v4_preds(F, promote=promote)
            print(report(T, disp, mu, label=f'v4 {kind:6s} promo={"sim" if promote else "não"}'))
        print()
