# Dr. Calder's lines for the reel tool, cached by text: Kokoro af_heart (as in the game), the Institute's
# old 8-bit PA chain (voice_scary.py), then speech recognition with word timestamps on the finished clip,
# mapped onto the line's own words (the captions pop in on these times).
#   python3 voice.py <cache dir> <lines.json: [{"key", "text"}]>
# Writes <cache>/<key>.wav (8-bit voice, 24 kHz) and <key>.json {"text", "dur", "words": [[t0, t1, word]], "env"}
# (env: the voice's loudness, 0..1, at 24 fps). Needs kokoro-onnx, faster-whisper, soundfile, numpy;
# the model files in $KOKORO_DIR (model.onnx, voices.npz).
import difflib, json, os, re, subprocess, sys
import numpy as np
import soundfile as sf

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import voice_scary  # noqa: E402

cache, todo = sys.argv[1], json.load(open(sys.argv[2]))
os.makedirs(cache, exist_ok=True)
todo = [x for x in todo if not os.path.exists(os.path.join(cache, x['key'] + '.json'))]
if not todo:
    print('voice: all cached'); sys.exit(0)

SR = 24000
KD = os.environ.get('KOKORO_DIR', os.path.join(os.path.dirname(__file__), 'kokoro'))
from kokoro_onnx import Kokoro  # noqa: E402
from faster_whisper import WhisperModel  # noqa: E402
tts = Kokoro(os.path.join(KD, 'model.onnx'), os.path.join(KD, 'voices.npz'))
asr = WhisperModel('base.en', device='cpu', compute_type='int8', cpu_threads=2)

def spoken(t):
    return t.replace('Dr.', 'Doctor').replace('metres', 'meters').replace('“', '"').replace('”', '"')

def trim(a, thr=0.006, pad=0.03):
    idx = np.where(np.abs(a) > thr)[0]
    s = max(0, idx[0] - int(pad * SR)); e = min(len(a), idx[-1] + int(pad * 2 * SR))
    b = a[s:e].astype(np.float32); f = int(0.008 * SR); b[:f] *= np.linspace(0, 1, f); b[-f:] *= np.linspace(1, 0, f)
    return b

norm = lambda w: re.sub(r'[^a-z0-9]', '', w.lower())

def map_words(text, rec, dur):
    """the line's own words, timed from the recognised words: matched letter by letter (difflib), the
    words recognition missed placed in proportion between their neighbours"""
    ws = text.split()
    if not rec:
        tot = sum(len(w) + 1 for w in ws); t = 0.0; out = []
        for w in ws: d = dur * (len(w) + 1) / tot; out.append([round(t, 3), round(t + d, 3), w]); t += d
        return out
    a = ''.join(norm(w) for w in ws); b = ''.join(norm(r[2]) for r in rec)
    bt = []  # time of each letter of the recognised text
    for s, e, w in rec:
        n = len(norm(w))
        for i in range(n): bt.append(s + (e - s) * i / max(1, n))
    be = []
    for s, e, w in rec:
        n = len(norm(w))
        for i in range(n): be.append(s + (e - s) * (i + 1) / max(1, n))
    amap = [None] * len(a)
    for blk in difflib.SequenceMatcher(None, a, b, autojunk=False).get_matching_blocks():
        for k in range(blk.size): amap[blk.a + k] = blk.b + k
    out, c = [], 0
    for w in ws:
        n = len(norm(w)); idx = [amap[c + i] for i in range(n) if amap[c + i] is not None]
        out.append([bt[idx[0]] if idx else None, be[idx[-1]] if idx else None, w]); c += n
    # fill the gaps: a run of missed words shares the time between its neighbours
    i = 0
    while i < len(out):
        if out[i][0] is not None: i += 1; continue
        j = i
        while j < len(out) and out[j][0] is None: j += 1
        t0 = out[i - 1][1] if i > 0 else 0.0
        t1 = out[j][0] if j < len(out) else dur
        n = j - i
        for k in range(n): out[i + k][0] = t0 + (t1 - t0) * k / n; out[i + k][1] = t0 + (t1 - t0) * (k + 1) / n
        i = j
    for x in out: x[0] = round(x[0], 3); x[1] = round(max(x[1], x[0] + 0.05), 3)
    return out

for i, x in enumerate(todo):
    key, text = x['key'], x['text']
    s, _ = tts.create(spoken(text), voice='af_heart', speed=0.97, lang='en-us')
    a = trim(np.asarray(s)); a = a / np.abs(a).max() * 0.8
    clean = os.path.join(cache, key + '_clean.wav')
    sf.write(clean, a, SR)
    y = voice_scary.scary(clean)
    wav = os.path.join(cache, key + '.wav')
    voice_scary.out(y, wav, False)
    os.remove(clean)
    v, _ = sf.read(wav, dtype='float32')
    dur = len(v) / SR
    # whisper wants 16 kHz
    raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', wav, '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    segs, _ = asr.transcribe(np.frombuffer(raw, dtype=np.float32), beam_size=1, word_timestamps=True, language='en')
    rec = [[w.start, w.end, w.word.strip()] for sg in segs for w in sg.words]
    heard = ' '.join(r[2] for r in rec)
    words = map_words(text, rec, dur)
    # loudness at 24 fps, 0..1 (the captions breathe with it)
    hop = SR // 24
    env = [float(np.sqrt(np.mean(v[k:k + hop] ** 2))) for k in range(0, len(v), hop)]
    m = max(env) or 1
    env = [round(min(1, e / m), 3) for e in env]
    json.dump({'text': text, 'heard': heard, 'dur': round(dur, 3), 'words': words, 'env': env}, open(os.path.join(cache, key + '.json'), 'w'))
    print(f'voice {i + 1}/{len(todo)} {dur:.2f}s | {text[:50]} | heard: {heard[:60]}', flush=True)
