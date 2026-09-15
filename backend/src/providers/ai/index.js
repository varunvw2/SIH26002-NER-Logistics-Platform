import { MockAIImageProvider } from './MockAIImageProvider.js';
import { HuggingFaceImageProvider } from './HuggingFaceImageProvider.js';
import { NLPExtractionProvider } from './NLPExtractionProvider.js';

export function getAIImageProvider() {
  if (process.env.HUGGINGFACE_API_KEY) {
    return new HuggingFaceImageProvider(process.env.HUGGINGFACE_API_KEY);
  }
  return new MockAIImageProvider();
}

export function getNLPProvider() {
  return new NLPExtractionProvider();
}
