# Big, plain captions for the reels (ASS, burned in by the encoder): Dr. Calder's lines in Alagard,
# white with a heavy black edge, two short lines at most, timed word by word from the recorded voice,
# kept inside Instagram's safe area (clear of the top bar, the right-hand buttons and the caption
# block at the bottom). Creature names and the Institute go yellow. No motion, no effects.
#   python3 captions.py <plan.json> <lines.json> <words.json> <reel> <out.ass> [--card-only]
import json, re, sys

plan_all, lines_all, words_all = (json.load(open(p)) for p in sys.argv[1:4])
reel, out = sys.argv[4], sys.argv[5]
card_only = '--card-only' in sys.argv
plan = plan_all[reel]
text_of = {k: t for k, t in lines_all[reel]}
HL = ['jelly bear', 'bumble bee', 'bee keeper', 'Meridian Institute of Liminality', 'Meridian Institute', 'Liminality', 'unit']

def words_for(key):
    # whisper's words for this line (keyed by file path ending in <reel>/<key>.wav)
    for p, w in words_all.items():
        if p.replace('\\', '/').endswith(f'/{reel}/{key}.wav'):
            return w
    return None

def timed_words(key, dur):
    """the line's own words with start / end times (whisper's timing mapped by character position)"""
    text = text_of[key]
    ws = text.split()
    asr = words_for(key)
    if not asr:
        tot = sum(len(w) + 1 for w in ws); t = 0.0; out = []
        for w in ws:
            d = dur * (len(w) + 1) / tot; out.append((t, t + d, w)); t += d
        return out
    # timeline of characters from the recognised words
    marks = []
    tot = sum(len(a[2]) + 1 for a in asr); c = 0
    for s, e, w in asr:
        marks.append((c / tot, s)); c += len(w) + 1; marks.append((c / tot, e))
    def at(f):
        for i in range(1, len(marks)):
            if f <= marks[i][0]:
                (f0, t0), (f1, t1) = marks[i - 1], marks[i]
                return t0 + (t1 - t0) * ((f - f0) / max(1e-6, f1 - f0))
        return marks[-1][1]
    tot2 = sum(len(w) + 1 for w in ws); c = 0; out = []
    for w in ws:
        out.append((at(c / tot2), at((c + len(w)) / tot2), w)); c += len(w) + 1
    return out

def chunks(tw, max_len=34):
    """clauses (split after . ? ! , : but not after an abbreviation), long ones cut into even pieces,
    tiny ones folded into a neighbour: no orphan words on screen"""
    clauses, cur = [], []
    for i, x in enumerate(tw):
        cur.append(x)
        w = x[2]
        if i + 1 == len(tw) or (w[-1] in '.?!,:' and w not in ('Dr.', 'Mr.', 'Mrs.')):
            clauses.append(cur); cur = []
    L = lambda c: len(' '.join(x[2] for x in c))
    pieces = []
    for c in clauses:
        if L(c) <= max_len: pieces.append(c); continue
        n = -(-L(c) // 30)
        target = L(c) / n; acc = []
        for x in c:
            acc.append(x)
            if L(acc) >= target and len(pieces) >= 0 and len(c) - c.index(x) - 1 >= 2:
                pieces.append(acc); acc = []
        if acc:
            if pieces and L(acc) < 10 and L(pieces[-1]) + 1 + L(acc) <= max_len + 6: pieces[-1] = pieces[-1] + acc
            else: pieces.append(acc)
    out = []
    for c in pieces:
        if out and (L(c) < 12 or L(out[-1]) < 12) and L(out[-1]) + 1 + L(c) <= max_len: out[-1] = out[-1] + c
        else: out.append(c)
    # a word left on its own goes with the next piece
    i = 0
    while i < len(out) - 1:
        if L(out[i]) < 10 and L(out[i]) + 1 + L(out[i + 1]) <= max_len + 6: out[i:i + 2] = [out[i] + out[i + 1]]
        else: i += 1
    return out

def two_lines(txt):
    if len(txt) <= 17: return txt
    ws = txt.split(); best = None
    for i in range(1, len(ws)):
        a, b = ' '.join(ws[:i]), ' '.join(ws[i:])
        sc = max(len(a), len(b))
        if best is None or sc < best[0]: best = (sc, a + r'\N' + b)
    return best[1]

def colour(txt):
    for h in HL:
        txt = re.sub(re.escape(h), lambda m: r'{\c&H18B4E8&}' + m.group(0) + r'{\c&HFFFFFF&}', txt, flags=re.I)
    return txt

def ts(t):
    t = max(0, t); h = int(t // 3600); m = int(t % 3600 // 60); s = t % 60
    return f'{h}:{m:02d}:{s:05.2f}'

card_at = next(s['at'] for s in plan['shots'] if s['id'] == 'endcard')
FX = '--plain' not in sys.argv
# words that cut: a red / cyan split under them as they type on
SCARY = ['swallows', 'swallow', 'eaten', 'burns', 'stings', 'dead', 'corner', 'bites', 'inside her', 'turning over', 'whatever is left', 'never, ever', 'settle for a unit', 'the queen']
ACC = r'&H18B4E8&'

def spans(txt, words):
    low = txt.lower().replace('\n', ' '); out = []  # a key phrase may be broken over the two lines
    for w in words:
        i = low.find(w.lower())
        while i >= 0: out.append((i, i + len(w))); i = low.find(w.lower(), i + 1)
    return out

def fx_events(text, a, b, top):
    """one caption, three layers: a CRT glow that flickers on, the type-on line (key words pop in the accent
    colour), and a chromatic split on scary words"""
    pos = r'\an8\pos(540,236)' if top else r'\an2\pos(540,1418)'
    plain = text.replace(r'\N', '\n')
    n = len(plain.replace('\n', ''))
    per = max(14, min(32, int(380 / max(1, n))))  # ms per letter
    key = spans(plain, HL); scary = spans(plain, SCARY)
    inside = lambda i, sp: any(x <= i < y for x, y in sp)
    dur = int((b - a) * 1000)
    # the letters, timed
    main, glow, red, cyan = [], [], [], []
    k = 0
    for i, ch in enumerate(plain):
        if ch == '\n':
            for L in (main, glow, red, cyan): L.append(r'\N')
            continue
        t0 = k * per; k += 1
        c = ch.replace('{', '(').replace('}', ')')
        on = r'\alpha&HFF&\t(%d,%d,\alpha&H00&)' % (t0, t0 + 50)
        if inside(i, key):
            start = inside(i - 1, key) is False
            main.append('{' + on + r'\c' + ACC + (r'\fscx116\fscy116\t(%d,%d,\fscx100\fscy100)' % (t0, t0 + 220)) + '}' + c)
        else:
            main.append('{' + on + r'\c&HFFFFFF&\fscx100\fscy100}' + c)
        # the bloom comes up with its letter and flickers like a tube warming up
        glow.append('{' + r'\alpha&HFF&\t(%d,%d,\alpha&H50&)\t(%d,%d,\alpha&HC8&)\t(%d,%d,\alpha&H9C&)\t(%d,%d,\alpha&HFF&)'
                    % (t0, t0 + 40, t0 + 40, t0 + 100, t0 + 100, t0 + 170, max(t0 + 200, dur - 160), max(t0 + 260, dur)) + '}' + c)
        sc = inside(i, scary)
        red.append('{' + (r'\alpha&HFF&\t(%d,%d,\alpha&H10&)\t(%d,%d,\alpha&H70&)' % (t0, t0 + 50, t0 + 260, t0 + 700) if sc else r'\alpha&HFF&') + '}' + c)
        cyan.append(red[-1])
    ev = []
    style = 'Top' if top else 'Say'
    # a soft phosphor bloom behind the letters (pale cyan, like the Institute's screens)
    ev.append(f"Dialogue: 0,{ts(a)},{ts(b)},{style},,0,0,0,,{{{pos}\\1c&HFFF0C8&\\3c&HFFE8B0&\\bord16\\blur16\\shad0}}" + ''.join(glow))
    if scary:
        ev.append(f"Dialogue: 1,{ts(a)},{ts(b)},{style},,0,0,0,,{{{pos.replace('540', '529')}\\1c&H2828FF&\\3c&H2828FF&\\bord7\\shad0\\blur1}}" + ''.join(red))
        ev.append(f"Dialogue: 1,{ts(a)},{ts(b)},{style},,0,0,0,,{{{pos.replace('540', '551')}\\1c&HFFE028&\\3c&HFFE028&\\bord7\\shad0\\blur1}}" + ''.join(cyan))
    ev.append(f"Dialogue: 2,{ts(a)},{ts(b)},{style},,0,0,0,,{{{pos}}}" + ''.join(main))
    return ev

ev = []
for v in plan['voice']:
    is_card = v['at'] >= card_at
    if card_only and not is_card: continue
    if is_card: continue  # the recruiting screen at the end shows her words itself (NOW RECRUITING UNITS ...)
    tw = timed_words(v['key'], v['dur'])
    ch = chunks(tw)
    for i, c in enumerate(ch):
        a = v['at'] + c[0][0] - 0.06
        b = v['at'] + (ch[i + 1][0][0] - 0.06 if i + 1 < len(ch) else c[-1][1] + 0.35)
        if card_only: a -= card_at; b -= card_at
        txt = two_lines(' '.join(x[2] for x in c))
        if FX: ev += fx_events(txt, a, b, is_card)
        else: ev.append(f"Dialogue: 0,{ts(a)},{ts(b)},{'Top' if is_card else 'Say'},,0,0,0,,{colour(txt)}")

head = r"""[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Say,Alagard,88,&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,0,0,0,0,100,100,1,0,1,7,4,2,90,150,520,1
Style: Top,Alagard,80,&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,0,0,0,0,100,100,1,0,1,7,4,8,90,150,250,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
open(out, 'w').write(head + '\n'.join(ev) + '\n')
print(out, len(ev), 'captions')
