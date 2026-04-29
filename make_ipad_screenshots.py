#!/usr/bin/env python3
"""
Converts iPhone screenshots to iPad 13" App Store screenshots (2048x2732).
Usage: python make_ipad_screenshots.py
       Place iPhone screenshots in the same folder as this script.
"""
import sys, os, glob
from PIL import Image, ImageFilter

IPAD_W, IPAD_H = 2048, 2732   # iPad 13" portrait (App Store required)
BG_COLOR = (13, 17, 30)         # Dark navy matching app background

def make_ipad(src_path, dst_path):
    img = Image.open(src_path).convert("RGBA")
    iw, ih = img.size

    # Scale to fill ~88% of iPad height, preserving aspect ratio
    target_h = int(IPAD_H * 0.88)
    scale = target_h / ih
    new_w = int(iw * scale)
    new_h = target_h
    img_resized = img.resize((new_w, new_h), Image.LANCZOS)

    # Create blurred background from the screenshot for a nice effect
    bg = img.resize((IPAD_W, IPAD_H), Image.LANCZOS)
    bg = bg.filter(ImageFilter.GaussianBlur(radius=40))
    # Darken the background
    bg_dark = Image.new("RGBA", (IPAD_W, IPAD_H), BG_COLOR + (255,))
    bg = Image.blend(bg, bg_dark, alpha=0.6)

    # Paste resized screenshot centered on canvas
    x = (IPAD_W - new_w) // 2
    y = (IPAD_H - new_h) // 2
    bg.paste(img_resized, (x, y), img_resized)

    # Save as RGB PNG
    final = bg.convert("RGB")
    final.save(dst_path, "PNG", optimize=True)
    print(f"  ✓ {os.path.basename(src_path)} → {os.path.basename(dst_path)} ({IPAD_W}×{IPAD_H})")

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))

    # Find iPhone screenshots (any png/jpg not already converted)
    patterns = ["*.png", "*.jpg", "*.jpeg"]
    sources = []
    for p in patterns:
        sources.extend(glob.glob(os.path.join(script_dir, p)))

    # Exclude already-converted iPad files and app assets
    sources = [s for s in sources if
               "_ipad" not in s.lower() and
               "ipad_ss" not in s.lower() and
               os.path.basename(s).startswith("ss")]

    if not sources:
        print("No screenshots found. Save your iPhone screenshots as ss1.png, ss2.png etc. in the FoodScannerApp folder.")
        return

    out_dir = os.path.join(script_dir, "ipad_screenshots")
    os.makedirs(out_dir, exist_ok=True)

    print(f"Converting {len(sources)} screenshot(s) to iPad 13\" ({IPAD_W}×{IPAD_H})...")
    for src in sorted(sources):
        name = os.path.splitext(os.path.basename(src))[0]
        dst = os.path.join(out_dir, f"{name}_ipad.png")
        make_ipad(src, dst)

    print(f"\nDone! iPad screenshots saved to: {out_dir}")
    print("Upload the files from that folder to App Store Connect → iPad 13\" Display.")

if __name__ == "__main__":
    main()
