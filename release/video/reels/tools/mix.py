# The reels' soundtracks: Dr. Calder's recorded lines, a light music bed, the room tone of the Ledge
# and recorded sound effects (CC0 / CC-BY files, never synthesised; see ../CREDITS.md), placed on the
# plan's shot times. Writes a 48 kHz stereo WAV per reel.
#   python3 mix.py <plan.json> <sfx dir (game src/assets/sfx)> <extra dir> <voice dir> <reel> <out.wav>
import json, subprocess, sys, os
import numpy as np

plan_all = json.load(open(sys.argv[1]))
SFX, EXTRA, VOICE, reel, out = sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5], sys.argv[6]
P = plan_all[reel]
SR = 48000
N = int(P['total'] * SR) + SR

def load(path, rate=1.0):
    af = f'aresample={SR}' + (f',asetrate={int(SR * rate)},aresample={SR}' if rate != 1 else '')
    raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', path, '-ac', '2', '-af', af, '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).copy()

cache = {}
def snd(name, rate=1.0):
    k = (name, rate)
    if k not in cache:
        p = os.path.join(SFX, name + '.mp3')
        if not os.path.exists(p): p = os.path.join(EXTRA, name)
        cache[k] = load(p, rate)
    return cache[k]

mix = np.zeros((N, 2), np.float32)
music = np.zeros((N, 2), np.float32)
voice = np.zeros((N, 2), np.float32)

def put(buf, a, t, gain_db=0.0, pan=0.0, fade_in=0.0, fade_out=0.0, dur=None):
    a = a.copy()
    if dur is not None: a = a[: int(dur * SR)]
    if fade_in > 0: n = min(len(a), int(fade_in * SR)); a[:n] *= np.linspace(0, 1, n)[:, None]
    if fade_out > 0: n = min(len(a), int(fade_out * SR)); a[-n:] *= np.linspace(1, 0, n)[:, None]
    g = 10 ** (gain_db / 20)
    l, r = g * min(1, 1 - pan), g * min(1, 1 + pan)
    i0 = int(t * SR)
    if i0 >= N: return
    a = a[: N - i0]
    buf[i0:i0 + len(a), 0] += a[:, 0] * l
    buf[i0:i0 + len(a), 1] += a[:, 1] * r

def loop(name, t0, t1, gain_db, rate=1.0, fade=0.6, buf=None, pan=0.0):
    a = snd(name, rate); L = len(a); xf = int(min(0.25, L / SR / 4) * SR)
    n = int((t1 - t0) * SR)
    if n <= 0: return
    seg = np.zeros((n + L, 2), np.float32); i = 0
    while i < n:
        b = a.copy()
        if i > 0: b[:xf] *= np.linspace(0, 1, xf)[:, None]
        b[-xf:] *= np.linspace(1, 0, xf)[:, None]
        seg[i:i + L] += b; i += L - xf
    put(buf if buf is not None else mix, seg[:n], t0, gain_db, pan, fade, fade)

shot = {s['id']: s for s in P['shots']}
def S(sid, u=0.0): return shot[sid]['at'] + u
def D(sid): return shot[sid]['dur']
END = P['total']
card = shot['endcard']['at']

# ---- beds: the Ledge's warm hum and drips under everything but the card; the music box all the way
loop('bed_hum', 0, card + 0.5, -24, fade=1.0)
loop('bed_drips', 0, card + 0.5, -27, fade=1.5)
loop('mus_musicbox', 0, END, -19, buf=music, fade=1.2)

# ---- Dr. Calder
for v in P['voice']:
    put(voice, load(os.path.join(VOICE, reel, v['key'] + '.ogg')), v['at'], -1.0)

# ---- the card out of her coat; then the recruiting screen: the breaker, the tube's static as it comes on,
# keys under the type, a crackle as the code is drawn (cue times: AD_CUES in tools/studio/adScreen.ts)
put(mix, snd('book_1'), S('card', 0.35), -8)
put(mix, snd('whoosh2.wav'), S('endcard', 0.0) - 0.15, -16, fade_out=0.8, dur=0.9)
put(mix, snd('breaker_1'), S('endcard', 0.0), -10)
put(mix, snd('static_burst_1'), S('endcard', 0.05), -17, fade_out=0.3)
loop('bed_static', S('endcard', 0.3), END, -36, fade=0.8)
put(mix, snd('typing_1'), S('endcard', 1.5), -21, fade_out=0.25, dur=0.85)
put(mix, snd('static_burst_2'), S('endcard', 3.5), -21, fade_out=0.25, dur=0.45)
put(mix, snd('typing_1'), S('endcard', 4.7), -21, fade_out=0.3, dur=0.9)

def steps(t0, t1, every, gain=-20, name='fs_dirt', pan=0.0):
    t, i = t0, 0
    while t < t1:
        put(mix, snd(f'{name}_{1 + i % 3}'), t, gain, pan); t += every; i += 1

if reel == 'jelly':
    for i, u in enumerate(np.arange(0.4, D('wide'), 0.95)): put(mix, snd(f'slime_{1 + i % 4}'), S('wide', u), -24, 0.2)
    put(mix, snd('bubble_1'), S('detail', 0.6), -18); put(mix, snd('burp_1'), S('detail', 2.8), -20); put(mix, snd('bubble_2'), S('detail', 4.4), -19)
    put(mix, snd('slime_2'), S('side', 0.8), -20); put(mix, snd('growl_1'), S('side', D('side') * 0.55), -14)
    h = D('hunt')
    loop('bee.wav', S('hunt'), S('hunt', h - 1.8), -15, fade=0.3, pan=0.15)
    put(mix, snd('bug_2'), S('hunt', h - 3.0), -16)
    put(mix, snd('slime_3'), S('hunt', h - 2.2), -12)
    put(mix, snd('splash_2'), S('hunt', h - 1.8), -9); put(mix, snd('slime_1'), S('hunt', h - 1.5), -12); put(mix, snd('bubble_3'), S('hunt', h - 0.8), -16)
    for i, u in enumerate(np.arange(0.3, D('split') * 0.62, 1.1)): put(mix, snd(f'squish_{1 + i % 3}'), S('split', u), -18)
    put(mix, snd('wetbreak_1'), S('split', D('split') * 0.62), -11); put(mix, snd('slime_4'), S('split', D('split') * 0.62 + 0.2), -14)
    steps(S('approach', 0.1), S('approach', D('approach') * 0.75), 0.55)
    put(mix, snd('growl_2'), S('approach', D('approach') * 0.45), -11)
    put(mix, snd('growl_3'), S('eaten', 0.0), -10)
    put(mix, snd('splash_1'), S('eaten', 0.8), -6); put(mix, snd('hit_1'), S('eaten', 0.82), -10); put(mix, snd('fall_1'), S('eaten', 0.95), -10)
    put(mix, snd('slime_2'), S('eaten', 1.3), -10); put(mix, snd('squish_2'), S('eaten', 1.9), -13); put(mix, snd('mud_2'), S('eaten', 2.8), -15)
    put(mix, snd('burp_2'), S('eaten', 4.2), -15)

if reel == 'bee':
    loop('bee.wav', S('hover'), S('hover', D('hover')), -11, fade=0.4)
    b = D('bonk')
    loop('bee.wav', S('bonk'), S('bonk', b * 0.6), -13, fade=0.4)
    put(mix, snd('hit_2'), S('bonk', b * 0.3), -10); put(mix, snd('bug_3'), S('bonk', b * 0.3 + 0.25), -15)
    put(mix, snd('breath_1'), S('bonk', b * 0.62), -19); put(mix, snd('breath_2'), S('bonk', b * 0.8), -20)
    put(mix, snd('insect0.ogg'), S('stub', 0.8), -18); put(mix, snd('insect2.ogg'), S('stub', 2.6), -18)
    c = D('chew')
    for i, u in enumerate(np.arange(0.2, c * 0.55, 0.62)): put(mix, snd(f'mud_{1 + i % 3}'), S('chew', u), -19)
    loop('bee.wav', S('chew', c * 0.55), S('chew', c), -13, rate=0.86, fade=0.5)
    loop('bee.wav', S('queen'), S('queen', D('queen')), -18, rate=0.9, fade=0.6)
    put(mix, snd('beast_1'), S('queen', 1.4), -15)
    put(mix, snd('burp_1'), S('feed', 0.6), -14); put(mix, snd('slime_3'), S('feed', 1.6), -16); put(mix, snd('bubble_1'), S('feed', 3.0), -16)
    loop('bee.wav', S('feed'), S('feed', D('feed')), -20, fade=0.5, pan=0.3)
    steps(S('rake', 0.1), S('rake', D('rake')), 0.6)
    put(mix, snd('beast_2'), S('rake', D('rake') * 0.5), -12); put(mix, snd('breath_3'), S('rake', D('rake') * 0.55), -16)
    put(mix, snd('cloth_2'), S('swallow', 0.25), -12); put(mix, snd('fall_2'), S('swallow', 0.5), -12)
    put(mix, snd('burp_2'), S('swallow', 1.35), -8); put(mix, snd('splash_3'), S('swallow', 1.4), -10)
    put(mix, snd('slime_4'), S('swallow', 2.1), -13); put(mix, snd('bubble_2'), S('swallow', 3.2), -15); put(mix, snd('beast_3'), S('swallow', 4.4), -18)

if reel == 'keeper':
    loop('bee.wav', S('turning'), S('turning', D('turning')), -19, fade=0.6)
    put(mix, snd('creak_1'), S('turning', 1.5), -18); put(mix, snd('cmisc_1'), S('turning', 3.8), -18)
    put(mix, snd('insect1.ogg'), S('face', 0.9), -14); put(mix, snd('insect3.ogg'), S('face', 3.1), -14); put(mix, snd('bug_4'), S('face', 4.6), -16)
    loop('bee.wav', S('legs'), S('legs', D('legs')), -17, rate=1.25, fade=0.5)
    put(mix, snd('insect4.ogg'), S('legs', 1.8), -15)
    f = D('follow')
    steps(S('follow', 0.1), S('follow', f * 0.6), 0.55)
    steps(S('follow', 0.4), S('follow', f * 0.6 + 0.4), 0.62, gain=-23, pan=-0.3)
    put(mix, snd('plastic_1'), S('inspect', 0.7), -14); put(mix, snd('plastic_2'), S('inspect', 2.2), -15); put(mix, snd('plastic_3'), S('inspect', 3.5), -15)
    k = D('corner')
    steps(S('corner', 0.1), S('corner', k * 0.7), 0.5, gain=-18)
    loop('bee.wav', S('corner', k * 0.4), S('sting', 0.6), -13, rate=1.15, fade=0.4)
    put(mix, snd('blade_2'), S('sting', 0.35), -8); put(mix, snd('hit_3'), S('sting', 0.38), -12); put(mix, snd('fall_3'), S('sting', 0.95), -9)
    a = D('after')
    for i in range(3): loop('bee.wav', S('after', 0.2 + i * 0.5), S('after', a), -19 - i, rate=0.9 + i * 0.08, fade=0.5, pan=-0.3 + i * 0.3)
    for i, u in enumerate(np.arange(1.9, a, 0.5)): put(mix, snd(f'mud_{1 + i % 3}'), S('after', u), -20)

# ---- the music ducks under her voice
env = np.abs(voice).max(axis=1)
k = int(0.25 * SR)
on = (env > 0.02).astype(np.float64)
cs = np.concatenate([[0.0], np.cumsum(on)])
idx = np.arange(N)
duck = ((cs[np.clip(idx + k // 2, 0, N)] - cs[np.clip(idx - k // 2, 0, N)]) / k).astype(np.float32)
music *= (1 - 0.45 * np.clip(duck, 0, 1))[:, None]
# the music comes up once she has finished, under the held screen
bye = [v for v in P['voice'] if v['key'] == 'bye'][0]
c0 = int((bye['at'] + bye['dur'] + 0.2) * SR); ramp = np.clip((np.arange(N) - c0) / (0.8 * SR), 0, 1)
music *= (1 + 0.8 * ramp)[:, None]
outbuf = mix + music + voice
outbuf = outbuf[: int(P['total'] * SR)]
# end fade
n = int(0.8 * SR); outbuf[-n:] *= np.linspace(1, 0, n)[:, None]
peak = np.abs(outbuf).max()
if peak > 0.97: outbuf *= 0.97 / peak
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', '-c:a', 'pcm_s16le', out], input=outbuf.astype(np.float32).tobytes(), check=True)
print(out, round(len(outbuf) / SR, 2), 's peak', round(float(peak), 3))

# ---- loudness for phones: -14 LUFS integrated, peaks held under -1 dB
import re as _re
m = subprocess.run(['ffmpeg', '-hide_banner', '-i', out, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True).stderr
I = float(_re.findall(r'I:\s+(-?[\d.]+) LUFS', m)[-1])
tmpw = out + '.tmp.wav'
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', out, '-af', f'volume={-14 - I:.2f}dB,alimiter=limit=0.89:level=false', '-c:a', 'pcm_s16le', tmpw], check=True)
os.replace(tmpw, out)
print('loudness', I, '->', -14)
