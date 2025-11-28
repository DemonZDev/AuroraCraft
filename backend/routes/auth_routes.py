from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import User, UserRole
from schemas import UserRegister, UserLogin, TokenResponse, UserResponse
from auth import get_password_hash, verify_password, create_access_token, get_current_user, TokenData
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix='/auth', tags=['Authentication'])

@router.post('/register', response_model=TokenResponse)
async def register(user_data: UserRegister, db: AsyncSession = Depends(get_db)):
    async with db as session:
        # Validate passwords match
        if user_data.password != user_data.confirm_password:
            raise HTTPException(status_code=400, detail='Passwords do not match')
        
        # Check if username exists
        result = await session.execute(select(User).where(User.username == user_data.username))
        if result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail='Username already exists')
        
        # Check if email exists
        result = await session.execute(select(User).where(User.email == user_data.email))
        if result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail='Email already exists')
        
        # Create user
        user = User(
            username=user_data.username,
            email=user_data.email,
            password_hash=get_password_hash(user_data.password),
            role=UserRole.USER,
            token_balance=10000.0  # Initial balance
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        
        # Create token
        access_token = create_access_token({
            'user_id': user.id,
            'username': user.username,
            'role': user.role.value
        })
        
        user_response = UserResponse(
            id=user.id,
            username=user.username,
            email=user.email,
            role=user.role.value,
            token_balance=user.token_balance,
            created_at=user.created_at
        )
        
        return TokenResponse(access_token=access_token, user=user_response)

@router.post('/login', response_model=TokenResponse)
async def login(credentials: UserLogin, db: AsyncSession = Depends(get_db)):
    async with db as session:
        # Find user by email
        result = await session.execute(select(User).where(User.email == credentials.email))
        user = result.scalar_one_or_none()
        
        if not user or not verify_password(credentials.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail='Invalid email or password'
            )
        
        # Create token
        access_token = create_access_token({
            'user_id': user.id,
            'username': user.username,
            'role': user.role.value
        })
        
        user_response = UserResponse(
            id=user.id,
            username=user.username,
            email=user.email,
            role=user.role.value,
            token_balance=user.token_balance,
            created_at=user.created_at
        )
        
        return TokenResponse(access_token=access_token, user=user_response)

@router.get('/me', response_model=UserResponse)
async def get_me(current_user: TokenData = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    async with db as session:
        result = await session.execute(select(User).where(User.id == current_user.user_id))
        user = result.scalar_one_or_none()
        
        if not user:
            raise HTTPException(status_code=404, detail='User not found')
        
        return UserResponse(
            id=user.id,
            username=user.username,
            email=user.email,
            role=user.role.value,
            token_balance=user.token_balance,
            created_at=user.created_at
        )
