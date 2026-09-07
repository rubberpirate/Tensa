"""
exceptions.py — Custom Application Exceptions & Error Handlers
"""

from __future__ import annotations

from fastapi import Request, status
from fastapi.responses import JSONResponse


class TensaException(Exception):
    """Base exception for all Tensa application domain errors."""
    def __init__(self, message: str, status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class AudioDecodeError(TensaException):
    """Raised when an uploaded audio file cannot be parsed or decoded."""
    def __init__(self, message: str = "Audio decode failed"):
        # Use HTTP_422_UNPROCESSABLE_CONTENT or fallback to 422
        status_code = getattr(status, "HTTP_422_UNPROCESSABLE_CONTENT", status.HTTP_422_UNPROCESSABLE_ENTITY)
        super().__init__(message, status_code=status_code)


class ModelNotReadyError(TensaException):
    """Raised when neural inference is requested before the model is loaded."""
    def __init__(self, message: str = "Inference model warming up. Please retry shortly."):
        super().__init__(message, status_code=status.HTTP_503_SERVICE_UNAVAILABLE)


class ModelInferenceError(TensaException):
    """Raised when an error occurs during model evaluation."""
    def __init__(self, message: str = "Inference engine encountered an internal error"):
        super().__init__(message, status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)


class SessionNotFoundError(TensaException):
    """Raised when an operation is attempted on an unknown call session."""
    def __init__(self, call_id: str):
        super().__init__(f"Call session '{call_id}' not found", status_code=status.HTTP_404_NOT_FOUND)


async def tensa_exception_handler(request: Request, exc: TensaException) -> JSONResponse:
    """Standardized JSON response for all domain exceptions."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.__class__.__name__,
            "detail": exc.message,
            "status_code": exc.status_code,
        },
    )
