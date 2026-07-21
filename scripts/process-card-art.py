from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    source = Path(args.input)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)

    with Image.open(source) as image:
        image = image.convert("RGB")
        image.thumbnail((512, 768), Image.Resampling.LANCZOS)
        canvas = Image.new("RGB", (512, 768), (8, 12, 18))
        left = (canvas.width - image.width) // 2
        top = (canvas.height - image.height) // 2
        canvas.paste(image, (left, top))
        canvas.save(output, "WEBP", quality=82, method=6)


if __name__ == "__main__":
    main()
