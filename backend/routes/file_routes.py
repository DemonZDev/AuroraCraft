from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse, FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import Session, File as FileModel
from schemas import FileMetadata, FileContent, FileWrite, FileRename
from auth import get_current_user, TokenData
from workspace_manager import WorkspaceManager
from typing import List
import logging
import tempfile
import os

logger = logging.getLogger(__name__)
router = APIRouter(prefix='/sessions/{session_id}/files', tags=['Files'])

async def verify_session_ownership(session_id: str, user_id: int, db: AsyncSession):
    result = await db.execute(
        select(Session).where(Session.id == session_id, Session.owner_id == user_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail='Session not found')
    return session

@router.get('/', response_model=List[FileMetadata])
async def list_files(session_id: str, current_user: TokenData = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    async with db as session:
        await verify_session_ownership(session_id, current_user.user_id, session)
        
        workspace = WorkspaceManager(session_id)
        files = await workspace.list_files()
        
        return [
            FileMetadata(
                path=f['path'],
                size=f['size'],
                checksum=None,
                last_modified_by='user',
                last_modified_at=f['modified']
            )
            for f in files
        ]

@router.get('/{path:path}', response_model=FileContent)
async def read_file(session_id: str, path: str, current_user: TokenData = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    async with db as session:
        await verify_session_ownership(session_id, current_user.user_id, session)
        
        workspace = WorkspaceManager(session_id)
        try:
            content = await workspace.read_file(path)
            return FileContent(path=path, content=content)
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail='File not found')

@router.put('/{path:path}', response_model=FileMetadata)
async def write_file(session_id: str, path: str, file_data: FileWrite, current_user: TokenData = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    async with db as session:
        await verify_session_ownership(session_id, current_user.user_id, session)
        
        workspace = WorkspaceManager(session_id)
        result = await workspace.write_file(path, file_data.content)
        
        # Update file index in DB
        file_result = await session.execute(
            select(FileModel).where(FileModel.session_id == session_id, FileModel.path == path)
        )
        file_obj = file_result.scalar_one_or_none()
        
        if file_obj:
            file_obj.size = result['size']
            file_obj.checksum = result['checksum']
            file_obj.last_modified_by = file_data.author
            file_obj.last_modified_at = result['modified']
        else:
            file_obj = FileModel(
                session_id=session_id,
                path=path,
                size=result['size'],
                checksum=result['checksum'],
                last_modified_by=file_data.author,
                last_modified_at=result['modified']
            )
            session.add(file_obj)
        
        await session.commit()
        
        return FileMetadata(
            path=path,
            size=result['size'],
            checksum=result['checksum'],
            last_modified_by=file_data.author,
            last_modified_at=result['modified']
        )

@router.delete('/{path:path}')
async def delete_file(session_id: str, path: str, current_user: TokenData = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    async with db as session:
        await verify_session_ownership(session_id, current_user.user_id, session)
        
        workspace = WorkspaceManager(session_id)
        try:
            await workspace.delete_file(path, soft_delete=True)
            
            # Remove from DB index
            file_result = await session.execute(
                select(FileModel).where(FileModel.session_id == session_id, FileModel.path == path)
            )
            file_obj = file_result.scalar_one_or_none()
            if file_obj:
                await session.delete(file_obj)
                await session.commit()
            
            return {'message': 'File deleted successfully'}
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail='File not found')

@router.post('/rename')
async def rename_file(session_id: str, rename_data: FileRename, current_user: TokenData = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    async with db as session:
        await verify_session_ownership(session_id, current_user.user_id, session)
        
        workspace = WorkspaceManager(session_id)
        try:
            await workspace.rename_file(rename_data.old_path, rename_data.new_path)
            
            # Update DB index
            file_result = await session.execute(
                select(FileModel).where(FileModel.session_id == session_id, FileModel.path == rename_data.old_path)
            )
            file_obj = file_result.scalar_one_or_none()
            if file_obj:
                file_obj.path = rename_data.new_path
                await session.commit()
            
            return {'message': 'File renamed successfully'}
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail='File not found')

@router.post('/upload-zip')
async def upload_zip(session_id: str, file: UploadFile = File(...), current_user: TokenData = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    async with db as session:
        await verify_session_ownership(session_id, current_user.user_id, session)
        
        if not file.filename.endswith('.zip'):
            raise HTTPException(status_code=400, detail='Only .zip files are allowed')
        
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.zip') as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_path = tmp_file.name
        
        try:
            workspace = WorkspaceManager(session_id)
            await workspace.extract_zip(tmp_path, validate=True)
            return {'message': 'Zip file extracted successfully'}
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        finally:
            os.unlink(tmp_path)

@router.post('/download-zip')
async def download_zip(session_id: str, current_user: TokenData = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    async with db as session:
        await verify_session_ownership(session_id, current_user.user_id, session)
        
        workspace = WorkspaceManager(session_id)
        zip_path = await workspace.create_zip()
        
        return FileResponse(
            path=str(zip_path),
            filename=f'{session_id}.zip',
            media_type='application/zip'
        )
