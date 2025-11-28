import asyncio
from sqlalchemy import select
from database import AsyncSessionLocal, init_db
from models import User, UserRole, Provider, Model
from auth import get_password_hash
from crypto_utils import encrypt_string
import os
import logging

logger = logging.getLogger(__name__)

async def seed_admin_user():
    """Seed default admin user"""
    async with AsyncSessionLocal() as session:
        # Check if admin exists
        result = await session.execute(select(User).where(User.email == 'admin@auroracraft.dev'))
        if result.scalar_one_or_none():
            logger.info('Admin user already exists')
            return
        
        admin = User(
            username='admin',
            email='admin@auroracraft.dev',
            password_hash=get_password_hash('Admin123!'),
            role=UserRole.ADMIN,
            token_balance=1000000.0
        )
        session.add(admin)
        await session.commit()
        logger.info('Admin user created successfully')

async def seed_providers():
    """Seed LLM providers with user-provided keys"""
    async with AsyncSessionLocal() as session:
        # OpenRouter
        openrouter_key = os.getenv('OPENROUTER_API_KEY', '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')
        result = await session.execute(select(Provider).where(Provider.provider_id == 'openrouter'))
        if not result.scalar_one_or_none():
            openrouter = Provider(
                provider_id='openrouter',
                display_name='OpenRouter',
                base_url='https://openrouter.ai/api/v1/chat/completions',
                auth_type='Bearer',
                credentials_encrypted=encrypt_string(openrouter_key),
                headers_json={'HTTP-Referer': 'https://auroracraft.dev', 'X-Title': 'AuroraCraft'},
                default_payload_template={}
            )
            session.add(openrouter)
            logger.info('OpenRouter provider created')
        
        # Google
        google_key = os.getenv('GOOGLE_API_KEY', 'AIzaSyCA8wx2uqnL0pCQ5lgd1fxOa-XX3ls21W4')
        result = await session.execute(select(Provider).where(Provider.provider_id == 'google'))
        if not result.scalar_one_or_none():
            google = Provider(
                provider_id='google',
                display_name='Google AI',
                base_url='https://generativelanguage.googleapis.com/v1beta/models',
                auth_type='API Key',
                credentials_encrypted=encrypt_string(google_key),
                headers_json={},
                default_payload_template={}
            )
            session.add(google)
            logger.info('Google provider created')
        
        await session.commit()

async def seed_models():
    """Seed default models"""
    async with AsyncSessionLocal() as session:
        # Get providers
        result = await session.execute(select(Provider).where(Provider.provider_id == 'openrouter'))
        openrouter = result.scalar_one_or_none()
        
        result = await session.execute(select(Provider).where(Provider.provider_id == 'google'))
        google = result.scalar_one_or_none()
        
        models_to_create = []
        
        if openrouter:
            # OpenRouter models
            openrouter_models = [
                ('openai/gpt-4o', 'GPT-4o', 0.000003, ['fast', 'capable']),
                ('openai/gpt-4o-mini', 'GPT-4o Mini', 0.0000003, ['fast', 'cheap']),
                ('anthropic/claude-3.5-sonnet', 'Claude 3.5 Sonnet', 0.000003, ['capable', 'reasoning']),
                ('google/gemini-2.0-flash-exp:free', 'Gemini 2.0 Flash (Free)', 0.0, ['free', 'fast']),
                ('meta-llama/llama-3.3-70b-instruct', 'Llama 3.3 70B', 0.0000005, ['free', 'capable']),
            ]
            
            for model_id, display_name, cost, tags in openrouter_models:
                result = await session.execute(
                    select(Model).where(Model.provider_id == openrouter.id, Model.model_id == model_id)
                )
                if not result.scalar_one_or_none():
                    models_to_create.append(Model(
                        provider_id=openrouter.id,
                        model_id=model_id,
                        display_name=display_name,
                        default_params={'temperature': 0.7, 'max_tokens': 4000},
                        per_char_cost=cost,
                        tags=tags
                    ))
        
        if google:
            # Google models
            google_models = [
                ('gemini-2.0-flash-exp', 'Gemini 2.0 Flash', 0.0000001, ['fast', 'multimodal']),
            ]
            
            for model_id, display_name, cost, tags in google_models:
                result = await session.execute(
                    select(Model).where(Model.provider_id == google.id, Model.model_id == model_id)
                )
                if not result.scalar_one_or_none():
                    models_to_create.append(Model(
                        provider_id=google.id,
                        model_id=model_id,
                        display_name=display_name,
                        default_params={'temperature': 0.7, 'max_tokens': 4000},
                        per_char_cost=cost,
                        tags=tags
                    ))
        
        if models_to_create:
            session.add_all(models_to_create)
            await session.commit()
            logger.info(f'Created {len(models_to_create)} models')

async def seed_all():
    """Run all seed functions"""
    logger.info('Starting database seed...')
    await init_db()
    await seed_admin_user()
    await seed_providers()
    await seed_models()
    logger.info('Database seed completed')

if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    asyncio.run(seed_all())
