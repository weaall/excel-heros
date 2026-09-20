# -*- coding: utf-8 -*-
"""
Removes the background from a generated card so the illustration can sit over anything.

WHY FLOOD FILL FROM THE BORDER, NOT A COLOUR MATCH
--------------------------------------------------
The obvious approach — "make every near-white pixel transparent" — eats the character. This cast
wears white shirts, lab coats and blouses, and several have white or silver hair; a global match
would punch holes through all of them.

So the fill starts at the image BORDER and spreads inward, and it only crosses pixels that are
still within tolerance of the background. An interior white shirt is never reached, because the
character's outline stands between it and the edge. That is the whole trick, and it is why the
generator's negative prompt has to keep `hair touching the top edge of the image` and
`cropped head`: if the character touches the border, the fill walks straight into them.

SDXL CANNOT OUTPUT ALPHA. Every route to a transparent PNG is "generate on something uniform, then
key it out", and the only choice is what that uniform thing is. A saturated chroma colour keys most
cleanly but bleeds its hue into the hair edges, and this roster has mint, lavender and pink hair
that the bleed would ruin. Near-white with a border fill keeps the edges honest.

    python tools/cutout.py assets/cards/ceo.png            # in place, writes ceo.png
    python tools/cutout.py assets/cards/*.png --out out/   # batch
    python tools/cutout.py x.png --check                   # report only, writes nothing
"""
import sys
import os
from collections import deque
from PIL import Image

TOL = 26          # per-channel distance from the sampled background still counted as background
FEATHER = 1       # px of alpha ramp, so the cut edge is not a staircase


def sample_bg(px, w, h):
    """The background colour, taken from the four corners — the one place the subject is not."""
    pts = [(1, 1), (w - 2, 1), (1, h - 2), (w - 2, h - 2)]
    cols = [px[p][:3] for p in pts]
    return tuple(sum(c[i] for c in cols) // len(cols) for i in range(3))


def near(a, b, tol=TOL):
    return abs(a[0] - b[0]) <= tol and abs(a[1] - b[1]) <= tol and abs(a[2] - b[2]) <= tol


def cut(path, out_path=None, check=False):
    im = Image.open(path).convert('RGBA')
    w, h = im.size
    px = im.load()
    bg = sample_bg(px, w, h)

    # Every border pixel that still looks like the background is a starting point.
    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if near(px[x, y][:3], bg) and not seen[y * w + x]:
                seen[y * w + x] = 1
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if near(px[x, y][:3], bg) and not seen[y * w + x]:
                seen[y * w + x] = 1
                q.append((x, y))

    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and near(px[nx, ny][:3], bg):
                seen[ny * w + nx] = 1
                q.append((nx, ny))

    cutpx = sum(seen)
    share = cutpx / (w * h)

    # A cut that takes almost everything means the fill leaked through the subject — usually the
    # character touching an edge. Better to refuse than to write a mostly-empty card.
    leaked = share > 0.92
    # And one that takes almost nothing means the background was not uniform after all.
    missed = share < 0.05

    if check or leaked or missed:
        status = 'LEAKED' if leaked else 'MISSED' if missed else 'ok'
        print(f'{os.path.basename(path)}: bg={bg} cut={share:.1%} {status}')
        if check or leaked or missed:
            return status

    for i in range(w * h):
        if seen[i]:
            x, y = i % w, i // w
            r, g, b, _ = px[x, y]
            px[x, y] = (r, g, b, 0)

    if FEATHER:
        # One pass of softening: any kept pixel touching a cut one gets partial alpha, which takes
        # the staircase off a diagonal edge without eroding the silhouette.
        edge = []
        for i in range(w * h):
            if seen[i]:
                continue
            x, y = i % w, i // w
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and seen[ny * w + nx]:
                    edge.append((x, y))
                    break
        for x, y in edge:
            r, g, b, a = px[x, y]
            px[x, y] = (r, g, b, int(a * 0.55))

    im.save(out_path or path)
    return 'ok'


def main(argv):
    args = [a for a in argv if not a.startswith('--')]
    check = '--check' in argv
    out_dir = None
    for a in argv:
        if a.startswith('--out'):
            out_dir = a.split('=', 1)[1] if '=' in a else argv[argv.index(a) + 1]
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
        args = [a for a in args if a != out_dir]

    if not args:
        print(__doc__)
        return 2

    bad = 0
    for p in args:
        dst = os.path.join(out_dir, os.path.basename(p)) if out_dir else None
        if cut(p, dst, check) != 'ok':
            bad += 1
    print(f'{len(args)} file(s), {bad} needing a look')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
