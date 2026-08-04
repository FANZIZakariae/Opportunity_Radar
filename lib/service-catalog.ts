import type { ServiceDefinition } from "@/lib/types";

export const SERVICE_CATALOG: ServiceDefinition[] = [
  {
    id: "document-intelligence",
    name: "Document Intelligence and OCR Automation",
    shortName: "Document AI",
    promise: "Turn invoices, delivery notes, orders, scanned PDFs and emails into validated business data and connected workflows.",
    problems: ["manual document entry", "invoice extraction", "unstructured PDFs", "document validation", "ERP data entry"],
    sectors: ["accounting", "logistics", "insurance", "industry", "healthcare", "ERP integrators"],
    deliverables: ["OCR and extraction pipeline", "validation rules", "human-review workflow", "Excel/API/database/Odoo export"],
    proofProject: "FacetOCR — production document-intelligence experience across more than 10,000 invoices",
    proofUrl: "https://fanzizakariae.github.io/FacetOCR/",
    keywords: ["invoice", "facture", "document", "ocr", "pdf", "delivery note", "bon de livraison", "data entry", "odoo", "erp"],
    negativeKeywords: ["paperless marketing only"],
  },
  {
    id: "reliable-rag",
    name: "Reliable RAG and Knowledge Assistants",
    shortName: "Reliable RAG",
    promise: "Build internal assistants that retrieve the right evidence, cite sources and answer across documents and images.",
    problems: ["knowledge scattered across documents", "slow document search", "unsupported chatbot answers", "multimodal knowledge"],
    sectors: ["consulting", "legal", "industry", "healthcare", "education", "technical support"],
    deliverables: ["RAG assistant", "exact citations", "evaluation suite", "multimodal retrieval", "access-control integration"],
    proofProject: "VLM Multimodal RAG — evidence-grounded answers across images and technical documents",
    proofUrl: "https://fanzizakariae.github.io/VLM-Multimodal-RAG/",
    keywords: ["rag", "knowledge base", "assistant", "chatbot", "documentation", "search", "llm", "citations", "pdf"],
    negativeKeywords: ["consumer entertainment chatbot"],
  },
  {
    id: "workflow-automation",
    name: "AI Workflow and API Automation",
    shortName: "AI Automation",
    promise: "Connect email, forms, CRM, spreadsheets, databases and AI services into observable business workflows.",
    problems: ["repetitive administration", "disconnected tools", "manual lead handling", "email triage", "copy-paste workflows"],
    sectors: ["agencies", "SMBs", "sales operations", "customer support", "e-commerce", "professional services"],
    deliverables: ["n8n workflow", "API integrations", "human approval", "failure recovery", "documentation"],
    proofProject: "AI Business Workflow Automation — event-driven n8n and API orchestration",
    proofUrl: "https://github.com/FANZIZakariae",
    keywords: ["n8n", "automation", "workflow", "api", "crm", "email", "sheets", "integration", "operations"],
    negativeKeywords: ["pure strategy with no implementation"],
  },
  {
    id: "llm-security",
    name: "LLM Security and Evaluation",
    shortName: "LLM Assurance",
    promise: "Evaluate AI behavior, expose prompt-injection risks and add measurable quality gates before production.",
    problems: ["prompt injection", "hallucinations", "unmeasured LLM quality", "unsafe RAG", "missing AI evaluation"],
    sectors: ["AI product companies", "regulated services", "internal AI teams", "consultancies"],
    deliverables: ["attack benchmark", "evaluation dataset", "quality dashboard", "guardrails", "remediation report"],
    proofProject: "XGuardLM — LLM security and prompt-injection evaluation",
    proofUrl: "https://fanzizakariae.github.io/XGuardLM/",
    keywords: ["llm security", "prompt injection", "evaluation", "guardrails", "red team", "hallucination", "ai safety"],
    negativeKeywords: ["physical security"],
  },
];

export function serviceById(id: string): ServiceDefinition | undefined {
  return SERVICE_CATALOG.find((service) => service.id === id);
}
