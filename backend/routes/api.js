import express from 'express';
import * as claude from '../services/claude.js';
import fs from 'fs/promises';
import path from 'path';

const router = express.Router();

// Session storage directory
const SESSIONS_DIR = path.join(process.cwd(), '../sessions');

// Ensure sessions directory exists
await fs.mkdir(SESSIONS_DIR, { recursive: true });

// Generate ideas from brief
router.post('/ideas', async (req, res) => {
  try {
    const { brief } = req.body;

    if (!brief || brief.trim().length < 50) {
      return res.status(400).json({ error: 'Brief must be at least 50 characters' });
    }

    const ideas = await claude.generateIdeas(brief);
    res.json({ ideas });
  } catch (error) {
    console.error('Error generating ideas:', error);
    res.status(500).json({ error: 'Failed to generate ideas', details: error.message });
  }
});

// Generate variations for selected ideas
router.post('/variations', async (req, res) => {
  try {
    const { brief, selectedIdeas } = req.body;

    if (!brief || !selectedIdeas || selectedIdeas.length === 0) {
      return res.status(400).json({ error: 'Brief and selected ideas are required' });
    }

    if (selectedIdeas.length > 3) {
      return res.status(400).json({ error: 'Maximum 3 ideas can be selected for variations to avoid response truncation' });
    }

    console.log(`\n📝 Generating variations for ${selectedIdeas.length} ideas...`);
    const variations = await claude.generateVariations(brief, selectedIdeas);
    console.log(`✅ Generated ${variations.length} variation groups`);

    res.json({ variations });
  } catch (error) {
    console.error('❌ Error generating variations:', error);
    res.status(500).json({ error: 'Failed to generate variations', details: error.message });
  }
});

// Develop final concepts
router.post('/final-concepts', async (req, res) => {
  try {
    const { brief, selectedVariations } = req.body;

    if (!brief || !selectedVariations || selectedVariations.length === 0) {
      return res.status(400).json({ error: 'Brief and selected variations are required' });
    }

    if (selectedVariations.length > 3) {
      return res.status(400).json({ error: 'Maximum 3 variations can be selected' });
    }

    const concepts = await claude.developFinalConcepts(brief, selectedVariations);
    res.json({ concepts });
  } catch (error) {
    console.error('Error developing final concepts:', error);
    res.status(500).json({ error: 'Failed to develop final concepts', details: error.message });
  }
});

// Refine a concept based on feedback
router.post('/refine', async (req, res) => {
  try {
    const { brief, concept, feedback } = req.body;

    if (!brief || !concept || !feedback) {
      return res.status(400).json({ error: 'Brief, concept, and feedback are required' });
    }

    const refined = await claude.refineConcept(brief, concept, feedback);
    res.json({ concept: refined });
  } catch (error) {
    console.error('Error refining concept:', error);
    res.status(500).json({ error: 'Failed to refine concept', details: error.message });
  }
});

// Save session
router.post('/sessions', async (req, res) => {
  try {
    const { name, data } = req.body;

    if (!name || !data) {
      return res.status(400).json({ error: 'Session name and data are required' });
    }

    const sessionId = Date.now().toString();
    const sessionData = {
      id: sessionId,
      name,
      createdAt: new Date().toISOString(),
      ...data
    };

    const filePath = path.join(SESSIONS_DIR, `${sessionId}.json`);
    await fs.writeFile(filePath, JSON.stringify(sessionData, null, 2));

    res.json({ sessionId, message: 'Session saved successfully' });
  } catch (error) {
    console.error('Error saving session:', error);
    res.status(500).json({ error: 'Failed to save session', details: error.message });
  }
});

// Get all sessions
router.get('/sessions', async (req, res) => {
  try {
    const files = await fs.readdir(SESSIONS_DIR);
    const sessions = await Promise.all(
      files
        .filter(f => f.endsWith('.json'))
        .map(async (file) => {
          const content = await fs.readFile(path.join(SESSIONS_DIR, file), 'utf-8');
          const data = JSON.parse(content);
          return {
            id: data.id,
            name: data.name,
            createdAt: data.createdAt
          };
        })
    );

    // Sort by creation date, newest first
    sessions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ sessions });
  } catch (error) {
    console.error('Error loading sessions:', error);
    res.status(500).json({ error: 'Failed to load sessions', details: error.message });
  }
});

// Get specific session
router.get('/sessions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const filePath = path.join(SESSIONS_DIR, `${id}.json`);

    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content);

    res.json(data);
  } catch (error) {
    console.error('Error loading session:', error);
    res.status(404).json({ error: 'Session not found' });
  }
});

// Delete session
router.delete('/sessions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const filePath = path.join(SESSIONS_DIR, `${id}.json`);

    await fs.unlink(filePath);
    res.json({ message: 'Session deleted successfully' });
  } catch (error) {
    console.error('Error deleting session:', error);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

export default router;
