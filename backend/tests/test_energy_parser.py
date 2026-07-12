from backend.core.config import Settings
from backend.parsers.energy import parse_energy_pass_output
from backend.services.analyzer import AnalyzerService


def test_parse_energy_pass_output_extracts_functions_and_lines() -> None:
    stderr = "\n".join(
        [
            '[energy] {"kind":"function","function":"main","rawEnergy":8.0,'
            '"weightedEnergy":11.5,"blockCount":3,"instructionCount":9,'
            '"mappedInstructionCount":8,"fallbackInstructionCount":1}',
            '[energy] {"kind":"line","function":"main","file":"main.cpp","line":7,'
            '"column":5,"rawEnergy":3.0,"weightedEnergy":6.0,"instructionCount":2,'
            '"topOpcodes":["ADD64rr","JCC_1"]}',
        ]
    )

    report = parse_energy_pass_output(stderr)

    assert len(report.functions) == 1
    assert report.functions[0].name == "main"
    assert report.functions[0].weighted_energy == 11.5
    assert report.functions[0].mapped_instruction_count == 8

    assert len(report.source_annotations) == 1
    assert report.source_annotations[0].line == 7
    assert report.source_annotations[0].top_opcodes == ["ADD64rr", "JCC_1"]


def _block_record(**overrides: object) -> str:
    import json

    record = {
        "kind": "block",
        "function": "main",
        "block": "",
        "number": 0,
        "successors": [1],
        "rawEnergy": 4.0,
        "weightedEnergy": 4.0,
        "frequencyWeight": 1.0,
        "loopDepth": 0,
        "isLoopHeader": False,
        "instructionCount": 3,
        "mappedInstructionCount": 3,
        "fallbackInstructionCount": 0,
        "file": "main.cpp",
        "line": 3,
        "endLine": 4,
        "topOpcodes": ["JCC_1"],
        "instructions": [
            {"opcode": "JCC_1", "bucket": "branch", "cost": 1.6, "line": 3}
        ],
        "instructionsTruncated": False,
    }
    record.update(overrides)
    return f"[energy] {json.dumps(record)}"


def test_parse_energy_pass_output_extracts_blocks() -> None:
    stderr = "\n".join(
        [
            _block_record(),
            _block_record(
                number=1,
                successors=[1, 2],
                loopDepth=1,
                isLoopHeader=True,
                frequencyWeight=10.0,
                weightedEnergy=42.0,
            ),
        ]
    )

    report = parse_energy_pass_output(stderr)

    assert len(report.blocks) == 2
    entry, loop = report.blocks
    assert entry.successors == [1]
    assert entry.display_name == "%bb.0"  # names are lost at -O2
    assert entry.instructions[0].opcode == "JCC_1"
    assert loop.is_loop_header is True
    assert loop.loop_depth == 1
    assert loop.frequency_weight == 10.0


def test_parse_energy_pass_output_tolerates_blocks_without_cfg_fields() -> None:
    # An EnergyPass.so built before CFG support emits blocks with no
    # number/successors; the analysis must still run, just without a graph.
    stderr = (
        '[energy] {"kind":"block","function":"main","block":"entry",'
        '"rawEnergy":4.0,"weightedEnergy":4.0,"frequencyWeight":1.0,'
        '"instructionCount":3,"mappedInstructionCount":3,'
        '"fallbackInstructionCount":0,"file":"main.cpp","line":3,"column":1}'
    )

    report = parse_energy_pass_output(stderr)

    assert len(report.blocks) == 1
    assert report.blocks[0].successors == []
    assert report.blocks[0].instructions == []
    assert report.blocks[0].display_name == "entry"

    cfg = AnalyzerService(Settings())._build_cfg(report)

    assert len(cfg) == 1
    assert cfg[0].edges == []
    assert cfg[0].blocks[0].name == "entry"


def test_build_cfg_marks_back_edges_and_groups_by_function() -> None:
    stderr = "\n".join(
        [
            _block_record(number=0, successors=[1]),
            _block_record(
                number=1,
                successors=[1, 2],
                loopDepth=1,
                isLoopHeader=True,
                weightedEnergy=42.0,
            ),
            _block_record(number=2, successors=[]),
            _block_record(function="helper", number=0, successors=[]),
        ]
    )

    cfg = AnalyzerService(Settings())._build_cfg(parse_energy_pass_output(stderr))

    assert [entry.function for entry in cfg] == ["main", "helper"]  # hottest first

    main = cfg[0]
    back_edges = [(edge.source, edge.target) for edge in main.edges if edge.isBackEdge]
    forward_edges = [
        (edge.source, edge.target) for edge in main.edges if not edge.isBackEdge
    ]

    assert back_edges == [(1, 1)]  # the loop latch
    assert forward_edges == [(0, 1), (1, 2)]
    assert main.blocks[0].isEntry is True
    assert main.blocks[1].isEntry is False
