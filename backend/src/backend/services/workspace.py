from contextlib import contextmanager
from pathlib import Path
from tempfile import TemporaryDirectory


@contextmanager
def analysis_workspace() -> Path:
    with TemporaryDirectory(prefix="energy-analyzer-") as directory:
        yield Path(directory)
