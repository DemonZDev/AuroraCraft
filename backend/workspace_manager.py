import os
import aiofiles
import shutil
import zipfile
import hashlib
from pathlib import Path
from typing import List, Dict, Optional
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

WORKSPACES_ROOT = Path('/app/workspaces')
WORKSPACES_ROOT.mkdir(parents=True, exist_ok=True)

class WorkspaceManager:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.workspace_path = WORKSPACES_ROOT / session_id
        self.trash_path = self.workspace_path / '.trash'
        
    def init_workspace(self):
        """Initialize workspace directory structure"""
        self.workspace_path.mkdir(parents=True, exist_ok=True)
        self.trash_path.mkdir(parents=True, exist_ok=True)
        
    def get_absolute_path(self, relative_path: str) -> Path:
        """Convert relative path to absolute workspace path with safety check"""
        # Remove leading slash if present
        relative_path = relative_path.lstrip('/')
        abs_path = (self.workspace_path / relative_path).resolve()
        
        # Security check: ensure path is within workspace
        if not str(abs_path).startswith(str(self.workspace_path)):
            raise ValueError(f'Path traversal detected: {relative_path}')
        
        return abs_path
    
    async def list_files(self) -> List[Dict]:
        """List all files in workspace recursively"""
        files = []
        
        if not self.workspace_path.exists():
            return files
        
        for file_path in self.workspace_path.rglob('*'):
            if file_path.is_file() and '.trash' not in str(file_path):
                relative_path = file_path.relative_to(self.workspace_path)
                stat = file_path.stat()
                
                files.append({
                    'path': str(relative_path),
                    'size': stat.st_size,
                    'modified': datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
                })
        
        return files
    
    async def read_file(self, path: str) -> str:
        """Read file content"""
        abs_path = self.get_absolute_path(path)
        
        if not abs_path.exists():
            raise FileNotFoundError(f'File not found: {path}')
        
        async with aiofiles.open(abs_path, 'r', encoding='utf-8') as f:
            return await f.read()
    
    async def write_file(self, path: str, content: str) -> Dict:
        """Write file content atomically"""
        abs_path = self.get_absolute_path(path)
        
        # Create parent directories
        abs_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Write to temporary file first
        temp_path = abs_path.with_suffix(abs_path.suffix + '.tmp')
        
        async with aiofiles.open(temp_path, 'w', encoding='utf-8') as f:
            await f.write(content)
        
        # Atomic rename
        temp_path.replace(abs_path)
        
        # Calculate checksum
        checksum = hashlib.sha256(content.encode()).hexdigest()
        
        stat = abs_path.stat()
        return {
            'path': path,
            'size': stat.st_size,
            'checksum': checksum,
            'modified': datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
        }
    
    async def delete_file(self, path: str, soft_delete: bool = True):
        """Delete file (soft delete moves to trash)"""
        abs_path = self.get_absolute_path(path)
        
        if not abs_path.exists():
            raise FileNotFoundError(f'File not found: {path}')
        
        if soft_delete:
            # Move to trash with timestamp
            timestamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
            trash_file = self.trash_path / f'{timestamp}_{abs_path.name}'
            shutil.move(str(abs_path), str(trash_file))
        else:
            abs_path.unlink()
    
    async def rename_file(self, old_path: str, new_path: str):
        """Rename/move file"""
        old_abs = self.get_absolute_path(old_path)
        new_abs = self.get_absolute_path(new_path)
        
        if not old_abs.exists():
            raise FileNotFoundError(f'File not found: {old_path}')
        
        # Create parent directories for new path
        new_abs.parent.mkdir(parents=True, exist_ok=True)
        
        old_abs.rename(new_abs)
    
    async def create_zip(self, output_path: Optional[str] = None) -> Path:
        """Create zip archive of workspace"""
        if output_path is None:
            output_path = f'/tmp/{self.session_id}.zip'
        
        with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for file_path in self.workspace_path.rglob('*'):
                if file_path.is_file() and '.trash' not in str(file_path):
                    arcname = file_path.relative_to(self.workspace_path)
                    zipf.write(file_path, arcname)
        
        return Path(output_path)
    
    async def extract_zip(self, zip_path: str, validate: bool = True):
        """Extract zip archive to workspace"""
        disallowed_extensions = {'.jar', '.exe', '.sh', '.bat', '.cmd'}
        
        with zipfile.ZipFile(zip_path, 'r') as zipf:
            # Validate files
            if validate:
                for name in zipf.namelist():
                    ext = Path(name).suffix.lower()
                    if ext in disallowed_extensions:
                        raise ValueError(f'Disallowed file type: {name}')
                    
                    # Check for path traversal
                    if '..' in name or name.startswith('/'):
                        raise ValueError(f'Invalid file path: {name}')
            
            # Extract
            zipf.extractall(self.workspace_path)
    
    def cleanup_trash(self, max_age_minutes: int = 10):
        """Clean up old trash files"""
        if not self.trash_path.exists():
            return
        
        cutoff_time = datetime.now(timezone.utc).timestamp() - (max_age_minutes * 60)
        
        for file_path in self.trash_path.iterdir():
            if file_path.is_file() and file_path.stat().st_mtime < cutoff_time:
                file_path.unlink()
