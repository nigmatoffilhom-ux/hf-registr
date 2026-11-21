#!/usr/bin/env python3
"""_effektlar/ulash.py dagi mavjud HTML bloklardan HyperFrames registri yaratadi."""

from __future__ import annotations

import argparse
import importlib.util
import json
import re
import shutil
import sys
from pathlib import Path
from typing import Any


HERE = Path(__file__).resolve().parent
SOURCE = HERE.parent
ULASH_PATH = SOURCE / "ulash.py"

SCHEMA_REGISTRY = "https://hyperframes.heygen.com/schema/registry.json"
SCHEMA_ITEM = "https://hyperframes.heygen.com/schema/registry-item.json"
AUTHOR = "hf-registr"

DESCRIPTIONS = {
    "subtitr-3d": "Subtitrlarni 3D ko'rinishda animatsiya bilan chiqaruvchi blok.",
    "subtitr-kinetik": "Kinetik matn harakati bilan subtitr chiqaruvchi blok.",
    "sarlavha-3d": "Three.js asosidagi 3D sarlavha animatsiyasi; internet va CDN kerak.",
    "sarlavha-kinetik": "Kinetik tipografiya bilan sarlavha ochilish bloki.",
    "lower-third": "Ism, lavozim yoki qisqa izoh uchun pastki ekran yozuvi.",
    "ai-belgi": "AI mavzusidagi belgili vizual blok.",
    "ikonka": "Lokal SVG belgilar to'plamidan foydalanadigan ikonka bloki.",
    "3d-mini": "Three.js yordamida 3D model ko'rsatadigan blok; model va vendor fayllari ham qo'shiladi.",
    "wire-neon": "Neon wireframe 3D shakllari: kub, shar, tor, konus, huni, Mobius, to'lqin, spiral va parametrik shakl.",
    "zarra-morf": "Zarralarning shaklga yig'ilishi va morfing animatsiyasi.",
    "uslub-sahna": "Sahna uchun rang va ko'rinish uslubini beradigan blok.",
    "formula": "LaTeX yozuvidan matematik formulalarni chiqaradigan blok; KaTeX fayllari bilan.",
    "hud-panel": "Sahnaga HUD ko'rsatkich panelini qo'shadigan blok.",
    "bob-shablon": "Sarlavha, matn va vizual qatlamlar uchun bob sahnasi shabloni.",
    "cta-kalit": "Yakuniy chaqiriq yoki kalit xabarni ko'rsatadigan blok.",
    "pop-subtitr": "Urg'u va pop animatsiyasi bilan subtitr chiqaruvchi blok.",
    "geo": "Geometrik chizma va matematik shakllarni ko'rsatadigan blok.",
    "maska-blok": "GSAP maska va shakl animatsiyalari uchun namuna blok.",
    "shader": "Oldingi qatlamga WebGL shader va rang LUT qo'llaydigan blok; HyperFrames 0.9.72 bilan.",
}

TAGS = {
    "subtitr-3d": ["captions", "text", "3d"],
    "subtitr-kinetik": ["captions", "text", "kinetic"],
    "sarlavha-3d": ["title", "text", "3d"],
    "sarlavha-kinetik": ["title", "text", "kinetic"],
    "lower-third": ["lower-third", "text", "overlay"],
    "ai-belgi": ["ai", "icon", "title"],
    "ikonka": ["icon", "svg", "overlay"],
    "3d-mini": ["3d", "model", "threejs"],
    "wire-neon": ["3d", "wireframe", "neon"],
    "zarra-morf": ["3d", "particles", "morph"],
    "uslub-sahna": ["style", "scene", "color"],
    "formula": ["math", "formula", "latex"],
    "hud-panel": ["hud", "overlay", "interface"],
    "bob-shablon": ["scene", "template", "text"],
    "cta-kalit": ["cta", "title", "text"],
    "pop-subtitr": ["captions", "text", "pop"],
    "geo": ["geometry", "math", "diagram"],
    "maska-blok": ["mask", "transition", "gsap"],
    "shader": ["shader", "color-grading", "webgl"],
    "exploded-view": ["3d", "exploded-view", "labels"],
    "kamera-yol": ["3d", "camera", "motion"],
    "halftone-reveal": ["reveal", "halftone", "transition"],
    "ui-mockup": ["ui", "phone", "interface"],
}

TITLES = {
    "ai-belgi": "AI Belgi",
    "hud-panel": "HUD Panel",
    "ui-mockup": "UI Mockup",
    "cta-kalit": "CTA Kalit",
}

EXCLUDED_FILES = {".DS_Store", "README.md", "package.json"}
EXCLUDED_DIRS = {".hyperframes", "__pycache__", "sinov", "namuna"}


def load_ulash() -> Any:
    if not ULASH_PATH.is_file():
        raise SystemExit(f"manba topilmadi: {ULASH_PATH}")
    spec = importlib.util.spec_from_file_location("effektlar_ulash", ULASH_PATH)
    if spec is None or spec.loader is None:
        raise SystemExit(f"ulash.py ni o'qib bo'lmadi: {ULASH_PATH}")
    module = importlib.util.module_from_spec(spec)
    old_dont_write_bytecode = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    try:
        spec.loader.exec_module(module)
    finally:
        sys.dont_write_bytecode = old_dont_write_bytecode
    return module


def is_generated_noise(path: Path) -> bool:
    if any(part in EXCLUDED_DIRS for part in path.parts):
        return True
    if path.name in EXCLUDED_FILES:
        return True
    if path.suffix == ".py" or path.suffix == ".pyc":
        return True
    if path.name in {"namuna.html", "namuna.mp4", "namuna-fx.mp4"}:
        return True
    if path.name.startswith("sinov-") and path.suffix == ".html":
        return True
    return False


def declared_files(block: dict[str, Any], source_root: Path) -> list[Path]:
    files: set[Path] = set()
    for declared in block.get("papka", []):
        source = (source_root / declared).resolve()
        if not source.is_relative_to(source_root.resolve()):
            raise SystemExit(f"manba papkadan tashqariga chiqdi: {declared}")
        if not source.exists():
            raise SystemExit(f"ulash.py dagi kerakli manba yo'q: {declared}")
        candidates = [source] if source.is_file() else source.rglob("*")
        for candidate in candidates:
            if not candidate.is_file():
                continue
            resolved = candidate.resolve()
            if not resolved.is_relative_to(source_root.resolve()):
                raise SystemExit(f"manba papkadan tashqariga chiqdi: {candidate}")
            rel = resolved.relative_to(source_root.resolve())
            if not is_generated_noise(rel):
                files.add(rel)
    return sorted(files, key=lambda p: p.as_posix())


def block_metadata(name: str, html_path: Path) -> tuple[dict[str, int], float, str]:
    markup = html_path.read_text(encoding="utf-8", errors="replace")
    live_markup = re.sub(r"<!--.*?-->", "", markup, flags=re.S)
    root = re.search(r"<[^>]*\bdata-composition-id=(['\"])[^'\"]+\1[^>]*>", live_markup, re.I)
    if not root:
        raise SystemExit(f"data-composition-id ildizi topilmadi: {html_path}")
    attrs = root.group(0)

    def attr(key: str) -> str:
        match = re.search(rf"\b{re.escape(key)}=(['\"])([^'\"]+)\1", attrs, re.I)
        # Ko'p manba fayllarida host uchun o'lcham va davomiylik tavsiyasi
        # HTML izohidagi ulash namunasi ichida berilgan.
        if not match:
            match = re.search(rf"\b{re.escape(key)}=(['\"])([^'\"]+)\1", markup, re.I)
        if not match:
            raise SystemExit(f"{key} topilmadi: {html_path}")
        return match.group(2)

    try:
        width = int(attr("data-width"))
        height = int(attr("data-height"))
        duration = float(attr("data-duration"))
    except ValueError as exc:
        raise SystemExit(f"o'lcham yoki davomiylik noto'g'ri: {html_path}: {exc}")
    if width < 1 or height < 1 or duration <= 0:
        raise SystemExit(f"o'lcham/davomiylik musbat bo'lishi kerak: {html_path}")
    return {"width": width, "height": height}, duration, markup


def title_for(name: str) -> str:
    return TITLES.get(name, name.replace("-", " ").title())


def generate(homepage: str) -> tuple[list[str], list[str]]:
    source_root = SOURCE.resolve()
    ulash = load_ulash()
    blocks: dict[str, dict[str, Any]] = ulash.BLOKLAR
    registry_items: list[dict[str, str]] = []
    included: list[str] = []
    skipped: list[str] = []
    previous_names: set[str] = set()
    old_registry_path = HERE / "registry.json"
    if old_registry_path.is_file():
        try:
            old_registry = json.loads(old_registry_path.read_text(encoding="utf-8"))
            previous_names = {
                item["name"]
                for item in old_registry.get("items", [])
                if item.get("type") == "hyperframes:block" and isinstance(item.get("name"), str)
            }
        except (json.JSONDecodeError, AttributeError, TypeError):
            previous_names = set()

    for name, block in blocks.items():
        main_file = block.get("fayl")
        if not main_file:
            continue
        main_source = source_root / main_file
        if not main_source.is_file():
            skipped.append(name)
            continue

        copied = declared_files(block, source_root)
        main_rel = Path(main_file)
        if main_rel not in copied:
            copied.append(main_rel)
            copied.sort(key=lambda p: p.as_posix())
        dimensions, duration, _ = block_metadata(name, main_source)

        item_dir = HERE / "blocks" / name
        if item_dir.exists():
            shutil.rmtree(item_dir)
        item_dir.mkdir(parents=True, exist_ok=True)
        manifest_files = []
        for rel in copied:
            destination = item_dir / rel
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source_root / rel, destination)
            manifest_files.append(
                {
                    "path": rel.as_posix(),
                    "target": f"compositions/{rel.as_posix()}",
                    "type": "hyperframes:composition" if rel == main_rel else "hyperframes:asset",
                }
            )

        manifest = {
            "$schema": SCHEMA_ITEM,
            "name": name,
            "type": "hyperframes:block",
            "title": title_for(name),
            "description": DESCRIPTIONS.get(name) or block.get("izoh") or f"_effektlar kutubxonasidagi {name} bloki.",
            "tags": TAGS.get(name, ["visual", "effect"]),
            "author": AUTHOR,
            "dimensions": dimensions,
            "duration": duration,
            "files": manifest_files,
        }
        (item_dir / "registry-item.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        registry_items.append({"name": name, "type": "hyperframes:block"})
        included.append(name)

    for stale_name in previous_names.difference(included):
        stale_dir = HERE / "blocks" / stale_name
        if stale_dir.is_dir():
            shutil.rmtree(stale_dir)

    registry = {
        "$schema": SCHEMA_REGISTRY,
        "name": "hf-registr",
        "homepage": homepage,
        "items": registry_items,
    }
    (HERE / "registry.json").write_text(
        json.dumps(registry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return included, skipped


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--homepage",
        default="https://github.com/nigmatoffilhom-ux/hf-registr",
        help="registry.json dagi homepage; standart: GitHub repo",
    )
    args = parser.parse_args()
    included, skipped = generate(args.homepage)
    print(f"{len(included)} ta blok yozildi: {HERE}")
    print("Kiritildi: " + ", ".join(included))
    if skipped:
        print("Manba HTML yo'qligi sabab o'tkazildi: " + ", ".join(skipped))
    print("Faqat papka ichidagi nusxalar yangilandi; asl manba fayllar o'zgartirilmadi.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
