"""Build the Chrome Web Store ZIP from runtime files only."""

import json
import pathlib
import shutil
import zipfile


ROOT = pathlib.Path(__file__).resolve().parent
RELEASE_FILES = (
    "manifest.json",
    "content.js",
    "record-groups.js",
    "mark-styles.js",
    "background.js",
    "popup.js",
    "sidepanel.js",
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
    install_dir = output_dir / "chrome-local-marks-unpacked"
    staging_dir = output_dir / ".chrome-local-marks-unpacked.tmp"
    if staging_dir.exists():
        shutil.rmtree(staging_dir)
    staging_dir.mkdir()
    for relative in RELEASE_FILES:
        source = ROOT / relative
        if not source.is_file():
            raise FileNotFoundError(source)
        destination = staging_dir / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
    if install_dir.exists():
        shutil.rmtree(install_dir)
    staging_dir.replace(install_dir)

    output = output_dir / f"chrome-local-marks-release-{manifest['version']}.zip"
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for relative in RELEASE_FILES:
            source = ROOT / relative
            archive.write(source, arcname=relative)
    print(f"开发者模式目录：{install_dir}")
    print(f"发布压缩包：{output}")


if __name__ == "__main__":
    main()
