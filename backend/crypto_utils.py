from cryptography.fernet import Fernet
import os
import base64
from hashlib import sha256

# Generate encryption key from secret
def get_encryption_key():
    secret = os.getenv('ENCRYPTION_SECRET', 'auroracraft-encryption-secret-change-in-production')
    key = base64.urlsafe_b64encode(sha256(secret.encode()).digest())
    return key

fernet = Fernet(get_encryption_key())

def encrypt_string(text: str) -> str:
    """Encrypt a string and return base64 encoded result"""
    if not text:
        return ''
    encrypted = fernet.encrypt(text.encode())
    return base64.b64encode(encrypted).decode()

def decrypt_string(encrypted_text: str) -> str:
    """Decrypt a base64 encoded encrypted string"""
    if not encrypted_text:
        return ''
    encrypted = base64.b64decode(encrypted_text.encode())
    decrypted = fernet.decrypt(encrypted)
    return decrypted.decode()
