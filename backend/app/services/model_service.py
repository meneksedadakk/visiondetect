"""Ultralytics YOLO modelini HTTP katmanindan ayiran servis."""

import logging
import threading
from dataclasses import dataclass
from importlib.util import find_spec
from time import perf_counter
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple


logger = logging.getLogger(__name__)


class ModelServiceError(RuntimeError):
    """Model yukleme veya inference hatalarinin ortak tabani."""


class UnsupportedClassesError(ValueError):
    def __init__(self, class_names: Sequence[str]) -> None:
        self.class_names = tuple(class_names)
        super().__init__(f"Desteklenmeyen siniflar: {', '.join(self.class_names)}")


@dataclass(frozen=True)
class DetectionResult:
    class_id: int
    class_name: str
    confidence: float
    x1: int
    y1: int
    x2: int
    y2: int


@dataclass(frozen=True)
class InferenceResult:
    frame_width: int
    frame_height: int
    inference_ms: float
    detections: Tuple[DetectionResult, ...]


@dataclass(frozen=True)
class ModelInfo:
    model: str
    device: str
    loaded: bool
    status: str
    last_error: str = ""


def select_device() -> str:
    """CUDA, Apple MPS ve CPU sirasiyla uygun cihazi secer."""

    try:
        import torch
    except ImportError:
        return "cpu"

    if torch.cuda.is_available():
        return "cuda:0"
    mps = getattr(torch.backends, "mps", None)
    if mps is not None and mps.is_available():
        return "mps"
    return "cpu"


class UltralyticsModelService:
    """Modeli tembel yukler ve YOLO sonuclarini sade Python verisine cevirir.

    Tembel yukleme, `/api/health` isteginin model dosyasi indirilmeden yanit
    vermesini saglar. Lock ise ayni model nesnesinde iki inference'in ayni anda
    calisip bellek baskisi olusturmasini engeller.
    """

    def __init__(
        self,
        model_source: str,
        preferred_device: Optional[str] = None,
        model_loader: Optional[Callable[[str], Any]] = None,
    ) -> None:
        self.model_source = model_source
        self._device = preferred_device
        self._model_loader = model_loader
        self._model: Optional[Any] = None
        self._class_names: Dict[int, str] = {}
        self._last_error = ""
        self._lock = threading.Lock()

    @property
    def device(self) -> str:
        if self._device is None:
            self._device = select_device()
        return self._device

    @property
    def available_classes(self) -> Tuple[Tuple[int, str], ...]:
        with self._lock:
            self._ensure_loaded()
            return tuple(sorted(self._class_names.items()))

    def info(self) -> ModelInfo:
        if self._model is not None:
            status = "ready"
        elif find_spec("ultralytics") is None:
            status = "dependency_missing"
        else:
            status = "not_loaded"
        if self._last_error:
            status = "error"
        return ModelInfo(
            model=self.model_source,
            device=self.device,
            loaded=self._model is not None,
            status=status,
            last_error=self._last_error,
        )

    def infer(
        self,
        image: Any,
        confidence: float,
        selected_classes: Sequence[str],
    ) -> InferenceResult:
        """Tek bir OpenCV goruntusunde nesne tespiti yapar."""

        with self._lock:
            self._ensure_loaded()
            class_ids = self._resolve_class_ids(selected_classes)

            started_at = perf_counter()
            try:
                result = self._predict_once(image, confidence, class_ids)
            except Exception as accelerator_error:
                if self.device == "cpu":
                    self._last_error = str(accelerator_error)
                    raise ModelServiceError(
                        "YOLO inference calistirilamadi."
                    ) from accelerator_error

                failed_device = self.device
                logger.warning(
                    "%s inference basarisiz; CPU ile yeniden deneniyor: %s",
                    failed_device,
                    accelerator_error,
                )
                self._device = "cpu"
                try:
                    result = self._predict_once(image, confidence, class_ids)
                except Exception as cpu_error:
                    self._last_error = str(cpu_error)
                    raise ModelServiceError(
                        f"Inference {failed_device} ve CPU uzerinde calistirilamadi."
                    ) from cpu_error

            inference_ms = (perf_counter() - started_at) * 1000
            self._last_error = ""
            return self._convert_result(result, image, inference_ms)

    def _ensure_loaded(self) -> None:
        if self._model is not None:
            return
        try:
            loader = self._model_loader
            if loader is None:
                from ultralytics import YOLO

                loader = YOLO

            self._model = loader(self.model_source)
            names = self._model.names
            if isinstance(names, dict):
                self._class_names = {int(key): str(value) for key, value in names.items()}
            else:
                self._class_names = {
                    index: str(value) for index, value in enumerate(names)
                }
            self._last_error = ""
        except Exception as error:
            self._model = None
            self._last_error = str(error)
            raise ModelServiceError(
                f"YOLO modeli yuklenemedi: {self.model_source}"
            ) from error

    def _resolve_class_ids(self, selected_classes: Sequence[str]) -> Optional[List[int]]:
        if not selected_classes:
            return None

        ids_by_name = {name: class_id for class_id, name in self._class_names.items()}
        unsupported = [name for name in selected_classes if name not in ids_by_name]
        if unsupported:
            raise UnsupportedClassesError(unsupported)
        return [ids_by_name[name] for name in selected_classes]

    def _predict_once(
        self,
        image: Any,
        confidence: float,
        class_ids: Optional[List[int]],
    ) -> Any:
        results = self._model.predict(
            source=image,
            conf=confidence,
            classes=class_ids,
            device=self.device,
            verbose=False,
        )
        if not results:
            raise ModelServiceError("Model bos bir sonuc listesi dondurdu.")
        return results[0]

    def _convert_result(
        self, result: Any, image: Any, inference_ms: float
    ) -> InferenceResult:
        height, width = image.shape[:2]
        detections: List[DetectionResult] = []

        boxes = result.boxes
        if boxes is not None:
            coordinates = boxes.xyxy.cpu().tolist()
            confidences = boxes.conf.cpu().tolist()
            class_ids = boxes.cls.cpu().tolist()
            for xyxy, score, raw_class_id in zip(
                coordinates, confidences, class_ids
            ):
                class_id = int(raw_class_id)
                detections.append(
                    DetectionResult(
                        class_id=class_id,
                        class_name=self._class_names[class_id],
                        confidence=round(float(score), 5),
                        x1=max(0, min(width, round(float(xyxy[0])))),
                        y1=max(0, min(height, round(float(xyxy[1])))),
                        x2=max(0, min(width, round(float(xyxy[2])))),
                        y2=max(0, min(height, round(float(xyxy[3])))),
                    )
                )

        return InferenceResult(
            frame_width=width,
            frame_height=height,
            inference_ms=round(inference_ms, 2),
            detections=tuple(detections),
        )
