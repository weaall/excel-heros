# -*- coding: utf-8 -*-
"""
One body for the whole cast, the way the reference's students share one: every figure gets the
SAME head size and the SAME height, so the same heads-tall ratio.

The head (detected with imgutils) is scaled to a fixed height; the body under it is then
stretched or squashed vertically to reach the common floor. The two are blended row by row over
a short band at the neck, so there is no seam. Figures that would need more than MAX_STRETCH of
body correction are listed for regeneration instead of being distorted.

    python tools/uniform.py sd  <in_dir> <out_dir>        # 2D SD sprites   (768x960, feet 944)
    python tools/uniform.py std <in_dir> <out_dir>        # standing art    (768x1344, feet 1318)
"""
import glob, os, sys
import numpy as np
from PIL import Image
from scipy.ndimage import map_coordinates

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import proportions

KINDS = {
    #        canvas       figure  floor  heads-tall
    "sd":  ((768, 960),   900,    944,   2.4),
    "std": ((768, 1344),  1240,   1318,  6.0),
}
MAX_STRETCH = 0.28          # body may be scaled by 0.72 .. 1.28
SEAM = 0.06                 # neck blend band, fraction of the figure height


def uniform(im, kind):
    (W, H), fig_h, floor, heads = KINDS[kind]
    im = im.convert("RGBA")
    n, _, box = proportions.measure(im)
    if box is None:
        return None, "no head"
    a = np.asarray(im).astype(np.float32)
    alpha = a[..., 3]
    ys, xs = np.nonzero(alpha > 20)
    top, bot = ys.min(), ys.max() + 1
    cx = (xs.min() + xs.max()) / 2.0
    head_h = box[3] - box[1]
    neck = box[3]                                   # the chin line
    tgt_head = fig_h / heads
    k = tgt_head / head_h                           # head scale
    top_part = (neck - top) * k                     # hair-top to chin, scaled
    body_src = bot - neck
    body_tgt = fig_h - top_part
    sy = body_tgt / max(1.0, body_src)
    if abs(sy - 1.0) > MAX_STRETCH:
        return None, f"body x{sy:.2f} (heads {n:.2f})"
    sx_body = (k + sy) / 2.0                        # the body widens a little with the head, not fully

    # inverse map: output row → source row, and a horizontal scale per row
    out_top = floor - fig_h
    yo = np.arange(H, dtype=np.float32)
    rel = yo - out_top
    src_y = np.where(rel < top_part, top + rel / k, neck + (rel - top_part) / sy)
    band = SEAM * fig_h
    t = np.clip((rel - (top_part - band / 2)) / band, 0, 1)
    t = t * t * (3 - 2 * t)
    sx = k * (1 - t) + sx_body * t
    xo = np.arange(W, dtype=np.float32)
    # figure centred in the output
    src_x = cx + (xo[None, :] - W / 2.0) / sx[:, None]
    src_yy = np.repeat(src_y[:, None], W, axis=1)
    out = np.zeros((H, W, 4), np.float32)
    for ch in range(4):
        out[..., ch] = map_coordinates(a[..., ch], [src_yy, src_x], order=1, mode="constant", cval=0.0)
    valid = (rel >= 0) & (src_y < bot + 1)
    out[~valid, :] = 0
    res = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")
    return res, f"heads {n:.2f} → {heads}  head x{k:.2f} body x{sy:.2f}"


def main(kind, src, dst):
    os.makedirs(dst, exist_ok=True)
    redo = []
    for f in sorted(glob.glob(os.path.join(src, "*.png"))):
        name = os.path.basename(f)
        if name.startswith("_"): continue
        res, note = uniform(Image.open(f), kind)
        if res is None:
            redo.append(os.path.splitext(name)[0])
            print(f"  {name:22s} REDO  {note}")
            continue
        res.save(os.path.join(dst, name))
        print(f"  {name:22s} ok    {note}")
    with open(os.path.join(dst, "_regenerate.txt"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(redo) + ("\n" if redo else ""))
    print(f"{kind}: {len(redo)} to regenerate" + (f": {' '.join(redo)}" if redo else ""))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3])
