import aiohttp
import json
from typing import Dict, Any, Optional, AsyncGenerator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from models import Provider, Model, User, TokenTransaction
from crypto_utils import decrypt_string
import logging

logger = logging.getLogger(__name__)

class LLMAdapter:
    def __init__(self, provider: Provider, model: Model, credentials: str):
        self.provider = provider
        self.model = model
        self.credentials = credentials
        self.base_url = provider.base_url
        self.auth_type = provider.auth_type
        self.headers = provider.headers_json.copy() if provider.headers_json else {}
        
    def _get_headers(self) -> Dict[str, str]:
        headers = self.headers.copy()
        headers['Content-Type'] = 'application/json'
        
        if self.auth_type == 'Bearer':
            headers['Authorization'] = f'Bearer {self.credentials}'
        elif self.auth_type == 'API Key':
            headers['X-API-Key'] = self.credentials
        
        return headers
    
    def _build_payload(self, prompt: str, system_prompt: Optional[str], temperature: float, max_tokens: int) -> Dict[str, Any]:
        # OpenRouter / OpenAI compatible format
        messages = []
        if system_prompt:
            messages.append({'role': 'system', 'content': system_prompt})
        messages.append({'role': 'user', 'content': prompt})
        
        payload = {
            'model': self.model.model_id,
            'messages': messages,
            'temperature': temperature,
            'max_tokens': max_tokens
        }
        
        # Merge with provider default template
        if self.provider.default_payload_template:
            payload.update(self.provider.default_payload_template)
        
        return payload
    
    async def call(self, prompt: str, system_prompt: Optional[str] = None, 
                   temperature: float = 0.7, max_tokens: int = 4000) -> Dict[str, Any]:
        headers = self._get_headers()
        payload = self._build_payload(prompt, system_prompt, temperature, max_tokens)
        
        async with aiohttp.ClientSession() as session:
            try:
                async with session.post(self.base_url, headers=headers, json=payload, timeout=aiohttp.ClientTimeout(total=120)) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        logger.error(f'LLM API error: {response.status} - {error_text}')
                        raise Exception(f'LLM API error: {response.status} - {error_text}')
                    
                    data = await response.json()
                    
                    # Extract response based on provider format
                    if 'choices' in data and len(data['choices']) > 0:
                        content = data['choices'][0].get('message', {}).get('content', '')
                    elif 'content' in data:
                        content = data['content']
                    else:
                        content = str(data)
                    
                    # Calculate token usage
                    prompt_chars = len(prompt) + (len(system_prompt) if system_prompt else 0)
                    response_chars = len(content)
                    
                    return {
                        'response': content,
                        'prompt_chars': prompt_chars,
                        'response_chars': response_chars,
                        'raw_data': data
                    }
            except Exception as e:
                logger.error(f'LLM call failed: {str(e)}')
                raise

class LLMIntegrationService:
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def get_adapter(self, model_id: int) -> LLMAdapter:
        result = await self.db.execute(
            select(Model, Provider)
            .join(Provider, Model.provider_id == Provider.id)
            .where(Model.id == model_id, Model.enabled == True, Provider.enabled == True)
        )
        row = result.first()
        
        if not row:
            raise ValueError(f'Model {model_id} not found or disabled')
        
        model, provider = row
        
        # Decrypt credentials
        credentials = decrypt_string(provider.credentials_encrypted) if provider.credentials_encrypted else ''
        
        return LLMAdapter(provider, model, credentials)
    
    async def call_llm(self, user_id: int, session_id: str, model_id: int, 
                       prompt: str, system_prompt: Optional[str] = None,
                       temperature: Optional[float] = None, max_tokens: Optional[int] = None) -> Dict[str, Any]:
        # Get user
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise ValueError('User not found')
        
        # Get adapter
        adapter = await self.get_adapter(model_id)
        
        # Use model defaults if not provided
        if temperature is None:
            temperature = adapter.model.default_params.get('temperature', 0.7)
        if max_tokens is None:
            max_tokens = adapter.model.default_params.get('max_tokens', 4000)
        
        # Calculate estimated cost
        estimated_chars = len(prompt) + (len(system_prompt) if system_prompt else 0) + max_tokens
        estimated_cost = estimated_chars * adapter.model.per_char_cost
        
        # Check balance
        if user.token_balance < estimated_cost:
            raise ValueError('Insufficient token balance')
        
        # Call LLM
        result = await adapter.call(prompt, system_prompt, temperature, max_tokens)
        
        # Calculate actual cost
        total_chars = result['prompt_chars'] + result['response_chars']
        actual_cost = total_chars * adapter.model.per_char_cost
        
        # Deduct tokens
        user.token_balance -= actual_cost
        
        # Record transaction
        transaction = TokenTransaction(
            user_id=user_id,
            session_id=session_id,
            provider_id=adapter.provider.id,
            model_id=model_id,
            prompt_chars=result['prompt_chars'],
            response_chars=result['response_chars'],
            total_chars=total_chars,
            calculated_cost=actual_cost
        )
        self.db.add(transaction)
        await self.db.commit()
        
        return {
            'response': result['response'],
            'prompt_chars': result['prompt_chars'],
            'response_chars': result['response_chars'],
            'total_chars': total_chars,
            'calculated_cost': actual_cost
        }
