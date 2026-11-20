import sys, math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

# Draws the app icon: "GO" over "EPIC" on the app's navy, the words as big as the maskable safe zone allows
# (Gianni: Go Epic must be read at a glance among all the phone's icons). Needs Pillow and the Caladea Bold font
# (Apache 2.0; Debian/Ubuntu package fonts-crosextra-caladea). Usage: python3 tools/make-icons.py [font.ttf]
import os
FONT = sys.argv[1] if len(sys.argv) > 1 else '/usr/share/fonts/truetype/crosextra/Caladea-Bold.ttf'
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public')
S = 2048                     # drawn large, scaled down for each size
NAVY, NAVY_HI = (16, 27, 66), (36, 52, 118)
CREAM = (255, 244, 233)


def background():
    bg = Image.new('RGB', (S, S), NAVY)
    glow = Image.new('L', (S, S), 0)
    d = ImageDraw.Draw(glow)
    r = int(S * .62)
    d.ellipse((S / 2 - r, S * .44 - r, S / 2 + r, S * .44 + r), fill=255)
    glow = glow.filter(ImageFilter.GaussianBlur(S * .16))
    return Image.composite(Image.new('RGB', (S, S), NAVY_HI), bg, glow)


def text_mask(word, size):
    font = ImageFont.truetype(FONT, size)
    l, t, r, b = font.getbbox(word)
    m = Image.new('L', (r - l, b - t), 0)
    ImageDraw.Draw(m).text((-l, -t), word, font=font, fill=255)
    return m


def gold(w, h):
    g = Image.new('RGB', (w, h))
    stops = [(0, (255, 232, 150)), (.45, (247, 201, 69)), (1, (196, 128, 24))]
    px = g.load()
    for y in range(h):
        f = y / max(1, h - 1)
        for i in range(len(stops) - 1):
            a, ca = stops[i]; b, cb = stops[i + 1]
            if a <= f <= b:
                k = (f - a) / (b - a)
                c = tuple(int(ca[j] + (cb[j] - ca[j]) * k) for j in range(3))
                break
        for x in range(w):
            px[x, y] = c
    return g


def place(img, mask, fill, x, y, shadow):
    sh = Image.new('RGBA', mask.size, shadow + (0,))
    sh.putalpha(mask)
    blur = sh.filter(ImageFilter.GaussianBlur(S * .006))
    img.paste(blur, (x, y + int(S * .014)), blur)
    if isinstance(fill, tuple):
        layer = Image.new('RGB', mask.size, fill)
    else:
        layer = fill
    img.paste(layer, (x, y), mask)


img = background().convert('RGBA')
epic = 'EPIC'
# sizes chosen so the whole word block sits inside the maskable safe circle (radius 40%)
go_m = text_mask('GO', int(S * .40))
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
place(img, go_m, CREAM, (S - go_m.width) // 2, top, (4, 8, 26))
ey = top + go_m.height + gap
place(img, ep_m, gold(ep_m.width, ep_m.height), (S - ep_m.width) // 2, ey, (4, 8, 26))
big = img.convert('RGB')
for n in (72, 96, 128, 144, 152, 192, 384, 512):
    big.resize((n, n), Image.LANCZOS).save(os.path.join(ROOT, 'icons', f'go-epic-{n}.png'), optimize=True)
big.resize((180, 180), Image.LANCZOS).save(os.path.join(ROOT, 'apple-touch-go-epic.png'), optimize=True)
big.resize((48, 48), Image.LANCZOS).save(os.path.join(ROOT, 'favicon.png'), optimize=True)
