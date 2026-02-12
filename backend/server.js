import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import apiRoutes from './routes/api.js';

// Load environment variables
const envConfig = dotenv.config();
if (envConfig.parsed) {
  Object.keys(envConfig.parsed).forEach(key => {
    process.env[key] = envConfig.parsed[key];
  });
}

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api', apiRoutes);

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║  Creative Development Partner API        ║
║  Server running on http://localhost:${PORT}  ║
╚═══════════════════════════════════════════╝

Environment:
  - Node: ${process.version}
  - API Key: ${process.env.ANTHROPIC_API_KEY ? '✓ Set' : '✗ Missing'}

Ready to generate creative concepts!
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});
