#!/usr/bin/env python3
"""Check parity between Penpot design tokens and the app theme.

Compares `penpot/Nextcloud Calendar Mobile/tokens.json` (DTCG export from the
Penpot file) with the constants in `src/theme.ts`. Exits non-zero and prints a
diff report when the design source and the code theme drift apart.

Usage: python3 scripts/check-theme-parity.py
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOKENS = ROOT / "penpot" / "tokens.json"
THEME = ROOT / "src" / "theme.ts"


def parse_theme(path: Path) -> dict:
    """Extract {object: {key: value}} blocks from theme.ts consts."""
    text = path.read_text()
    out = {}
    for m in re.finditer(r"const (\w+): \w+ = \{([^}]+)\}", text):
        name, body = m.group(1), m.group(2)
        entries = dict(re.findall(r"(\w+): '?(#[0-9a-fA-F]+|\d+)'?", body))
        out[name] = entries
    return out


def token_map(tokens: dict, set_name: str, category: str) -> dict:
    """Flatten a token set category into {short_name: value}."""
    cat = tokens.get(set_name, {}).get(category, {})
    return {k: v["$value"].lower() for k, v in cat.items()}


def diff(label: str, expected: dict, actual: dict, errors: list) -> None:
    for key, val in expected.items():
        got = actual.get(key)
        if got is None:
            errors.append(f"[{label}] missing token for '{key}' (expected {val})")
        elif got != val:
            errors.append(f"[{label}] '{key}': theme={val} tokens={got}")


def main() -> int:
    if not TOKENS.exists():
        print(f"token export not found: {TOKENS}")
        print("Export the Penpot file first (File > Export > .penpot, unzip).")
        return 2
    tokens = json.loads(TOKENS.read_text())
    theme = parse_theme(THEME)
    errors = []

    # colors: lightColors/darkColors <-> colors.light/colors.dark 'color' group
    for theme_block, set_name in (("lightColors", "colors.light"), ("darkColors", "colors.dark")):
        app = {k: v.lower() for k, v in theme.get(theme_block, {}).items()}
        pen = token_map(tokens, set_name, "color")
        diff(theme_block, app, pen, errors)
        extra = set(pen) - set(app)
        if extra:
            print(f"note: penpot-only colors in {set_name}: {sorted(extra)}")

    # spacing / radius / fontSize / fontWeight
    diff("spacing", theme.get("spacing", {}), token_map(tokens, "core", "spacing"), errors)
    diff("radius", theme.get("radius", {}), token_map(tokens, "core", "radius"), errors)
    diff("typography", theme.get("typography", {}), token_map(tokens, "core", "fontSize"), errors)

    weight_names = {"regular": "400", "medium": "500", "bold": "700", "heavy": "800"}
    diff("fontWeight", weight_names, token_map(tokens, "core", "fontWeight"), errors)

    if errors:
        print(f"{len(errors)} parity issue(s):")
        for e in errors:
            print(" -", e)
        return 1
    print("theme parity OK: tokens.json and src/theme.ts are in sync")
    return 0


if __name__ == "__main__":
    sys.exit(main())
