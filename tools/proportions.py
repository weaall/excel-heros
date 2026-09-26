# -*- coding: utf-8 -*-
"""
Body proportions of a cut-out standing figure: how many heads tall it is.

The reference game's standing art is drawn to one rule across the whole cast — about six and a
half heads, feet on one line, one height in the frame. Left to itself the generator draws every
card to its own rule: a big-headed child's body beside a nine-head fashion plate beside someone
standing small in a corner, and a roster of those reads as clip art.

HOW IT MEASURES
---------------
An anime head detector (deepghs/imgutils, weights hosted on Hugging Face, run locally) finds the
head; the cut-out's alpha gives the figure from the top of the hair to the soles.

    heads = figure height / head box height

The head box includes the hair, so this reads a little LOWER than a crown-to-chin count; the
accepted band below is calibrated for that on figures judged by eye. The first attempt used the
silhouette alone (the shoulder line) and could not tell long hair from a big head.

    python tools/proportions.py assets/cards_cutout/alpha/*.png
"""
import os, sys
from PIL import Image

# Calibrated on this cast: 4.5-head child proportions and 7.5-head stretched figures both have
# to fall outside, the ones that look right inside.
HEADS_MIN, HEADS_MAX = 5.3, 6.9

def measure(im):
    """(heads, figure_px, head_box) or (None, figure_px, None) when no head is found."""
    from imgutils.detect import detect_heads
    im = im.convert('RGBA')
    bbox = im.split()[3].point(lambda v: 255 if v > 127 else 0).getbbox()
    if not bbox:
        return None, 0, None
    fig_h = bbox[3] - bbox[1]
    flat = Image.new('RGB', im.size, (255, 255, 255))
    flat.paste(im, (0, 0), im)
    found = [d for d in detect_heads(flat) if d[2] > 0.4]
    if not found:
        return None, fig_h, None
    # The highest-confidence head that sits in the top half of the figure.
    found.sort(key=lambda d: -d[2])
    top_half = [d for d in found if d[0][1] < bbox[1] + fig_h * 0.5] or found
    (x0, y0, x1, y1), _, _ = top_half[0]
    head_h = max(1, y1 - y0)
    return fig_h / head_h, fig_h, (x0, y0, x1, y1)

def verdict(n):
    if n is None: return 'no head found'
    if n < HEADS_MIN: return 'BIG HEAD / SHORT BODY'
    if n > HEADS_MAX: return 'STRETCHED'
    return 'ok'

if __name__ == '__main__':
    rows = []
    for f in sys.argv[1:]:
        if os.path.basename(f).startswith('_'): continue
        n, h, _ = measure(Image.open(f))
        rows.append((os.path.basename(f), n, h))
    for name, n, h in sorted(rows, key=lambda t: (t[1] or 0)):
        print(f'  {name:22s} {("%.1f" % n) if n else "  ?"} heads   figure {h:4d}px   {verdict(n)}')
