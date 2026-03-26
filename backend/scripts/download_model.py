import hashlib
import os
import shutil
from collections.abc import Iterable
from pathlib import Path

import httpx
from huggingface_hub import snapshot_download

MODEL_DOWNLOADS = {
    "u2net": {
        "filename": "u2net.onnx",
        "url": "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx",
        "md5": "60024c5c889badc19c04ad937298a77b",
    },
    "u2netp": {
        "filename": "u2netp.onnx",
        "url": "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx",
        "md5": "8e83ca70e441ab06c318d82300c84806",
    },
    "isnet-general-use": {
        "filename": "isnet-general-use.onnx",
        "url": "https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx",
        "md5": "fc16ebd8b0c10d971d3513d564d01e29",
    },
}
MODEL_ALIASES = {"isnet": "isnet-general-use", "birefnet_lite": "birefnet-lite"}
# HuggingFace repos for models not in MODEL_DOWNLOADS
HUGGINGFACE_REPOS = {
    "birefnet-lite": "ZhengPeng7/BiRefNet_lite",
}
DEFAULT_MODEL_DIR = Path("backend/.cache/models/u2netp")
DEFAULT_MODEL_NAME = "u2netp"
DEFAULT_PRELOAD_MODELS = ("u2netp", "isnet-general-use", "birefnet-lite")
DEFAULT_CACHE_DIR = Path(".cache/model-downloads")


def file_md5(path: Path) -> str:
    digest = hashlib.md5()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download_file(url: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with httpx.stream("GET", url, follow_redirects=True, timeout=httpx.Timeout(120.0, connect=30.0)) as response:
        response.raise_for_status()
        with destination.open("wb") as handle:
            for chunk in response.iter_bytes():
                if chunk:
                    handle.write(chunk)


def parse_env_file(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}

    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def get_config_value(name: str, defaults: dict[str, str], fallback: str) -> str:
    return os.environ.get(name) or defaults.get(name) or fallback


def normalize_model_name(model_name: str) -> str:
    normalized = MODEL_ALIASES.get(model_name.strip().lower(), model_name.strip().lower())
    if normalized.endswith("/birefnet_lite-onnx") or normalized.endswith("/birefnet-lite-onnx"):
        return "birefnet-lite"
    return normalized


def parse_model_list(raw_value: str | None) -> list[str]:
    if not raw_value:
        return []
    return [normalize_model_name(item) for item in raw_value.split(",") if item.strip()]


def unique_in_order(values: Iterable[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def download_direct_model(model_name: str, target_dir: Path, cache_dir: Path) -> None:
    spec = MODEL_DOWNLOADS[model_name]
    destination = target_dir / spec["filename"]
    cache_path = cache_dir / spec["filename"]

    if destination.exists() and file_md5(destination) == spec["md5"]:
        print(f"Using existing {model_name} model at {destination}")
        return

    cache_path.parent.mkdir(parents=True, exist_ok=True)
    if not cache_path.exists() or file_md5(cache_path) != spec["md5"]:
        print(f"Downloading {model_name} model to cache {cache_path}")
        download_file(spec["url"], cache_path)
        checksum = file_md5(cache_path)
        if checksum != spec["md5"]:
            cache_path.unlink(missing_ok=True)
            raise RuntimeError(f"Checksum mismatch for {cache_path.name}: expected {spec['md5']}, got {checksum}")

    target_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(cache_path, destination)
    print(f"Copied {model_name} into {destination}")


def download_huggingface_model(model_name: str, target_dir: Path, cache_dir: Path) -> None:
    repo_id = HUGGINGFACE_REPOS.get(model_name, model_name)
    target_dir.mkdir(parents=True, exist_ok=True)
    snapshot_download(
        repo_id=repo_id,
        local_dir=target_dir,
        local_dir_use_symlinks=False,
        cache_dir=cache_dir / "huggingface",
    )
    print(f"Downloaded {repo_id} into {target_dir}")


def resolve_download_targets(model_name: str, model_dir: Path, preload_models: list[str]) -> list[tuple[str, Path]]:
    root_dir = model_dir.parent
    requested_models = unique_in_order([model_name, *preload_models])
    targets: list[tuple[str, Path]] = []

    for requested_model in requested_models:
        target_dir = model_dir if requested_model == model_name else root_dir / requested_model
        targets.append((requested_model, target_dir))

    return targets


def main() -> None:
    env_defaults = parse_env_file(Path(".env"))
    model_name = normalize_model_name(get_config_value("STICKIFY_MODEL_NAME", env_defaults, DEFAULT_MODEL_NAME))
    model_dir = Path(get_config_value("STICKIFY_MODEL_DIR", env_defaults, str(DEFAULT_MODEL_DIR)))
    cache_dir = Path(get_config_value("STICKIFY_MODEL_CACHE_DIR", env_defaults, str(DEFAULT_CACHE_DIR)))
    preload_models = parse_model_list(
        get_config_value("STICKIFY_PRELOAD_MODELS", env_defaults, ",".join(DEFAULT_PRELOAD_MODELS))
    )

    for requested_model, target_dir in resolve_download_targets(model_name, model_dir, preload_models):
        if requested_model in MODEL_DOWNLOADS:
            download_direct_model(requested_model, target_dir, cache_dir)
            continue

        download_huggingface_model(requested_model, target_dir, cache_dir)


if __name__ == "__main__":
    main()
