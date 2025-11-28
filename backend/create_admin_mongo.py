#!/usr/bin/env python3
"""
Create admin account using MongoDB (for environments without PostgreSQL)
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from datetime import datetime, timezone
import os
from dotenv import load_dotenv

load_dotenv()

pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto')

async def create_admin():
    # Connect to MongoDB
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    client = AsyncIOMotorClient(mongo_url)
    db = client['auroracraft_demo']
    
    print("🔐 Creating AuroraCraft Admin Account...\n")
    
    # Check if admin exists
    existing_admin = await db.users.find_one({'email': 'admin@auroracraft.local'})
    
    if existing_admin:
        print("⚠️  Admin account already exists!")
        print(f"   Email: {existing_admin['email']}")
        print(f"   Username: {existing_admin['username']}")
        print(f"   Token Balance: {existing_admin.get('token_balance', 0)}")
        return
    
    # Create admin user
    admin_user = {
        'username': 'admin',
        'email': 'admin@auroracraft.local',
        'password_hash': pwd_context.hash('Admin123!'),
        'role': 'admin',
        'token_balance': 1000000.0,
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    
    result = await db.users.insert_one(admin_user)
    
    print("✅ Admin account created successfully!\n")
    print("=" * 50)
    print("📧 Email:    admin@auroracraft.local")
    print("🔑 Password: Admin123!")
    print("👤 Role:     admin")
    print("💰 Tokens:   1,000,000")
    print("=" * 50)
    print("\n🎯 You can now login at http://localhost:3000")
    print("📝 Remember to change the password after first login!\n")
    
    client.close()

if __name__ == '__main__':
    asyncio.run(create_admin())
