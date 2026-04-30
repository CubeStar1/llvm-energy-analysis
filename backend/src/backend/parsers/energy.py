from __future__ import annotations

import json
from dataclasses import dataclass, field


ENERGY_PREFIX = "[energy] "


@dataclass(slots=True)
class ParsedFunctionEnergy:
    name: str
    raw_energy: float
    weighted_energy: float
    block_count: int
    instruction_count: int
    mapped_instruction_count: int
    fallback_instruction_count: int


@dataclass(slots=True)
class ParsedSourceAnnotation:
    function: str
    file: str
    line: int
    column: int
    raw_energy: float
    weighted_energy: float
    instruction_count: int
    top_opcodes: list[str] = field(default_factory=list)


@dataclass(slots=True)
class ParsedEnergyReport:
    functions: list[ParsedFunctionEnergy] = field(default_factory=list)
    source_annotations: list[ParsedSourceAnnotation] = field(default_factory=list)


def parse_energy_pass_output(stderr: str) -> ParsedEnergyReport:
    report = ParsedEnergyReport()

    for raw_line in stderr.splitlines():
        line = raw_line.strip()
        if not line.startswith(ENERGY_PREFIX):
            continue

        payload = line.removeprefix(ENERGY_PREFIX).strip()
        if not payload.startswith("{"):
            continue

        try:
            record = json.loads(payload)
        except json.JSONDecodeError:
            continue

        kind = record.get("kind")
        if kind == "function":
            function_name = _as_text(record.get("function"))
            if not function_name:
                continue
            report.functions.append(
                ParsedFunctionEnergy(
                    name=function_name,
                    raw_energy=_as_float(record.get("rawEnergy")),
                    weighted_energy=_as_float(record.get("weightedEnergy")),
                    block_count=_as_int(record.get("blockCount")),
                    instruction_count=_as_int(record.get("instructionCount")),
                    mapped_instruction_count=_as_int(
                        record.get("mappedInstructionCount")
                    ),
                    fallback_instruction_count=_as_int(
                        record.get("fallbackInstructionCount")
                    ),
                )
            )
            continue

        if kind == "line":
            source_file = _as_text(record.get("file"))
            function_name = _as_text(record.get("function"))
            line_number = _as_int(record.get("line"))
            if not source_file or not function_name or line_number <= 0:
                continue
            top_opcodes = record.get("topOpcodes")
            report.source_annotations.append(
                ParsedSourceAnnotation(
                    function=function_name,
                    file=source_file,
                    line=line_number,
                    column=max(_as_int(record.get("column")), 1),
                    raw_energy=_as_float(record.get("rawEnergy")),
                    weighted_energy=_as_float(record.get("weightedEnergy")),
                    instruction_count=_as_int(record.get("instructionCount")),
                    top_opcodes=_as_text_list(top_opcodes),
                )
            )

    report.functions.sort(key=lambda item: item.weighted_energy, reverse=True)
    report.source_annotations.sort(
        key=lambda item: (item.weighted_energy, -item.line),
        reverse=True,
    )
    return report


def _as_float(value: object) -> float:
    if isinstance(value, bool):
        return float(value)
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return 0.0
    return 0.0


def _as_int(value: object) -> int:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        try:
            return int(value)
        except ValueError:
            return 0
    return 0


def _as_text(value: object) -> str:
    return value if isinstance(value, str) else ""


def _as_text_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str)]
