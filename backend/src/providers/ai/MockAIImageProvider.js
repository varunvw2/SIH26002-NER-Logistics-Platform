import fs from 'node:fs';
import crypto from 'node:crypto';
import { AIImageProvider } from './AIImageProvider.js';

const LABELS = ['landslide', 'flood', 'damaged_road', 'damaged_bridge', 'obstruction'];

// No real vision model runs here. This deterministically derives a label and
// confidence from the photo's own bytes (same photo -> same result, unlike
// pure randomness) purely so the demo has a believable "AI Suggested"
// classification to react to. It is explicitly NOT real image understanding
// - every caller must label this "AI Suggested (simulated)" in the UI/API
// response and never claim genuine computer vision occurred.
export class MockAIImageProvider extends AIImageProvider {
  async classifyIncidentPhoto(filePath) {
    let buf;
    try {
      buf = fs.readFileSync(filePath);
    } catch {
      buf = Buffer.from(filePath); // fall back to hashing the path itself
    }
    const hash = crypto.createHash('sha256').update(buf).digest();

    const label = LABELS[hash[0] % LABELS.length];
    const confidence = 0.55 + (hash[1] / 255) * 0.35; // 0.55 - 0.90
    const severity_suggestion = confidence > 0.8 ? 'high' : confidence > 0.65 ? 'medium' : 'low';

    return {
      label,
      confidence: Number(confidence.toFixed(2)),
      severity_suggestion,
      source: 'mock',
      note: 'Simulated classification - no real computer vision model was run.'
    };
  }
}
