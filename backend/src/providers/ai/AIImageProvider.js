// Interface:
//   class AIImageProvider {
//     async classifyIncidentPhoto(filePath) -> {
//       label, confidence, severity_suggestion, source
//     }
//   }
//
// label is one of: landslide | flood | damaged_road | damaged_bridge |
// obstruction | unclear
//
// Every result returned by any implementation MUST be treated as
// "AI Suggested" by the caller, never "Officially Verified" - only a human
// verifier can set that status. See services/incidentService.js.
export class AIImageProvider {
  async classifyIncidentPhoto(_filePath) {
    throw new Error('Not implemented');
  }
}
