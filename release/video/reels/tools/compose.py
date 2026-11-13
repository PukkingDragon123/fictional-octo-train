# The reel tool's picture: the rendered frames scaled to 1080 x 1920, the Institute's lockup in the opening,
# and Dr. Calder's captions moving with her voice: each word pops in as she says it (a quick scale-up that
# overshoots and settles), with a green glow that blooms and decays; the word she is saying is the brightest;
# the whole caption breathes a little with the loudness of her voice; key words in the accent colour; a clean
# fade up and away at the end of the caption. Words keep their places (each scales about its own centre), so
# nothing jitters.
#   python3 compose.py <timeline.json> -            raw RGB frames to stdout (make.mjs pipes them to ffmpeg)
#   python3 compose.py <timeline.json> --still <t> <out.png>
import json, math, os, re, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

TL = json.load(open(sys.argv[1]))
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '../../../..'))
FPS = TL['fps']
OW, OH = TL.get('size', [1080, 1920])
k = OW / 1080.0                                  # preview renders everything at half size
FONT = ImageFont.truetype(os.path.join(ROOT, 'public/fonts/alagard.ttf'), int(round(94 * k)))
WHITE, DIM, ACC = (252, 255, 250), (206, 228, 214), (255, 214, 72)
EDGE, GLOW = (5, 16, 10), (80, 255, 140)
STROKE, GLOW_R = max(2, int(round(7 * k))), max(4, int(round(15 * k)))
LINE_H = int(round(104 * k))
BOTTOM = int(round(1462 * k))                    # the caption's last line ends here (clear of Instagram's UI)
MAXW = int(round(930 * k))
ACCENT = [a.lower() for a in TL.get('accent', [])]

# ------------------------------------------------------------------ captions from the lines' word times
def chunks(ws, max_len=26):
    """clauses (split after . ? ! , : but not after an abbreviation), long ones cut evenly, no orphans"""
    clauses, cur = [], []
    for i, x in enumerate(ws):
        cur.append(x)
        w = x[2]
        if i + 1 == len(ws) or (w[-1] in '.?!,:;' and w not in ('Dr.', 'Mr.', 'Mrs.')):
            clauses.append(cur); cur = []
    L = lambda c: len(' '.join(x[2] for x in c))
    out = []
    for c in clauses:
        if L(c) <= max_len: out.append(c); continue
        n = -(-L(c) // max_len); target = L(c) / n; acc = []
        for j, x in enumerate(c):
            acc.append(x)
            if L(acc) >= target and len(c) - j - 1 >= 2: out.append(acc); acc = []
        if acc: out.append(acc)
    i = 0
    while i < len(out) - 1:
        if (L(out[i]) < 9 or L(out[i + 1]) < 7) and L(out[i]) + 1 + L(out[i + 1]) <= max_len + 6: out[i:i + 2] = [out[i] + out[i + 1]]
        else: i += 1
    return out

def two_lines(ws):
    words = [x[2] for x in ws]
    if len(' '.join(words)) <= 14 or len(words) < 2: return [list(range(len(ws)))]
    best = None
    for i in range(1, len(words)):
        a, b = ' '.join(words[:i]), ' '.join(words[i:])
        sc = max(FONT.getlength(a), FONT.getlength(b)) + (8 * k if FONT.getlength(a) > FONT.getlength(b) * 1.6 else 0)
        if best is None or sc < best[0]: best = (sc, i)
    return [list(range(best[1])), list(range(best[1], len(words)))]

def accent_marks(ws):
    text = ' '.join(x[2] for x in ws).lower()
    flat = re.sub(r'[^a-z0-9 ]', ' ', text)
    mark = [False] * len(ws)
    starts, c = [], 0
    for x in ws: starts.append(c); c += len(x[2]) + 1
    for a in ACCENT:
        for m in re.finditer(r'\b' + re.escape(re.sub(r'[^a-z0-9 ]', ' ', a)) + r'\b', flat):
            for i, s0 in enumerate(starts):
                if s0 < m.end() and s0 + len(ws[i][2]) > m.start(): mark[i] = True
    return mark

class Word:
    def __init__(self, w, t0, t1, accent):
        self.w, self.t0, self.t1, self.acc = w, t0, t1, accent
        pad = STROKE + GLOW_R * 2 + int(8 * k)
        asc, desc = FONT.getmetrics()
        self.wl = FONT.getlength(w)
        W, H = int(self.wl) + pad * 2, asc + desc + pad * 2
        self.off = (pad, pad)
        def text(fill, stroke=True):
            im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
            d.text((pad, pad), w, font=FONT, fill=fill, stroke_width=STROKE if stroke else 0, stroke_fill=EDGE + (255,))
            return im
        shadow = text((0, 0, 0, 255)).filter(ImageFilter.GaussianBlur(3 * k))
        sh = Image.new('RGBA', (W, H), (0, 0, 0, 0)); sh.paste(shadow, (0, int(5 * k)))
        sh.putalpha(sh.getchannel('A').point(lambda v: int(v * 0.55)))
        self.bright = Image.alpha_composite(sh, text((ACC if accent else WHITE) + (255,)))
        self.dim = Image.alpha_composite(sh, text((ACC if accent else DIM) + (255,)))
        g = text(GLOW + (255,), stroke=True).filter(ImageFilter.GaussianBlur(GLOW_R))
        g.putalpha(g.getchannel("A").point(lambda v: min(255, int(v * 2.8))))
        self.glow = g
        self.size = (W, H)

class Caption:
    def __init__(self, ws, marks, a, b):
        self.a, self.b = a, b
        self.words = [Word(x[2], x[0], x[1], m) for x, m in zip(ws, marks)]
        rows = two_lines(ws)
        sp = FONT.getlength(' ')
        asc, desc = FONT.getmetrics()
        n = len(rows)
        self.centres = [None] * len(ws)
        for r, row in enumerate(rows):
            wl = sum(self.words[i].wl for i in row) + sp * (len(row) - 1)
            x = OW / 2 - wl / 2
            base = BOTTOM - (n - 1 - r) * LINE_H - desc
            for i in row:
                wd = self.words[i]
                self.centres[i] = (x + wd.wl / 2, base - asc / 2 - desc / 2 + desc)
                x += wd.wl + sp
        ys = [c[1] for c in self.centres]
        self.mid = (OW / 2, (min(ys) + max(ys)) / 2)

def pop(a):
    """0.6 -> overshoots to ~1.08 -> 1: a damped spring"""
    if a <= 0: return 0.6
    return 1 - 0.4 * math.exp(-a * 13) * math.cos(a * 24)

caps, env = [], [0.0] * (int(TL['total'] * FPS) + 2)
for ln in TL['lines']:
    ws = [[w[0] + ln['at'], w[1] + ln['at'], w[2]] for w in ln['words']]
    for i, e in enumerate(ln.get('env', [])):
        f = int(round(ln['at'] * FPS)) + i
        if 0 <= f < len(env): env[f] = max(env[f], e)
    if ln.get('nocap'): continue
    cs = chunks(ws)
    for c in cs: caps.append([c, None])
caps.sort(key=lambda c: c[0][0][0])
built = []
for i, (c, _) in enumerate(caps):
    a = c[0][0] - 0.03
    end = c[-1][1] + 0.55
    if i + 1 < len(caps): end = min(end, caps[i + 1][0][0][0] - 0.05)
    built.append(Caption(c, accent_marks(c), a, max(end, c[-1][1] + 0.12)))
# the loudness, smoothed (a quick rise, a slower fall): no flicker
es, v = [], 0.0
for e in env:
    v += (e - v) * (0.45 if e > v else 0.18); es.append(v)

def draw_captions(frame, t):
    f = min(len(es) - 1, max(0, int(t * FPS)))
    e = es[f]
    for cp in built:
        if t < cp.a or t > cp.b: continue
        out = max(0.0, min(1.0, (t - (cp.b - 0.16)) / 0.16))      # the exit
        lift = -14 * k * out * out
        breath = 1 + 0.022 * e
        cur = None
        for i, wd in enumerate(cp.words):
            if wd.t0 <= t: cur = i
        for i, wd in enumerate(cp.words):
            a = t - wd.t0
            if a < 0: continue
            s = pop(a) * breath * (1 - 0.03 * out)
            alpha = min(1.0, a / 0.06) * (1 - out)
            cx, cy = cp.centres[i]
            px = cp.mid[0] + (cx - cp.mid[0]) * breath
            py = cp.mid[1] + (cy - cp.mid[1]) * breath + lift
            nxt = cp.words[i + 1].t0 if i + 1 < len(cp.words) else wd.t1 + 0.35
            on = 1.0 if i == cur and t < nxt else max(0.0, 1 - (t - nxt) / 0.09) if t >= nxt else 1.0
            g = (0.3 + 0.7 * math.exp(-a / 0.3) + (0.35 * e if i == cur else 0.08 * e)) * alpha
            W, H = wd.size
            sw, sh = max(1, int(W * s)), max(1, int(H * s))
            x0, y0 = int(px - sw / 2), int(py - sh / 2)
            gl = wd.glow.resize((sw, sh), Image.BILINEAR)
            if g < 0.999: gl.putalpha(gl.getchannel('A').point(lambda v, g=g: int(v * min(1, g))))
            frame.alpha_composite(gl, (max(0, x0), max(0, y0)), (max(0, -x0), max(0, -y0)))
            core = wd.bright if on >= 0.999 else wd.dim if on <= 0.001 else Image.blend(wd.dim, wd.bright, on)
            core = core.resize((sw, sh), Image.BICUBIC)
            if alpha < 0.999: core.putalpha(core.getchannel('A').point(lambda v, al=alpha: int(v * al)))
            frame.alpha_composite(core, (max(0, x0), max(0, y0)), (max(0, -x0), max(0, -y0)))

# ------------------------------------------------------------------ the lockup in the opening
LOGO = TL.get('logo')
if LOGO:
    lk = Image.open(os.path.join(ROOT, 'public/brand/lockup-horizontal@1x.png')).convert('RGBA')
    lk = lk.resize((int(lk.width * 3 * k), int(lk.height * 3 * k)), Image.NEAREST)
    bh = int(520 * k)
    band = Image.new('RGBA', (OW, bh), (0, 0, 0, 0))
    band.putalpha(Image.frombytes('L', (1, bh), bytes(int(215 * (1 - y / bh) ** 1.2) for y in range(bh))).resize((OW, bh)))

def draw_logo(frame, t):
    A, Z = LOGO['from'], LOGO['to']
    if t < A or t > Z: return
    fade = min(1.0, (Z - t) / 0.45)
    ba = min(1.0, (t - A) / 0.3) * fade
    b = band if ba >= 0.999 else band.copy()
    if ba < 0.999: b.putalpha(b.getchannel('A').point(lambda v: int(v * ba)))
    frame.alpha_composite(b, (0, 0))
    if t < A + 0.4 and math.sin((t - A) * 110) <= 0.1: return
    l = lk if fade >= 0.999 else lk.copy()
    if fade < 0.999: l.putalpha(l.getchannel('A').point(lambda v: int(v * fade)))
    frame.alpha_composite(l, ((OW - lk.width) // 2, int(118 * k)))

# ------------------------------------------------------------------ frames
FR = TL['frames']
SHARP = ImageFilter.UnsharpMask(radius=2 * k, percent=55, threshold=2)
def base(i):
    im = Image.open(FR[min(i, len(FR) - 1)]).convert('RGB')
    if im.size != (OW, OH):
        exact = OW % im.width == 0 and OW // im.width == OH // im.height
        im = im.resize((OW, OH), Image.NEAREST if exact else Image.LANCZOS)
        if not exact: im = im.filter(SHARP)
    return im

def frame_at(i):
    t = i / FPS
    im = base(i).convert('RGBA')
    if LOGO: draw_logo(im, t)
    draw_captions(im, t)
    return im.convert('RGB')

if sys.argv[2] == '--still':
    t = float(sys.argv[3]); frame_at(int(round(t * FPS))).save(sys.argv[4]); print(sys.argv[4]); sys.exit(0)
n = int(round(TL['total'] * FPS))
out = sys.stdout.buffer
for i in range(n):
    out.write(frame_at(i).tobytes())
    if i % 240 == 0: print(f'compose {i}/{n}', file=sys.stderr, flush=True)
