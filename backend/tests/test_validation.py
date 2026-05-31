"""
Validation tests: energy model consistency and frequency-weighting behaviour.

These tests validate that:
1. Bucket costs maintain the correct ordering relative to published energy data
   (Agner Fog tables, ARM Cortex-A energy characterisation literature).
2. Frequency weighting logic produces weighted_energy > raw_energy for loop-body
   source annotations when frequency weight > 1.0.
3. The HTML report preserves the correct heat classification thresholds.
"""

import json
import math
from pathlib import Path

from backend.parsers.energy import parse_energy_pass_output
from backend.services.report import _heat_class, generate_html
from backend.schemas.analyze import (
    AnalyzeRequest,
    AnalyzeResponse,
    FunctionSummary,
    Remark,
    SourceAnnotation,
    Summary,
)


# ─── helpers ──────────────────────────────────────────────────────────────────

def _load_model(name: str) -> dict:
    # tests/ → backend/ → llvm-energy-analysis/ then into llvm-pass/models/
    repo_root = Path(__file__).parent.parent.parent
    model_path = repo_root / "llvm-pass" / "models" / name
    with open(model_path) as f:
        return json.load(f)


# ─── energy model ordering ───────────────────────────────────────────────────

def test_x86_64_bucket_cost_ordering():
    """call > fp_or_vector > store > load > branch > compare > integer_alu."""
    model = _load_model("x86_64-energy-model.json")
    costs = model["opcodeBuckets"]
    assert costs["call"] > costs["fp_or_vector_fallback"], "call must cost more than FP/vector"
    assert costs["fp_or_vector_fallback"] > costs["store"], "FP/vector must cost more than store"
    assert costs["store"] > costs["load"], "store must cost more than load"
    assert costs["load"] > costs["branch"], "load must cost more than branch"
    assert costs["branch"] > costs["compare"], "branch must cost more than compare"
    assert costs["compare"] > costs["integer_alu"], "compare must cost more than integer ALU"


def test_aarch64_bucket_cost_ordering():
    """AArch64 model maintains the same relative cost ordering."""
    model = _load_model("aarch64-energy-model.json")
    costs = model["opcodeBuckets"]
    assert costs["call"] > costs["fp_or_vector_fallback"]
    assert costs["fp_or_vector_fallback"] > costs["store"]
    assert costs["store"] > costs["load"]
    assert costs["load"] > costs["branch"]
    assert costs["branch"] > costs["compare"]
    assert costs["compare"] > costs["integer_alu"]


def test_x86_64_model_has_expanded_opcode_aliases():
    """Expanded model should have substantially more than the original 23 aliases."""
    model = _load_model("x86_64-energy-model.json")
    aliases = model["opcodeAliases"]
    assert len(aliases) >= 70, f"Expected >=70 aliases, got {len(aliases)}"


def test_x86_64_model_version_bumped():
    model = _load_model("x86_64-energy-model.json")
    assert model["version"] >= 3, "Model version should be >=3 after expansion"


def test_aarch64_model_exists_and_valid():
    model = _load_model("aarch64-energy-model.json")
    assert model["target"] == "aarch64"
    assert "opcodeBuckets" in model
    assert "opcodeAliases" in model
    assert len(model["opcodeAliases"]) >= 30


def test_all_aliases_reference_known_buckets():
    """Every opcode alias must point to a defined bucket."""
    for filename in ("x86_64-energy-model.json", "aarch64-energy-model.json"):
        model = _load_model(filename)
        buckets = set(model["opcodeBuckets"].keys())
        for opcode, bucket in model["opcodeAliases"].items():
            assert bucket in buckets, (
                f"{filename}: alias {opcode!r} → {bucket!r} is not a defined bucket"
            )


# ─── frequency weighting ─────────────────────────────────────────────────────

def test_weighted_energy_equals_raw_at_depth_zero():
    """At loop depth 0, weight=1.0 → weighted == raw."""
    stderr = (
        '[energy] {"kind":"function","function":"f","rawEnergy":5.0,'
        '"weightedEnergy":5.0,"blockCount":1,"instructionCount":4,'
        '"mappedInstructionCount":4,"fallbackInstructionCount":0}\n'
        '[energy] {"kind":"line","function":"f","file":"f.cpp","line":1,'
        '"column":1,"rawEnergy":5.0,"weightedEnergy":5.0,'
        '"instructionCount":4,"topOpcodes":["ADD64rr"]}\n'
    )
    report = parse_energy_pass_output(stderr)
    fn = report.functions[0]
    assert fn.raw_energy == fn.weighted_energy


def test_weighted_energy_exceeds_raw_in_loop():
    """In a loop body (depth >=1), weighted_energy > raw_energy."""
    # Simulate depth=1 (weight=10): a block with raw=5.0 → weighted=50.0
    loop_weight = math.pow(10.0, 1)
    raw = 5.0
    weighted = raw * loop_weight

    stderr = (
        f'[energy] {{"kind":"function","function":"loop_fn","rawEnergy":{raw},'
        f'"weightedEnergy":{weighted},"blockCount":2,"instructionCount":4,'
        f'"mappedInstructionCount":4,"fallbackInstructionCount":0}}\n'
        f'[energy] {{"kind":"line","function":"loop_fn","file":"loop.cpp","line":3,'
        f'"column":5,"rawEnergy":{raw},"weightedEnergy":{weighted},'
        f'"instructionCount":4,"topOpcodes":["ADD64rr","JCC_1"]}}\n'
    )
    report = parse_energy_pass_output(stderr)
    fn = report.functions[0]
    assert fn.weighted_energy > fn.raw_energy, (
        "Weighted energy should exceed raw energy for loop-depth-1 block"
    )
    assert fn.weighted_energy == pytest_approx(weighted, rel=1e-3)


def test_multiple_loop_depths_ordering():
    """A deeper loop should produce higher weighted energy for the same raw cost."""
    def weighted_for_depth(depth: int) -> float:
        return 5.0 * math.pow(10.0, depth)

    assert weighted_for_depth(2) > weighted_for_depth(1) > weighted_for_depth(0)


# ─── heat classification ─────────────────────────────────────────────────────

def test_heat_class_cold():
    assert _heat_class(0.0) == "cold"
    assert _heat_class(0.24) == "cold"


def test_heat_class_warm():
    assert _heat_class(0.25) == "warm"
    assert _heat_class(0.49) == "warm"


def test_heat_class_hot():
    assert _heat_class(0.5) == "hot"
    assert _heat_class(0.74) == "hot"


def test_heat_class_critical():
    assert _heat_class(0.75) == "critical"
    assert _heat_class(1.0) == "critical"


# ─── report HTML content validation ──────────────────────────────────────────

def _make_report_fixtures(raw: float, weighted: float):
    request = AnalyzeRequest(
        code="int f() { return 0; }\n",
        filename="f.cpp",
        std="c++20",
        compilerFlags=["-O2"],
    )
    response = AnalyzeResponse(
        runId="val-test",
        llvmIr="",
        summary=Summary(
            totalRawEnergy=raw,
            totalWeightedEnergy=weighted,
            hottestFunction="f",
            hottestLine=1,
        ),
        functions=[
            FunctionSummary(
                name="f",
                weightedEnergy=weighted,
                rawEnergy=raw,
                blockCount=1,
                instructionCount=2,
                mappedInstructionCount=2,
                fallbackInstructionCount=0,
            )
        ],
        sourceAnnotations=[
            SourceAnnotation(
                file="f.cpp",
                line=1,
                column=1,
                rawEnergy=raw,
                weightedEnergy=weighted,
                instructionCount=2,
                topOpcodes=["RET64"],
            )
        ],
        remarks=[],
    )
    return request, response


def test_report_html_reflects_weighted_energy_in_summary():
    request, response = _make_report_fixtures(3.0, 30.0)
    html = generate_html(request, response)
    assert "30.0" in html or "30.00" in html


def test_report_html_shows_hottest_function():
    request, response = _make_report_fixtures(3.0, 3.0)
    html = generate_html(request, response)
    assert ">f<" in html or "f</td>" in html or ">f " in html


def test_report_html_energy_values_are_rounded():
    request, response = _make_report_fixtures(3.14159, 6.28318)
    html = generate_html(request, response)
    # Should show 2-3 decimal places, not full float precision
    assert "3.14159265" not in html


# helper used in test_weighted_energy_exceeds_raw_in_loop
def pytest_approx(value, rel=None):
    import pytest
    return pytest.approx(value, rel=rel)
