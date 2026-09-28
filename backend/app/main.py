"""VisionGuard FastAPI uygulamasi."""

from typing import Any, Callable, List, Optional

from fastapi import (
    FastAPI,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware

from backend.app.config import Settings
from backend.app.image_utils import InvalidImageError, decode_image
from backend.app.schemas import (
    ClassResponse,
    Detection,
    HealthResponse,
    ImageDetectionResponse,
    ModelResponse,
)
from backend.app.services.model_service import (
    ModelServiceError,
    UnsupportedClassesError,
    UltralyticsModelService,
)


ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png"}


def _parse_classes(raw_classes: Optional[str]) -> List[str]:
    if not raw_classes:
        return []
    # dict.fromkeys sirayi korurken tekrar eden degerleri kaldirir.
    return list(
        dict.fromkeys(
            item.strip() for item in raw_classes.split(",") if item.strip()
        )
    )


def _detection_response(result: Any) -> ImageDetectionResponse:
    """Model servisinin sonucunu HTTP ve WebSocket'in ortak semasina cevir."""

    return ImageDetectionResponse(
        frame_width=result.frame_width,
        frame_height=result.frame_height,
        inference_ms=result.inference_ms,
        detections=[Detection(**item.__dict__) for item in result.detections],
    )


def create_app(
    settings: Optional[Settings] = None,
    model_service: Optional[Any] = None,
    image_decoder: Callable[[bytes, int], Any] = decode_image,
) -> FastAPI:
    """Uygulamayi kurar; parametreler testlerde gercek modeli degistirebilir."""

    app_settings = settings or Settings()
    service = model_service or UltralyticsModelService(app_settings.model_source)

    application = FastAPI(
        title=app_settings.app_name,
        version=app_settings.app_version,
        description="Fotograf ve canli kamera icin YOLO nesne algilama API'si.",
    )
    application.state.settings = app_settings
    application.state.model_service = service
    application.add_middleware(
        CORSMiddleware,
        allow_origins=list(app_settings.allowed_origins),
        allow_credentials=True,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["*"],
    )

    @application.get("/api/health", response_model=HealthResponse, tags=["system"])
    async def health() -> HealthResponse:
        return HealthResponse(
            status="ok",
            service=app_settings.app_name,
            version=app_settings.app_version,
        )

    @application.get("/api/model", response_model=ModelResponse, tags=["model"])
    async def model_status() -> ModelResponse:
        info = service.info()
        return ModelResponse(**info.__dict__)

    @application.get(
        "/api/classes", response_model=List[ClassResponse], tags=["model"]
    )
    async def classes() -> List[ClassResponse]:
        try:
            class_items = await run_in_threadpool(lambda: service.available_classes)
        except ModelServiceError as error:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=str(error),
            ) from error
        return [
            ClassResponse(class_id=class_id, class_name=class_name)
            for class_id, class_name in class_items
        ]

    @application.post(
        "/api/detections/image",
        response_model=ImageDetectionResponse,
        tags=["detections"],
    )
    async def detect_image(
        file: UploadFile = File(..., description="JPEG veya PNG goruntusu"),
        confidence: float = Form(default=0.25, ge=0.01, le=1.0),
        classes: Optional[str] = Form(
            default=None,
            description="Virgulle ayrilmis model sinif adlari; bos ise tum siniflar",
        ),
    ) -> ImageDetectionResponse:
        content_type = (file.content_type or "").lower().split(";", 1)[0]
        if content_type not in ALLOWED_IMAGE_TYPES:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="Yalnizca image/jpeg ve image/png dosyalari desteklenir.",
            )

        try:
            content = await file.read(app_settings.max_upload_bytes + 1)
        finally:
            await file.close()

        if not content:
            raise HTTPException(status_code=422, detail="Yuklenen dosya bos.")
        if len(content) > app_settings.max_upload_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail=(
                    "Dosya boyutu siniri asildi: "
                    f"{app_settings.max_upload_bytes} bayt."
                ),
            )

        try:
            image = image_decoder(content, app_settings.max_image_pixels)
        except InvalidImageError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error

        selected_classes = _parse_classes(classes)
        try:
            result = await run_in_threadpool(
                service.infer, image, confidence, selected_classes
            )
        except UnsupportedClassesError as error:
            raise HTTPException(
                status_code=422,
                detail={
                    "message": "Desteklenmeyen nesne sinifi.",
                    "unsupported_classes": list(error.class_names),
                },
            ) from error
        except ModelServiceError as error:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=str(error),
            ) from error

        return _detection_response(result)

    @application.websocket("/api/detections/stream")
    async def detection_stream(
        websocket: WebSocket,
        confidence: float = Query(default=0.25, ge=0.01, le=1.0),
        classes: Optional[str] = Query(default=None),
    ) -> None:
        """JPEG frame alir ve her frame icin detection JSON'u dondurur.

        Istemci bir onceki sonucun gelmesini bekleyerek gonderim yaptigi icin
        burada ek bir frame kuyrugu tutulmaz.
        """

        origin = websocket.headers.get("origin")
        if origin and origin not in app_settings.allowed_origins:
            await websocket.close(code=1008, reason="Origin izinli degil.")
            return

        await websocket.accept()
        selected_classes = _parse_classes(classes)

        try:
            while True:
                message = await websocket.receive()
                if message["type"] == "websocket.disconnect":
                    return

                content = message.get("bytes")
                if content is None:
                    await websocket.send_json(
                        {
                            "error": {
                                "code": "binary_frame_required",
                                "message": "Frame binary JPEG olarak gonderilmelidir.",
                            }
                        }
                    )
                    continue
                if not content:
                    await websocket.send_json(
                        {
                            "error": {
                                "code": "empty_frame",
                                "message": "Bos frame islenemez.",
                            }
                        }
                    )
                    continue
                if len(content) > app_settings.max_upload_bytes:
                    await websocket.send_json(
                        {
                            "error": {
                                "code": "frame_too_large",
                                "message": (
                                    "Frame boyutu siniri asildi: "
                                    f"{app_settings.max_upload_bytes} bayt."
                                ),
                            }
                        }
                    )
                    continue

                try:
                    image = image_decoder(content, app_settings.max_image_pixels)
                    result = await run_in_threadpool(
                        service.infer, image, confidence, selected_classes
                    )
                except InvalidImageError as error:
                    await websocket.send_json(
                        {
                            "error": {
                                "code": "invalid_frame",
                                "message": str(error),
                            }
                        }
                    )
                    continue
                except UnsupportedClassesError as error:
                    await websocket.send_json(
                        {
                            "error": {
                                "code": "unsupported_classes",
                                "message": str(error),
                            }
                        }
                    )
                    await websocket.close(code=1008)
                    return
                except ModelServiceError as error:
                    await websocket.send_json(
                        {
                            "error": {
                                "code": "model_unavailable",
                                "message": str(error),
                            }
                        }
                    )
                    await websocket.close(code=1011)
                    return

                await websocket.send_json(
                    _detection_response(result).model_dump(mode="json")
                )
        except WebSocketDisconnect:
            return

    return application


app = create_app()
