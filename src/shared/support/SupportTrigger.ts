/**
 * Detects when a user is requesting support and should be connected to a persona.
 * Only triggers on explicit support requests, not automatic AI chat.
 */

const SUPPORT_TRIGGER_PATTERNS = [
  // Explicit requests for a human/person/someone
  /\b(connect|talk|speak|chat)\s+(to|with)\s+(a\s+)?(person|human|representative|specialist|support|agent|someone)\b/i,
  /\b(connect|link|put)\s+me\s+(to|with)\s+(support|a\s+person|someone)\b/i,
  /\bi\s+need\s+(human\s+)?support\b/i,
  /\bI\s+need\s+to\s+talk\s+to\s+(someone|a\s+person|support)\b/i,
  /\bcan\s+i\s+(talk|chat|speak)\s+to\s+(someone|a\s+person|a\s+human)\b/i,
  /\bconnect\s+me\s+with\s+(support|a\s+specialist|billing)\b/i,
  /\bis\s+there\s+a\s+(person|human)\s+(i\s+can\s+)?talk\s+to\b/i,
  /\bI'd\s+like\s+to\s+talk\s+to\s+(someone|a\s+specialist)\b/i,
  /\bplease\s+connect\s+me\s+with\s+(support|billing)\b/i,
  /\bcan\s+I\s+get\s+help\s+from\s+a\s+(person|human|specialist)\b/i,
];

export function isSupportRequest(message: string): boolean {
  const lowerMessage = message.toLowerCase().trim();

  // Check exact length to avoid false positives on very short messages
  if (lowerMessage.length < 5) return false;

  return SUPPORT_TRIGGER_PATTERNS.some((pattern) => pattern.test(lowerMessage));
}

/**
 * Generates a support greeting that acknowledges the user's request
 * and introduces the assigned persona.
 */
export function generateSupportGreeting(personaName: string): string {
  return `Hi, I'm ${personaName}. I've reviewed your request. Just give me a minute and I'll check this for you.`;
}
