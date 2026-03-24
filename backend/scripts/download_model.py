import hashlib
from pathlib import Path

import httpx
from huggingface_hub import snapshot_download

from backend.app.core.config import get_settings

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
}


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


def main() -> None:
    settings = get_settings()
    model_name = settings.model_name.strip().lower()
    target_dir = Path(settings.model_dir)

    if model_name in MODEL_DOWNLOADS:
        spec = MODEL_DOWNLOADS[model_name]
        destination = target_dir / spec["filename"]
        if destination.exists() and file_md5(destination) == spec["md5"]:
            print(f"Using existing {model_name} model at {destination}")
            return

        print(f"Downloading {model_name} model to {destination}")
        download_file(spec["url"], destination)
        checksum = file_md5(destination)
        if checksum != spec["md5"]:
            destination.unlink(missing_ok=True)
            raise RuntimeError(f"Checksum mismatch for {destination.name}: expected {spec['md5']}, got {checksum}")
        print(f"Downloaded {model_name} into {destination}")
        return

    snapshot_download(
        repo_id=settings.model_name.strip(),
        local_dir=target_dir,
        local_dir_use_symlinks=False,
    )
    print(f"Downloaded {settings.model_name.strip()} into {target_dir}")


if __name__ == "__main__":
    main()
