"""Run SD skin analysis on local photos; save raw JSON to results/. Usage: skin.py <action,action,..> <tag> files..."""
import json, sys, time, pathlib, urllib.request
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from yc import call

def upload(p):
    p = pathlib.Path(p); b = p.read_bytes()
    st, r = call('POST', '/s2s/v2.0/file', {'files': [{'content_type': 'image/jpeg', 'file_name': p.name, 'file_size': len(b)}]})
    if st != 200: raise SystemExit(f'upload init {st} {r}')
    f = r['data']['files'][0]; rq = f['requests'][0]
    req = urllib.request.Request(rq['url'], data=b, method=rq.get('method', 'PUT'), headers=rq.get('headers') or {'Content-Type': 'image/jpeg'})
    urllib.request.urlopen(req, timeout=120).read()
    return f['file_id']

def analyze(path, actions):
    fid = upload(path)
    st, r = call('POST', '/s2s/v2.0/task/skin-analysis', {'src_file_id': fid, 'dst_actions': actions, 'format': 'json'})
    if st != 200: raise SystemExit(f'task {st} {r}')
    tid = r['data']['task_id']
    for _ in range(60):
        time.sleep(3)
        st, r = call('GET', f'/s2s/v2.0/task/skin-analysis/{tid}')
        s = (r.get('data') or {}).get('task_status') if isinstance(r, dict) else None
        if s in ('success', 'error'): return r
    return r

if __name__ == '__main__':
    actions, tag, files = sys.argv[1].split(','), sys.argv[2], sys.argv[3:]
    out = pathlib.Path(__file__).parent.parent / 'results' / tag; out.mkdir(parents=True, exist_ok=True)
    for i, f in enumerate(files):
        r = analyze(f, actions)
        (out / f'{i:02d}_{pathlib.Path(f).stem}.json').write_text(json.dumps(r, ensure_ascii=False, indent=1), encoding='utf-8')
        print(f, (r.get('data') or {}).get('task_status'))
