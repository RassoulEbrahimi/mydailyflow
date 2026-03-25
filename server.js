import express from 'express';
import multer from 'multer';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: '.env.local' });
dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

// Set up multer for processing audio blob uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Lightweight deterministic parser for time, date and title.
 * Focuses on practical structures and common inputs in English, Persian, and German.
 */
function parseVoiceDraft(transcript) {
  let title = transcript.trim();
  let timeStr = '';
  let dateStr = '';

  const lowerTitle = title.toLowerCase();

  // ----- Date Parsing -----
  // Look for "tomorrow", "morgen", "فردا"
  if (lowerTitle.match(/\b(tomorrow|tmrw|morgen|frda|فردا)\b/i)) {
    // Tomorrow
    const tmrw = new Date();
    tmrw.setDate(tmrw.getDate() + 1);
    dateStr = tmrw.getFullYear() + '-' + String(tmrw.getMonth() + 1).padStart(2, '0') + '-' + String(tmrw.getDate()).padStart(2, '0');
    // Remove date word
    title = title.replace(/\b(tomorrow|tmrw|morgen|frda|فردا)\b/ig, '').trim();
  } else if (lowerTitle.match(/\b(today|heute|امروز)\b/i)) {
    // Today
    const today = new Date();
    dateStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    title = title.replace(/\b(today|heute|امروز)\b/ig, '').trim();
  }

  // ----- Time Parsing -----
  // 1. Check for "at 3 pm", "um 15 uhr", "ساعت ۱۵", "ساعت 15", "15:00"
  // Persian and Arabic numbers to English: ۰-۹, ٠-٩
  const persianToEnglishMap = {
    '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9'
  };

  title = title.replace(/[۰-۹٠-٩]/g, c => persianToEnglishMap[c]); // apply map directly to title
  let normalizedForTime = title.toLowerCase();

  // Map text words to digits for simpler time extraction regex
  const wordMap = {
    'eins': '1', 'zwei': '2', 'drei': '3', 'vier': '4', 'fünf': '5', 'sechs': '6', 'sieben': '7', 'acht': '8', 'neun': '9', 'zehn': '10', 'elf': '11', 'zwölf': '12',
    'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9', 'ten': '10', 'eleven': '11', 'twelve': '12',
    'یک': '1', 'دو': '2', 'سه': '3', 'چهار': '4', 'پنج': '5', 'شش': '6', 'هفت': '7', 'هشت': '8', 'نه': '9', 'ده': '10', 'یازده': '11', 'دوازده': '12'
  };
  const wordsPattern = Object.keys(wordMap).join('|');

  // Match times like 15:30, 9:00
  const hmMatch = normalizedForTime.match(/(?:^|\s)([01]?[0-9]|2[0-3]):([0-5][0-9])(?:\s|$)/);
  if (hmMatch) {
    timeStr = `${hmMatch[1].padStart(2, '0')}:${hmMatch[2]}`;
    // Remove from title
    title = title.replace(hmMatch[0], ' ').trim();
    title = title.replace(/(?:^|\s)(at|um|ساعت|ساعة)(?:\s|$)/ig, ' ').trim();
  } else {
    // Word-based am/pm matcher
    const ampmWords = 'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve';
    const ampmMatch = title.match(new RegExp(`(?:^|\\s)(1[0-2]|[1-9]|${ampmWords})\\s*(am|pm|a\\.m\\.|p\\.m\\.)(?:\\s|$)`, 'i'));
    if (ampmMatch) {
      let rawHour = ampmMatch[1].toLowerCase();
      let hour = parseInt(wordMap[rawHour] || rawHour, 10);
      const isPm = ampmMatch[2].toLowerCase().startsWith('p');
      if (isPm && hour < 12) hour += 12;
      if (!isPm && hour === 12) hour = 0;

      timeStr = `${String(hour).padStart(2, '0')}:00`;
      title = title.replace(ampmMatch[0], ' ').trim();
      title = title.replace(/(?:^|\s)(at)(?:\s|$)/ig, ' ').trim();
    } else {
      // um 9 uhr, ساعت 15, at 9
      let hrMatch = title.match(new RegExp(`(?:^|\\s)(um|ساعت|ساعة|at)?\\s*([01]?[0-9]|2[0-3]|${wordsPattern})\\s+(uhr|o'clock)(?:\\s|$)`, 'i'));
      if (!hrMatch) {
        hrMatch = title.match(new RegExp(`(?:^|\\s)(um|ساعت|ساعة|at)\\s+([01]?[0-9]|2[0-3]|${wordsPattern})(?:\\s|$)`, 'i'));
      }
      
      if (hrMatch) {
        let rawHour = hrMatch[2].toLowerCase();
        let hour = parseInt(wordMap[rawHour] || rawHour, 10);
        timeStr = `${String(hour).padStart(2, '0')}:00`;
        title = title.replace(hrMatch[0], ' ').trim();
      }
    }
  }

  // Cleanup extra spaces and prepositions left dangling
  title = title.replace(/(?:^|\s)(at|um|ساعت|ساعة)(?:\s|$)/ig, ' ').replace(/\s+/g, ' ').trim();

  // If title ends up empty but we have time/date, fallback to a default title
  if (!title) {
    title = "Voice Task";
  }

  // Capitalize first letter
  title = title.charAt(0).toUpperCase() + title.slice(1);

  return {
    title,
    time: timeStr || undefined,
    date: dateStr || undefined,
    note: '' // Optional note not parsed heavily in v1
  };
}

// Ensure error-handling wrapping
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

app.post('/api/voice-task/transcribe', upload.single('audio'), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No audio file provided' });
  }

  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    console.error('MISTRAL_API_KEY is missing');
    return res.status(500).json({ error: 'Transcription service not configured' });
  }

  // Prepare standard multipart/form-data payload for Mistral
  const formData = new FormData();

  // Convert multer buffer to a Blob-like format that FormData accepts in Node 18+
  const audioBlob = new Blob([req.file.buffer], { type: req.file.mimetype || 'audio/webm' });
  const modelName = process.env.MISTRAL_MODEL || 'voxtral-mini-latest';

  formData.append('file', audioBlob, 'audio.webm');
  formData.append('model', modelName);

  if (req.body.language) {
    formData.append('language', req.body.language);
  }

  // Let's actually use a mock or standard fetch for Mistral

  try {
    const mistralRes = await fetch('https://api.mistral.ai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      body: formData
    });

    if (!mistralRes.ok) {
      const errText = await mistralRes.text();
      console.error('Mistral API error:', mistralRes.status, errText);

      // Wait, did the user mean some OTHER api? If Mistral API fails, we throw.
      throw new Error(`Mistral API Error ${mistralRes.status}`);
    }

    const result = await mistralRes.json();
    const transcript = result.text || '';

    const draft = parseVoiceDraft(transcript);

    res.json({
      transcript,
      draft
    });
  } catch (error) {
    console.error('Transcription failed:', error);
    res.status(500).json({ error: 'Transcription failed: ' + error.message });
  }
}));

// Fallback error handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server listening at http://0.0.0.0:${port}`);
});
