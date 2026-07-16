// Compatibility entry point. The application imports the implementation from
// src/services/aiService, so this file deliberately re-exports that single,
// maintained extraction pipeline rather than duplicating prompts or behavior.
export { processPrescription, translateResult } from './src/services/aiService';
