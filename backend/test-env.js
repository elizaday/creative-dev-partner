require('dotenv').config(); console.log('Test:', process.env.ANTHROPIC_API_KEY); console.log('All env keys:', Object.keys(process.env).filter(k => k.includes('ANTHROPIC')));
