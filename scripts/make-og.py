#!/usr/bin/env python3
"""Regenerate the social preview image and inline it into src/og.ts.

LinkedIn, Slack and X build link previews from the OpenGraph tags in src/page.ts,
which point at /og.png. Run this if the wording or branding changes:

    pip install pillow
    python3 scripts/make-og.py
"""
import base64
import pathlib

from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
W, H = 1200, 630

FONT_CANDIDATES = {
    True: [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/Library/Fonts/Arial Bold.ttf",
    ],
    False: [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial.ttf",
    ],
}


def font(size: int, bold: bool = False):
    for path in FONT_CANDIDATES[bold]:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def main() -> None:
    img = Image.new("RGB", (W, H), "#1d4ed8")
    draw = ImageDraw.Draw(img)
    draw.rectangle([0, 0, W, 14], fill="#d97706")  # amber accent

    draw.text((80, 150), "Ask my resume", font=font(92, True), fill="white")
    draw.text((80, 270), "Huining Li  ·  Technical Lead, Brisbane", font=font(40), fill="#fcd34d")
    draw.text((80, 360), "A RAG assistant that answers questions about my", font=font(34), fill="#dbeafe")
    draw.text((80, 406), "experience — grounded in my own documents,", font=font(34), fill="#dbeafe")
    draw.text((80, 452), "with source citations.", font=font(34), fill="#dbeafe")
    draw.text((80, 540), "TypeScript · Cloudflare Workers · embeddings + LLM", font=font(28), fill="#a9c2f0")

    png_path = ROOT / "og.png"
    img.save(png_path, optimize=True)

    b64 = base64.b64encode(png_path.read_bytes()).decode()
    (ROOT / "src/og.ts").write_text(
        "// Social preview image (1200x630), inlined so the worker is self-contained.\n"
        "// LinkedIn, Slack, X and Google all read the OpenGraph tags in page.ts which\n"
        "// point at /og.png. Regenerate with scripts/make-og.py if the wording changes.\n"
        "const OG_BASE64 =\n"
        f'  "{b64}";\n\n'
        "const BYTES = Uint8Array.from(atob(OG_BASE64), (c) => c.charCodeAt(0));\n\n"
        "export function ogImageResponse(): Response {\n"
        "  return new Response(BYTES, {\n"
        "    headers: {\n"
        '      "content-type": "image/png",\n'
        '      "cache-control": "public, max-age=86400",\n'
        "    },\n"
        "  });\n"
        "}\n"
    )
    print(f"Wrote og.png ({png_path.stat().st_size} bytes) and src/og.ts")


if __name__ == "__main__":
    main()
