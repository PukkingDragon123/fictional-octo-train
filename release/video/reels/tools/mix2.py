# The reel tool's soundtrack: Dr. Calder's lines, a music bed that ducks under her, room beds and the
# recorded sound effects the timeline lists (picked by tag from the CC0 library: sfx_tags.json), then
# -14 LUFS for phones. 48 kHz stereo WAV.
#   python3 mix2.py <timeline.json> <out.wav>
import json, os, re, subprocess, sys
import numpy as np

TL = json.load(open(sys.argv[1])); out = sys.argv[2]
SR = 48000
N = int(TL['total'] * SR) + SR

def load(path, rate=1.0):
    af = f'aresample={SR}' + (f',asetrate={int(SR * rate)},aresample={SR}' if rate != 1 else '')
    raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', path, '-ac', '2', '-af', af, '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).copy()

cache = {}
def snd(path, rate=1.0):
    if (path, rate) not in cache: cache[(path, rate)] = load(path, rate)
    return cache[(path, rate)]

mix, music, voice = (np.zeros((N, 2), np.float32) for _ in range(3))

def put(buf, a, t, gain_db=0.0, pan=0.0, fade_in=0.0, fade_out=0.0, dur=None):
    a = a.copy()
    if dur is not None: a = a[: int(dur * SR)]
    if fade_in > 0: n = min(len(a), int(fade_in * SR)); a[:n] *= np.linspace(0, 1, n)[:, None]
    if fade_out > 0: n = min(len(a), int(fade_out * SR)); a[-n:] *= np.linspace(1, 0, n)[:, None]
    g = 10 ** (gain_db / 20); l, r = g * min(1, 1 - pan), g * min(1, 1 + pan)
    i0 = int(max(0, t) * SR)
    if i0 >= N: return
    a = a[: N - i0]
    buf[i0:i0 + len(a), 0] += a[:, 0] * l; buf[i0:i0 + len(a), 1] += a[:, 1] * r

def loop(path, t0, t1, gain_db, rate=1.0, fade=0.6, buf=None, pan=0.0):
    a = snd(path, rate); L = len(a); xf = int(min(0.25, L / SR / 4) * SR)
    n = int((t1 - t0) * SR)
    if n <= 0: return
    seg = np.zeros((n + L, 2), np.float32); i = 0
    while i < n:
        b = a.copy()
        if i > 0: b[:xf] *= np.linspace(0, 1, xf)[:, None]
        b[-xf:] *= np.linspace(1, 0, xf)[:, None]
        seg[i:i + L] += b; i += L - xf
    put(buf if buf is not None else mix, seg[:n], t0, gain_db, pan, fade, fade)

for b in TL.get('beds', []): loop(b['file'], b['from'], b['to'], b.get('gain', -24), fade=b.get('fade', 1.0))
m = TL.get('music')
if m: loop(m['file'], 0, TL['total'], m.get('gain', -19), buf=music, fade=1.2)
for v in TL['lines']: put(voice, load(v['wav']), v['at'], -1.0)
for s in TL.get('sfx', []):
    if s.get('to') is not None: loop(s['file'], s['at'], s['to'], s.get('gain', -14), rate=s.get('rate', 1.0), fade=s.get('fade', 0.4), pan=s.get('pan', 0))
    else: put(mix, snd(s['file'], s.get('rate', 1.0)), s['at'], s.get('gain', -14), s.get('pan', 0), 0, s.get('fade_out', 0), s.get('dur'))

# the music ducks under her voice, comes up when she is done at the end
env = np.abs(voice).max(axis=1); k = int(0.25 * SR)
cs = np.concatenate([[0.0], np.cumsum((env > 0.02).astype(np.float64))]); idx = np.arange(N)
duck = ((cs[np.clip(idx + k // 2, 0, N)] - cs[np.clip(idx - k // 2, 0, N)]) / k).astype(np.float32)
music *= (1 - 0.45 * np.clip(duck, 0, 1))[:, None]
if m and m.get('up_at') is not None:
    ramp = np.clip((idx - int(m['up_at'] * SR)) / (0.8 * SR), 0, 1); music *= (1 + 0.8 * ramp)[:, None]
buf = (mix + music + voice)[: int(TL['total'] * SR)]
n = int(0.8 * SR); buf[-n:] *= np.linspace(1, 0, n)[:, None]
peak = np.abs(buf).max()
if peak > 0.97: buf *= 0.97 / peak
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', '-c:a', 'pcm_s16le', out], input=buf.astype(np.float32).tobytes(), check=True)
I = float(re.findall(r'I:\s+(-?[\d.]+) LUFS', subprocess.run(['ffmpeg', '-hide_banner', '-i', out, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True).stderr)[-1])
tmp = out + '.tmp.wav'
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', out, '-af', f'volume={-14 - I:.2f}dB,alimiter=limit=0.89:level=false', '-c:a', 'pcm_s16le', tmp], check=True)
os.replace(tmp, out)
print('mix', out, round(len(buf) / SR, 2), 's, loudness', I, '-> -14')
