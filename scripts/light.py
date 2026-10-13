import json, glob, statistics as S
def load(tag):
    r = {}
    for f in sorted(glob.glob(f'results/{tag}/*.json')):
        for o in json.load(open(f, encoding='utf-8'))['data']['results']['output']:
            if 'raw_score' in o: r.setdefault(o['type'], []).append((o['ui_score'], o['raw_score']))
    return r
s1 = load('s1'); t = load('test1')
for k in t: s1[k] = t[k] + s1[k][:5]
s2, s3 = load('s2'), load('s3')
for k in ['moisture', 'pore', 'radiance', 'wrinkle']:
    line = [k.ljust(9)]
    for name, s in [('s1', s1), ('s2', s2), ('s3', s3)]:
        ui = [x[0] for x in s[k]]; raw = [x[1] for x in s[k]]
        line.append(f"{name} ui {S.mean(ui):.1f}±{S.stdev(ui):.1f} raw {S.mean(raw):.1f}±{S.stdev(raw):.1f}")
    print(' | '.join(line))
