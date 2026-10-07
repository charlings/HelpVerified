from fastapi.testclient import TestClient


def test_health_returns_ok(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_docs_and_openapi_load(client: TestClient) -> None:
    assert client.get("/docs").status_code == 200

    schema = client.get("/openapi.json").json()
    assert schema["info"]["title"] == "HelpVerified API"
    assert "/health" in schema["paths"]


def test_cors_allows_the_web_origin(client: TestClient) -> None:
    response = client.get("/health", headers={"Origin": "http://localhost:3000"})

    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert response.headers["access-control-allow-credentials"] == "true"


def test_cors_ignores_other_origins(client: TestClient) -> None:
    response = client.get("/health", headers={"Origin": "https://evil.example"})

    assert "access-control-allow-origin" not in response.headers
