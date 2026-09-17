# Card thumbnails: assets/cards/<id>.png (832x1216 PNG, ~1.1 MB each) -> assets/cards/thumb/<id>.webp (416x608, ~40 KB).
# The game draws cards from the thumbnails and only opens the full PNG in the lightbox / S splash.
# Usage: python scripts/thumbs.py        (re-run after adding illustrations)
import os, sys
from PIL import Image
root = os.path.join(os.path.dirname(__file__), '..', 'assets', 'cards'); out = os.path.join(root, 'thumb'); os.makedirs(out, exist_ok=True)
n = 0; before = after = 0
for f in sorted(os.listdir(root)):
    if not f.endswith('.png'): continue
    src = os.path.join(root, f); dst = os.path.join(out, f[:-4] + '.webp')
    if os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src) and '--force' not in sys.argv: continue
    im = Image.open(src).convert('RGB'); im.thumbnail((416, 608), Image.LANCZOS)
    im.save(dst, 'WEBP', quality=82, method=6); n += 1; before += os.path.getsize(src); after += os.path.getsize(dst)
print(f'{n} thumbnails; {before/1048576:.1f} MB -> {after/1048576:.2f} MB')

# Prologue panels: assets/story/<id>.png (1216x832) -> assets/story/<id>.webp (912x624, ~90 KB).
# The game only ever loads the webp; the PNG stays as the generation original.
story = os.path.join(os.path.dirname(__file__), '..', 'assets', 'story')
if os.path.isdir(story):
    sn = sb = sa = 0
    for f in sorted(os.listdir(story)):
        if not f.endswith('.png'): continue
        src = os.path.join(story, f); dst = os.path.join(story, f[:-4] + '.webp')
        if os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src) and '--force' not in sys.argv: continue
        im = Image.open(src).convert('RGB'); im.thumbnail((912, 624), Image.LANCZOS)
        im.save(dst, 'WEBP', quality=84, method=6); sn += 1; sb += os.path.getsize(src); sa += os.path.getsize(dst)
    print(f'{sn} story panels; {sb/1048576:.1f} MB -> {sa/1048576:.2f} MB')
