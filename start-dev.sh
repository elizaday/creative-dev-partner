#!/bin/bash
# Start both frontend and backend servers for development

echo "🚀 Starting Creative Development Partner..."
echo ""

# Start backend in background
echo "📦 Starting backend server (port 3001)..."
cd backend && node server.js &
BACKEND_PID=$!

# Wait a moment for backend to initialize
sleep 2

# Start frontend in background
echo "🎨 Starting frontend server (port 3000)..."
cd ../frontend && npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ Both servers started!"
echo "   Frontend: http://localhost:3000"
echo "   Backend:  http://localhost:3001"
echo ""
echo "Press Ctrl+C to stop both servers"

# Wait for either process to exit
wait $BACKEND_PID $FRONTEND_PID
