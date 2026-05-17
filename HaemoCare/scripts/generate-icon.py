#!/usr/bin/env python3
"""
Generate HaemoCare app icons.

Brand: teal gradient (#074F4F → #0B6E6E → #14A39A) + white blood droplet.
Outputs (overwriting):
  - assets/icon.png            (1024x1024, gradient bg + centered droplet) — iOS
  - assets/adaptive-icon.png   (1024x1024, transparent bg + centered droplet within safe zone) — Android
  - assets/splash-icon.png     (1024x1024, transparent bg + centered droplet) — splash screen
  - assets/favicon.png         (48x48, scaled-down icon) — web

Uses 2x supersampling for smooth (anti-aliased) edges.
"""
import math
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

ASSETS = Path(__file__).resolve().parent.parent / "assets"

SIZE = 1024
SUPER = 2  # supersample factor for AA
RENDER = SIZE * SUPER

# Brand colors (from PassportScreen hero gradient)
DARK = (7, 79, 79)        # #074F4F
MID = (11, 110, 110)      # #0B6E6E
LIGHT = (20, 163, 154)    # #14A39A
WHITE = (255, 255, 255)


def make_gradient(size):
    """Two-stop diagonal gradient: DARK (top-left) → MID (middle) → LIGHT (bottom-right)."""
    y, x = np.meshgrid(np.arange(size), np.arange(size), indexing="ij")
    t = (x + y) / (2 * (size - 1))  # 0..1 along the diagonal

    mask = t < 0.5
    tt1 = t * 2
    tt2 = (t - 0.5) * 2

    img = np.zeros((size, size, 3), dtype=np.uint8)
    for ch in range(3):
        img[:, :, ch] = np.where(
            mask,
            DARK[ch] + (MID[ch] - DARK[ch]) * tt1,
            MID[ch] + (LIGHT[ch] - MID[ch]) * tt2,
        ).astype(np.uint8)
    return Image.fromarray(img, mode="RGB")


def teardrop_polygon(cx, cy, R, H, n_arc=160):
    """
    Teardrop with tip pointing UP (image coords, y-down).
      cx, cy : center of the bottom circle
      R      : radius of bottom circle
      H      : distance from tip to circle center (must be > R)
    Returns a list of (x, y) tuples suitable for ImageDraw.polygon.
    """
    if H <= R:
        raise ValueError("H must be > R for a teardrop shape.")
    alpha = math.acos(R / H)  # angle at center between line-to-tip and line-to-tangent-point

    tip = (cx, cy - H)
    T_left = (cx - R * math.sin(alpha), cy - R * math.cos(alpha))
    T_right = (cx + R * math.sin(alpha), cy - R * math.cos(alpha))

    pts = [tip, T_left]

    # Arc from T_left through the bottom to T_right.
    # In image coords with point = (cx + R cosθ, cy + R sinθ):
    #   θ_left  = 3π/2 - α   (upper-left tangent point)
    #   θ_right = 3π/2 + α   (upper-right tangent point)
    # The long arc avoiding the top wedge has sweep = 2π - 2α (radians).
    theta_left = 3 * math.pi / 2 - alpha
    sweep = 2 * math.pi - 2 * alpha
    for i in range(1, n_arc):
        theta = theta_left - sweep * (i / n_arc)
        pts.append((cx + R * math.cos(theta), cy + R * math.sin(theta)))

    pts.append(T_right)
    return pts


def draw_droplet(canvas_size, fill=WHITE, opacity=255, scale=1.0):
    """
    Render a centered teardrop on a transparent RGBA canvas.
      scale : 1.0 = nominal size; <1 shrinks (used for splash padding).
    """
    img = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Nominal sizing (relative to canvas)
    R = int(canvas_size * 0.20 * scale)      # bottom-circle radius
    H = int(canvas_size * 0.36 * scale)      # tip-to-circle-center distance
    cx = canvas_size // 2
    cy = int(canvas_size * 0.58)             # nudge down so the visual center sits centered

    pts = teardrop_polygon(cx, cy, R, H, n_arc=200)
    draw.polygon(pts, fill=(*fill, opacity))
    return img


def render_icon():
    """iOS icon: full-bleed gradient bg + white droplet."""
    bg = make_gradient(RENDER).convert("RGBA")
    droplet = draw_droplet(RENDER, fill=WHITE)
    composited = Image.alpha_composite(bg, droplet)
    return composited.resize((SIZE, SIZE), Image.LANCZOS).convert("RGB")


def render_adaptive_icon():
    """Android adaptive icon foreground: transparent + droplet within safe zone (inner ~66%)."""
    # Safe zone is ~66% of canvas. Shrink droplet so it stays within the mask.
    return draw_droplet(RENDER, fill=WHITE, scale=0.78).resize(
        (SIZE, SIZE), Image.LANCZOS
    )


def render_splash_icon():
    """Splash: white droplet on transparent (sits on splash bg color, see app.json)."""
    return draw_droplet(RENDER, fill=WHITE, scale=0.5).resize(
        (SIZE, SIZE), Image.LANCZOS
    )


def render_favicon():
    """Web favicon: downscaled iOS icon."""
    return render_icon().resize((48, 48), Image.LANCZOS)


def main():
    if not ASSETS.exists():
        raise SystemExit(f"Assets dir not found: {ASSETS}")

    targets = {
        "icon.png": render_icon(),
        "adaptive-icon.png": render_adaptive_icon(),
        "splash-icon.png": render_splash_icon(),
        "favicon.png": render_favicon(),
    }

    for name, img in targets.items():
        path = ASSETS / name
        img.save(path, "PNG", optimize=True)
        print(f"✓ wrote {path.relative_to(ASSETS.parent)} ({img.size[0]}x{img.size[1]})")


if __name__ == "__main__":
    main()
