"""Apply YouCam makeup virtual try-on (foundation) to one local photo and download the result right away.
Usage: vto.py <src.jpg> <out.jpg> <effects.json>
Saves the raw task response next to the image as <out>.task.json (download URL removed, it expires)."""
import json, sys, time, pathlib, urllib.request
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from yc import call
from skin import upload

def run(src, effects):
    fid = upload(src)
    st, r = call('POST', '/s2s/v2.0/task/makeup-vto', {'src_file_id': fid, 'effects': effects, 'version': '1.0'})
    if st != 200: raise SystemExit(f'task {st} {r}')
    tid = r['data']['task_id']
    for _ in range(60):
        time.sleep(3)
        st, r = call('GET', f'/s2s/v2.0/task/makeup-vto/{tid}')
        s = (r.get('data') or {}).get('task_status') if isinstance(r, dict) else None
        if s in ('success', 'error'): return r
    return r

if __name__ == '__main__':
    src, out, eff = sys.argv[1], pathlib.Path(sys.argv[2]), json.loads(pathlib.Path(sys.argv[3]).read_text())
    r = run(src, eff)
    d = r.get('data') or {}
    print('status', d.get('task_status'), d.get('error'), d.get('error_message'))
    if d.get('task_status') != 'success': raise SystemExit(1)
    res = d['results']
    url = res['url'] if isinstance(res, dict) else res[0].get('download_url') or res[0].get('url')
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(urllib.request.urlopen(url, timeout=120).read())
    meta = {'src': str(src), 'effects': eff, 'task_status': d.get('task_status'), 'downloaded_at': time.strftime('%Y-%m-%dT%H:%M:%S')}
    out.with_suffix('.task.json').write_text(json.dumps(meta, indent=1), encoding='utf-8')
    print('saved', out, out.stat().st_size)
