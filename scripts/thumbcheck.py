# Verify every thumbnail actually shows its own illustration.
# A regenerated PNG whose WebP was not rebuilt leaves the card grid showing the old art while the lightbox shows the
# new one. Comparing mtimes is not enough (a --force run rewrites both), so this downscales both files to 16x16 and
# compares them: anything above THRESHOLD is a thumbnail that does not match its source.
# Usage: python scripts/thumbcheck.py [--fix]
import os, sys
from PIL import Image, ImageChops, ImageStat

root = os.path.join(os.path.dirname(__file__), '..', 'assets')
THRESHOLD = 12.0  # mean per-channel difference on a 16x16 downscale; identical art lands around 1-3

def fingerprint(path):
    im = Image.open(path).convert('RGB').resize((16, 16), Image.LANCZOS)
    return im

def diff(a, b):
    return ImageStat.Stat(ImageChops.difference(a, b)).mean

def check(src_dir, thumb_of, label):
    bad, missing, ok = [], [], 0
    for f in sorted(os.listdir(src_dir)):
        if not f.endswith('.png'): continue
        src = os.path.join(src_dir, f); dst = thumb_of(f)
        if not os.path.exists(dst): missing.append(f); continue
        d = sum(diff(fingerprint(src), fingerprint(dst))) / 3
        if d > THRESHOLD: bad.append((f, round(d, 1), os.path.getmtime(src) - os.path.getmtime(dst)))
        else: ok += 1
    print(f'{label}: {ok} matched, {len(bad)} mismatched, {len(missing)} missing')
    for f, d, age in bad: print(f'  MISMATCH {f} diff={d} png_newer_by={age:.0f}s')
    for f in missing: print(f'  MISSING  {f}')
    return bad, missing

cards = os.path.join(root, 'cards')
bad1, miss1 = check(cards, lambda f: os.path.join(cards, 'thumb', f[:-4] + '.webp'), 'cards')
story = os.path.join(root, 'story')
bad2, miss2 = ([], [])
if os.path.isdir(story):
    bad2, miss2 = check(story, lambda f: os.path.join(story, f[:-4] + '.webp'), 'story')

stale = [f for f, _, _ in bad1 + bad2] + miss1 + miss2
if stale and '--fix' in sys.argv:
    print('rebuilding…')
    os.system(f'python "{os.path.join(os.path.dirname(__file__), "thumbs.py")}" --force')
sys.exit(1 if stale else 0)
