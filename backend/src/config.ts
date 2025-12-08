import dotenv from 'dotenv';
dotenv.config();

export const config = {
    // Server
    port: parseInt(process.env.PORT || '4000', 10),
    host: process.env.HOST || '0.0.0.0',
    nodeEnv: process.env.NODE_ENV || 'development',
    isDev: process.env.NODE_ENV !== 'production',

    // Database
    databaseUrl: process.env.DATABASE_URL!,

    // Redis
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

    // JWT
    jwt: {
        secret: process.env.JWT_SECRET || 'change-me-in-production',
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    },

    // Encryption (for provider credentials)
    encryptionKey: process.env.ENCRYPTION_KEY || '00000000000000000000000000000000',

    // CORS
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',

    // File Storage
    workspacePath: process.env.WORKSPACE_PATH || './data/workspaces',
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '52428800', 10), // 50MB
    maxZipSize: parseInt(process.env.MAX_ZIP_SIZE || '104857600', 10), // 100MB

    // Rate Limiting
    rateLimit: {
        max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
        timeWindow: parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10),
    },

    // Allowed file extensions
    allowedExtensions: [
        '.java', '.kt', '.xml', '.yml', '.yaml', '.json',
        '.txt', '.md', '.html', '.css', '.js', '.ts',
        '.properties', '.gradle', '.toml'
    ],
};

// Validate required config
if (!config.databaseUrl && config.nodeEnv === 'production') {
    throw new Error('DATABASE_URL is required in production');
}

// Validate encryption key format (64 hex chars = 32 bytes)
if (config.encryptionKey.length !== 64 || !/^[0-9a-fA-F]+$/.test(config.encryptionKey)) {
    if (config.nodeEnv === 'production') {
        throw new Error('ENCRYPTION_KEY must be 64 hexadecimal characters (32 bytes)');
    }
    console.warn('⚠️  Warning: Using default encryption key. Set ENCRYPTION_KEY in production.');
}

