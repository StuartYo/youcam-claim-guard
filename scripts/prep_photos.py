"""HEIC -> JPG for the API: fix rotation, drop all metadata (GPS etc.), long side <= 2560."""
import sys, pathlib
from PIL import Image, ImageOps
import pillow_heif
pillow_heif.register_heif_opener()
src, dst = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
thumbs = []
for f in sorted(src.rglob('*.HEIC')):
    s = 'session' + f.parent.name[-1]
    im = ImageOps.exif_transpose(Image.open(f)).convert('RGB')
    im.thumbnail((2560, 2560))
    out = dst / s / (f.stem + '.jpg'); out.parent.mkdir(parents=True, exist_ok=True)
    im.save(out, quality=92)  # no exif passed -> metadata stripped
    print(out.relative_to(dst), im.size, round(out.stat().st_size/1e6, 2), 'MB')
    t = im.copy(); t.thumbnail((240, 320)); thumbs.append((s, t))
W, H = 250, 330
sheet = Image.new('RGB', (W*6, H*3), 'white')
row = {'session1': 0, 'session2': 1, 'session3': 2}; col = {}
for s, t in thumbs:
    c = col.get(s, 0); col[s] = c + 1
    sheet.paste(t, (c*W + 5, row[s]*H + 5))
sheet.save(dst / '_contact.jpg', quality=80)
