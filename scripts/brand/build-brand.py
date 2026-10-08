#!/usr/bin/env python3
"""Marca do CineOracle — gera o símbolo, o logotipo e todos os ícones.

O símbolo é o "Olho Lunar": pixel art numa grade de 24×24, na mesma
linguagem das cartas dos oráculos. A pálpebra de cima é a lua crescente
iridescente que fica no topo de cada carta, a íris tem o violeta e o fúcsia
da marca, a pálpebra de baixo é uma linha de papel creme e a estrela de
quatro pontas das cartas brilha no canto.

O logotipo "CineOracle" é desenhado letra por letra na grade (caixa-alta
de 12 unidades, altura-x de 8, traço de 2), com "Cine" em papel creme e
"Oracle" nas faixas da lua. O pingo do i é a estrela das cartas.

Rodar a partir da raiz do repositório (precisa de Pillow e numpy):

    python3 scripts/brand/build-brand.py

Saídas:
    src/components/brand/brandArt.ts   desenhos que o React usa (Logo.tsx)
    public/brand/*.svg                 símbolo, logotipo e assinatura
    public/favicon.svg, favicon.ico, apple-touch-icon.png
    public/assets/icon-192.png, icon-512.png, maskable-512.png (PWA)
    resources/*.png                    fontes dos ícones e da abertura do
                                       app nativo (Android/iOS, Capacitor)
"""
import math
import os
from PIL import Image
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))

# ---------------------------------------------------------------- cores
NIGHT = '#120D22'
PAPER = '#F3EAD3'
MOON = ['#B9A6FF', '#E2A9F3', '#A6CFF5', '#86E3CC']  # lua das cartas: lilás → rosa → céu → menta
COLORS = {
    'moon0': MOON[0], 'moon1': MOON[1], 'moon2': MOON[2], 'moon3': MOON[3],
    'lid': PAPER, 'irisOut': '#8B5CF6', 'irisIn': '#D946EF', 'pupil': NIGHT,
    'hl': PAPER, 'spark': PAPER,
}
LAYER_ORDER = ['moon0', 'moon1', 'moon2', 'moon3', 'lid', 'irisOut', 'irisIn', 'pupil', 'hl', 'spark']

# ---------------------------------------------------------------- símbolo
N = 24
SPARK = ["...#...", "...#...", "..###..", "#######", "..###..", "...#...", "...#..."]


def _arc_y(L, R, Y, apex, x):
    """Altura do arco que passa pelos cantos (L, Y) e (R, Y) e pelo topo/fundo apex."""
    half = (R - L) / 2
    d = abs(Y - apex)
    r = (half * half + d * d) / (2 * d)
    v = r * r - (x - 0.5) ** 2
    if v < 0:
        return None
    s = math.sqrt(v)
    return (apex + r) - s if apex < Y else (apex - r) + s


def build_mark():
    L, R, Y = 0.02, 0.98, 0.60          # cantos do olho
    up_out, up_in = 0.18, 0.34          # lua: borda de fora e de dentro
    low = 0.86                          # pálpebra de baixo
    icy, ir, pr = 0.62, 0.235, 0.09     # íris
    cells = {}
    for j in range(N):
        for i in range(N):
            x, y = (i + 0.5) / N, (j + 0.5) / N
            if not (L <= x <= R):
                continue
            yo, yi, yl = _arc_y(L, R, Y, up_out, x), _arc_y(L, R, Y, up_in, x), _arc_y(L, R, Y, low, x)
            col = None
            if yo is not None and yi is not None and yo <= y <= yi:
                t = (x - L) / (R - L)
                col = 'moon%d' % min(3, int(t * 4))
            elif yi is not None and yl is not None and yi < y < yl - 1.0 / N:
                dd = math.hypot(x - 0.5, y - icy)
                if dd <= ir:
                    col = 'irisIn' if dd <= (pr + ir) / 2 + 0.01 else 'irisOut'
            if col:
                cells[(i, j)] = col
    # pálpebra de baixo, contínua (sem buracos na escada)
    lowy = {}
    for i in range(N):
        x = (i + 0.5) / N
        if L <= x <= R:
            yl = _arc_y(L, R, Y, low, x)
            if yl is not None:
                lowy[i] = min(N - 1, int(yl * N - 0.5))
    for i, jy in lowy.items():
        cells[(i, jy)] = 'lid'
        for nb in (i - 1, i + 1):
            if nb in lowy and lowy[nb] < jy - 1:
                for jj in range(lowy[nb] + 1, jy):
                    cells[(i, jj)] = 'lid'
    # pupila 4×4 de cantos cortados
    px0, py0 = int(round(N / 2 - 2)), int(round(icy * N - 2))
    for dy in range(4):
        for dx in range(4):
            if dx in (0, 3) and dy in (0, 3):
                continue
            if (px0 + dx, py0 + dy) in cells:
                cells[(px0 + dx, py0 + dy)] = 'pupil'
    # brilho
    k = (int(0.40 * N), int(0.53 * N))
    if cells.get(k) in ('irisIn', 'irisOut', 'pupil'):
        cells[k] = 'hl'
    # estrela das cartas
    sx = N - len(SPARK[0])
    for dy, row in enumerate(SPARK):
        for dx, ch in enumerate(row):
            if ch == '#':
                cells[(sx + dx, dy)] = 'spark'
    return cells


# ---------------------------------------------------------------- logotipo
X4 = ["......."] * 4
GLYPHS = {
    'C': ["..######", ".#######", "###.....", "##......", "##......", "##......",
          "##......", "##......", "##......", "###.....", ".#######", "..######"],
    'O': ["..#####..", ".#######.", "###...###", "##.....##", "##.....##", "##.....##",
          "##.....##", "##.....##", "##.....##", "###...###", ".#######.", "..#####.."],
    'i': [".#.", "###", ".#.", "...", ".##", ".##", ".##", ".##", ".##", ".##", ".##", ".##"],
    'l': ["##"] * 12,
    'n': X4 + ["######.", "#######", "##...##", "##...##", "##...##", "##...##", "##...##", "##...##"],
    'e': X4 + [".#####.", "#######", "##...##", "#######", "#######", "##.....", "#######", ".######"],
    'r': ["......"] * 4 + ["##.###", "######", "###...", "##....", "##....", "##....", "##....", "##...."],
    'a': X4 + ["######.", "#######", ".....##", ".######", "#######", "##...##", "#######", ".######"],
    'c': X4 + [".######", "#######", "##.....", "##.....", "##.....", "##.....", "#######", ".######"],
}
GAP = 2
WORD_H = 12


def build_wordmark(text='CineOracle', split=4):
    """Células do logotipo: 'paper' para Cine, faixas da lua para Oracle."""
    cells = {}
    ox = 0
    starts = []
    for idx, ch in enumerate(text):
        g = GLYPHS[ch]
        starts.append(ox)
        for y, row in enumerate(g):
            for x, c in enumerate(row):
                if c == '#':
                    cells[(ox + x, y)] = ('paper', idx)
        ox += len(g[0]) + GAP
    width = ox - GAP
    oracle_x0 = starts[split]
    out = {}
    for (x, y), (_, idx) in cells.items():
        if idx < split:
            out[(x, y)] = 'paper'
        else:
            t = (x + 0.5 - oracle_x0) / (width - oracle_x0)
            out[(x, y)] = 'moon%d' % min(3, int(t * 4))
    return out, width


WORD_COLORS = {'paper': PAPER, 'moon0': MOON[0], 'moon1': MOON[1], 'moon2': MOON[2], 'moon3': MOON[3]}


# ---------------------------------------------------------------- SVG
def cells_to_paths(cells):
    """{(x,y): cor} → {cor: 'd'} com um retângulo por trecho contínuo de linha."""
    by = {}
    for (x, y), c in cells.items():
        by.setdefault(c, {}).setdefault(y, []).append(x)
    paths = {}
    for c, rows in by.items():
        d = []
        for y in sorted(rows):
            xs = sorted(rows[y])
            s = prev = xs[0]
            for x in xs[1:] + [None]:
                if x is not None and x == prev + 1:
                    prev = x
                    continue
                d.append(f"M{s} {y}h{prev - s + 1}v1h-{prev - s + 1}z")
                if x is not None:
                    s = prev = x
        paths[c] = ''.join(d)
    return paths


def bbox(cells):
    xs = [x for x, _ in cells]
    ys = [y for _, y in cells]
    return min(xs), min(ys), max(xs) + 1, max(ys) + 1


def svg_doc(layers, vb, extra=''):
    body = ''.join(f'<path fill="{fill}" d="{d}"/>' for fill, d in layers)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" shape-rendering="crispEdges">'
            f'{extra}{body}</svg>\n')


# ---------------------------------------------------------------- PNG
def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def night_background(size, glow=True):
    """Noite com o brilho violeta no alto, como o fundo das páginas."""
    w = h = size
    base = np.array(hex_rgb(NIGHT), dtype=np.float32)
    img = np.ones((h, w, 3), dtype=np.float32) * base
    if glow:
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        # elipse centrada no alto, um pouco à direita
        dx = (xx - w * 0.62) / (w * 0.75)
        dy = (yy - h * 0.05) / (h * 0.62)
        r = np.sqrt(dx * dx + dy * dy)
        a = np.clip(1 - r, 0, 1) ** 1.6 * 0.42
        violet = np.array(hex_rgb('#8B5CF6'), dtype=np.float32)
        img = img * (1 - a[..., None]) + violet * a[..., None]
        # contraluz fúcsia discreta embaixo à esquerda
        dx2 = (xx - w * 0.2) / (w * 0.7)
        dy2 = (yy - h * 1.05) / (h * 0.55)
        r2 = np.sqrt(dx2 * dx2 + dy2 * dy2)
        a2 = np.clip(1 - r2, 0, 1) ** 1.8 * 0.18
        fuchsia = np.array(hex_rgb('#D946EF'), dtype=np.float32)
        img = img * (1 - a2[..., None]) + fuchsia * a2[..., None]
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), 'RGB').convert('RGBA')


def paint_cells(canvas, cells, colors, cell, ox, oy):
    px = canvas.load()
    for (x, y), c in cells.items():
        rgb = hex_rgb(colors[c]) + (255,)
        for yy in range(oy + y * cell, oy + (y + 1) * cell):
            for xx in range(ox + x * cell, ox + (x + 1) * cell):
                px[xx, yy] = rgb


def place_centered(canvas, cells, colors, cell, cx=None, cy=None):
    x0, y0, x1, y1 = bbox(cells)
    w, h = (x1 - x0) * cell, (y1 - y0) * cell
    cx = canvas.width / 2 if cx is None else cx
    cy = canvas.height / 2 if cy is None else cy
    ox = int(round(cx - w / 2)) - x0 * cell
    oy = int(round(cy - h / 2)) - y0 * cell
    paint_cells(canvas, cells, colors, cell, ox, oy)


def icon(size, mark, fill=0.70, glow=True, transparent=False):
    """Ícone quadrado: o símbolo ocupa `fill` da largura, pixels inteiros."""
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0)) if transparent else night_background(size, glow)
    x0, y0, x1, y1 = bbox(mark)
    cell = max(1, int(size * fill / (x1 - x0)))
    place_centered(canvas, mark, COLORS, cell)
    return canvas


def splash(size, mark, word):
    canvas = night_background(size)
    cell = int(size * 0.16 / 24)
    place_centered(canvas, mark, COLORS, cell, cy=size * 0.47)
    wcell = max(1, int(size * 0.30 / 81))
    _, wy0, _, wy1 = bbox(word)
    place_centered(canvas, word, WORD_COLORS, wcell, cy=size * 0.47 + cell * 13 + wcell * 8)
    return canvas


# ---------------------------------------------------------------- saída
def write(path, data):
    full = os.path.join(ROOT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    mode = 'wb' if isinstance(data, bytes) else 'w'
    with open(full, mode) as f:
        f.write(data)
    print('  ', path)


def main():
    mark = build_mark()
    word, word_w = build_wordmark()
    mx0, my0, mx1, my1 = bbox(mark)
    mark_paths = cells_to_paths(mark)
    word_paths = cells_to_paths(word)

    mark_layers = [(COLORS[k], mark_paths[k]) for k in LAYER_ORDER if k in mark_paths]
    word_layers = [(WORD_COLORS[k], word_paths[k]) for k in ['paper', 'moon0', 'moon1', 'moon2', 'moon3'] if k in word_paths]
    mark_vb = (mx0, my0, mx1 - mx0, my1 - my0)

    # --- React
    def ts_layers(layers):
        return ',\n'.join(f"  {{ fill: '{f}', d: '{d}' }}" for f, d in layers)
    ts = (
        "// GERADO por scripts/brand/build-brand.py — não edite à mão.\n"
        "// O \"Olho Lunar\" (símbolo) e o logotipo CineOracle em pixel art.\n\n"
        "export interface BrandLayer { fill: string; d: string }\n\n"
        f"export const MARK_VIEWBOX = '{' '.join(str(v) for v in mark_vb)}';\n"
        f"export const MARK_ASPECT = {round(mark_vb[2] / mark_vb[3], 4)};\n"
        f"export const MARK_LAYERS: BrandLayer[] = [\n{ts_layers(mark_layers)},\n];\n\n"
        f"export const WORDMARK_VIEWBOX = '0 0 {word_w} {WORD_H}';\n"
        f"export const WORDMARK_ASPECT = {round(word_w / WORD_H, 4)};\n"
        f"export const WORDMARK_LAYERS: BrandLayer[] = [\n{ts_layers(word_layers)},\n];\n"
    )
    write('src/components/brand/brandArt.ts', ts)

    # --- SVGs
    vb = ' '.join(str(v) for v in mark_vb)
    write('public/brand/cineoracle-mark.svg', svg_doc(mark_layers, vb))
    write('public/brand/cineoracle-wordmark.svg', svg_doc(word_layers, f'0 0 {word_w} {WORD_H}'))
    # assinatura horizontal: símbolo + logotipo (o logotipo com 12 de altura
    # fica com ~0,55 da altura do símbolo, centralizado)
    s = 0.55 * (my1 - my0) / WORD_H
    gx = mx1 + 3
    gy = my0 + ((my1 - my0) - WORD_H * s) / 2
    lock = ''.join(f'<path fill="{f}" d="{d}"/>' for f, d in mark_layers)
    lock += f'<g transform="translate({gx} {round(gy, 3)}) scale({round(s, 4)})">' + ''.join(f'<path fill="{f}" d="{d}"/>' for f, d in word_layers) + '</g>'
    lw = gx + word_w * s - mx0
    write('public/brand/cineoracle-lockup.svg',
          f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{mx0} {my0} {round(lw, 3)} {my1 - my0}" shape-rendering="crispEdges">{lock}</svg>\n')
    # favicon: símbolo sobre a noite, cantos arredondados
    pad = 2
    fav = (f'<rect x="{-pad}" y="{-pad}" width="{N + 2 * pad}" height="{N + 2 * pad}" rx="6" fill="{NIGHT}"/>')
    write('public/favicon.svg', svg_doc(mark_layers, f'{-pad} {-pad} {N + 2 * pad} {N + 2 * pad}', fav))

    # --- PNGs
    def save(img, path, rgb=False):
        full = os.path.join(ROOT, path)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        (img.convert('RGB') if rgb else img).save(full, optimize=True)
        print('  ', path)

    save(icon(192, mark), 'public/assets/icon-192.png')
    save(icon(512, mark), 'public/assets/icon-512.png')
    save(icon(512, mark, fill=0.56), 'public/assets/maskable-512.png')
    save(icon(180, mark, fill=0.72), 'public/apple-touch-icon.png', rgb=True)
    ico = icon(48, mark, fill=0.86, glow=False)
    ico.save(os.path.join(ROOT, 'public/favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48)])
    print('   public/favicon.ico')

    # app nativo (Capacitor: npx @capacitor/assets generate)
    save(icon(1024, mark, fill=0.70), 'resources/icon-only.png', rgb=True)
    save(icon(1024, mark, fill=0.62, transparent=True), 'resources/icon-foreground.png')
    save(night_background(1024), 'resources/icon-background.png', rgb=True)
    sp = splash(2732, mark, word)
    save(sp, 'resources/splash.png', rgb=True)
    save(sp, 'resources/splash-dark.png', rgb=True)


if __name__ == '__main__':
    main()
