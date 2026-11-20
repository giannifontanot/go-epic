import sys, math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

# Draws the app icon in the look of the Get Go Epic page (Gianni): its off-white page, its wordmark's
# Cinzel Decorative Black, "Go" in the app's navy over "Epic!" in the ribbon's gold, as big as the maskable
# safe zone allows, so Go Epic is read at a glance among the phone's icons. Needs Pillow and fontTools
# (+ brotli) to read the page's own woff2. Usage: python3 tools/make-icons.py
import io, os
from fontTools.ttLib import TTFont
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public')
_ttf = TTFont(os.path.join(ROOT, 'get', 'cinzel-decorative-900.woff2'))
_ttf.flavor = None
_buf = io.BytesIO()
_ttf.save(_buf)
FONT_BYTES = _buf.getvalue()
S = 2048                     # drawn large, scaled down for each size
PAGE, PAGE_HI = (251, 251, 253), (255, 255, 255)   # the page's --bg
NAVY = (16, 27, 66)


def background():
    bg = Image.new('RGB', (S, S), (241, 239, 236))
    glow = Image.new('L', (S, S), 0)
    d = ImageDraw.Draw(glow)
    r = int(S * .62)
    d.ellipse((S / 2 - r, S * .44 - r, S / 2 + r, S * .44 + r), fill=255)
    glow = glow.filter(ImageFilter.GaussianBlur(S * .16))
    return Image.composite(Image.new('RGB', (S, S), PAGE), bg, glow)


def text_mask(word, size):
    font = ImageFont.truetype(io.BytesIO(FONT_BYTES), size)
    l, t, r, b = font.getbbox(word)
    m = Image.new('L', (r - l, b - t), 0)
    ImageDraw.Draw(m).text((-l, -t), word, font=font, fill=255)
    return m


def gold(w, h):
    """The wordmark's gold: linear-gradient(100deg, #b8860b, #8a5a12), left to right."""
    g = Image.new('RGB', (w, h))
    px = g.load()
    c0, c1 = (184, 134, 11), (138, 90, 18)
    for x in range(w):
        k = x / max(1, w - 1)
        c = tuple(int(c0[j] + (c1[j] - c0[j]) * k) for j in range(3))
        for y in range(h):
            px[x, y] = c
    return g


def place(img, mask, fill, x, y, shadow):
    sh = Image.new('RGBA', mask.size, shadow + (0,))
    sh.putalpha(mask.point(lambda v: v * 22 // 100))   # a soft shadow on the light page
    blur = sh.filter(ImageFilter.GaussianBlur(S * .006))
    img.paste(blur, (x, y + int(S * .014)), blur)
    if isinstance(fill, tuple):
        layer = Image.new('RGB', mask.size, fill)
    else:
        layer = fill
    img.paste(layer, (x, y), mask)


img = background().convert('RGBA')
epic = 'Epic!'
# sizes chosen so the whole word block sits inside the maskable safe circle (radius 40%)
go_m = text_mask('Go', int(S * .40))
ep_m = text_mask(epic, int(S * .40))
gap = int(S * .025)
total = go_m.height + gap + ep_m.height
safe = S * .40
# scale the block down until its corners are inside the safe circle
scale = 1.0
for _ in range(60):
    gh, eh = go_m.height * scale, ep_m.height * scale
    top = S / 2 - (gh + gap + eh) / 2 + S * .01
    corners = [(go_m.width * scale / 2, S / 2 - top), (ep_m.width * scale / 2, top + gh + gap + eh - S / 2)]
    if all(math.hypot(x, y) <= safe for x, y in corners):
        break
    scale *= .985
go_m = go_m.resize((int(go_m.width * scale), int(go_m.height * scale)), Image.LANCZOS)
ep_m = ep_m.resize((int(ep_m.width * scale), int(ep_m.height * scale)), Image.LANCZOS)
top = int(S / 2 - (go_m.height + gap + ep_m.height) / 2 + S * .01)
place(img, go_m, NAVY, (S - go_m.width) // 2, top, (4, 8, 26))
ey = top + go_m.height + gap
place(img, ep_m, gold(ep_m.width, ep_m.height), (S - ep_m.width) // 2, ey, (4, 8, 26))
big = img.convert('RGB')
for n in (72, 96, 128, 144, 152, 192, 384, 512):
    big.resize((n, n), Image.LANCZOS).save(os.path.join(ROOT, 'icons', f'go-epic-{n}.png'), optimize=True)
big.resize((180, 180), Image.LANCZOS).save(os.path.join(ROOT, 'apple-touch-go-epic.png'), optimize=True)
big.resize((48, 48), Image.LANCZOS).save(os.path.join(ROOT, 'favicon.png'), optimize=True)
