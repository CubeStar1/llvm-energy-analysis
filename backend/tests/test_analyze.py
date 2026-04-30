from fastapi.testclient import TestClient

from backend.main import app


client = TestClient(app)


def test_healthz() -> None:
    response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_analyze_returns_contract() -> None:
    response = client.post(
        "/analyze",
        json={
            "code": "int main() {\n  for (int i = 0; i < 4; ++i) {}\n  return 0;\n}\n",
            "filename": "main.cpp",
            "std": "c++20",
            "compilerFlags": ["-O2"],
        },
    )

    payload = response.json()

    assert response.status_code == 200
    assert payload["runId"]
    assert "define i32 @main()" in payload["llvmIr"]
    assert payload["summary"]["hottestFunction"] == "main"
    assert payload["functions"][0]["name"] == "main"
    assert payload["remarks"][0]["pass"] == "energy"
    assert payload["sourceAnnotations"]
