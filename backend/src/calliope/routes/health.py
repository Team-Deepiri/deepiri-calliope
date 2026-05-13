from fastapi import APIRouter

from calliope.schemas import HealthResponse
from calliope.services.aamati_bridge import AamatiBridge

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse()


@router.get("/v1/aamati/health")
async def aamati_health() -> dict:
    return AamatiBridge().health()
