# Quick Start Guide

Get the Creative Development Partner running in 3 minutes.

## Prerequisites

- Node.js 18+ installed
- Anthropic API key from [console.anthropic.com](https://console.anthropic.com/)

## Setup (First Time Only)

### Option 1: Automated Setup

```bash
cd creative-dev-partner
npm run setup
```

This will:
1. Copy `.env.example` to `backend/.env`
2. Install all dependencies

Then edit `backend/.env` and add your API key:
```
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

### Option 2: Manual Setup

```bash
# 1. Create environment file
cp .env.example backend/.env

# 2. Edit backend/.env and add your API key
# ANTHROPIC_API_KEY=sk-ant-your-key-here

# 3. Install dependencies
cd backend && npm install
cd ../frontend && npm install
```

## Running the App

You need **two terminal windows**.

### Terminal 1 - Backend
```bash
cd backend
npm run dev
```

Wait for:
```
╔═══════════════════════════════════════════╗
║  Creative Development Partner API        ║
║  Server running on http://localhost:3001  ║
╚═══════════════════════════════════════════╝
```

### Terminal 2 - Frontend
```bash
cd frontend
npm run dev
```

Wait for:
```
➜  Local:   http://localhost:3000/
```

### Open Browser

Navigate to: **http://localhost:3000**

## First Use

1. Paste a client brief (minimum 50 characters)
2. Click "Generate 10 Ideas"
3. Select up to 5 ideas
4. Click "Get Variations on Selected"
5. Pick 3 variations
6. Click "Develop Final 3"

## Example Brief

```
PROJECT: :30 Commercial for Luna Sleep Tea
OBJECTIVE: Position Luna as the tea that helps busy professionals wind down
KEY MESSAGE: 'Finally, a way to turn off your brain'
TONE: Warm, slightly humorous, relatable
TARGET: Working professionals 30-45 who struggle to disconnect
CONSTRAINTS: 30-second format, lifestyle aesthetic
```

## Troubleshooting

**"Failed to generate ideas"**
→ Check that your API key is correct in `backend/.env`

**Port already in use**
→ Kill the process using that port or change the port in the config files

**Dependencies not installing**
→ Make sure you have Node.js 18+ installed (`node --version`)

## What's Next?

See [README.md](README.md) for:
- Full documentation
- API details
- Project structure
- Advanced features

---

Built by Elizabeth Strickler | Powered by Claude
