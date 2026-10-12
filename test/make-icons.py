"""Generate the app/extension icons: a broken ring with a minus (= "use less data") on green.

Usage: python3 test/make-icons.py  (writes extension/images/icon-*.png)
"""
from PIL import Image, ImageDraw

S = 1024


def draw(size: int, bg: bool) -> Image.Image:
    k = 4  # supersample for smooth edges
    n = size * k
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    u = n / S
    if bg:
        d.rounded_rectangle([0, 0, n, n], radius=230 * u, fill=(22, 163, 98, 255))
    fg = (255, 255, 255, 255) if bg else (0, 0, 0, 255)
    # broken ring (data saver) with a minus: "use less"
    r, w = 300 * u, 92 * u
    c = n / 2
    box = [c - r, c - r, c + r, c + r]
    d.arc(box, start=-20, end=300, fill=fg, width=int(w))
    import math
    for ang in (-20, 300):  # round caps
        x, y = c + (r - w / 2) * math.cos(math.radians(ang)), c + (r - w / 2) * math.sin(math.radians(ang))
        d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=fg)
    d.rounded_rectangle([c - 120 * u, c - 46 * u, c + 120 * u, c + 46 * u], radius=46 * u, fill=fg)
    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    import os

    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "extension", "images")
    for s in (48, 96, 128, 256, 512, 1024):
        draw(s, True).save(os.path.join(out, f"icon-{s}.png"))
    for s in (16, 19, 32, 38):  # monochrome toolbar glyph
        draw(s, False).save(os.path.join(out, f"toolbar-{s}.png"))
