"""Gera os ícones do app a partir da marca (pote de bolo). Uso: python scripts/make-icons.py"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent / 'assets'
GROUND = (243, 242, 241, 255)
BERRY = (163, 50, 74, 255)
COCOA = (35, 28, 26, 255)
CREAM = (248, 234, 237, 255)
SS = 4  # supersampling para bordas suaves


def mark(size, scale=1.0, mono=None, background=None):
    big = size * SS
    img = Image.new('RGBA', (big, big), background or (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    unit = big * scale / 32
    off = (big - 32 * unit) / 2

    def box(x, y, w, h):
        return [off + x * unit, off + y * unit, off + (x + w) * unit, off + (y + h) * unit]

    berry, cocoa, cream = (mono, mono, (0, 0, 0, 0)) if mono else (BERRY, COCOA, CREAM)
    d.rounded_rectangle(box(5, 9, 22, 20), radius=5 * unit, fill=berry)
    d.rounded_rectangle(box(4, 6, 24, 5), radius=2.5 * unit, fill=cocoa)
    for y, alpha in ((17.5, 255), (23, 180)):
        color = cream if mono else (*cream[:3], alpha)
        points = []
        for i in range(0, 45):
            t = i / 44
            x = 5 + 22 * t
            import math
            yy = y + 1.0 * math.sin(t * 2 * math.pi)
            points.append((off + x * unit, off + yy * unit))
        d.line(points, fill=color, width=max(1, int(2.2 * unit)), joint='curve')
    d.ellipse(box(19.4, 1, 5.2, 5.2), fill=berry)
    return img.resize((size, size), Image.LANCZOS)


def main():
    mark(1024, 0.72, background=GROUND).convert('RGB').save(ROOT / 'icon.png')
    mark(512, 0.62).save(ROOT / 'android-icon-foreground.png')
    Image.new('RGBA', (512, 512), GROUND).save(ROOT / 'android-icon-background.png')
    mark(432, 0.62, mono=(0, 0, 0, 255)).save(ROOT / 'android-icon-monochrome.png')
    mark(1024, 0.42).save(ROOT / 'splash-icon.png')
    mark(48, 0.95).save(ROOT / 'favicon.png')


if __name__ == '__main__':
    main()
