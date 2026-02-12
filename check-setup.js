#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('\n🔍 Checking Creative Dev Partner setup...\n');

let allGood = true;

// Check Node version
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
if (majorVersion < 18) {
  console.log('❌ Node.js version:', nodeVersion, '(Need 18+)');
  allGood = false;
} else {
  console.log('✅ Node.js version:', nodeVersion);
}

// Check backend .env
const backendEnvPath = path.join(__dirname, 'backend', '.env');
if (fs.existsSync(backendEnvPath)) {
  const envContent = fs.readFileSync(backendEnvPath, 'utf-8');
  if (envContent.includes('ANTHROPIC_API_KEY=sk-ant-')) {
    console.log('✅ Backend .env file configured');
  } else if (envContent.includes('your_api_key_here')) {
    console.log('⚠️  Backend .env exists but API key not set');
    console.log('   → Edit backend/.env and add your Anthropic API key');
    allGood = false;
  } else {
    console.log('⚠️  Backend .env exists but format unclear');
    allGood = false;
  }
} else {
  console.log('❌ Backend .env file missing');
  console.log('   → Run: cp .env.example backend/.env');
  allGood = false;
}

// Check backend node_modules
const backendModules = path.join(__dirname, 'backend', 'node_modules');
if (fs.existsSync(backendModules)) {
  console.log('✅ Backend dependencies installed');
} else {
  console.log('❌ Backend dependencies not installed');
  console.log('   → Run: cd backend && npm install');
  allGood = false;
}

// Check frontend node_modules
const frontendModules = path.join(__dirname, 'frontend', 'node_modules');
if (fs.existsSync(frontendModules)) {
  console.log('✅ Frontend dependencies installed');
} else {
  console.log('❌ Frontend dependencies not installed');
  console.log('   → Run: cd frontend && npm install');
  allGood = false;
}

// Check sessions directory
const sessionsDir = path.join(__dirname, 'sessions');
if (!fs.existsSync(sessionsDir)) {
  console.log('ℹ️  Creating sessions directory...');
  fs.mkdirSync(sessionsDir, { recursive: true });
  console.log('✅ Sessions directory created');
} else {
  console.log('✅ Sessions directory exists');
}

console.log('\n' + '='.repeat(50) + '\n');

if (allGood) {
  console.log('🎉 Setup looks good! Ready to start.\n');
  console.log('To run the app:');
  console.log('  Terminal 1: cd backend && npm run dev');
  console.log('  Terminal 2: cd frontend && npm run dev');
  console.log('  Then open: http://localhost:3000\n');
} else {
  console.log('⚠️  Please fix the issues above, then run this check again.\n');
  process.exit(1);
}
