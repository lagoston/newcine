"""Paridade da réplica Python com a predict_ratings do banco (raw/parity_db.raw)."""
from lab import load, v4_features, v4_predict
D = load()
rows = [r.split(',') for r in open('raw/parity_db.raw').read().strip().split(';')]
worst = dict(mu=0, p9=0, p10=0); bad_disp = 0; lines = []
for u, mt, i, mu, disp, p9, p10 in rows:
    key = ('m' if mt == 'movie' else 't', int(i))
    F = v4_features(D, int(u), key, exclude=True)
    o = v4_predict(F)
    d = dict(mu=abs(o['mu'] - float(mu)), p9=abs(o['p9'] - float(p9)), p10=abs(o['p10'] - float(p10)))
    for k in d: worst[k] = max(worst[k], d[k])
    if o['disp'] != int(disp): bad_disp += 1
    lines.append(f"| {u} | {mt} {i} | {float(mu):.6f} | {o['mu']:.6f} | {d['mu']:.1e} | {disp} | {o['disp']} |")
print('n', len(rows), 'max |Δmu|', worst['mu'], 'max |Δp9|', worst['p9'], 'max |Δp10|', worst['p10'], 'nota exibida diferente:', bad_disp)
with open('parity_report.md', 'w') as f:
    f.write('# Paridade baseline_v4.py × predict_ratings (banco, 09/10/2026)\n\n')
    f.write(f"{len(rows)} pares (50 filmes com p_exclude_movie, 12 séries). Máx |Δμ| = {worst['mu']:.2e}, máx |Δchance 9+| = {worst['p9']:.2e}, "
            f"máx |Δchance 10| = {worst['p10']:.2e}; nota exibida diferente em {bad_disp}.\n\n")
    f.write('| u | título | μ banco | μ python | Δ | exibida banco | exibida python |\n|---|---|---|---|---|---|---|\n')
    f.write('\n'.join(lines) + '\n')
