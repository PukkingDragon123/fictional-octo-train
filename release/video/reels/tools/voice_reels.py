import json, sys, os, re, numpy as np, soundfile as sf
from kokoro_onnx import Kokoro
D = os.path.dirname(os.path.abspath(sys.argv[1]))
k = Kokoro(sys.argv[2], sys.argv[3])
SR = 24000
def spoken(t):
    return t.replace('Dr.', 'Doctor').replace('metres', 'meters')
def trim(a, thr=0.006, pad=0.03):
    idx = np.where(np.abs(a) > thr)[0]
    s = max(0, idx[0] - int(pad * SR)); e = min(len(a), idx[-1] + int(pad * 2 * SR))
    b = a[s:e].astype(np.float32); f = int(0.008 * SR); b[:f] *= np.linspace(0, 1, f); b[-f:] *= np.linspace(1, 0, f)
    return b
L = json.load(open(sys.argv[1]))
out = {}
for reel, lines in L.items():
    os.makedirs(os.path.join(D, reel), exist_ok=True)
    for key, text in lines:
        p = os.path.join(D, reel, key + '.wav')
        if key in ('card', 'bye') and reel != 'jelly':
            src = os.path.join(D, 'jelly', key + '.wav')
            if os.path.exists(src): import shutil; shutil.copy(src, p)
        if not os.path.exists(p):
            s, sr = k.create(spoken(text), voice='af_heart', speed=0.97, lang='en-us')
            a = trim(np.asarray(s)); a = a / np.abs(a).max() * 0.8
            sf.write(p, a, SR)
        d = sf.info(p).duration
        out.setdefault(reel, []).append({'key': key, 'text': text, 'dur': round(d, 3), 'wav': p})
        print(reel, key, round(d, 2), flush=True)
json.dump(out, open(os.path.join(D, 'voice.json'), 'w'), indent=1)
