from collections.abc import AsyncIterator
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from calliope.db import SessionLocal
from calliope.models import GenerationJob
from calliope.schemas import GenerationJobCreate, GenerationJobRead

router = APIRouter(tags=["jobs"])


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session


@router.post("/v1/jobs", response_model=GenerationJobRead)
async def create_job(
    body: GenerationJobCreate,
    session: AsyncSession = Depends(get_session),
) -> GenerationJob:
    job = GenerationJob(prompt=body.prompt, status="queued")
    session.add(job)
    await session.commit()
    await session.refresh(job)
    return job


@router.get("/v1/jobs/{job_id}", response_model=GenerationJobRead)
async def get_job(
    job_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> GenerationJob:
    result = await session.execute(select(GenerationJob).where(GenerationJob.id == job_id))
    job = result.scalar_one_or_none()
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    return job
