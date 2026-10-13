"""Build the extension ZIP from runtime files and its license."""

import json
import pathlib
import shutil
import zipfile


ROOT = pathlib.Path(__file__).resolve().parent
RELEASE_FILES = (
    "LICENSE",
    "manifest.json",
    "content.js",
    "record-groups.js",
    "mark-styles.js",
    "ui.js",
    "record-store.js",
    "store-client.js",
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
    # A checkout may already be loaded in Chrome; Python's cache name is
    # reserved by Chrome even though these files are excluded from releases.
    cache_dir = ROOT / "__pycache__"
    if cache_dir.is_dir() and not cache_dir.is_symlink():
        shutil.rmtree(cache_dir)
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
