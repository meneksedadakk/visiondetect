import base64

import pytest

from backend.app.image_utils import InvalidImageError, decode_image


# 1x1 piksellik gecerli bir PNG. Test fixture'i icin harici dosya gerektirmez.
ONE_PIXEL_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUB"
    "AScY42YAAAAASUVORK5CYII="
)


def test_decode_image_reads_valid_png() -> None:
    image = decode_image(ONE_PIXEL_PNG, max_pixels=10)

    assert image.shape[:2] == (1, 1)


def test_decode_image_rejects_invalid_bytes() -> None:
    with pytest.raises(InvalidImageError):
        decode_image(b"not-an-image", max_pixels=10)
