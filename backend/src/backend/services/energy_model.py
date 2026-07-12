import json
import logging
from functools import lru_cache
from pathlib import Path

from backend.core.config import Settings, get_settings
from backend.schemas.analyze import EnergyBucket, EnergyModelResponse

logger = logging.getLogger(__name__)

# How many opcodes to name per bucket in the UI — enough to make the bucket
# concrete without turning the table into the full ~110-entry alias list.
EXAMPLE_OPCODE_COUNT = 4


def load_energy_model(settings: Settings) -> EnergyModelResponse:
    """Read the same model JSON the LLVM pass is given.

    Serving this rather than duplicating the costs in the frontend means the
    table in the UI cannot drift from the numbers the analysis actually used —
    including when the model is swapped via ENERGY_ANALYZER_ENERGY_MODEL_PATH.
    """
    path = Path(settings.energy_model_path)
    raw = json.loads(path.read_text(encoding="utf-8"))

    bucket_costs: dict[str, float] = raw.get("opcodeBuckets", {})
    aliases: dict[str, str] = raw.get("opcodeAliases", {})

    opcodes_by_bucket: dict[str, list[str]] = {}
    for opcode, bucket in aliases.items():
        opcodes_by_bucket.setdefault(bucket, []).append(opcode)

    buckets = [
        EnergyBucket(
            name=name,
            cost=float(cost),
            opcodeCount=len(opcodes_by_bucket.get(name, [])),
            exampleOpcodes=sorted(opcodes_by_bucket.get(name, []))[
                :EXAMPLE_OPCODE_COUNT
            ],
        )
        for name, cost in bucket_costs.items()
    ]
    buckets.sort(key=lambda bucket: bucket.cost)

    return EnergyModelResponse(
        target=raw.get("target", "unknown"),
        version=int(raw.get("version", 0)),
        defaultFallbackCost=float(raw.get("defaultFallbackCost", 1.0)),
        buckets=buckets,
        aliasCount=len(aliases),
    )


@lru_cache(maxsize=1)
def get_energy_model() -> EnergyModelResponse:
    return load_energy_model(get_settings())
