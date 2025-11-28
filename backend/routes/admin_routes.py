from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import Provider, Model, User, TokenTransaction
from schemas import (
    ProviderCreate, ProviderResponse, ProviderUpdate,
    ModelCreate, ModelResponse, ModelUpdate,
    TokenTransactionResponse
)
from auth import get_current_admin, TokenData
from crypto_utils import encrypt_string, decrypt_string
from typing import List
import logging
import aiohttp

logger = logging.getLogger(__name__)
router = APIRouter(prefix='/admin', tags=['Admin'])

@router.post('/providers', response_model=ProviderResponse)
async def create_provider(provider_data: ProviderCreate, current_user: TokenData = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    async with db as session:
        # Check if provider_id already exists
        result = await session.execute(select(Provider).where(Provider.provider_id == provider_data.provider_id))
        if result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail='Provider ID already exists')
        
        # Encrypt credentials
        encrypted_creds = encrypt_string(provider_data.credentials) if provider_data.credentials else None
        
        provider = Provider(
            provider_id=provider_data.provider_id,
            display_name=provider_data.display_name,
            base_url=provider_data.base_url,
            auth_type=provider_data.auth_type,
            credentials_encrypted=encrypted_creds,
            headers_json=provider_data.headers_json,
            health_check_endpoint=provider_data.health_check_endpoint,
            default_payload_template=provider_data.default_payload_template
        )
        session.add(provider)
        await session.commit()
        await session.refresh(provider)
        
        return ProviderResponse(
            id=provider.id,
            provider_id=provider.provider_id,
            display_name=provider.display_name,
            base_url=provider.base_url,
            auth_type=provider.auth_type,
            enabled=provider.enabled,
            created_at=provider.created_at
        )

@router.get('/providers', response_model=List[ProviderResponse])
async def get_providers(current_user: TokenData = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    async with db as session:
        result = await session.execute(select(Provider).order_by(Provider.created_at.desc()))
        providers = result.scalars().all()
        
        return [
            ProviderResponse(
                id=p.id,
                provider_id=p.provider_id,
                display_name=p.display_name,
                base_url=p.base_url,
                auth_type=p.auth_type,
                enabled=p.enabled,
                created_at=p.created_at
            )
            for p in providers
        ]

@router.patch('/providers/{provider_id}', response_model=ProviderResponse)
async def update_provider(provider_id: int, update_data: ProviderUpdate, current_user: TokenData = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    async with db as session:
        result = await session.execute(select(Provider).where(Provider.id == provider_id))
        provider = result.scalar_one_or_none()
        
        if not provider:
            raise HTTPException(status_code=404, detail='Provider not found')
        
        if update_data.display_name is not None:
            provider.display_name = update_data.display_name
        if update_data.base_url is not None:
            provider.base_url = update_data.base_url
        if update_data.auth_type is not None:
            provider.auth_type = update_data.auth_type
        if update_data.credentials is not None:
            provider.credentials_encrypted = encrypt_string(update_data.credentials)
        if update_data.headers_json is not None:
            provider.headers_json = update_data.headers_json
        if update_data.health_check_endpoint is not None:
            provider.health_check_endpoint = update_data.health_check_endpoint
        if update_data.enabled is not None:
            provider.enabled = update_data.enabled
        
        await session.commit()
        await session.refresh(provider)
        
        return ProviderResponse(
            id=provider.id,
            provider_id=provider.provider_id,
            display_name=provider.display_name,
            base_url=provider.base_url,
            auth_type=provider.auth_type,
            enabled=provider.enabled,
            created_at=provider.created_at
        )

@router.post('/providers/{provider_id}/test')
async def test_provider(provider_id: int, current_user: TokenData = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    async with db as session:
        result = await session.execute(select(Provider).where(Provider.id == provider_id))
        provider = result.scalar_one_or_none()
        
        if not provider:
            raise HTTPException(status_code=404, detail='Provider not found')
        
        # Test endpoint
        test_url = provider.health_check_endpoint if provider.health_check_endpoint else provider.base_url
        
        headers = provider.headers_json.copy() if provider.headers_json else {}
        if provider.credentials_encrypted:
            credentials = decrypt_string(provider.credentials_encrypted)
            if provider.auth_type == 'Bearer':
                headers['Authorization'] = f'Bearer {credentials}'
            elif provider.auth_type == 'API Key':
                headers['X-API-Key'] = credentials
        
        try:
            async with aiohttp.ClientSession() as client_session:
                async with client_session.get(test_url, headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as response:
                    return {
                        'success': response.status < 400,
                        'status_code': response.status,
                        'message': f'Provider responded with status {response.status}'
                    }
        except Exception as e:
            return {
                'success': False,
                'status_code': 0,
                'message': f'Connection failed: {str(e)}'
            }

@router.post('/models', response_model=ModelResponse)
async def create_model(model_data: ModelCreate, current_user: TokenData = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    async with db as session:
        # Verify provider exists
        result = await session.execute(select(Provider).where(Provider.id == model_data.provider_id))
        if not result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail='Provider not found')
        
        model = Model(
            provider_id=model_data.provider_id,
            model_id=model_data.model_id,
            display_name=model_data.display_name,
            default_params=model_data.default_params,
            per_char_cost=model_data.per_char_cost,
            tags=model_data.tags
        )
        session.add(model)
        await session.commit()
        await session.refresh(model)
        
        return ModelResponse(
            id=model.id,
            provider_id=model.provider_id,
            model_id=model.model_id,
            display_name=model.display_name,
            default_params=model.default_params,
            per_char_cost=model.per_char_cost,
            enabled=model.enabled,
            tags=model.tags,
            created_at=model.created_at
        )

@router.get('/models', response_model=List[ModelResponse])
async def get_models(current_user: TokenData = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    async with db as session:
        result = await session.execute(select(Model).order_by(Model.created_at.desc()))
        models = result.scalars().all()
        
        return [
            ModelResponse(
                id=m.id,
                provider_id=m.provider_id,
                model_id=m.model_id,
                display_name=m.display_name,
                default_params=m.default_params,
                per_char_cost=m.per_char_cost,
                enabled=m.enabled,
                tags=m.tags,
                created_at=m.created_at
            )
            for m in models
        ]

@router.patch('/models/{model_id}', response_model=ModelResponse)
async def update_model(model_id: int, update_data: ModelUpdate, current_user: TokenData = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    async with db as session:
        result = await session.execute(select(Model).where(Model.id == model_id))
        model = result.scalar_one_or_none()
        
        if not model:
            raise HTTPException(status_code=404, detail='Model not found')
        
        if update_data.display_name is not None:
            model.display_name = update_data.display_name
        if update_data.default_params is not None:
            model.default_params = update_data.default_params
        if update_data.per_char_cost is not None:
            model.per_char_cost = update_data.per_char_cost
        if update_data.enabled is not None:
            model.enabled = update_data.enabled
        if update_data.tags is not None:
            model.tags = update_data.tags
        
        await session.commit()
        await session.refresh(model)
        
        return ModelResponse(
            id=model.id,
            provider_id=model.provider_id,
            model_id=model.model_id,
            display_name=model.display_name,
            default_params=model.default_params,
            per_char_cost=model.per_char_cost,
            enabled=model.enabled,
            tags=model.tags,
            created_at=model.created_at
        )
