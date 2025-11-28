from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, Text, ForeignKey, JSON, Enum
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import enum
from database import Base

class UserRole(str, enum.Enum):
    USER = 'user'
    ADMIN = 'admin'

class CompileStatus(str, enum.Enum):
    PENDING = 'pending'
    RUNNING = 'running'
    SUCCESS = 'success'
    FAILED = 'failed'

class User(Base):
    __tablename__ = 'users'
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(100), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), default=UserRole.USER, nullable=False)
    token_balance = Column(Float, default=10000.0)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    sessions = relationship('Session', back_populates='owner', cascade='all, delete-orphan')
    token_transactions = relationship('TokenTransaction', back_populates='user', cascade='all, delete-orphan')

class Session(Base):
    __tablename__ = 'sessions'
    
    id = Column(String(36), primary_key=True)
    owner_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    title = Column(String(200), nullable=False)
    creation_type = Column(String(100), default='minecraft_java_plugin')  # minecraft_java_plugin, minecraft_java_mod, etc.
    target_software = Column(String(50), nullable=True)  # Paper, Spigot, Bukkit, Purpur (only for minecraft_java_plugin)
    project_source = Column(String(50), default='blank')  # blank, upload, github
    github_repo_url = Column(String(500), nullable=True)  # GitHub repo URL if project_source is 'github'
    selected_model_id = Column(Integer, ForeignKey('models.id'), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    last_updated = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    owner = relationship('User', back_populates='sessions')
    files = relationship('File', back_populates='session', cascade='all, delete-orphan')
    checkpoints = relationship('Checkpoint', back_populates='session', cascade='all, delete-orphan')
    plans = relationship('Plan', back_populates='session', cascade='all, delete-orphan')
    memory_entries = relationship('MemoryEntry', back_populates='session', cascade='all, delete-orphan')
    compile_jobs = relationship('CompileJob', back_populates='session', cascade='all, delete-orphan')
    logs = relationship('Log', back_populates='session', cascade='all, delete-orphan')

class File(Base):
    __tablename__ = 'files'
    
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String(36), ForeignKey('sessions.id', ondelete='CASCADE'), nullable=False)
    path = Column(String(500), nullable=False)
    size = Column(Integer, default=0)
    checksum = Column(String(64), nullable=True)
    last_modified_by = Column(String(20), default='user')
    last_modified_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    session = relationship('Session', back_populates='files')

class Checkpoint(Base):
    __tablename__ = 'checkpoints'
    
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String(36), ForeignKey('sessions.id', ondelete='CASCADE'), nullable=False)
    name = Column(String(200), nullable=False)
    file_paths = Column(JSON, default=list)
    diff_blob = Column(Text, nullable=True)
    author = Column(String(20), default='agent')
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    session = relationship('Session', back_populates='checkpoints')

class Plan(Base):
    __tablename__ = 'plans'
    
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String(36), ForeignKey('sessions.id', ondelete='CASCADE'), nullable=False)
    plan_json = Column(JSON, nullable=False)
    current_phase_index = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    session = relationship('Session', back_populates='plans')

class MemoryEntry(Base):
    __tablename__ = 'memory_entries'
    
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String(36), ForeignKey('sessions.id', ondelete='CASCADE'), nullable=False)
    key = Column(String(200), nullable=False)
    value = Column(Text, nullable=False)
    type = Column(String(50), default='requirement')
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    session = relationship('Session', back_populates='memory_entries')

class Provider(Base):
    __tablename__ = 'providers'
    
    id = Column(Integer, primary_key=True, index=True)
    provider_id = Column(String(50), unique=True, nullable=False)
    display_name = Column(String(100), nullable=False)
    base_url = Column(String(500), nullable=False)
    auth_type = Column(String(50), default='Bearer')
    credentials_encrypted = Column(Text, nullable=True)
    headers_json = Column(JSON, default=dict)
    health_check_endpoint = Column(String(500), nullable=True)
    default_payload_template = Column(JSON, default=dict)
    enabled = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    models = relationship('Model', back_populates='provider', cascade='all, delete-orphan')

class Model(Base):
    __tablename__ = 'models'
    
    id = Column(Integer, primary_key=True, index=True)
    provider_id = Column(Integer, ForeignKey('providers.id', ondelete='CASCADE'), nullable=False)
    model_id = Column(String(100), nullable=False)
    display_name = Column(String(200), nullable=False)
    default_params = Column(JSON, default=dict)
    per_char_cost = Column(Float, default=0.000001)
    enabled = Column(Boolean, default=True)
    tags = Column(JSON, default=list)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    provider = relationship('Provider', back_populates='models')

class TokenTransaction(Base):
    __tablename__ = 'token_transactions'
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    session_id = Column(String(36), nullable=True)
    provider_id = Column(Integer, ForeignKey('providers.id'), nullable=True)
    model_id = Column(Integer, ForeignKey('models.id'), nullable=True)
    prompt_chars = Column(Integer, default=0)
    response_chars = Column(Integer, default=0)
    total_chars = Column(Integer, default=0)
    calculated_cost = Column(Float, default=0.0)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    user = relationship('User', back_populates='token_transactions')

class CompileJob(Base):
    __tablename__ = 'compile_jobs'
    
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String(36), ForeignKey('sessions.id', ondelete='CASCADE'), nullable=False)
    status = Column(Enum(CompileStatus), default=CompileStatus.PENDING)
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    log_path = Column(String(500), nullable=True)
    artifact_path = Column(String(500), nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    session = relationship('Session', back_populates='compile_jobs')

class Log(Base):
    __tablename__ = 'logs'
    
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String(36), ForeignKey('sessions.id', ondelete='CASCADE'), nullable=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=True)
    type = Column(String(50), nullable=False)
    payload_json = Column(JSON, default=dict)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    session = relationship('Session', back_populates='logs')
