"""Scan the Sounds/ folder (recursively) and write sounds.json for the Soundboard webapp.

Folder layout expected:

    Sounds/
        Andor/
            B2-Casa.mp3
            B2-Sooner_Or_Later.mp3
        Back_To_The_Future/
            George_McFly-What.mp3
        Star_Wars/
            Darth_Vader-Failed_Me.mp3
            Effect-Light_Saber.mp3
        Standalone.mp3                # also OK; lands in the "Misc" group

Run me whenever you add or remove audio files:

    python build_manifest.py

Manifest shape written to sounds.json:

    {
      "files": [
        {"path": "Andor/B2-Casa.mp3",                "source": "Andor"},
        {"path": "Star_Wars/Effect-Light_Saber.mp3", "source": "Star_Wars"},
        ...
      ],
      "count": 14
    }

The webapp groups buttons by `source` (the immediate folder name). Inside the
filename, the part before the first '-' becomes a small sub-label on the button
(e.g. the speaker name or "Effect"); the rest becomes the main button label.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

AUDIO_EXTS = {".mp3", ".wav", ".ogg", ".oga", ".m4a", ".aac", ".opus", ".flac", ".webm"}


def collect(sounds_dir: Path) -> list[dict]:
    entries: list[dict] = []
    for p in sorted(sounds_dir.rglob("*"), key=lambda x: str(x).lower()):
        if not p.is_file():
            continue
        if p.suffix.lower() not in AUDIO_EXTS:
            continue
        if p.name.startswith("."):
            continue

        rel = p.relative_to(sounds_dir)
        # Always use forward slashes in the manifest so the URL works in browsers.
        rel_posix = rel.as_posix()

        # Source = first folder under Sounds/. Files placed directly under
        # Sounds/ get a "Misc" source so they still show up.
        if rel.parent == Path("."):
            source = "Misc"
        else:
            source = rel.parts[0]

        entries.append({"path": rel_posix, "source": source})

    return entries


def main() -> int:
    here = Path(__file__).resolve().parent
    sounds_dir = here / "Sounds"
    out = here / "sounds.json"

    if not sounds_dir.exists():
        sounds_dir.mkdir(parents=True, exist_ok=True)
        print(f"Created empty Sounds/ folder at {sounds_dir}")

    files = collect(sounds_dir)
    payload = {"files": files, "count": len(files)}
    out.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    rel_out = out.relative_to(here)
    print(f"Wrote {rel_out} with {len(files)} entr{'y' if len(files) == 1 else 'ies'}.")
    if files:
        tally: dict[str, int] = {}
        for f in files:
            tally[f["source"]] = tally.get(f["source"], 0) + 1
        for src, n in sorted(tally.items(), key=lambda kv: kv[0].lower()):
            print(f"  {src:<28} {n}")
    else:
        print(
            "No audio files found yet. Drop files like:\n"
            "  Sounds/<Source>/<Person>-<Sound_Name>.mp3\n"
            "  Sounds/<Source>/Effect-<Effect_Name>.mp3"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
