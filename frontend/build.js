import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createProxyMiddleware } from 'http-proxy-middleware';

// ✅ recreate __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5173;

const distPath = join(__dirname, 'dist');

// API Proxy - must be BEFORE static files
app.use('/api', createProxyMiddleware({
  target: 'https://system.200m.website',
  changeOrigin: true,
  secure: false,
  logLevel: 'debug'
}));

// Serve static files
app.use(express.static(distPath));

// Fallback to index.html for all routes
app.use((req, res) => {
  res.sendFile(join(distPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
});