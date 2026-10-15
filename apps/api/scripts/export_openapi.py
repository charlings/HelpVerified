"""Write the API's OpenAPI schema to a file, without starting a server (B7, packages/contracts).

    cd apps/api
    uv run python -m scripts.export_openapi ../../packages/contracts/openapi.json

The schema doesn't depend on settings, but building the app reads them, so `.env` (or the CI env) must be
complete. Keys are sorted so the file only changes when the API does. Usually run through the root
script `pnpm contracts:generate`, which also regenerates the TypeScript types.
"""

import json
import sys
from pathlib import Path

from app.main import create_app


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: python -m scripts.export_openapi <output.json>")
        return 2
    schema = create_app().openapi()
    out = Path(sys.argv[1])
    text = json.dumps(schema, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    out.write_text(text, encoding="utf-8", newline="\n")  # LF on Windows too, so CI's diff check matches
    print(f"Wrote {out} ({len(schema.get('paths', {}))} paths)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
