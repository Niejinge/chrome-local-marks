"""Build the Chrome Web Store ZIP from runtime files only."""

import json
import pathlib
import zipfile


ROOT = pathlib.Path(__file__).resolve().parent
RELEASE_FILES = (
    "manifest.json",
    "content.js",
    "background.js",
    "popup.js",
    "popup.html",
    "popup.css",
    "backup.js",
    "icons/icon16.png",
    "icons/icon32.png",
    "icons/icon48.png",
    "icons/icon128.png",
)


def main():
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    output_dir = ROOT / "dist"
    output_dir.mkdir(exist_ok=True)
    output = output_dir / f"chrome-local-marks-release-{manifest['version']}.zip"
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for relative in RELEASE_FILES:
            source = ROOT / relative
            if not source.is_file():
                raise FileNotFoundError(source)
            archive.write(source, arcname=relative)
    print(output)


if __name__ == "__main__":
    main()
