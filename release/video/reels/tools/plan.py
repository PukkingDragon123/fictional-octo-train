# The reels' timelines: shots (ids from the studio's shot list) with their lengths, and when each of
# Dr. Calder's lines starts, derived from the recorded line lengths (voice.json).
#   python3 plan.py voice.json plan.json
import json, sys

V = {r: {x['key']: x['dur'] for x in l} for r, l in json.load(open(sys.argv[1])).items()}
# the recruiting screen at the end (the studio's endcard shot): her recruiting line after a short lead, then
# held long enough to scan the QR code
AD_LEAD, AD_HOLD = 0.6, 3.0

# (shot, line or None, lead before the line, tail after it, extra fixed length when there is no line)
SPEC = {
  'jelly': [('intro', 'hi', .35, .3), ('wide', 'was', .2, .25), ('detail', 'see', .2, .3), ('side', 'fur', .2, .25),
            ('hunt', 'hunt', .2, 1.45), ('split', 'split', .2, .3), ('approach', 'hungry', .2, .25),
            ('eaten', 'burns', 2.2, .45), ('card', 'card', .2, .3)],
  'bee': [('intro', 'hi', .35, .3), ('hover', 'yes', .2, .25), ('bonk', 'look', .2, .25), ('stub', 'sting', .2, .3),
          ('chew', 'chew', .2, .3), ('queen', 'queen', .2, .3), ('feed', 'full', .2, .3), ('rake', 'rake', .2, .2),
          ('swallow', 'inside', 2.1, .45), ('card', 'card', .2, .3)],
  'keeper': [('intro', 'hi', .35, .3), ('turning', 'was', .2, .3), ('face', 'eyes', .2, .3), ('legs', 'legs', .2, .25),
             ('follow', 'follow', .2, .35), ('inspect', 'turn', .2, .35), ('corner', 'corner', .3, 1.3),
             ('sting', None, 0, 0, 2.2), ('after', None, 0, 0, None), ('card', 'card', .2, .3)],
}

out = {}
for reel, spec in SPEC.items():
    t = 0.0; shots = []; voice = []
    for i, it in enumerate(spec):
        sid, line, lead, tail = it[:4]
        if line:
            dur = lead + V[reel][line] + tail
            voice.append({'key': line, 'at': round(t + lead, 3), 'dur': V[reel][line]})
        elif sid == 'sting':
            dur = it[4]
            voice.append({'key': 'after', 'at': round(t + 0.3, 3), 'dur': V[reel]['after']})
        elif sid == 'after':
            dur = max(3.2, V[reel]['after'] + 0.3 - 2.2 + 0.9)
        shots.append({'id': sid, 'at': round(t, 3), 'dur': round(dur, 3)})
        t += dur
    card = round(AD_LEAD + V[reel]['bye'] + AD_HOLD, 3)
    voice.append({'key': 'bye', 'at': round(t + AD_LEAD, 3), 'dur': V[reel]['bye']})
    shots.append({'id': 'endcard', 'at': round(t, 3), 'dur': card})
    t += card
    out[reel] = {'fps': 24, 'total': round(t, 3), 'shots': shots, 'voice': voice}
    print(reel, round(t, 2), 's', [(s['id'], s['dur']) for s in shots])
json.dump(out, open(sys.argv[2], 'w'), indent=1)
