import sys
from importlib import import_module
from pathlib import Path

service_root = str(Path(__file__).resolve().parents[1])
if service_root not in sys.path:
    sys.path.insert(0, service_root)

app = import_module("tax_service.app").app

__all__ = ["app"]
