import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import { generateMultipleFrames } from './imageGenerator.js';

// Ensure environment variables are loaded
const envConfig = dotenv.config();
if (envConfig.parsed) {
  Object.keys(envConfig.parsed).forEach(key => {
    process.env[key] = envConfig.parsed[key];
  });
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = 'claude-sonnet-4-20250514';

// Generate 10 creative ideas from a brief
export async function generateIdeas(brief) {
  const prompt = `You are an expert creative director helping develop advertising concepts. I'll give you a client brief, and you'll generate 10 wildly different creative directions.

BRIEF:
${brief}

Generate exactly 10 creative concepts. Each should be:
- Wildly different from the others (different tones, approaches, risk levels)
- Range from safe to bold
- Include variety: satirical, emotional, absurd, minimal, cinematic, etc.
- Adaptable to the brief's product/brand

For each concept, provide:
1. A short, punchy title (3-5 words)
2. A one-sentence hook (the core idea in under 20 words)
3. A 2-3 sentence description explaining the concept
4. 3 tags: one for tone, one for visual style, one for risk level
5. 4 scene beats (opening, build, turn, resolution)

Format your response as a JSON array. Example structure:
[
  {
    "id": 1,
    "title": "The Expert Opinion",
    "hook": "Experts analyzed it for hours. Their conclusion? It just works.",
    "description": "A panel of overly serious experts examine the product with absurd intensity. Charts, graphs, heated debates. Final verdict: no notes.",
    "tags": {
      "tone": "Satirical",
      "visual": "Institutional",
      "risk": "Safe"
    },
    "scenes": [
      "Opening: Panel of experts gather around product",
      "Build: Intense analysis, furrowed brows, heated whispers",
      "Turn: Head expert delivers verdict with gravitas",
      "Resolution: 'No notes.' Simple satisfaction."
    ]
  }
]

Return ONLY the JSON array, no other text.`;

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8000,
    messages: [{ role: 'user', content: prompt }],
  });

  const response = message.content[0].text;

  // Extract JSON from the response
  const jsonMatch = response.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('Failed to parse ideas from Claude response');
  }

  return JSON.parse(jsonMatch[0]);
}

// Generate variations for selected ideas
export async function generateVariations(brief, selectedIdeas) {
  const ideasText = selectedIdeas.map(idea =>
    `${idea.title}: ${idea.description}`
  ).join('\n\n');

  const prompt = `You are an expert creative director developing variations on selected concepts.

ORIGINAL BRIEF:
${brief}

SELECTED CONCEPTS:
${ideasText}

For each concept above, generate 3 distinct variations. Each variation should:
- Maintain the core idea but shift tone, pacing, or structure
- Offer a meaningfully different execution
- Include a clear "shift" explanation

Common variation types:
- Extended Cut (slower pacing, more silence)
- Ensemble Version (multiple characters/vignettes)
- Inverted (reversed structure)
- Darker/Lighter tone shifts
- Different setting or time period
- Different visual style

Format as JSON array:
[
  {
    "originalId": 1,
    "originalTitle": "The Expert Opinion",
    "variations": [
      {
        "letter": "A",
        "title": "The Expert Opinion — Extended Cut",
        "description": "Same core concept, but we hold on moments longer. Let the silence do the work. More observational, less rushed.",
        "shift": "Slower pacing, more uncomfortable pauses"
      },
      {
        "letter": "B",
        "title": "The Expert Opinion — Ensemble Version",
        "description": "Multiple expert panels across different industries, all reaching the same simple conclusion.",
        "shift": "Multiple vignettes instead of single narrative"
      },
      {
        "letter": "C",
        "title": "The Expert Opinion — Inverted",
        "description": "Start with the satisfied user, then flash back to show the absurd analysis they're NOT dealing with.",
        "shift": "Reversed structure, satisfaction first"
      }
    ]
  }
]

Return ONLY the JSON array, no other text.`;

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 12000, // Increased for variations
    messages: [{ role: 'user', content: prompt }],
  });

  const response = message.content[0].text;

  // Check if response was truncated
  if (message.stop_reason === 'max_tokens') {
    console.warn('⚠️  Response may be truncated - increasing token limit');
  }

  const jsonMatch = response.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error('Failed to extract JSON from response:', response.substring(0, 500));
    throw new Error('Failed to parse variations from Claude response');
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('JSON parse error:', err.message);
    console.error('Extracted JSON:', jsonMatch[0].substring(0, 500));
    throw new Error('Failed to parse variations JSON: ' + err.message);
  }
}

// Develop final concepts with full details and storyboard frames
export async function developFinalConcepts(brief, selectedVariations) {
  const variationsText = selectedVariations.map(v =>
    `${v.title}\n${v.description}\nShift: ${v.shift}`
  ).join('\n\n---\n\n');

  const prompt = `You are an expert creative director developing final presentation-ready concepts with detailed storyboard frames.

ORIGINAL BRIEF:
${brief}

SELECTED VARIATIONS:
${variationsText}

For each variation above, create a fully developed creative concept suitable for client presentation. Include:

1. Polished title and tagline
2. Expanded concept description (4-5 sentences)
3. STORYBOARD FRAMES (5-8 frames for a 30-second spot) - Each frame must include:
   - Frame number and timing (e.g., "Frame 1 (0:00-0:04)")
   - Shot type (Wide, Medium, Close-up, Extreme Close-up, Over-shoulder, POV, etc.)
   - Visual description (What we see - be specific about composition, lighting, subjects)
   - Action/Movement (What's happening in the frame)
   - Audio (Dialogue, sound effects, or music cues)
   - Transition (Cut, Fade, Dissolve, etc.)
4. Visual references description (describe 4 reference types/moods)
5. Production notes (tone, format, key considerations)
6. Rationale (why this works for the brief)

Format as JSON array:
[
  {
    "number": 1,
    "title": "The Expert Opinion",
    "tagline": "Experts analyzed it for hours. Their conclusion? It just works.",
    "description": "A panel of overly serious experts—scientists, critics, analysts—examine the product with absurd intensity. We watch them debate, measure, and scrutinize with lab-level precision. After all this buildup, the verdict is simple: it just works. Cut to everyday people enjoying the product without overthinking it.",
    "storyboardFrames": [
      {
        "frameNumber": 1,
        "timing": "0:00-0:04",
        "shotType": "Wide",
        "visual": "Sterile white conference room. Five experts in lab coats sit around a sleek table with the product in the center under a spotlight. Clean, institutional lighting.",
        "action": "Experts lean in, examining the product intensely. One adjusts glasses, another takes notes.",
        "audio": "Silence, then soft murmur of serious discussion. Pencil scratching paper.",
        "transition": "Cut"
      },
      {
        "frameNumber": 2,
        "timing": "0:04-0:08",
        "shotType": "Close-up",
        "visual": "Expert's face, furrowed brow, intense concentration. Reflection of charts in glasses.",
        "action": "Expert squints at data on tablet, nods slowly with grave expression.",
        "audio": "Quiet 'hmm' and keyboard clicking sounds.",
        "transition": "Cut"
      },
      {
        "frameNumber": 3,
        "timing": "0:08-0:12",
        "shotType": "Medium",
        "visual": "Two experts huddle over complex charts and graphs projected on wall. Product sits in foreground, untouched.",
        "action": "Heated whispered debate. One points at graph, other shakes head, then nods in agreement.",
        "audio": "Whispered technical jargon: 'But the efficiency ratio...' 'Yes, but look at this...'",
        "transition": "Cut"
      },
      {
        "frameNumber": 4,
        "timing": "0:12-0:17",
        "shotType": "Wide",
        "visual": "Full panel reconvenes. Head expert stands at head of table, hand raised for silence.",
        "action": "All eyes turn to head expert. Dramatic pause. Expert opens mouth to speak.",
        "audio": "Silence builds. Chair scrape. Anticipatory tension.",
        "transition": "Cut"
      },
      {
        "frameNumber": 5,
        "timing": "0:17-0:21",
        "shotType": "Close-up",
        "visual": "Head expert's face, deadpan serious expression.",
        "action": "Expert delivers verdict with complete sincerity.",
        "audio": "Expert (deadpan): 'No notes.' Long pause.",
        "transition": "Beat, then Cut"
      },
      {
        "frameNumber": 6,
        "timing": "0:21-0:25",
        "shotType": "Medium",
        "visual": "Bright, warm kitchen. Real person casually using the product, natural smile.",
        "action": "Person enjoys product effortlessly, no overthinking. Simple satisfaction.",
        "audio": "Upbeat music kicks in. Natural ambient sounds.",
        "transition": "Cut"
      },
      {
        "frameNumber": 7,
        "timing": "0:25-0:30",
        "shotType": "Close-up",
        "visual": "Product hero shot with perfect lighting and condensation. Logo clearly visible.",
        "action": "Product rotates slowly or sits perfectly composed.",
        "audio": "Voiceover: '[Brand name]. It just works.' Music out.",
        "transition": "Fade to black"
      }
    ],
    "visualReferences": [
      "Corporate boardroom aesthetic - sterile, professional, Apple keynote vibes",
      "Scientific analysis - charts, data visualization, NASA mission control energy",
      "Comedic contrast - serious faces for simple product, Wes Anderson symmetry",
      "Clean product shot - hero moment, no frills, high-end beverage commercial lighting"
    ],
    "productionNotes": [
      "Tone: Deadpan, observational comedy",
      "Format: 30-second spot",
      "Focus: Contrast between over-analysis and simple satisfaction",
      "Key: Product must be hero, not the joke",
      "Music: Silence in analysis scenes, bright and uplifting in user scenes"
    ],
    "rationale": "This concept delivers on the brief's core message that the product doesn't need credentials or validation—it simply works. The humor comes from the contrast between elaborate expert analysis and the obvious simplicity of just enjoying the product. The storyboard structure builds tension through the expert analysis, pays off with deadpan comedy, then releases into genuine brand warmth."
  }
]

Return ONLY the JSON array, no other text.`;

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 16000, // Large increase for storyboard frames
    messages: [{ role: 'user', content: prompt }],
  });

  const response = message.content[0].text;

  // Check if response was truncated
  if (message.stop_reason === 'max_tokens') {
    console.warn('⚠️  Response may be truncated - consider reducing frame count');
  }

  const jsonMatch = response.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error('Failed to extract JSON from response:', response.substring(0, 500));
    throw new Error('Failed to parse final concepts from Claude response');
  }

  let concepts;
  try {
    concepts = JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('JSON parse error:', err.message);
    console.error('Extracted JSON:', jsonMatch[0].substring(0, 500));
    throw new Error('Failed to parse final concepts JSON: ' + err.message);
  }

  // Generate images for each concept's storyboard frames
  console.log('\n🎬 Generating storyboard images...');
  for (const concept of concepts) {
    if (concept.storyboardFrames && concept.storyboardFrames.length > 0) {
      const brandContext = `${concept.title}. ${concept.description}`;
      concept.storyboardFrames = await generateMultipleFrames(
        concept.storyboardFrames,
        brandContext
      );
    }
  }

  return concepts;
}

// Refine a specific concept based on feedback
export async function refineConcept(brief, concept, feedback) {
  const prompt = `You are an expert creative director refining a concept based on client feedback.

ORIGINAL BRIEF:
${brief}

CURRENT CONCEPT:
Title: ${concept.title}
Description: ${concept.description}

CLIENT FEEDBACK:
${feedback}

Revise the concept to address the feedback while maintaining what works. Return a JSON object with the same structure as the original concept, but improved based on the feedback.

Return ONLY the JSON object, no other text.`;

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  });

  const response = message.content[0].text;
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to parse refined concept from Claude response');
  }

  return JSON.parse(jsonMatch[0]);
}
