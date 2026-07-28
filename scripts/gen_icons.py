#!/usr/bin/env python3
"""Genera el set de iconos de ArchFlow (PNG + .ico + .icns) desde una sola definicion.

Se ejecuta a mano cuando cambia la marca:  python3 scripts/gen_icons.py
Salida: src-tauri/icons/*  y  public/archflow.svg
"""
import struct
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "src-tauri" / "icons"
PUBLIC = ROOT / "public"

S = 1024  # lienzo maestro
BG_TOP = (79, 70, 229)      # indigo-600
BG_BOT = (124, 58, 237)     # violet-600
INK = (255, 255, 255)
ACCENT = (250, 204, 21)     # amber-400


def rounded_mask(size: int, radius: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask


def gradient(size: int, top: tuple, bottom: tuple) -> Image.Image:
    img = Image.new("RGB", (size, size))
    d = ImageDraw.Draw(img)
    for y in range(size):
        t = y / max(size - 1, 1)
        d.line(
            [(0, y), (size, y)],
            fill=tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)),
        )
    return img


def master() -> Image.Image:
    """Marca: tres capas arquitectonicas conectadas por un eje, con un nodo de decision."""
    base = gradient(S, BG_TOP, BG_BOT).convert("RGBA")
    base.putalpha(rounded_mask(S, int(S * 0.22)))

    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    cx = S // 2
    bar_h = int(S * 0.105)
    gap = int(S * 0.075)
    widths = [int(S * 0.52), int(S * 0.40), int(S * 0.28)]
    top = int(S * 0.255)

    # Eje vertical que atraviesa las capas (el "flow").
    axis_w = int(S * 0.035)
    d.rounded_rectangle(
        [cx - axis_w // 2, top, cx + axis_w // 2, top + 3 * bar_h + 2 * gap],
        radius=axis_w // 2,
        fill=INK + (110,),
    )

    for i, w in enumerate(widths):
        y = top + i * (bar_h + gap)
        d.rounded_rectangle(
            [cx - w // 2, y, cx + w // 2, y + bar_h],
            radius=bar_h // 2,
            fill=INK + (255,),
        )

    # Nodo de decision sobre la capa superior.
    r = int(S * 0.058)
    d.ellipse([cx - r, top - int(S * 0.12) - r, cx + r, top - int(S * 0.12) + r], fill=ACCENT + (255,))

    return Image.alpha_composite(base, layer)


def write_icns(pngs: dict, dest: Path) -> None:
    """Empaqueta PNGs en un contenedor ICNS (entradas PNG, formato soportado desde macOS 10.7)."""
    types = {16: b"icp4", 32: b"icp5", 64: b"icp6", 128: b"ic07", 256: b"ic08", 512: b"ic09", 1024: b"ic10"}
    body = b""
    for size, ostype in types.items():
        data = pngs[size]
        body += ostype + struct.pack(">I", len(data) + 8) + data
    dest.write_bytes(b"icns" + struct.pack(">I", len(body) + 8) + body)


def main() -> None:
    ICONS.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    img = master()

    sizes = [16, 32, 48, 64, 128, 256, 512, 1024]
    raster = {s: img.resize((s, s), Image.LANCZOS) for s in sizes}

    raster[32].save(ICONS / "32x32.png")
    raster[128].save(ICONS / "128x128.png")
    raster[256].save(ICONS / "128x128@2x.png")
    raster[512].save(ICONS / "icon.png")
    for s in (30, 44, 71, 89, 107, 142, 150, 284, 310):
        img.resize((s, s), Image.LANCZOS).save(ICONS / f"Square{s}x{s}Logo.png")
    img.resize((50, 50), Image.LANCZOS).save(ICONS / "StoreLogo.png")

    raster[256].save(ICONS / "icon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

    import io

    blobs = {}
    for s in (16, 32, 64, 128, 256, 512, 1024):
        buf = io.BytesIO()
        raster[s].save(buf, format="PNG")
        blobs[s] = buf.getvalue()
    write_icns(blobs, ICONS / "icon.icns")

    (PUBLIC / "archflow.svg").write_text(SVG, encoding="utf-8")
    print("iconos generados en", ICONS)


SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#4f46e5"/>
      <stop offset="1" stop-color="#7c3aed"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="225" fill="url(#g)"/>
  <rect x="494" y="261" width="36" height="450" rx="18" fill="#fff" opacity="0.43"/>
  <rect x="246" y="261" width="532" height="107" rx="53" fill="#fff"/>
  <rect x="307" y="445" width="410" height="107" rx="53" fill="#fff"/>
  <rect x="369" y="629" width="286" height="107" rx="53" fill="#fff"/>
  <circle cx="512" cy="139" r="59" fill="#facc15"/>
</svg>
"""

if __name__ == "__main__":
    main()
