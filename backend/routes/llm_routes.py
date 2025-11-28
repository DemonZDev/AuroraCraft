from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import Session, Model, Provider
from schemas import LLMCallRequest, LLMCallResponse, ModelResponse
from auth import get_current_user, TokenData
from llm_integration import LLMIntegrationService
from typing import List
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix='/llm', tags=['LLM'])

@router.post('/call', response_model=LLMCallResponse)
async def call_llm(request: LLMCallRequest, current_user: TokenData = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    async with db as session:
        # Verify session ownership
        result = await session.execute(
            select(Session).where(Session.id == request.session_id, Session.owner_id == current_user.user_id)
        )
        if not result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail='Session not found')
        
        # Call LLM
        llm_service = LLMIntegrationService(session)
        try:
            result = await llm_service.call_llm(
                user_id=current_user.user_id,
                session_id=request.session_id,
                model_id=request.model_id,
                prompt=request.prompt,
                system_prompt=request.system_prompt,
                temperature=request.temperature,
                max_tokens=request.max_tokens
            )
            
            return LLMCallResponse(**result)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            logger.error(f'LLM call failed: {str(e)}')
            raise HTTPException(status_code=500, detail=f'LLM call failed: {str(e)}')

@router.get('/models', response_model=List[ModelResponse])
async def get_available_models(current_user: TokenData = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    async with db as session:
        result = await session.execute(
            select(Model, Provider)
            .join(Provider, Model.provider_id == Provider.id)
            .where(Model.enabled == True, Provider.enabled == True)
            .order_by(Provider.display_name, Model.display_name)
        )
        rows = result.all()
        
        return [
            ModelResponse(
                id=model.id,
                provider_id=model.provider_id,
                model_id=model.model_id,
                display_name=f'{provider.display_name} - {model.display_name}',
                default_params=model.default_params,
                per_char_cost=model.per_char_cost,
                enabled=model.enabled,
                tags=model.tags,
                created_at=model.created_at
            )
            for model, provider in rows
        ]
