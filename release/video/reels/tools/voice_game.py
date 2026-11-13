# Dr. Calder's lines -> trimmed mono OGG clips + manifest (keyed by normalised text)
import json, re, sys, os, subprocess, hashlib
import numpy as np, soundfile as sf
from kokoro_onnx import Kokoro

LINES, OUT, MODEL, VOICES = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
VOICE = os.environ.get('VOICE', 'af_heart'); SPEED = float(os.environ.get('SPEED', '0.97'))
os.makedirs(OUT, exist_ok=True)
k = Kokoro(MODEL, VOICES)
SR = 24000

def key_of(t):
    t = t.lower().replace('’', "'")
    t = re.sub(r'd-\d{4}', '{n}', t)
    t = re.sub(r"[^a-z0-9{}']+", ' ', t)
    return re.sub(r'\s+', ' ', t).strip()

KEEP_CAPS = {'HUD', 'ID', 'OK'}
def spoken(t):
    t = t.replace('’', "'").replace('Dr.', 'Doctor').replace('Esc', 'Escape')
    t = re.sub(r'^\.\.\.', '', t).strip()
    t = re.sub(r'\bLevel 0\b', 'Level zero', t)
    t = re.sub(r'\bHm\.', 'Hmm.', t)
    t = re.sub(r'\b([A-Z]{2,})\b', lambda m: m.group(1) if m.group(1) in KEEP_CAPS else m.group(1).capitalize(), t)
    return t

def trim(a, thr=0.006, pad=0.04):
    idx = np.where(np.abs(a) > thr)[0]
    if not len(idx): return a
    s = max(0, idx[0] - int(pad * SR)); e = min(len(a), idx[-1] + int(pad * 1.6 * SR))
    b = a[s:e].astype(np.float32)
    f = int(0.01 * SR); b[:f] *= np.linspace(0, 1, f); b[-f:] *= np.linspace(1, 0, f)
    return b

def render(text, name):
    path = os.path.join(OUT, name + '.ogg')
    meta = path + '.json'
    if os.path.exists(path) and os.path.exists(meta):
        return json.load(open(meta))['d']
    s, sr = k.create(text, voice=VOICE, speed=SPEED, lang='en-us')
    a = trim(np.asarray(s))
    # gentle loudness match: peak to -3 dBFS
    a = a / max(1e-4, np.abs(a).max()) * 0.7
    wav = path[:-4] + '.wav'
    sf.write(wav, a, SR)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-ac', '1', '-c:a', 'libopus', '-b:a', '28k', '-application', 'voip', path], check=True)
    os.remove(wav)
    d = round(len(a) / SR, 3)
    json.dump({'d': d, 't': text}, open(meta, 'w'))
    return d

def h(s): return hashlib.sha1(s.encode()).hexdigest()[:10]

lines = json.load(open(LINES))
first = [x for x in lines if re.match(r'^(Hello!|That body on your screen|My job is)', x['text'])]
lines = first + [x for x in lines if x not in first]
manifest = {'v': 1, 'voice': VOICE, 'lines': [], 'num': {}}
for i, x in enumerate(lines):
    t = x['text']
    parts = t.split('{n}')
    files = []; dur = 0
    for j, seg in enumerate(parts):
        seg_s = spoken(seg).strip(' ,')
        if seg_s and re.search(r'[A-Za-z]', seg_s):
            nm = h(seg_s)
            dur += render(seg_s, nm); files.append(nm)
        if j < len(parts) - 1:
            files.append('#'); dur += 1.4
    manifest['lines'].append({'k': key_of(t), 'f': files, 'd': round(dur, 3)})
    print(i, round(dur, 2), t[:70], flush=True)
# the unit's number, spoken as D + two pairs ("dee, forty-four seventy-one")
words1 = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
tens = ['', 'ten', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
teens = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
def pair(n):
    if n == 0: return 'hundred'
    if n < 10: return 'oh ' + words1[n]
    if n < 20: return teens[n - 10]
    return tens[n // 10] + ('-' + words1[n % 10] if n % 10 else '')
nm = 'n_dee'; manifest['num']['D'] = [nm, render('Dee,', nm)]
for n in range(100):
    nm = 'n_%02d' % n; manifest['num']['%02d' % n] = [nm, render(pair(n) + ',', nm)]
json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'), separators=(',', ':'))
print('done', len(manifest['lines']))
