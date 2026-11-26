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
k = min(OW, OH) / 1080.0                         # preview renders everything at half size
PORTRAIT, WIDE = OH > OW * 1.2, OW > OH * 1.2
# anamorphic bars on the wide picture (2.39:1)
LB = int(round((OH - OW / 2.39) / 2)) if WIDE and TL.get('letterbox', True) else 0
FONT = ImageFont.truetype(os.path.join(ROOT, 'public/fonts/alagard.ttf'), int(round(94 * k)))
WHITE, DIM, ACC = (252, 255, 250), (206, 228, 214), (255, 214, 72)
EDGE, GLOW = (5, 16, 10), (80, 255, 140)
STROKE, GLOW_R = max(2, int(round(7 * k))), max(4, int(round(15 * k)))
LINE_H = int(round(104 * k))
BOTTOM = int(round(1462 * k)) if PORTRAIT else OH - LB - int(round(70 * k)) if WIDE else OH - int(round(150 * k))  # the caption's last line ends here (clear of the apps' UI)
MAXW = int(round((930 if not WIDE else 1300) * k))
ACCENT = [a.lower() for a in TL.get('accent', [])]

# ------------------------------------------------------------------ captions from the lines' word times
def chunks(ws, max_len=18):
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
        if (L(out[i]) < 9 or L(out[i + 1]) < 7) and L(out[i]) + 1 + L(out[i + 1]) <= max_len + 2: out[i:i + 2] = [out[i] + out[i + 1]]
        else: i += 1
    return out

def two_lines(ws):
    # one line only: a caption never stacks over another
    return [list(range(len(ws)))]
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
    # one line each, and every line fits the width: split a wide one at its middle word
    fit, q = [], list(cs)
    while q:
        c = q.pop(0)
        if len(c) > 1 and FONT.getlength(' '.join(x[2] for x in c)) > MAXW * 0.96: m = len(c) // 2; q[0:0] = [c[:m], c[m:]]
        else: fit.append(c)
    for c in fit: caps.append([c, None])
caps.sort(key=lambda c: c[0][0][0])
built = []
for i, (c, _) in enumerate(caps):
    a = c[0][0] - 0.03
    end = c[-1][1] + 0.55
    end = max(end, c[-1][1] + 0.12)
    # the next caption starts only once this one is gone (its exit fade ends here): a hard cut when speech runs on
    if i + 1 < len(caps): end = min(end, caps[i + 1][0][0][0] - 0.03 - 0.03)
    built.append(Caption(c, accent_marks(c), a, max(a + 0.05, end)))
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
# The Institute's stacked lockup (the bishop crest over the name), whole-pixel scaled so it stays crisp, revealed
# once: it swings in from a slight 3D tilt while it fades up, a light sweep runs across the brass, then it holds
# perfectly still (no blink, no jitter) until it fades with the opening.
LOGO = TL.get('logo')
if LOGO:
    src = Image.open(os.path.join(ROOT, 'public/brand/lockup-stacked@1x.png')).convert('RGBA')
    LS = max(1, int(round(TL.get('logoScale', 3 if PORTRAIT else 2.4 if not WIDE else 3) * k)))
    lk = src.resize((src.width * LS, src.height * LS), Image.NEAREST)
    LX, LY = (OW - lk.width) // 2, int(TL.get('logoY', 96 if PORTRAIT else 60) * k) + LB
    # on the wide picture the crest stands in the left third, clear of Dr. Calder in the middle
    if WIDE and not LB:
        # a recomposed tall reel: the crest in the middle of the left margin beside the 3:4 window
        mg = (OW - OH * 0.75) / 2
        LS = max(1, int(mg * 0.9 // src.width)); lk = src.resize((src.width * LS, src.height * LS), Image.NEAREST)
        LX, LY = int(mg / 2 - lk.width / 2), int((OH - lk.height) * 0.42)
    elif WIDE: LX, LY = int(OW * 0.2 - lk.width / 2), LB + int((OH - 2 * LB - lk.height) * 0.42)
    elif not PORTRAIT:
        # the square: a smaller crest in the top-left corner, off her head
        LS = max(1, int(round(TL.get('logoScale', 1.8) * k))); lk = src.resize((src.width * LS, src.height * LS), Image.NEAREST)
        LX, LY = int(34 * k), int(30 * k)
    bh = int(TL.get('logoBand', 640) * k)
    band = Image.new('RGBA', (OW, bh), (0, 0, 0, 0))
    band.putalpha(Image.frombytes('L', (1, bh), bytes(int(205 * (1 - y / bh) ** 1.3) for y in range(bh))).resize((OW, bh)))
    # a soft green glow behind it (the crest's own light)
    gl = Image.new('RGBA', (lk.width + 160, lk.height + 160), (0, 0, 0, 0))
    gl.paste(Image.new('RGBA', lk.size, (90, 255, 160, 255)), (80, 80), lk)
    gl = gl.filter(ImageFilter.GaussianBlur(int(34 * k) + 1))
    gl.putalpha(gl.getchannel('A').point(lambda v: int(v * 0.55)))
    LA = lk.getchannel('A')

def tilt(im, ang):
    """a rotation about the vertical axis, in perspective (ang radians)"""
    w, h = im.size
    c, sn = math.cos(ang), math.sin(ang)
    f = 1.6 * w
    def P(x, y):
        X, Z = (x - w / 2) * c, (x - w / 2) * sn
        s_ = f / (f + Z)
        return (w / 2 + X * s_, h / 2 + (y - h / 2) * s_)
    q = [P(0, 0), P(w, 0), P(w, h), P(0, h)]
    # PIL wants the inverse: output corners -> input corners
    import numpy as np
    A_ = []; B_ = []
    for (x, y), (u, v) in zip(q, [(0, 0), (w, 0), (w, h), (0, h)]):
        A_.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); B_.append(u)
        A_.append([0, 0, 0, x, y, 1, -v * x, -v * y]); B_.append(v)
    co = np.linalg.solve(np.array(A_, float), np.array(B_, float))
    return im.transform((w, h), Image.PERSPECTIVE, tuple(co), Image.BICUBIC)

def ease_out(x):
    x = max(0.0, min(1.0, x)); return 1 - (1 - x) ** 3

def draw_logo(frame, t):
    A, Z = LOGO['from'], LOGO['to']
    if t < A or t > Z: return
    fade = min(1.0, (Z - t) / 0.45)
    ba = min(1.0, (t - A) / 0.35) * fade
    b = band if ba >= 0.999 else band.copy()
    if ba < 0.999: b.putalpha(b.getchannel('A').point(lambda v: int(v * ba)))
    frame.alpha_composite(b, (0, 0))
    r = ease_out((t - A) / 0.8)                       # the reveal: 0 -> 1 over 0.8 s
    a = min(fade, r)
    g = gl if a >= 0.999 else gl.copy()
    if a < 0.999: g.putalpha(g.getchannel('A').point(lambda v: int(v * a)))
    frame.alpha_composite(g, (LX - 80, LY - 80))
    l = lk
    sw = (t - A - 0.35) / 0.9                          # the light sweep: 0.35 s in, 0.9 s across
    if 0 < sw < 1:
        l = lk.copy()
        x0 = -0.3 * l.width + sw * 1.6 * l.width
        m = Image.new('L', l.size, 0)
        d = ImageDraw.Draw(m)
        wB = 0.16 * l.width
        d.polygon([(x0, 0), (x0 + wB, 0), (x0 + wB - 0.35 * l.height, l.height), (x0 - 0.35 * l.height, l.height)], fill=200)
        m = m.filter(ImageFilter.GaussianBlur(int(10 * k) + 1))
        from PIL import ImageChops
        m = ImageChops.multiply(m, LA)
        hi = Image.new('RGBA', l.size, (255, 246, 214, 0)); hi.putalpha(m)
        l.alpha_composite(hi)
        l.putalpha(LA)
    if r < 0.999:
        l = tilt(l, (1 - r) * 0.32)
        sc = 0.94 + 0.06 * r
        l = l.resize((max(1, int(l.width * sc)), max(1, int(l.height * sc))), Image.BICUBIC)
    if a < 0.999:
        l = l.copy(); l.putalpha(l.getchannel('A').point(lambda v: int(v * a)))
    frame.alpha_composite(l, (LX + (lk.width - l.width) // 2, LY + (lk.height - l.height) // 2))

# ------------------------------------------------------------------ the film look: grade, vignette, grain
import numpy as np
FILM = TL.get('film', True)
if FILM:
    xs = np.linspace(0, 1, 256)
    curve = xs + 0.10 * np.sin((xs - 0.5) * np.pi) * (1 - np.abs(xs - 0.5) * 2) * 0.9  # a gentle S
    LUT = [np.clip(255 * (curve + d), 0, 255).astype(np.uint8) for d in (0.012 * xs, 0.004 * xs, -0.02 * xs + 0.012 * (1 - xs))]
    yy, xx = np.mgrid[0:OH, 0:OW]
    rr = np.sqrt(((xx - OW / 2) / (OW / 2)) ** 2 * 0.8 + ((yy - OH / 2) / (OH / 2)) ** 2)
    VIG = (1 - 0.30 * np.clip(rr - 0.55, 0, 1) ** 1.6)[..., None].astype(np.float32)
    rng = np.random.default_rng(7)
    GRAIN = [rng.normal(0, 5.5 * (1 if k >= 1 else 0.7), (OH // 2, OW // 2)).astype(np.float32) for _ in range(6)]
def film(im, i):
    if not FILM: return im
    a = np.asarray(im.convert('RGB')).copy()
    for c in range(3): a[..., c] = LUT[c][a[..., c]]
    g = GRAIN[i % len(GRAIN)].repeat(2, 0).repeat(2, 1)[:OH, :OW, None]
    out = np.clip(a.astype(np.float32) * VIG + g, 0, 255).astype(np.uint8)
    return Image.fromarray(out, 'RGB')

# ------------------------------------------------------------------ frames
FR = TL['frames']
SHARP = ImageFilter.UnsharpMask(radius=2 * k, percent=55, threshold=2)
def base(i):
    im = Image.open(FR[min(i, len(FR) - 1)]).convert('RGB')
    sa, oa = im.width / im.height, OW / OH
    if WIDE and oa > sa * 1.05:
        # a tall picture on a wide frame: the picture whole in the middle, the frame filled by a soft, dark, wide copy
        fh = OH - 2 * LB
        # a wider window on the tall picture: its middle three quarters (3:4), full height
        if sa < 0.75:
            h_ = im.width / 0.75; cy = TL.get('cropY', 0.46); y0 = max(0, min(im.height - h_, im.height * cy - h_ / 2))
            im = im.crop((0, int(y0), im.width, int(y0 + h_))); sa = 0.75
        fg = im.resize((int(round(fh * sa)), fh), Image.LANCZOS).filter(SHARP)
        bg = im.resize((OW, int(OW / sa)), Image.BILINEAR)
        bg = bg.crop((0, (bg.height - OH) // 2, OW, (bg.height - OH) // 2 + OH)).filter(ImageFilter.GaussianBlur(int(28 * k) + 1))
        bg = Image.eval(bg, lambda v: int(v * 0.42))
        bg.paste(fg, ((OW - fg.width) // 2, LB))
        return bg
    if abs(oa - sa) > sa * 0.02:
        # crop to the frame's shape (the subject sits a little above the middle of the reels' framing)
        cy = TL.get('cropY', 0.46)
        if oa < sa: w_ = im.height * oa; im = im.crop((int((im.width - w_) / 2), 0, int((im.width + w_) / 2), im.height))
        else: h_ = im.width / oa; y0 = max(0, min(im.height - h_, im.height * cy - h_ / 2)); im = im.crop((0, int(y0), im.width, int(y0 + h_)))
    if im.size != (OW, OH):
        exact = OW % im.width == 0 and OW // im.width == OH // im.height
        im = im.resize((OW, OH), Image.NEAREST if exact else Image.LANCZOS)
        if not exact: im = im.filter(SHARP)
    return im

# ------------------------------------------------------------------ whip pans between shots
WHIPS = TL.get('whips', [])
def whip(im, t):
    for j, w in enumerate(WHIPS):
        d = t - w
        if abs(d) >= 0.17: continue
        s_ = 1 - abs(d) / 0.17                       # 1 at the cut
        a = np.asarray(im).astype(np.float32)
        L = int(s_ * s_ * 0.22 * OW) + 1             # the smear, longest at the cut
        sgn = 1 if j % 2 == 0 else -1
        off = int(sgn * (-d) / 0.17 * 0.18 * OW * s_)  # the picture slides through the cut
        acc = np.zeros_like(a)
        n_ = 9
        for q in range(n_):
            acc += np.roll(a, off + int((q / (n_ - 1) - 0.5) * L) * sgn, axis=1)
        return Image.fromarray(np.clip(acc / n_, 0, 255).astype(np.uint8), 'RGB')
    return im

def frame_at(i):
    t = i / FPS
    im = film(whip(base(i), t), i).convert('RGBA')
    if LB: d_ = ImageDraw.Draw(im); d_.rectangle((0, 0, OW, LB), fill=(0, 0, 0, 255)); d_.rectangle((0, OH - LB, OW, OH), fill=(0, 0, 0, 255))
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
