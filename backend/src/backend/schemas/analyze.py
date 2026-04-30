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


class HealthResponse(BaseModel):
    status: str
