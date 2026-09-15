// Converts a free-text field report into structured incident fields.
//
// This is a keyword/rule-based heuristic extractor, NOT a trained NLP/LLM
// model - honestly labeled as such wherever it's surfaced. It is written as
// an adapter (single exported function used behind one call site) so it can
// be swapped for a real Hugging Face / LLM-based extractor later without
// touching any caller.
//
// Example:
//   "Bridge near village X is partially damaged because of flooding."
//   -> { type: 'bridge_damaged', cause: 'flood', severity: 'high', ... }

// Order matters: checked top-to-bottom, first match wins. A structural
// target (bridge/road/blockage) is classified as the incident TYPE even when
// a weather word like "flooding" also appears in the same sentence - that
// word is captured separately as the CAUSE below. Purely meteorological
// reports with no structural target still fall through to 'flood'/'weather_hazard'.
const TYPE_KEYWORDS = [
  [/bridge/i, 'bridge_damaged'],
  [/landslide|land slide|mudslide/i, 'landslide'],
  [/block(ed)?|obstruct/i, 'road_blocked'],
  [/accident|collision|crash/i, 'accident'],
  [/traffic|congestion|jam/i, 'heavy_traffic'],
  [/damage|pothole|crack|erosion/i, 'road_damage'],
  [/flood|inundat|water level|submerg/i, 'flood'],
  [/storm|hail|weather|visibility/i, 'weather_hazard']
];

const CAUSE_KEYWORDS = [
  [/flood|inundat|submerg/i, 'flood'],
  [/rain|monsoon/i, 'weather'],
  [/landslide/i, 'landslide'],
  [/traffic/i, 'congestion'],
  [/vehicle|truck|overload/i, 'vehicular']
];

const SEVERITY_KEYWORDS = [
  [/complete(ly)?\s*(blocked|closed|destroyed)|impassable|fully damaged|critical/i, 'critical'],
  [/major|severe|significant|partially damaged/i, 'high'],
  [/minor|small|slight/i, 'low']
];

export class NLPExtractionProvider {
  extract(rawText) {
    if (!rawText || !rawText.trim()) {
      return {
        type: 'other', cause: 'unknown', severity: 'medium',
        confidence: 0, method: 'heuristic', note: 'Empty text - defaults applied.'
      };
    }

    const text = rawText.trim();
    const matchFirst = (rules, fallback) => {
      for (const [pattern, value] of rules) {
        if (pattern.test(text)) return value;
      }
      return fallback;
    };

    const type = matchFirst(TYPE_KEYWORDS, 'other');
    const cause = matchFirst(CAUSE_KEYWORDS, 'unknown');
    const severity = matchFirst(SEVERITY_KEYWORDS, 'medium');

    // Rough confidence: proportion of the three fields we actually matched
    // (vs. falling back to a default), just to signal extraction quality.
    const matchedCount = [type !== 'other', cause !== 'unknown', severity !== 'medium'].filter(Boolean).length;
    const confidence = Number((0.4 + matchedCount * 0.2).toFixed(2));

    return { type, cause, severity, confidence, method: 'heuristic-keyword', rawText: text };
  }
}
