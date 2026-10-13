"""Tiny YouCam API client. Reads the key from the user's environment (registry on Windows); never prints it."""
import json, os, sys, time, urllib.request, urllib.error
BASE = 'https://yce-api-01.makeupar.com'

def key():
    k = os.environ.get('YOUCAM_API_KEY')
    if not k and sys.platform == 'win32':
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, 'Environment') as h:
            k = winreg.QueryValueEx(h, 'YOUCAM_API_KEY')[0]
    return k

def call(method, path, body=None):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Authorization': 'Bearer ' + key(), 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r: return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        return e.code, (e.read() or b'')[:500].decode('utf-8', 'replace')

if __name__ == '__main__':
    for p in sys.argv[1:]:
        print(p, *call('GET', '/' + p.lstrip('/')))
