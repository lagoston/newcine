"""CineOracle — laboratório da nota prevista: carga dos dados e "features" da v4.

Uso típico:
    from lab import load, v4_features
    D = load()
    F = v4_features(D, u, ('m', 550))     # deixa a nota (u, filme 550) de fora de tudo

Chaves de título: (mt, tmdb_id) com mt = 'm' (filme) ou 't' (série).
"""
from __future__ import annotations

import math
import os
from collections import defaultdict
from dataclasses import dataclass, field

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'data')


@dataclass
class Title:
    key: tuple
    va: float            # nota do TMDB (0 = sem nota)
    vc: int              # número de votos no TMDB
    year: int | None
    runtime: int | None
    ep_runtime: int | None
    seasons: int | None
    dir: int | None      # índice do diretor (filme) / criador (série)
    mood: str | None     # letra da prateleira: A V C D P F L M R (None = fora das prateleiras)
    oracle: str | None   # b (bogart) / f (fincher) / c (cypher)
    genres: list
    kw: list             # índices de palavra-chave (só as que aparecem em >= 2 títulos com nota; genéricas da v4 já removidas)
    cast: list           # índices dos 5 primeiros do elenco (só quem aparece em >= 2 títulos com nota)
    origin: list


@dataclass
class Rating:
    u: int
    key: tuple
    r: float
    created: int
    updated: int


@dataclass
class Data:
    users: dict
    titles: dict                 # key -> Title
    ratings: list                # todas as notas (inclusive de títulos sem TMDB)
    watchlist: list              # (u, key, created)
    idf: list                    # idf[ki] = ln(ndocs / max(df, 1)), como na v4
    df: list
    ndocs: int
    # índices derivados
    by_user: dict = field(default_factory=dict)    # u -> list[Rating] (só títulos com va > 0)
    by_title: dict = field(default_factory=dict)   # key -> list[Rating] (só va > 0)
    anchored: list = field(default_factory=list)   # notas com va > 0 (o "allr" da v4)


MOOD_NAMES = {'A': 'adrenaline', 'V': 'adventures', 'C': 'catharsis', 'D': 'dark-and-scary', 'P': 'drug-trip',
              'F': 'family-time', 'L': 'laugh-out-loud', 'M': 'mind-blowing', 'R': 'romantic'}


def _ints(s):
    return [int(x) for x in s.split('/')] if s else []


def _int(s):
    return int(s) if s != '' else None


def load(path: str = DATA) -> Data:
    users = {}
    for line in open(os.path.join(path, 'users.tsv'), encoding='utf-8').read().strip().split('\n'):
        f = line.split('\t')
        users[int(f[0])] = {'sub': f[1], 'E': float(f[2] or 0), 'I': float(f[3] or 0), 'C': float(f[4] or 0),
                            'S': float(f[5] or 0), 'R': float(f[6] or 0),
                            'bot': len(f) > 7 and f[7] == '1'}
    titles = {}
    lines = open(os.path.join(path, 'titles.tsv'), encoding='utf-8').read().strip().split('\n')
    for line in lines[1:]:
        f = line.split('\t')
        while len(f) < 15:
            f.append('')
        key = (f[1], int(f[0]))
        titles[key] = Title(key=key, va=float(f[2] or 0), vc=int(f[3] or 0), year=_int(f[4]), runtime=_int(f[5]),
                            ep_runtime=_int(f[6]), seasons=_int(f[7]), dir=_int(f[8]), mood=f[9] or None,
                            oracle=f[10] or None, genres=_ints(f[11]), kw=_ints(f[12]), cast=_ints(f[13]),
                            origin=f[14].split('/') if f[14] else [])
    ratings = []
    for line in open(os.path.join(path, 'ratings.tsv'), encoding='utf-8').read().strip().split('\n'):
        f = line.split('\t')
        ratings.append(Rating(u=int(f[0]), key=(f[2], int(f[1])), r=float(f[3]), created=int(f[4]), updated=int(f[5])))
    watchlist = []
    for line in open(os.path.join(path, 'watchlist.tsv'), encoding='utf-8').read().strip().split('\n'):
        if not line.strip():
            continue
        f = line.split('\t')
        watchlist.append((int(f[0]), (f[2], int(f[1])), int(f[3])))
    kl = open(os.path.join(path, 'keywords.tsv'), encoding='utf-8').read().strip().split('\n')
    ndocs = int(kl[0].split('\t')[1])
    df = [int(l.split('\t')[1]) for l in kl[1:] if l and l[0].isdigit()]
    idf = [math.log(ndocs / max(d, 1)) for d in df]
    D = Data(users=users, titles=titles, ratings=ratings, watchlist=watchlist, idf=idf, df=df, ndocs=ndocs)
    by_user, by_title = defaultdict(list), defaultdict(list)
    for r in ratings:
        t = titles.get(r.key)
        if t is None or t.va <= 0:
            continue
        D.anchored.append(r)
        by_user[r.u].append(r)
        by_title[r.key].append(r)
    D.by_user, D.by_title = dict(by_user), dict(by_title)
    return D


def split_export(tsv_path: str, out_dir: str) -> str:
    """Quebra o pacote da função de borda lab-export (seções ##users, ##ratings, ##watchlist, ##titles, ##keywords)
    nos arquivos que load() lê. Devolve out_dir."""
    os.makedirs(out_dir, exist_ok=True)
    sections, cur = {}, None
    for line in open(tsv_path, encoding='utf-8').read().split('\n'):
        if line.startswith('##'):
            cur = line[2:].strip()
            sections[cur] = []
        elif cur is not None and line.strip():
            sections[cur].append(line)
    hdr = 'tmdb_id\tmt\tvote_average\tvote_count\tyear\truntime\tepisode_run_time\tnumber_of_seasons\tdir\tmood\toracle\tgenres\tkw\tcast\torigin'
    files = {'users.tsv': sections['users'], 'ratings.tsv': sections['ratings'], 'watchlist.tsv': sections.get('watchlist', []),
             'titles.tsv': [hdr] + sections['titles'], 'keywords.tsv': sections['keywords']}
    for name, lines in files.items():
        with open(os.path.join(out_dir, name), 'w', encoding='utf-8') as f:
            f.write('\n'.join(lines) + '\n')
    return out_dir


# ---------------------------------------------------------------------------
# Features da v4 (tudo o que não depende dos pesos), com "deixa um de fora".
# ---------------------------------------------------------------------------

@dataclass
class V4Features:
    u: int
    key: tuple
    va: float
    g: float
    bias: float          # viés pessoal encolhido (k = kb)
    n_hist: int          # nº de filmes no histórico (sem o alvo)
    dir_s: float         # soma dos resíduos nos filmes do mesmo diretor
    dir_n: int
    mood_s: float
    mood_n: int
    kw_sw: float         # soma idf-ponderada dos resíduos nas palavras-chave em comum
    kw_cw: float
    comm_s: float        # desvio dos outros usuários neste título (cada um vs o próprio viés)
    comm_n: int
    # para o ruído pessoal (sigma): um registro por filme do histórico, com as mesmas peças "deixando ele de fora"
    hist: list           # [(r, va + bias_loo, dir_s, dir_n, mood_s, mood_n, kw_sw, kw_cw, comm_s, comm_n)]
    e_hist: list         # resíduo (r − va − bias) de cada filme do histórico, na mesma ordem
    hist_keys: list


class _Stats:
    """Somas globais que a v4 usa, para recalcular rápido com uma nota excluída."""

    def __init__(self, D: Data):
        self.G_sum = 0.0
        self.G_n = 0
        self.sres = defaultdict(float)
        self.n = defaultdict(int)
        for r in D.anchored:
            if r.key[0] == 'm':
                va = D.titles[r.key].va
                self.G_sum += r.r - va
                self.G_n += 1
                self.sres[r.u] += r.r - va
                self.n[r.u] += 1


_STATS_CACHE = {}


def stats(D: Data) -> _Stats:
    s = _STATS_CACHE.get(id(D))
    if s is None:
        s = _STATS_CACHE[id(D)] = _Stats(D)
    return s


def v4_features(D: Data, u: int, key: tuple, exclude: bool = True, kb: float = 3.0) -> V4Features:
    """Peças da v4 para prever o título `key` para o usuário `u`.
    exclude=True: a nota (u, key), se existir, sai de tudo (é o p_exclude_movie da v4; para séries ela não entra em nada mesmo)."""
    S = stats(D)
    T = D.titles
    excl = None
    if exclude:
        for r in D.by_user.get(u, []):
            if r.key == key:
                excl = r
                break
    G_sum, G_n = S.G_sum, S.G_n
    my_sres, my_n = S.sres.get(u, 0.0), S.n.get(u, 0)
    if excl is not None and key[0] == 'm':
        d = excl.r - T[key].va
        G_sum -= d
        G_n -= 1
        my_sres -= d
        my_n -= 1
    g = G_sum / G_n if G_n else 0.0
    bias = (my_sres + kb * g) / (my_n + kb) if my_n > 0 else g

    def bias_of(v):
        if v == u:
            return bias
        n = S.n.get(v, 0)
        return (S.sres[v] + kb * g) / (n + kb) if n > 0 else g

    hist = [r for r in D.by_user.get(u, []) if r.key[0] == 'm' and r is not excl]
    e = [r.r - T[r.key].va - bias for r in hist]
    fd_s, fd_n = defaultdict(float), defaultdict(int)
    fm_s, fm_n = defaultdict(float), defaultdict(int)
    fk_s = defaultdict(float)   # soma dos resíduos (sem idf)
    fk_n = defaultdict(int)
    for r, ei in zip(hist, e):
        t = T[r.key]
        if t.dir is not None:
            fd_s[t.dir] += ei
            fd_n[t.dir] += 1
        if t.mood is not None:
            fm_s[t.mood] += ei
            fm_n[t.mood] += 1
        for k in t.kw:
            fk_s[k] += ei
            fk_n[k] += 1
    idf = D.idf

    def comm(k):
        s, n = 0.0, 0
        for r in D.by_title.get(k, []):
            if r.u == u:
                continue
            s += r.r - T[k].va - bias_of(r.u)
            n += 1
        return s, n

    t = T[key]
    kw_sw = sum(fk_s[k] * idf[k] for k in t.kw if k in fk_n)
    kw_cw = sum(fk_n[k] * idf[k] for k in t.kw if k in fk_n)
    cs, cn = comm(key)
    # histórico, cada filme deixando a si mesmo de fora
    H = []
    for r, ei in zip(hist, e):
        th = T[r.key]
        base = th.va + (my_sres - (r.r - th.va) + kb * g) / (max(my_n - 1, 0) + kb)
        ds, dn = (fd_s[th.dir] - ei, fd_n[th.dir] - 1) if th.dir is not None else (0.0, 0)
        ms, mn = (fm_s[th.mood] - ei, fm_n[th.mood] - 1) if th.mood is not None else (0.0, 0)
        sw = sum((fk_s[k] - ei) * idf[k] for k in th.kw)
        cw = sum((fk_n[k] - 1) * idf[k] for k in th.kw)
        hs, hn = comm(r.key)
        H.append((r.r, base, ds, dn, ms, mn, sw, cw, hs, hn))
    return V4Features(u=u, key=key, va=t.va, g=g, bias=bias, n_hist=len(hist),
                      dir_s=fd_s[t.dir] if t.dir is not None and t.dir in fd_n else 0.0,
                      dir_n=fd_n[t.dir] if t.dir is not None and t.dir in fd_n else 0,
                      mood_s=fm_s[t.mood] if t.mood is not None and t.mood in fm_n else 0.0,
                      mood_n=fm_n[t.mood] if t.mood is not None and t.mood in fm_n else 0,
                      kw_sw=kw_sw, kw_cw=kw_cw, comm_s=cs, comm_n=cn, hist=H, e_hist=e,
                      hist_keys=[r.key for r in hist])


V4_PARAMS = dict(wd=0.70, kd=1.0, wm=0.60, km=8.0, wk=0.75, kk=20.0, wc=0.80, kc=4.0,
                 sig_prior=2.2, sig_n=10.0, a=1.702, t9=8.5, t10=9.5, off10=-0.4, promo9=0.40, promo10=0.70)


def pg_round(x: float) -> int:
    """round() do Postgres para double: meio para longe do zero."""
    return int(math.floor(x + 0.5)) if x >= 0 else -int(math.floor(-x + 0.5))


def v4_mu(F: V4Features, P=V4_PARAMS) -> float:
    return (F.va + F.bias
            + P['wd'] * F.dir_s / (F.dir_n + P['kd'])
            + P['wm'] * F.mood_s / (F.mood_n + P['km'])
            + P['wk'] * F.kw_sw / (F.kw_cw + P['kk'])
            + P['wc'] * F.comm_s / (F.comm_n + P['kc']))


def v4_sigma(F: V4Features, P=V4_PARAMS) -> float:
    ss = 0.0
    for (r, base, ds, dn, ms, mn, sw, cw, hs, hn) in F.hist:
        mu = (base + P['wd'] * ds / (dn + P['kd']) + P['wm'] * ms / (mn + P['km'])
              + P['wk'] * sw / (cw + P['kk']) + P['wc'] * hs / (hn + P['kc']))
        ss += (r - mu) ** 2
    return math.sqrt((ss + P['sig_n'] * P['sig_prior']) / (len(F.hist) + P['sig_n']))


def logistic(x):
    if x < -500:
        return 0.0
    return 1.0 / (1.0 + math.exp(-x))


def v4_predict(F: V4Features, P=V4_PARAMS, promote: bool = True) -> dict:
    mu = v4_mu(F, P)
    sig = v4_sigma(F, P)
    p9 = logistic(P['a'] * (mu - P['t9']) / sig)
    p10 = logistic(P['a'] * (mu - P['t10']) / sig + P['off10'])
    disp = pg_round(mu)
    if promote:
        disp = max(disp, 10 if p9 >= P['promo10'] else 9 if p9 >= P['promo9'] else 0)
    disp = max(0, min(10, disp))
    return dict(mu=mu, sigma=sig, p9=p9, p10=p10, disp=disp)
