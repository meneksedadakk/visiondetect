"""Yuklenen goruntuleri guvenli bicimde OpenCV matrisine cevirir."""

from typing import Any


class InvalidImageError(ValueError):
    """Dosya baytlari gecerli bir goruntu degilse firlatilir."""


def decode_image(content: bytes, max_pixels: int) -> Any:
    """JPEG/PNG baytlarini BGR OpenCV matrisine donusturur.

    Import'lar fonksiyon icinde tutulur. Boylece API'nin health endpoint'i,
    makine-ogrenmesi bagimliliklari henuz kurulmadan da import edilebilir.
    """

    import cv2
    import numpy as np

    encoded = np.frombuffer(content, dtype=np.uint8)
    image = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
    if image is None:
        raise InvalidImageError("Dosya gecerli bir JPEG veya PNG goruntusu degil.")

    height, width = image.shape[:2]
    if height * width > max_pixels:
        raise InvalidImageError(
            f"Cozulmus goruntu en fazla {max_pixels:,} piksel olabilir."
        )
    return image
