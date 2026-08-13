export type CodingRequestClassification = 'PLAN_ONLY' | 'ANALYZE' | 'GUIDANCE' | 'EXECUTE' | 'AUTONOMOUS_ENGINEERING';

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export function classifyCodingRequest(input: string): CodingRequestClassification {
  const text = input.trim().toLowerCase();
  if (!text) return 'ANALYZE';

  if (
    hasAny(text, [
      /\bautonom(?:ous|ously)\b/,
      /\bkeep (?:going|working|fixing|iterating)\b/,
      /\buntil (?:tests?|checks?|builds?) (?:pass|are green|succeed)\b/,
      /\bbuild (?:this|the|an?|my) entire (?:app|application|project|site)\b/,
      /\bend[- ]to[- ]end\b/,
      /\bfull autonomous\b/,
    ])
  ) {
    return 'AUTONOMOUS_ENGINEERING';
  }

  if (
    hasAny(text, [
      /\bgive me (?:the )?commands?\b/,
      /\bwhat commands? (?:should|do) i\b/,
      /\bshow me (?:the )?commands?\b/,
      /\binstructions?\b/,
      /\bsteps? to\b/,
      /\bhow do i\b/,
    ])
  ) {
    return 'GUIDANCE';
  }

  if (hasAny(text, [/\bbuild project\b/, /\bbuild (?:it|this|the) from (?:the )?approved (?:project )?plan\b/])) {
    return 'EXECUTE';
  }

  if (
    hasAny(text, [
      /\b(plan|design|architect|architecture|structure|roadmap)\b/,
      /\bhow should i structure\b/,
      /\bbefore (?:we )?(?:build|implement|code)\b/,
      /\bdo not (?:implement|modify|change|edit|run)\b/,
    ])
  ) {
    return 'PLAN_ONLY';
  }

  if (
    hasAny(text, [
      /\b(explain|diagnose|inspect|investigate|analy[sz]e|why|what caused|what does)\b/,
      /\berror\b/,
      /\bfailing\b/,
      /\bbroken\b/,
      /\bunderstand\b/,
    ])
  ) {
    if (hasAny(text, [/\bwithout (?:changing|modifying|editing|running|executing)\b/, /\bdo not (?:change|modify|edit|run|execute)\b/])) return 'ANALYZE';
    if (!hasAny(text, [/\b(fix|change|modify|edit|write|create|delete|run|install|commit|build|test)\b/])) return 'ANALYZE';
  }

  if (hasAny(text, [/\b(fix|change|modify|edit|write|create|delete|run|install|commit|build|test|update)\b/])) {
    return 'EXECUTE';
  }

  return 'ANALYZE';
}

export function isExecutionClassification(classification: CodingRequestClassification): boolean {
  return classification === 'EXECUTE' || classification === 'AUTONOMOUS_ENGINEERING';
}
