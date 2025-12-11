import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { config } from './config/env.js';
import prisma from './config/database.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { ensureDir } from './utils/zip.js';

// Routes
import authRoutes from './routes/auth.js';
import sessionRoutes from './routes/sessions.js';
import fileRoutes from './routes/files.js';
import chatRoutes from './routes/chat.js';
import compileRoutes from './routes/compile.js';
import providerRoutes from './routes/providers.js';
import adminRoutes from './routes/admin.js';

const app = express();

// Security middleware
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS - Allow dynamic origins for mobile access
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) return callback(null, true);

        // Allow localhost and any origin in development
        // In production, you would want to restrict this to specific domains
        const allowedPatterns = [
            /^http:\/\/localhost(:\d+)?$/,
            /^http:\/\/127\.0\.0\.1(:\d+)?$/,
            /^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/,  // Local network IPs
            /^http:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/,   // Private network
            /^http:\/\/172\.(1[6-9]|2\d|3[01])\.\d+\.\d+(:\d+)?$/, // Private network
        ];

        const isAllowed = allowedPatterns.some(pattern => pattern.test(origin));
        if (isAllowed || process.env.NODE_ENV === 'development') {
            callback(null, true);
        } else {
            callback(null, config.frontendUrl); // Fall back to configured frontend URL in production
        }
    },
    credentials: true,
}));


// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Limit each IP to 1000 requests per windowMs
    message: { error: 'Too many requests, please try again later.' },
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/compile', compileRoutes);
app.use('/api/providers', providerRoutes);
app.use('/api/admin', adminRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Startup
async function startServer() {
    try {
        // Ensure storage directories exist
        await ensureDir(config.storage.path);
        await ensureDir(`${config.storage.path}/sessions`);
        await ensureDir(`${config.storage.path}/temp`);
        await ensureDir(`${config.storage.path}/builds`);
        await ensureDir(`${config.storage.path}/artifacts`);

        // Test database connection
        await prisma.$connect();
        console.log('✅ Database connected');

        // Start server
        app.listen(config.port, () => {
            console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║     █████╗ ██╗   ██╗██████╗  ██████╗ ██████╗  █████╗     ║
║    ██╔══██╗██║   ██║██╔══██╗██╔═══██╗██╔══██╗██╔══██╗    ║
║    ███████║██║   ██║██████╔╝██║   ██║██████╔╝███████║    ║
║    ██╔══██║██║   ██║██╔══██╗██║   ██║██╔══██╗██╔══██║    ║
║    ██║  ██║╚██████╔╝██║  ██║╚██████╔╝██║  ██║██║  ██║    ║
║    ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝    ║
║                      CRAFT                                ║
║                                                           ║
║   🚀 Server running on http://localhost:${config.port}             ║
║   📦 Environment: ${config.nodeEnv.padEnd(35)}║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
      `);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Shutting down...');
    await prisma.$disconnect();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('Shutting down...');
    await prisma.$disconnect();
    process.exit(0);
});

startServer();

export default app;
