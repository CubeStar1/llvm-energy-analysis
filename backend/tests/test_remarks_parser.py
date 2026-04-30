from pathlib import Path

from backend.parsers.remarks import parse_remarks_documents


def test_parse_remarks_documents(tmp_path: Path) -> None:
    remarks_path = tmp_path / "remarks.yaml"
    remarks_path.write_text(
        """--- !Analysis
Pass:            energy
Name:            WeightedEnergy
Function:        main
DebugLoc:
  File:          sample.cpp
  Line:          7
  Column:        3
Args:
  - String:      "weighted energy"
  - Value:       "4.2"
""",
        encoding="utf-8",
    )

    remarks = parse_remarks_documents(remarks_path)

    assert len(remarks) == 1
    assert remarks[0].pass_name == "energy"
    assert remarks[0].line == 7
    assert "weighted energy" in remarks[0].message
