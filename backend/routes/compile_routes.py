from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import Session, CompileJob, CompileStatus
from schemas import CompileJobResponse
from auth import get_current_user, TokenData
from typing import List
import logging
from arq import create_pool
from arq.connections import RedisSettings
import os

logger = logging.getLogger(__name__)
router = APIRouter(prefix='/sessions/{session_id}/compile', tags=['Compilation'])

REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379')

async def verify_session_ownership(session_id: str, user_id: int, db: AsyncSession):
    result = await db.execute(
        select(Session).where(Session.id == session_id, Session.owner_id == user_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail='Session not found')
    return session

@router.post('/', response_model=CompileJobResponse)
async def start_compile(session_id: str, current_user: TokenData = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    async with db as session:
        await verify_session_ownership(session_id, current_user.user_id, session)
        
        # Check if there's already a running compile job
        result = await session.execute(
            select(CompileJob)
            .where(
                CompileJob.session_id == session_id,
                CompileJob.status == CompileStatus.RUNNING
            )
        )
        running_job = result.scalar_one_or_none()
        if running_job:
            raise HTTPException(status_code=400, detail='A compile job is already running for this session')
        
        # Create new compile job
        job = CompileJob(
            session_id=session_id,
            status=CompileStatus.PENDING
        )
        session.add(job)
        await session.commit()
        await session.refresh(job)
        
        # Queue compile task
        redis = await create_pool(RedisSettings.from_dsn(REDIS_URL))
        await redis.enqueue_job('compile_maven_project', session_id, job.id)
        
        return CompileJobResponse(
            id=job.id,
            session_id=job.session_id,
            status=job.status.value,
            started_at=job.started_at,
            finished_at=job.finished_at,
            log_path=job.log_path,
            artifact_path=job.artifact_path,
            error_message=job.error_message,
            created_at=job.created_at
        )

@router.get('/', response_model=List[CompileJobResponse])
async def get_compile_history(session_id: str, current_user: TokenData = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    async with db as session:
        await verify_session_ownership(session_id, current_user.user_id, session)
        
        result = await session.execute(
            select(CompileJob)
            .where(CompileJob.session_id == session_id)
            .order_by(CompileJob.created_at.desc())
        )
        jobs = result.scalars().all()
        
        return [
            CompileJobResponse(
                id=job.id,
                session_id=job.session_id,
                status=job.status.value,
                started_at=job.started_at,
                finished_at=job.finished_at,
                log_path=job.log_path,
                artifact_path=job.artifact_path,
                error_message=job.error_message,
                created_at=job.created_at
            )
            for job in jobs
        ]

@router.get('/{job_id}', response_model=CompileJobResponse)
async def get_compile_job(session_id: str, job_id: int, current_user: TokenData = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    async with db as session:
        await verify_session_ownership(session_id, current_user.user_id, session)
        
        result = await session.execute(
            select(CompileJob)
            .where(CompileJob.id == job_id, CompileJob.session_id == session_id)
        )
        job = result.scalar_one_or_none()
        
        if not job:
            raise HTTPException(status_code=404, detail='Compile job not found')
        
        return CompileJobResponse(
            id=job.id,
            session_id=job.session_id,
            status=job.status.value,
            started_at=job.started_at,
            finished_at=job.finished_at,
            log_path=job.log_path,
            artifact_path=job.artifact_path,
            error_message=job.error_message,
            created_at=job.created_at
        )

@router.get('/{job_id}/logs')
async def get_compile_logs(session_id: str, job_id: int, current_user: TokenData = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    async with db as session:
        await verify_session_ownership(session_id, current_user.user_id, session)
        
        result = await session.execute(
            select(CompileJob)
            .where(CompileJob.id == job_id, CompileJob.session_id == session_id)
        )
        job = result.scalar_one_or_none()
        
        if not job:
            raise HTTPException(status_code=404, detail='Compile job not found')
        
        if not job.log_path:
            return {'logs': ''}
        
        try:
            import aiofiles
            async with aiofiles.open(job.log_path, 'r') as f:
                logs = await f.read()
            return {'logs': logs}
        except FileNotFoundError:
            return {'logs': 'Log file not found'}
