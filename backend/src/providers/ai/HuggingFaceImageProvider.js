import fs from 'node:fs';
import { AIImageProvider } from './AIImageProvider.js';
import { MockAIImageProvider } from './MockAIImageProvider.js';

const KEYWORD_MAP = [
  [/slide|rock|debris|mud/i, 'landslide'],
  [/flood|water|river|submerg/i, 'flood'],
  [/road|pavement|pothole|crack|asphalt/i, 'damaged_road'],
  [/bridge|culvert|span/i, 'damaged_bridge'],
  [/tree|block|obstruct|fallen/i, 'obstruction']
];

// Real adapter: calls a public Hugging Face inference endpoint (a general
// image classification model) when HUGGINGFACE_API_KEY is set, then maps the
// model's generic labels onto our incident taxonomy via keyword matching -
// no landslide/flood-specific model is freely available, so this is a
// best-effort mapping, not a purpose-trained classifier. Falls back to the
// mock provider on any failure.
export class HuggingFaceImageProvider extends AIImageProvider {
  constructor(apiKey) {
    super();
    this.apiKey = apiKey;
    this.model = 'microsoft/resnet-50';
  }

  async classifyIncidentPhoto(filePath) {
    try {
      const buf = fs.readFileSync(filePath);
      const res = await fetch(`https://api-inference.huggingface.co/models/${this.model}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/octet-stream' },
        body: buf,
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) throw new Error(`HF API ${res.status}`);
      const predictions = await res.json();
      const top = Array.isArray(predictions) ? predictions[0] : null;
      if (!top?.label) throw new Error('No prediction returned');

      let mapped = 'obstruction';
      for (const [pattern, label] of KEYWORD_MAP) {
        if (pattern.test(top.label)) { mapped = label; break; }
      }

      const confidence = Number((top.score ?? 0.5).toFixed(2));
      return {
        label: mapped,
        confidence,
        severity_suggestion: confidence > 0.8 ? 'high' : confidence > 0.6 ? 'medium' : 'low',
        source: 'huggingface',
        note: `Mapped from general-purpose model label "${top.label}" - not a purpose-trained hazard classifier.`
      };
    } catch (error) {
      console.warn('HuggingFaceImageProvider failed, falling back to mock:', error.message);
      return new MockAIImageProvider().classifyIncidentPhoto(filePath);
    }
  }
}
