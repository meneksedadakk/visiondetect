from typing import Any, List, Optional

import pytest

from backend.app.services.model_service import (
    UltralyticsModelService,
    UnsupportedClassesError,
)


class FakeTensor:
    def __init__(self, values: Any) -> None:
        self.values = values

    def cpu(self) -> "FakeTensor":
        return self

    def tolist(self) -> Any:
        return self.values


class FakeBoxes:
    xyxy = FakeTensor([[-5.0, 10.2, 150.7, 99.9]])
    conf = FakeTensor([0.912345])
    cls = FakeTensor([0.0])


class FakePrediction:
    boxes = FakeBoxes()


class FakeImage:
    shape = (100, 120, 3)


class FakeYoloModel:
    names = {0: "person", 2: "car"}

    def __init__(self, fail_device: Optional[str] = None) -> None:
        self.fail_device = fail_device
        self.calls: List[dict] = []

    def predict(self, **kwargs: Any) -> List[FakePrediction]:
        self.calls.append(kwargs)
        if kwargs["device"] == self.fail_device:
            raise RuntimeError("accelerator failed")
        return [FakePrediction()]


def test_service_filters_classes_and_converts_yolo_result() -> None:
    fake_model = FakeYoloModel()
    service = UltralyticsModelService(
        "fake.pt",
        preferred_device="cpu",
        model_loader=lambda source: fake_model,
    )

    result = service.infer(FakeImage(), 0.4, ["person"])

    assert fake_model.calls[0]["classes"] == [0]
    assert result.frame_width == 120
    assert result.frame_height == 100
    assert result.detections[0].confidence == pytest.approx(0.912345, abs=0.00001)
    # Koordinatlar goruntu sinirlari disina tasamaz.
    assert result.detections[0].x1 == 0
    assert result.detections[0].x2 == 120


def test_service_rejects_unsupported_class_before_prediction() -> None:
    fake_model = FakeYoloModel()
    service = UltralyticsModelService(
        "fake.pt",
        preferred_device="cpu",
        model_loader=lambda source: fake_model,
    )

    with pytest.raises(UnsupportedClassesError):
        service.infer(FakeImage(), 0.4, ["dragon"])

    assert fake_model.calls == []


def test_service_retries_accelerator_failure_on_cpu() -> None:
    fake_model = FakeYoloModel(fail_device="mps")
    service = UltralyticsModelService(
        "fake.pt",
        preferred_device="mps",
        model_loader=lambda source: fake_model,
    )

    result = service.infer(FakeImage(), 0.4, [])

    assert result.detections[0].class_name == "person"
    assert [call["device"] for call in fake_model.calls] == ["mps", "cpu"]
    assert service.info().device == "cpu"
