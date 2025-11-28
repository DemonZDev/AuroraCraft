from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum

class UserRole(str, Enum):
    USER = 'user'
    ADMIN = 'admin'

class CompileStatus(str, Enum):
    PENDING = 'pending'
    RUNNING = 'running'
    SUCCESS = 'success'
    FAILED = 'failed'

# Auth Schemas
class UserRegister(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=6)
    confirm_password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = 'bearer'
    user: 'UserResponse'

class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    role: str
    token_balance: float
    created_at: datetime

# Session Schemas
class SessionCreate(BaseModel):
    title: str = Field(..., max_length=200)
    creation_type: str = 'minecraft_java_plugin'  # minecraft_java_plugin, minecraft_java_mod, etc.
    target_software: Optional[str] = None  # Only for minecraft_java_plugin
    project_source: str = 'blank'  # blank, upload, github
    github_repo_url: Optional[str] = None  # Required if project_source is 'github'

class SessionResponse(BaseModel):
    id: str
    title: str
    creation_type: str
    target_software: Optional[str]
    project_source: str
    github_repo_url: Optional[str]
    selected_model_id: Optional[int]
    created_at: datetime
    last_updated: datetime

class SessionUpdate(BaseModel):
    title: Optional[str] = None
    creation_type: Optional[str] = None
    target_software: Optional[str] = None
    project_source: Optional[str] = None
    github_repo_url: Optional[str] = None
    selected_model_id: Optional[int] = None

# File Schemas
class FileMetadata(BaseModel):
    path: str
    size: int
    checksum: Optional[str]
    last_modified_by: str
    last_modified_at: datetime

class FileContent(BaseModel):
    path: str
    content: str

class FileWrite(BaseModel):
    path: str
    content: str
    author: str = 'user'

class FileRename(BaseModel):
    old_path: str
    new_path: str

# Checkpoint Schemas
class CheckpointCreate(BaseModel):
    name: str
    file_paths: List[str]
    diff_blob: Optional[str] = None
    author: str = 'agent'

class CheckpointResponse(BaseModel):
    id: int
    session_id: str
    name: str
    file_paths: List[str]
    author: str
    created_at: datetime

# Plan Schemas
class PhaseTask(BaseModel):
    name: str
    description: str
    completed: bool = False

class Phase(BaseModel):
    name: str
    goal: str
    tasks: List[PhaseTask]
    files_to_create: List[str]
    acceptance_criteria: List[str]
    estimated_steps: int
    completed: bool = False

class PlanCreate(BaseModel):
    phases: List[Phase]

class PlanResponse(BaseModel):
    id: int
    session_id: str
    plan_json: Dict[str, Any]
    current_phase_index: int
    created_at: datetime

# Memory Schemas
class MemoryCreate(BaseModel):
    key: str
    value: str
    type: str = 'requirement'

class MemoryResponse(BaseModel):
    id: int
    session_id: str
    key: str
    value: str
    type: str
    created_at: datetime

# Provider Schemas
class ProviderCreate(BaseModel):
    provider_id: str
    display_name: str
    base_url: str
    auth_type: str = 'Bearer'
    credentials: Optional[str] = None
    headers_json: Dict[str, Any] = {}
    health_check_endpoint: Optional[str] = None
    default_payload_template: Dict[str, Any] = {}

class ProviderResponse(BaseModel):
    id: int
    provider_id: str
    display_name: str
    base_url: str
    auth_type: str
    enabled: bool
    created_at: datetime

class ProviderUpdate(BaseModel):
    display_name: Optional[str] = None
    base_url: Optional[str] = None
    auth_type: Optional[str] = None
    credentials: Optional[str] = None
    headers_json: Optional[Dict[str, Any]] = None
    health_check_endpoint: Optional[str] = None
    enabled: Optional[bool] = None

# Model Schemas
class ModelCreate(BaseModel):
    provider_id: int
    model_id: str
    display_name: str
    default_params: Dict[str, Any] = {'temperature': 0.7, 'max_tokens': 4000}
    per_char_cost: float = 0.000001
    tags: List[str] = []

class ModelResponse(BaseModel):
    id: int
    provider_id: int
    model_id: str
    display_name: str
    default_params: Dict[str, Any]
    per_char_cost: float
    enabled: bool
    tags: List[str]
    created_at: datetime

class ModelUpdate(BaseModel):
    display_name: Optional[str] = None
    default_params: Optional[Dict[str, Any]] = None
    per_char_cost: Optional[float] = None
    enabled: Optional[bool] = None
    tags: Optional[List[str]] = None

# Token Schemas
class TokenTransactionResponse(BaseModel):
    id: int
    user_id: int
    session_id: Optional[str]
    provider_id: Optional[int]
    model_id: Optional[int]
    prompt_chars: int
    response_chars: int
    total_chars: int
    calculated_cost: float
    created_at: datetime

# Compile Schemas
class CompileJobResponse(BaseModel):
    id: int
    session_id: str
    status: str
    started_at: Optional[datetime]
    finished_at: Optional[datetime]
    log_path: Optional[str]
    artifact_path: Optional[str]
    error_message: Optional[str]
    created_at: datetime

# LLM Schemas
class LLMCallRequest(BaseModel):
    session_id: str
    model_id: int
    prompt: str
    system_prompt: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    stream: bool = False

class LLMCallResponse(BaseModel):
    response: str
    prompt_chars: int
    response_chars: int
    total_chars: int
    calculated_cost: float

# Chat Message Schemas
class ChatMessage(BaseModel):
    role: str  # 'user', 'assistant', 'system'
    content: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now())

class ChatHistoryResponse(BaseModel):
    session_id: str
    messages: List[ChatMessage]
