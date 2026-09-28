from typing import Any, Sequence

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from backend.app.config import Settings
from backend.app.main import create_app
from backend.app.services.model_service import (
    DetectionResult,
    InferenceResult,
    ModelInfo,
    UnsupportedClassesError,
)


class FakeModelService:
    """API testlerinde agir YOLO modelinin yerine gecen hizli sahte servis."""

    available_classes = ((0, "person"), (2, "car"))

    def info(self) -> ModelInfo:
        return ModelInfo(
            model="fake-model.pt",
            device="cpu",
            loaded=True,
            status="ready",
        )

    def infer(
        self, image: Any, confidence: float, selected_classes: Sequence[str]
    ) -> InferenceResult:
        supported = {name for _, name in self.available_classes}
        unsupported = [name for name in selected_classes if name not in supported]
        if unsupported:
            raise UnsupportedClassesError(unsupported)
        return InferenceResult(
            frame_width=1280,
            frame_height=720,
            inference_ms=12.5,
            detections=(
                DetectionResult(
                    class_id=0,
                    class_name="person",
                    confidence=0.91,
                    x1=120,
                    y1=80,
                    x2=380,
                    y2=690,
                ),
            ),
        )


@pytest.fixture()
def client() -> TestClient:
    settings = Settings(max_upload_bytes=16, max_image_pixels=100)
    app = create_app(
        settings=settings,
        model_service=FakeModelService(),
        image_decoder=lambda content, max_pixels: object(),
    )
    return TestClient(app)


def test_health_does_not_require_model_inference(client: TestClient) -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_model_and_classes_endpoints(client: TestClient) -> None:
    model_response = client.get("/api/model")
    classes_response = client.get("/api/classes")

    assert model_response.status_code == 200
    assert model_response.json()["status"] == "ready"
    assert classes_response.json() == [
        {"class_id": 0, "class_name": "person"},
        {"class_id": 2, "class_name": "car"},
    ]


def test_image_detection_returns_expected_contract(client: TestClient) -> None:
    response = client.post(
        "/api/detections/image",
        files={"file": ("frame.jpg", b"fake-jpeg", "image/jpeg")},
        data={"confidence": "0.4", "classes": "person,person"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "frame_width": 1280,
        "frame_height": 720,
        "inference_ms": 12.5,
        "detections": [
            {
                "class_id": 0,
                "class_name": "person",
                "confidence": 0.91,
                "x1": 120,
                "y1": 80,
                "x2": 380,
                "y2": 690,
            }
        ],
    }


@pytest.mark.parametrize("confidence", ["0", "1.01", "not-a-number"])
def test_invalid_confidence_is_rejected(
    client: TestClient, confidence: str
) -> None:
    response = client.post(
        "/api/detections/image",
        files={"file": ("frame.jpg", b"image", "image/jpeg")},
        data={"confidence": confidence},
    )

    assert response.status_code == 422


def test_unsupported_mime_type_is_rejected(client: TestClient) -> None:
    response = client.post(
        "/api/detections/image",
        files={"file": ("payload.txt", b"not-an-image", "text/plain")},
    )

    assert response.status_code == 415


def test_oversized_file_is_rejected(client: TestClient) -> None:
    response = client.post(
        "/api/detections/image",
        files={"file": ("frame.png", b"x" * 17, "image/png")},
    )

    assert response.status_code == 413


def test_unsupported_class_is_rejected(client: TestClient) -> None:
    response = client.post(
        "/api/detections/image",
        files={"file": ("frame.png", b"image", "image/png")},
        data={"classes": "dragon"},
    )

    assert response.status_code == 422
    assert response.json()["detail"]["unsupported_classes"] == ["dragon"]


def test_websocket_stream_returns_detection_contract(client: TestClient) -> None:
    with client.websocket_connect(
        "/api/detections/stream?confidence=0.4&classes=person"
    ) as websocket:
        websocket.send_bytes(b"fake-jpeg")
        response = websocket.receive_json()

    assert response["frame_width"] == 1280
    assert response["inference_ms"] == 12.5
    assert response["detections"][0]["class_name"] == "person"


def test_websocket_rejects_oversized_frame(client: TestClient) -> None:
    with client.websocket_connect("/api/detections/stream") as websocket:
        websocket.send_bytes(b"x" * 17)
        response = websocket.receive_json()

    assert response["error"]["code"] == "frame_too_large"


def test_websocket_requires_binary_frames(client: TestClient) -> None:
    with client.websocket_connect("/api/detections/stream") as websocket:
        websocket.send_text("not-a-jpeg")
        response = websocket.receive_json()

    assert response["error"]["code"] == "binary_frame_required"


def test_websocket_rejects_unknown_origin(client: TestClient) -> None:
    with pytest.raises(WebSocketDisconnect) as error:
        with client.websocket_connect(
            "/api/detections/stream",
            headers={"origin": "https://evil.example"},
        ):
            pass

    assert error.value.code == 1008
