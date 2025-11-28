from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os
import logging
from pathlib import Path
from contextlib import asynccontextmanager

# Import routes
from routes import auth_routes, session_routes, file_routes, admin_routes, compile_routes, llm_routes
from database import init_db
from seed_data import seed_all

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info('Initializing database...')
    await init_db()
    logger.info('Seeding database...')
    await seed_all()
    logger.info('AuroraCraft API started')
    yield
    # Shutdown
    logger.info('AuroraCraft API shutting down')

# Create the main app
app = FastAPI(
    title='AuroraCraft API',
    description='Agentic AI Platform for Minecraft Plugin Development',
    version='1.0.0',
    lifespan=lifespan
)

# Create API router
api_router = APIRouter(prefix='/api')

# Health check
@api_router.get('/')
async def root():
    return {'message': 'AuroraCraft API', 'version': '1.0.0', 'status': 'operational'}

# Include all routers
api_router.include_router(auth_routes.router)
api_router.include_router(session_routes.router)
api_router.include_router(file_routes.router)
api_router.include_router(admin_routes.router)
api_router.include_router(compile_routes.router)
api_router.include_router(llm_routes.router)

# Include the API router in the main app
app.include_router(api_router)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=['*'],
    allow_headers=['*'],
)