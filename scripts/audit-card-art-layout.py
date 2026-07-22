from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
CATALOG = json.loads((ROOT / "src/data/master-catalog.json").read_text(encoding="utf-8"))
FULL_DIR = ROOT / "assets/card-art/cards"
THUMB_DIR = ROOT / "assets/card-art/thumbs"
UNRELEASED_IDS = {
    "catalog-11513604",
    "catalog-11513621",
    "catalog-11513645",
    "catalog-11513653",
    "catalog-11513673",
    "catalog-58496",
}
EXCLUDED_CATEGORIES = {"Pack / Set", "Prototype / Unreleased", "Villain Reference"}


def inspect_image(path: Path, expected_size: tuple[int, int]) -> str | None:
    if not path.exists():
        return "missing"
    try:
        with Image.open(path) as image:
            if image.size != expected_size:
                return f"size {image.size[0]}x{image.size[1]}"
            if image.mode != "RGB":
                return f"mode {image.mode}"
    except Exception as error:  # pragma: no cover - reports corrupt assets
        return f"unreadable: {error}"
    return None


eligible = [
    card
    for card in CATALOG["cards"]
    if card["id"] not in UNRELEASED_IDS and card["category"] not in EXCLUDED_CATEGORIES
]
full_issues: dict[str, str] = {}
thumbnail_issues: dict[str, str] = {}

for card in eligible:
    card_id = card["id"]
    full_issue = inspect_image(FULL_DIR / f"{card_id}.webp", (512, 768))
    thumbnail_issue = inspect_image(THUMB_DIR / f"{card_id}.webp", (384, 576))
    if full_issue:
        full_issues[card_id] = full_issue
    if thumbnail_issue:
        thumbnail_issues[card_id] = thumbnail_issue

result = {
    "eligible": len(eligible),
    "full_art_checked": len(eligible) - len(full_issues),
    "ipad_thumbnails_checked": len(eligible) - len(thumbnail_issues),
    "required_aspect_ratio": "2:3",
    "full_art_issues": full_issues,
    "thumbnail_issues": thumbnail_issues,
    "passed": len(eligible) == 640 and not full_issues and not thumbnail_issues,
}

print(json.dumps(result, indent=2))
raise SystemExit(0 if result["passed"] else 1)
