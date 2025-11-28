from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import Session, User
from schemas import SessionCreate, SessionResponse, SessionUpdate
from auth import get_current_user, TokenData
from workspace_manager import WorkspaceManager
from typing import List
import uuid
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix='/sessions', tags=['Sessions'])

@router.post('/', response_model=SessionResponse)
async def create_session(session_data: SessionCreate, current_user: TokenData = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    async with db as session:
        # Create session
        new_session = Session(
            id=str(uuid.uuid4()),
            owner_id=current_user.user_id,
            title=session_data.title,
            creation_type=session_data.creation_type,
            target_software=session_data.target_software,
            project_source=session_data.project_source,
            github_repo_url=session_data.github_repo_url
        )
        session.add(new_session)
        await session.commit()
        await session.refresh(new_session)
        
        # Initialize workspace
        workspace = WorkspaceManager(new_session.id)
        workspace.init_workspace()
        
        return SessionResponse(
            id=new_session.id,
            title=new_session.title,
            creation_type=new_session.creation_type,
            target_software=new_session.target_software,
            project_source=new_session.project_source,
            github_repo_url=new_session.github_repo_url,
            selected_model_id=new_session.selected_model_id,
            created_at=new_session.created_at,
            last_updated=new_session.last_updated
        )

@router.get('/', response_model=List[SessionResponse])
async def get_sessions(current_user: TokenData = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    async with db as session:
        result = await session.execute(
            select(Session)
            .where(Session.owner_id == current_user.user_id)
            .order_by(Session.last_updated.desc())
        )
        sessions = result.scalars().all()
        
        return [
            SessionResponse(
                id=s.id,
                title=s.title,
                creation_type=s.creation_type,
                target_software=s.target_software,
                project_source=s.project_source,
                github_repo_url=s.github_repo_url,
                selected_model_id=s.selected_model_id,
                created_at=s.created_at,
                last_updated=s.last_updated
            )
            for s in sessions
        ]

@router.get('/{session_id}', response_model=SessionResponse)
async def get_session(session_id: str, current_user: TokenData = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    async with db as session:
        result = await session.execute(
            select(Session)
            .where(Session.id == session_id, Session.owner_id == current_user.user_id)
        )
        session_obj = result.scalar_one_or_none()
        
        if not session_obj:
            raise HTTPException(status_code=404, detail='Session not found')
        
        return SessionResponse(
            id=session_obj.id,
            title=session_obj.title,
            creation_type=session_obj.creation_type,
            target_software=session_obj.target_software,
            project_source=session_obj.project_source,
            github_repo_url=session_obj.github_repo_url,
            selected_model_id=session_obj.selected_model_id,
            created_at=session_obj.created_at,
            last_updated=session_obj.last_updated
        )

@router.patch('/{session_id}', response_model=SessionResponse)
async def update_session(session_id: str, update_data: SessionUpdate, current_user: TokenData = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    async with db as session:
        result = await session.execute(
            select(Session)
            .where(Session.id == session_id, Session.owner_id == current_user.user_id)
        )
        session_obj = result.scalar_one_or_none()
        
        if not session_obj:
            raise HTTPException(status_code=404, detail='Session not found')
        
        # Update fields
        if update_data.title is not None:
            session_obj.title = update_data.title
        if update_data.creation_type is not None:
            session_obj.creation_type = update_data.creation_type
        if update_data.target_software is not None:
            session_obj.target_software = update_data.target_software
        if update_data.project_source is not None:
            session_obj.project_source = update_data.project_source
        if update_data.github_repo_url is not None:
            session_obj.github_repo_url = update_data.github_repo_url
        if update_data.selected_model_id is not None:
            session_obj.selected_model_id = update_data.selected_model_id
        
        await session.commit()
        await session.refresh(session_obj)
        
        return SessionResponse(
            id=session_obj.id,
            title=session_obj.title,
            creation_type=session_obj.creation_type,
            target_software=session_obj.target_software,
            project_source=session_obj.project_source,
            github_repo_url=session_obj.github_repo_url,
            selected_model_id=session_obj.selected_model_id,
            created_at=session_obj.created_at,
            last_updated=session_obj.last_updated
        )

@router.delete('/{session_id}')
async def delete_session(session_id: str, current_user: TokenData = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    async with db as session:
        result = await session.execute(
            select(Session)
            .where(Session.id == session_id, Session.owner_id == current_user.user_id)
        )
        session_obj = result.scalar_one_or_none()
        
        if not session_obj:
            raise HTTPException(status_code=404, detail='Session not found')
        
        await session.delete(session_obj)
        await session.commit()
        
        return {'message': 'Session deleted successfully'}
