export type HiringFitResult = { aligned: boolean; reason: string };

function normalize(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9+#/.]+/g, " ").trim();
}

const AI_ROLE = /\b(ai|ia|ml|llm|rag|nlp|mlops)\b|artificial intelligence|intelligence artificielle|machine learning|deep learning|data scientist|data engineer|computer vision|vision par ordinateur|generative ai|ia generative|agentic|ai agent|document intelligence|ocr engineer/;
const TOO_SENIOR = /\b(senior|seniors|sr|lead|principal|staff|manager|head|director|directeur|architect|architecte|expert|confirme|confirmee)\b/;
const EXPERIENCE_FLOOR = /\b(?:3|4|5|6|7|8|9|[1-9][0-9])\s*\+?\s*(?:years?|ans?|annees?)\b/;

export function assessHiringFit(input: { role: string; evidenceTexts?: string[] }): HiringFitResult {
  const role = normalize(input.role);
  if (!role) return { aligned: false, reason: "No verified hiring role was supplied." };
  if (TOO_SENIOR.test(role)) return { aligned: false, reason: "The advertised role is above Zakariae's current career level." };
  const evidence = normalize((input.evidenceTexts || []).join(" "));
  if (EXPERIENCE_FLOOR.test(`${role} ${evidence}`)) return { aligned: false, reason: "The opening requires at least three years of experience." };
  if (!AI_ROLE.test(role)) return { aligned: false, reason: "The advertised role is outside Zakariae's AI, ML, data and intelligent-automation domain." };
  return { aligned: true, reason: "The opening is in Zakariae's professional domain and does not show a seniority conflict." };
}