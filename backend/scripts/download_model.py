from pathlib import Path

from huggingface_hub import snapshot_download

from backend.app.core.config import get_settings


def main() -> None:
    settings = get_settings()
    model_name = settings.model_name.strip()
    target_dir = Path(settings.model_dir)

    if model_name.lower() == "u2net":
        target_dir.mkdir(parents=True, exist_ok=True)
        print(f"Skipping Hugging Face download for model '{model_name}'.")
        return

    snapshot_download(
        repo_id=model_name,
        local_dir=target_dir,
        local_dir_use_symlinks=False,
    )
    print(f"Downloaded {model_name} into {target_dir}")


if __name__ == "__main__":
    main()
