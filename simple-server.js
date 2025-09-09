const http = require('http');

console.log('🚀 Starting Cartaisy Backend Server...');
console.log('📝 All environment variables:', JSON.stringify(process.env, null, 2));

const PORT = process.env.PORT || 3000;
console.log('🔌 Using PORT:', PORT);

// Create a simple server
const server = http.createServer((req, res) => {
  console.log(`Request received: ${req.method} ${req.url}`);
  
  // Health check endpoint
  if (req.url === '/api/health' || req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      port: PORT,
      timestamp: new Date().toISOString()
    }));
    return;
  }
  
  // Root endpoint
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      message: 'Cartaisy Backend is running',
      health: '/api/health'
    }));
    return;
  }
  
  // 404 for other routes
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log('✅ Server successfully started!');
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🏥 Health check: http://0.0.0.0:${PORT}/api/health`);
  console.log(`🌍 Server bound to 0.0.0.0:${PORT}`);
});

server.on('error', (err) => {
  console.error('❌ Server failed to start:', err.message);
  console.error('Stack:', err.stack);
  process.exit(1);
});

server.on('listening', () => {
  console.log('🎉 Server is now listening for connections');
});

// Handle process termination
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  server.close(() => {
    process.exit(0);
  });
});