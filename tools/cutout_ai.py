# -*- coding: utf-8 -*-
"""
Background removal for the generated standing art, with a CHECK after every attempt.

WHY NOT tools/cutout.py ALONE
-----------------------------
The border flood is exact on a pure white backdrop and helpless on anything else. The model
sometimes paints a light grey studio gradient or a soft shadow under the feet; widening the flood
to cover those ate white clothing, because this art style draws white fabric with thin, pale
outlines that do not stop a fill. A segmentation model decides "character or not" from the whole
picture instead of from colour, so it keeps a white skirt and drops a grey backdrop.

THE CHECK IS AGREEMENT, NOT COLOUR
----------------------------------
The first version judged a cut by colour — "was anything that is not white or grey removed, is
anything light and colourless left on the edge" — and it was wrong both ways: a grey studio
gradient that the model removed correctly counted as eaten clothing, and the edge of a white hoodie
counted as leftover backdrop. On white-on-white, colour cannot tell fabric from background, which
is the whole reason for a model in the first place.

So two models of different design cut the same picture:
    1. rembg isnet-anime        trained on anime characters
    2. rembg birefnet-general   a different architecture
and the cut is accepted when their masks agree (IoU >= 0.96) and the figure covers a sane share of
the frame. Where two unrelated models draw the same outline, the outline is right; where they part,
that is exactly the ambiguous region. On disagreement a third opinion is asked:
    3. the BiRefNet Hugging Face Space
and whichever local cut it agrees with is kept. If all three disagree, the id goes to
<out>/_regenerate.txt — a new seed almost always gives a background the models agree on.

A contact sheet of every accepted cut on a coloured field is written to <out>/_review.png, for the
eye: the models agreeing proves consistency, not taste.

    python tools/cutout_ai.py assets/cards_cutout/*.png --out assets/cards_cutout/alpha
    python tools/cutout_ai.py x.png --report        # check only, prints the numbers

Exit status is the number of files that failed every step; their ids go to
<out>/_regenerate.txt for the generator to redo with a new seed.
"""
import io, json, os, sys, time, urllib.request, urllib.error, uuid
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

AGREE_MIN = 0.96
COVER_MIN, COVER_MAX = 0.06, 0.75

def mask(im, scale=4):
    """Alpha > 50% as a set of pixel indices on a 1/scale grid — enough to compare outlines."""
    a = im.convert('RGBA').split()[3].resize((im.width // scale, im.height // scale))
    return {i for i, v in enumerate(a.getdata()) if v > 127}, a.width * a.height

def iou(a, b):
    ma, n = mask(a)
    mb, _ = mask(b)
    inter = len(ma & mb)
    union = len(ma | mb) or 1
    return inter / union, len(ma) / n

# ---------------------------------------------------------------- removers

_sessions = {}
def rembg_remove(img, model):
    from rembg import remove, new_session
    if model not in _sessions:
        _sessions[model] = new_session(model)
    return remove(img, session=_sessions[model], post_process_mask=True)

HF_SPACE = os.environ.get('BG_SPACE', 'https://zhengpeng7-birefnet-demo.hf.space')

def hf_remove(img):
    """Gradio queue protocol, as scripts/genCardsHF.mjs speaks it: upload, call, read the stream.

    ANONYMOUS. With an account token attached this Space answers every call with `event: error,
    data: null` — the same family as the ZeroGPU proxy-token failure noted in CLAUDE.md — and
    without one it works. BG_SPACE_TOKEN=1 attaches the first .hf_tokens entry anyway (never
    printed), for a Space that needs it."""
    headers = {}
    if os.environ.get('BG_SPACE_TOKEN'):
        for f in ('.hf_tokens', '.hf_token'):
            if os.path.exists(f):
                tok = next((l.strip() for l in open(f, encoding='utf-8') if l.strip()), None)
                if tok:
                    headers['authorization'] = f'Bearer {tok}'
                    break
    buf = io.BytesIO(); img.save(buf, 'PNG')
    boundary = uuid.uuid4().hex
    body = (f'--{boundary}\r\nContent-Disposition: form-data; name="files"; filename="in.png"\r\n'
            f'Content-Type: image/png\r\n\r\n').encode() + buf.getvalue() + f'\r\n--{boundary}--\r\n'.encode()
    req = urllib.request.Request(f'{HF_SPACE}/gradio_api/upload', data=body, method='POST',
                                 headers={**headers, 'content-type': f'multipart/form-data; boundary={boundary}'})
    path = json.loads(urllib.request.urlopen(req, timeout=120).read())[0]
    fd = {'path': path, 'meta': {'_type': 'gradio.FileData'}}
    for fn, extra in (('image', ['', 'General']), ('png', []), ('predict', [])):
        try:
            req = urllib.request.Request(f'{HF_SPACE}/gradio_api/call/{fn}', method='POST',
                                         data=json.dumps({'data': [fd] + extra}).encode(),
                                         headers={**headers, 'content-type': 'application/json'})
            eid = json.loads(urllib.request.urlopen(req, timeout=60).read())['event_id']
        except urllib.error.HTTPError:
            continue
        stream = urllib.request.urlopen(urllib.request.Request(f'{HF_SPACE}/gradio_api/call/{fn}/{eid}', headers=headers), timeout=300)
        for line in stream.read().decode('utf-8', 'replace').splitlines():
            if line.startswith('data:') and 'url' in line:
                data = json.loads(line[5:])
                item = data[0] if isinstance(data, list) else data
                if isinstance(item, list): item = item[-1]
                url = item.get('url') if isinstance(item, dict) else None
                if url:
                    raw = urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=120).read()
                    return Image.open(io.BytesIO(raw)).convert('RGBA')
    raise RuntimeError('the Space answered without an image')

def process(path, out_dir, report_only=False):
    orig = Image.open(path).convert('RGB')
    name = os.path.basename(path)
    t = time.time()
    a = rembg_remove(orig, 'isnet-anime')
    b = rembg_remove(orig, 'birefnet-general')
    agree, cover = iou(a, b)
    verdict, keep = 'fail', None
    if COVER_MIN <= cover <= COVER_MAX and agree >= AGREE_MIN:
        verdict, keep = 'agree', a
    else:
        try:
            c = hf_remove(orig)
            ca, _ = iou(c, a)
            cb, _ = iou(c, b)
            if ca >= AGREE_MIN: verdict, keep = f'space=isnet {ca:.3f}', a
            elif cb >= AGREE_MIN: verdict, keep = f'space=biref {cb:.3f}', b
            else: verdict = f'all differ (space/isnet {ca:.3f}, space/biref {cb:.3f})'
        except Exception as e:
            verdict = f'fail (space unavailable: {str(e)[:60]})'
    ok = keep is not None and COVER_MIN <= cover <= COVER_MAX
    heads = None
    if ok:
        # Proportions (tools/proportions.py): a clean cut of a three-head child is still a redo.
        import proportions
        heads, _, _ = proportions.measure(keep)
        if heads is None or not (proportions.HEADS_MIN <= heads <= proportions.HEADS_MAX):
            ok = False
            verdict += f'  | proportions {("%.1f heads" % heads) if heads else "no head found"} → redo'
        else:
            verdict += f'  | {heads:.1f} heads'
    print(f'  {name}: isnet/biref IoU {agree:.3f}  cover {cover:5.1%}  {verdict}  ({time.time() - t:.1f}s)')
    if ok and not report_only:
        normalise(keep).save(os.path.join(out_dir, name))
    return ok


# Every accepted figure is scaled to one height with its feet on one line, as the reference's
# standing art is: before this a figure the model drew small stayed small, and the lobby showed
# a giant beside a child. Canvas 768x1344, figure 1240px tall, soles at y=1318, centred.
CANVAS = (768, 1344)
FIG_H, FLOOR = 1240, 1318

def normalise(cut):
    a = cut.split()[3].point(lambda v: 255 if v > 20 else 0)
    bbox = a.getbbox()
    if not bbox:
        return cut
    fig = cut.crop(bbox)
    k = FIG_H / fig.height
    fig = fig.resize((max(1, round(fig.width * k)), FIG_H), Image.LANCZOS)
    if fig.width > CANVAS[0]:            # a very wide pose: fit the width instead
        k2 = CANVAS[0] / fig.width
        fig = fig.resize((CANVAS[0], max(1, round(fig.height * k2))), Image.LANCZOS)
    out = Image.new('RGBA', CANVAS, (0, 0, 0, 0))
    out.paste(fig, ((CANVAS[0] - fig.width) // 2, FLOOR - fig.height), fig)
    return out


def review_sheet(out_dir, names):
    """Every accepted cut on a mid-blue field, six to a row, for the human check."""
    ims = []
    for n in names:
        f = os.path.join(out_dir, n)
        if os.path.exists(f):
            im = Image.open(f).convert('RGBA'); im.thumbnail((240, 420)); ims.append(im)
    if not ims: return
    cols = 6
    rows = (len(ims) + cols - 1) // cols
    sheet = Image.new('RGBA', (cols * 250, rows * 430), (104, 156, 214, 255))
    for i, im in enumerate(ims):
        x, y = (i % cols) * 250 + (250 - im.width) // 2, (i // cols) * 430 + 5
        sheet.paste(im, (x, y), im)
    sheet.save(os.path.join(out_dir, '_review.png'))


def main(argv):
    out_dir = None
    files = []
    it = iter(argv)
    for a in it:
        if a == '--out': out_dir = next(it)
        elif a.startswith('--out='): out_dir = a.split('=', 1)[1]
        elif a == '--report': pass
        else: files.append(a)
    report = '--report' in argv
    out_dir = out_dir or os.path.join(os.path.dirname(files[0]), 'alpha')
    os.makedirs(out_dir, exist_ok=True)
    failed = [os.path.splitext(os.path.basename(f))[0] for f in files if not process(f, out_dir, report)]
    if not report:
        review_sheet(out_dir, [os.path.basename(f) for f in files])
    if failed and not report:
        with open(os.path.join(out_dir, '_regenerate.txt'), 'w', encoding='utf-8') as f:
            f.write('\n'.join(failed) + '\n')
    print(f'{len(files)} file(s): {len(files) - len(failed)} ok, {len(failed)} to regenerate'
          + (f' → {", ".join(failed)}' if failed else ''))
    return len(failed)

if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
