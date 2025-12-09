import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
    // Server
    port: parseInt(process.env.BACKEND_PORT || '3001', 10),
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
    nodeEnv: process.env.NODE_ENV || 'development',

    // JWT
    jwt: {
        secret: process.env.JWT_SECRET || 'auroracraft-secret-change-me',
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    },

    // Database
    databaseUrl: process.env.DATABASE_URL,

    // Default Admin
    defaultAdmin: {
        username: process.env.DEFAULT_ADMIN_USERNAME || 'admin',
        email: process.env.DEFAULT_ADMIN_EMAIL || 'admin@auroracraft.local',
        password: process.env.DEFAULT_ADMIN_PASSWORD || 'Admin123!',
    },

    // Compilation
    compilation: {
        mavenHome: process.env.MAVEN_HOME || '/usr/share/maven',
        javaHome: process.env.JAVA_HOME || '/usr/lib/jvm/java-21-openjdk-amd64',
        timeoutMs: parseInt(process.env.COMPILE_TIMEOUT_MS || '300000', 10),
    },

    // File Storage
    storage: {
        path: process.env.STORAGE_PATH || './storage',
        maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB || '50', 10),
    },
};

export default config;
