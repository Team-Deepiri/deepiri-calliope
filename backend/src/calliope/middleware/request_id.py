import time
import uuid
from collections.abc import Awaitable, Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Attach X-Request-ID (pattern aligned with platform PrismPipe server middleware)."""

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        incoming = request.headers.get("X-Request-ID")
        request_id = incoming if incoming and len(incoming) < 100 else str(uuid.uuid4())
        request.state.request_id = request_id
        start = time.monotonic()
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
            response.headers.setdefault("X-Request-ID", request_id)
            return response
        finally:
            duration = time.monotonic() - start
            print(f"[{request_id}] {request.method} {request.url.path} {status_code} {duration:.3f}s")
