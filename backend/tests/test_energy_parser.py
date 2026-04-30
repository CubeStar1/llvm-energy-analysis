from backend.parsers.energy import parse_energy_pass_output


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
