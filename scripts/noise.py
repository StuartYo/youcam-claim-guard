import json, glob, os, statistics as S
rows = {}
files = sorted(glob.glob('results/test1/*.json')) + sorted(glob.glob('results/s1/*.json'))
for f in files:
    d = json.load(open(f, encoding='utf-8'))
    for o in [o for o in d['data']['results']['output'] if 'ui_score' in o or 'score' in o]:
        rows.setdefault(o['type'], []).append((o.get('ui_score', o.get('score')), round(o.get('raw_score', o.get('score')), 2)))
for t, v in rows.items():
    ui = [x[0] for x in v[:6]]; raw = [x[1] for x in v[:6]]
    print(f"{t:9} ui {ui} dup {v[6][0]} | raw {raw} dup {v[6][1]}")
    print(f"          ui mean {S.mean(ui):.1f} sd {S.stdev(ui):.2f} range {max(ui)-min(ui)} | raw mean {S.mean(raw):.1f} sd {S.stdev(raw):.2f}")
