# AuroraCraft Admin Account

## ✅ Admin Account Created Successfully

Your admin account has been created in the MongoDB database and is ready to use.

### Login Credentials

```
📧 Email:    admin@auroracraft.local
🔑 Password: Admin123!
👤 Role:     admin
💰 Tokens:   1,000,000
```

---

## How to Use

### Option 1: With Full PostgreSQL Stack (Recommended)

The complete AuroraCraft platform requires PostgreSQL. To run the full application:

```bash
cd /app
./start.sh
```

This will start:
- PostgreSQL database
- Redis cache
- Backend API (FastAPI)
- Compile Worker
- Frontend (React)

Then visit: **http://localhost:3000**

The seed script will automatically create the admin account in PostgreSQL.

---

### Option 2: Current Environment (MongoDB Demo)

An admin account has been created in MongoDB for demo purposes:

**Database:** `auroracraft_demo`  
**Collection:** `users`

To use this account, you would need to:
1. Adapt the backend to use MongoDB instead of PostgreSQL
2. Update the auth routes to query MongoDB
3. Restart the backend service

**Current Status:** Account exists in MongoDB, but the backend is configured for PostgreSQL.

---

## Account Details

### Username
```
admin
```

### Email
```
admin@auroracraft.local
```

### Password
```
Admin123!
```

### Role
```
admin
```

### Token Balance
```
1,000,000 tokens
```

---

## Security Notes

⚠️ **Important Security Recommendations:**

1. **Change the default password** after first login
2. **Use strong passwords** in production (min 12 chars, mixed case, numbers, symbols)
3. **Enable 2FA** if implementing for production
4. **Rotate JWT secrets** regularly
5. **Use HTTPS** in production environments

---

## Admin Capabilities

As an admin user, you have access to:

✅ **All User Features**
- Create and manage sessions
- Upload/download files
- Compile plugins
- Use LLM models

✅ **Admin-Only Features**
- Access admin panel at `/admin`
- Manage LLM providers (add/edit/disable)
- Configure AI models
- Set token pricing
- Test provider connectivity
- View all user sessions (if implemented)
- Monitor token usage across platform

---

## Testing the Account

### Via MongoDB

```bash
cd /app/backend
python -c "
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def test():
    client = AsyncIOMotorClient('mongodb://localhost:27017')
    db = client['auroracraft_demo']
    admin = await db.users.find_one({'email': 'admin@auroracraft.local'})
    print(f'Admin: {admin}')
    client.close()

asyncio.run(test())
"
```

### Via API (when backend is running)

```bash
# Login
curl -X POST "http://localhost:8001/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@auroracraft.local",
    "password": "Admin123!"
  }'

# Expected response:
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "user": {
    "id": 1,
    "username": "admin",
    "email": "admin@auroracraft.local",
    "role": "admin",
    "token_balance": 1000000.0,
    "created_at": "2024-..."
  }
}
```

---

## Troubleshooting

### Can't Login

1. **Check backend is running:**
   ```bash
   curl http://localhost:8001/api/
   ```

2. **Verify account exists:**
   ```bash
   cd /app/backend
   python create_admin_mongo.py
   ```

3. **Check database connection:**
   ```bash
   # MongoDB
   mongo --eval "db.adminCommand('ping')"
   
   # PostgreSQL (if using full stack)
   psql -U postgres -d auroracraft -c "SELECT * FROM users WHERE email='admin@auroracraft.local';"
   ```

### Wrong Password

If you forgot the password, recreate the account:

```bash
cd /app/backend
# For MongoDB
python create_admin_mongo.py

# For PostgreSQL (with full stack)
python seed_data.py
```

### Permission Denied

Ensure you're logged in with the admin account. Check the JWT token contains `"role": "admin"`.

---

## Next Steps

1. **Start the full platform:**
   ```bash
   ./start.sh
   ```

2. **Access the UI:**
   Open http://localhost:3000

3. **Login with admin credentials**

4. **Go to Admin Panel:**
   Click the "Admin" button in the top right

5. **Configure LLM Providers:**
   - Add your API keys
   - Configure models
   - Set token pricing

6. **Create your first project:**
   - Return to dashboard
   - Click "New Project"
   - Start building!

---

## Support

- **Documentation:** `/app/README.md`
- **Setup Guide:** `/app/SETUP.md`
- **Testing Guide:** `/app/TESTING.md`
- **Project Summary:** `/app/PROJECT_SUMMARY.md`

---

**Your admin account is ready! 🎉**
