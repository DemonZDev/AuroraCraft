import asyncio
import os
import logging
import subprocess
from pathlib import Path
from datetime import datetime, timezone
from redis import asyncio as aioredis
from arq import create_pool, cron
from arq.connections import RedisSettings
from sqlalchemy import select
from database import AsyncSessionLocal
from models import CompileJob, CompileStatus, Session

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379')
WORKSPACES_ROOT = Path('/app/workspaces')

async def compile_maven_project(ctx, session_id: str, compile_job_id: int):
    """
    Background task to compile Maven project in Docker
    """
    logger.info(f'Starting compile job {compile_job_id} for session {session_id}')
    
    async with AsyncSessionLocal() as db:
        # Get compile job
        result = await db.execute(select(CompileJob).where(CompileJob.id == compile_job_id))
        job = result.scalar_one_or_none()
        
        if not job:
            logger.error(f'Compile job {compile_job_id} not found')
            return
        
        # Update status to running
        job.status = CompileStatus.RUNNING
        job.started_at = datetime.now(timezone.utc)
        await db.commit()
    
    workspace_path = WORKSPACES_ROOT / session_id
    log_file = workspace_path / 'compile.log'
    artifact_path = workspace_path / 'target'
    
    try:
        # Check if pom.xml exists
        pom_file = workspace_path / 'pom.xml'
        if not pom_file.exists():
            raise Exception('pom.xml not found in workspace')
        
        # Run Maven compile in Docker
        docker_command = [
            'docker', 'run',
            '--rm',
            '--network', 'none',  # No network access
            '--memory', '2g',
            '--cpus', '2',
            '--user', '1000:1000',
            '-v', f'{workspace_path}:/workspace',
            '-w', '/workspace',
            'maven:3.9-eclipse-temurin-21',
            'mvn', 'clean', 'package', '-DskipTests=false', '-B'
        ]
        
        logger.info(f'Running compile: {" ".join(docker_command)}')
        
        # Execute with timeout
        process = await asyncio.create_subprocess_exec(
            *docker_command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT
        )
        
        # Stream output to log file
        log_content = []
        async with asyncio.open_file(log_file, 'w') as f:
            while True:
                line = await process.stdout.readline()
                if not line:
                    break
                line_str = line.decode('utf-8')
                log_content.append(line_str)
                await f.write(line_str)
        
        # Wait for completion with timeout (5 minutes)
        try:
            await asyncio.wait_for(process.wait(), timeout=300)
        except asyncio.TimeoutError:
            process.kill()
            raise Exception('Compilation timeout (5 minutes)')
        
        # Check result
        if process.returncode == 0:
            # Success - find JAR artifact
            jar_files = list(artifact_path.glob('*.jar'))
            jar_path = jar_files[0] if jar_files else None
            
            async with AsyncSessionLocal() as db:
                result = await db.execute(select(CompileJob).where(CompileJob.id == compile_job_id))
                job = result.scalar_one()
                job.status = CompileStatus.SUCCESS
                job.finished_at = datetime.now(timezone.utc)
                job.log_path = str(log_file)
                job.artifact_path = str(jar_path) if jar_path else None
                await db.commit()
            
            logger.info(f'Compile job {compile_job_id} completed successfully')
        else:
            # Failed
            async with AsyncSessionLocal() as db:
                result = await db.execute(select(CompileJob).where(CompileJob.id == compile_job_id))
                job = result.scalar_one()
                job.status = CompileStatus.FAILED
                job.finished_at = datetime.now(timezone.utc)
                job.log_path = str(log_file)
                job.error_message = '\n'.join(log_content[-50:])  # Last 50 lines
                await db.commit()
            
            logger.warning(f'Compile job {compile_job_id} failed with return code {process.returncode}')
    
    except Exception as e:
        logger.error(f'Compile job {compile_job_id} error: {str(e)}')
        
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(CompileJob).where(CompileJob.id == compile_job_id))
            job = result.scalar_one()
            job.status = CompileStatus.FAILED
            job.finished_at = datetime.now(timezone.utc)
            job.error_message = str(e)
            await db.commit()

class WorkerSettings:
    redis_settings = RedisSettings.from_dsn(REDIS_URL)
    functions = [compile_maven_project]
    job_timeout = 600  # 10 minutes
    
if __name__ == '__main__':
    from arq import run_worker
    run_worker(WorkerSettings)
