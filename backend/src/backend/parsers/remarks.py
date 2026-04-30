from pathlib import Path

import yaml

from backend.schemas.analyze import Remark


class RemarksLoader(yaml.SafeLoader):
    pass


def _construct_tagged_mapping(
    loader: yaml.SafeLoader,
    _tag_suffix: str,
    node: yaml.nodes.Node,
) -> dict[str, object]:
    return loader.construct_mapping(node, deep=True)


RemarksLoader.add_multi_constructor("!", _construct_tagged_mapping)


def _stringify_argument(argument: object) -> str:
    if isinstance(argument, dict):
        for key in ("String", "DebugLoc", "Value", "Caller", "Callee"):
            value = argument.get(key)
            if isinstance(value, str) and value:
                return value
        return ", ".join(f"{name}={value}" for name, value in argument.items())
    return str(argument)


def _build_message(document: dict) -> str:
    message = document.get("Message")
    if isinstance(message, str) and message.strip():
        return message

    args = document.get("Args", [])
    if isinstance(args, list) and args:
        parts = [_stringify_argument(argument) for argument in args]
        return " ".join(part for part in parts if part)

    return document.get("Name", "analysis remark")


def parse_remarks_documents(remarks_path: Path) -> list[Remark]:
    if not remarks_path.exists():
        return []

    with remarks_path.open("r", encoding="utf-8") as handle:
        documents = list(yaml.load_all(handle, Loader=RemarksLoader))

    remarks: list[Remark] = []
    for document in documents:
        if not isinstance(document, dict):
            continue

        debug_location = document.get("DebugLoc") or {}
        remarks.append(
            Remark(
                kind=document.get("RemarkType", "Analysis"),
                pass_name=document.get("Pass", "energy"),
                function=document.get("Function", "<unknown>"),
                message=_build_message(document),
                file=debug_location.get("File"),
                line=debug_location.get("Line"),
                column=debug_location.get("Column"),
                metadata=document,
            )
        )

    return remarks
