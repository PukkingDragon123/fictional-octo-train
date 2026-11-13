# Dr. Calder through the Institute's old PA: the recorded lines made into an unsettling 8-bit
# voice that is still clearly understood. Pitched down a little (same length), a faint second
# voice an octave below, sample-and-hold at ~9 kHz, crushed to 8 bits, a short metallic room
# (comb), a slow tape wobble, a PA band-pass. Lengths are kept, so manifests and timings hold.
#   python3 voice_scary.py <in file or dir> <out dir> [--ogg]   (files: .wav / .ogg)
import os, subprocess, sys
import numpy as np

SR = 24000
def dec(path, af=''):
    cmd = ['ffmpeg', '-loglevel', 'error', '-i', path, '-ac', '1', '-ar', str(SR)]
    # resample first: asetrate below assumes the stream runs at SR (an OGG decodes at 48 kHz)
    if af: cmd += ['-af', f'aresample={SR},' + af]
    cmd += ['-f', 'f32le', '-']
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, dtype=np.float32).copy()

def fit(a, n):
    return a[:n] if len(a) >= n else np.concatenate([a, np.zeros(n - len(a), np.float32)])

def scary(path):
    dry = dec(path)
    n = len(dry)
    # a little lower, same length; and a faint voice an octave down under it
    low = fit(dec(path, f'asetrate={int(SR * 0.92)},aresample={SR},atempo={1 / 0.92:.5f}'), n)
    octv = fit(dec(path, f'asetrate={SR // 2},aresample={SR},atempo=2.0'), n)
    x = low + 0.24 * octv
    x /= max(1e-4, np.abs(x).max())
    # sample-and-hold at ~9 kHz (the aliasing grit of an old sampler)
    hold = SR / float(os.environ.get('HOLD', '9000'))
    idx = (np.floor(np.arange(n) / hold) * hold).astype(np.int64)
    x = x[np.clip(idx, 0, n - 1)]
    # 8-bit
    x = np.round(x * 0.9 * 127) / 127
    # a short metallic room: a ringing comb and one slap
    d1, d2 = int(0.0087 * SR), int(0.023 * SR)
    y = x.copy()
    g = float(os.environ.get('COMB', '0.32'))
    for k in range(d1, n, d1): e = min(n, k + d1); y[k:e] += g * y[k - d1:e - d1]
    y[d2:] += 0.18 * x[:-d2]
    y /= max(1e-4, np.abs(y).max())
    return y.astype(np.float32)

def out(y, dst, ogg):
    af = 'vibrato=f=5.2:d=0.06,highpass=f=240,lowpass=f=3900,volume=0.9'
    args = ['ffmpeg', '-loglevel', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-', '-af', af]
    args += (['-c:a', 'libopus', '-b:a', '32k', '-application', 'voip'] if ogg else ['-c:a', 'pcm_s16le']) + [dst]
    subprocess.run(args, input=y.tobytes(), check=True)

if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    ogg = '--ogg' in sys.argv
    os.makedirs(dst, exist_ok=True)
    files = [os.path.join(src, f) for f in sorted(os.listdir(src)) if f.endswith(('.ogg', '.wav'))] if os.path.isdir(src) else [src]
    for i, f in enumerate(files):
        name = os.path.splitext(os.path.basename(f))[0] + ('.ogg' if ogg else '.wav')
        out(scary(f), os.path.join(dst, name), ogg)
        if i % 25 == 0: print(i, len(files), name, flush=True)
    print('done', len(files))
