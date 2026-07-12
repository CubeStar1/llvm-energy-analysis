from pydantic import BaseModel, Field


class AnalyzeRequest(BaseModel):
    code: str = Field(min_length=1)
    filename: str = "main.cpp"
    std: str = "c++20"
    compilerFlags: list[str] = Field(default_factory=lambda: ["-O2"])


class FunctionSummary(BaseModel):
    name: str
    weightedEnergy: float
    rawEnergy: float
    blockCount: int
    instructionCount: int = 0
    mappedInstructionCount: int = 0
    fallbackInstructionCount: int = 0


class SourceAnnotation(BaseModel):
    file: str
    line: int
    column: int = 1
    rawEnergy: float = 0.0
    weightedEnergy: float
    instructionCount: int
    topOpcodes: list[str] = Field(default_factory=list)


class BlockInstruction(BaseModel):
    opcode: str
    bucket: str = ""
    cost: float = 0.0
    line: int = 0


class CfgBlock(BaseModel):
    id: int
    name: str
    rawEnergy: float = 0.0
    weightedEnergy: float = 0.0
    frequencyWeight: float = 1.0
    loopDepth: int = 0
    isLoopHeader: bool = False
    isEntry: bool = False
    instructionCount: int = 0
    mappedInstructionCount: int = 0
    fallbackInstructionCount: int = 0
    line: int = 0
    endLine: int = 0
    topOpcodes: list[str] = Field(default_factory=list)
    instructions: list[BlockInstruction] = Field(default_factory=list)
    instructionsTruncated: bool = False


class CfgEdge(BaseModel):
    source: int
    target: int
    isBackEdge: bool = False


class CfgFunction(BaseModel):
    function: str
    weightedEnergy: float = 0.0
    blocks: list[CfgBlock] = Field(default_factory=list)
    edges: list[CfgEdge] = Field(default_factory=list)


class AstNode(BaseModel):
    id: str
    kind: str
    label: str = ""
    detail: str = ""
    line: int = 0
    column: int = 0
    endLine: int = 0
    selfEnergy: float = 0.0
    subtreeEnergy: float = 0.0
    truncated: bool = False
    children: list["AstNode"] = Field(default_factory=list)


class Remark(BaseModel):
    kind: str
    pass_name: str = Field(serialization_alias="pass", validation_alias="pass_name")
    function: str
    message: str
    file: str | None = None
    line: int | None = None
    column: int | None = None
    metadata: dict[str, object] = Field(default_factory=dict)


class Summary(BaseModel):
    totalRawEnergy: float = 0.0
    totalWeightedEnergy: float
    hottestFunction: str | None = None
    hottestLine: int | None = None


class AnalyzeResponse(BaseModel):
    runId: str
    llvmIr: str
    summary: Summary
    functions: list[FunctionSummary]
    sourceAnnotations: list[SourceAnnotation]
    remarks: list[Remark]
    cfg: list[CfgFunction] = Field(default_factory=list)
    ast: AstNode | None = None


class HealthResponse(BaseModel):
    status: str
