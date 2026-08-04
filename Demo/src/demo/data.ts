// Static demo dataset that mirrors the shapes used by the real Opportunity Radar app.

export type Band = "hot" | "promising" | "watch";

export type Evidence = {
  id: string;
  claimKind: "fact" | "inference";
  signalType: string;
  claim: string;
  excerpt: string;
  sourceUrl: string;
  sourceQuality: number;
};

export type Contact = {
  id: string;
  kind: "email" | "phone" | "contact_form";
  label: string;
  value: string;
  sourceUrl: string;
};

export type Opportunity = {
  id: string;
  organizationName: string;
  organizationWebsite: string;
  country: string;
  serviceId: string;
  serviceName: string;
  title: string;
  needStatement: string;
  needKind: "explicit" | "inferred" | "investigate";
  whyNow: string;
  score: number;
  confidence: number;
  status:
    | "new"
    | "reviewed"
    | "contacted"
    | "replied"
    | "discovery_call"
    | "pilot"
    | "proposal"
    | "won"
    | "lost"
    | "snoozed";
  buyerRole: string;
  person: {
    name: string;
    role: string;
    professionalUrl: string;
    email: string;
    verificationLevel: string;
  } | null;
  contacts: Contact[];
  engagementMode: "freelance" | "dual";
  hiringRole: string;
  buyerIntent: number;
  contactability: number;
  subject: string;
  hook: string;
  shortMessage: string;
  longMessage: string;
  followUp: string;
  openingQuestion: string;
  proofProject: string;
  evidence: Evidence[];
};

export function opportunityBand(score: number, confidence: number): Band {
  if (score >= 74 && confidence >= 65) return "hot";
  if (score >= 58) return "promising";
  return "watch";
}

export const SERVICES = [
  {
    id: "document-intelligence",
    name: "Document Intelligence and OCR Automation",
    shortName: "Document AI",
    promise:
      "Turn invoices, delivery notes, orders, scanned PDFs and emails into validated business data and connected workflows.",
    deliverables: [
      "OCR and extraction pipeline",
      "validation rules",
      "human-review workflow",
      "Excel/API/Odoo export",
    ],
    proofProject: "FacetOCR — production document intelligence across 10,000+ invoices",
  },
  {
    id: "reliable-rag",
    name: "Reliable RAG and Knowledge Assistants",
    shortName: "Reliable RAG",
    promise:
      "Build internal assistants that retrieve the right evidence, cite sources and answer across documents and images.",
    deliverables: ["RAG assistant", "exact citations", "evaluation suite", "multimodal retrieval"],
    proofProject: "VLM Multimodal RAG — evidence-grounded answers across images and technical documents",
  },
  {
    id: "workflow-automation",
    name: "AI Workflow and API Automation",
    shortName: "AI Automation",
    promise:
      "Connect email, forms, CRM, spreadsheets, databases and AI services into observable business workflows.",
    deliverables: ["n8n workflow", "API integrations", "human approval", "failure recovery"],
    proofProject: "AI Business Workflow Automation — event-driven n8n and API orchestration",
  },
  {
    id: "llm-security",
    name: "LLM Security and Evaluation",
    shortName: "LLM Assurance",
    promise:
      "Evaluate AI behavior, expose prompt-injection risks and add measurable quality gates before production.",
    deliverables: ["attack benchmark", "evaluation dataset", "quality dashboard", "guardrails"],
    proofProject: "XGuardLM — LLM security and prompt-injection evaluation",
  },
];

export const OPPORTUNITIES: Opportunity[] = [
  {
    id: "opp-1",
    organizationName: "Delmas Logistique",
    organizationWebsite: "https://delmas-logistique.fr",
    country: "France",
    serviceId: "document-intelligence",
    serviceName: "Document Intelligence and OCR Automation",
    title: "Manual delivery-note entry blocking the new WMS rollout",
    needStatement:
      "Delivery notes and supplier invoices are still keyed in by hand before reaching the WMS, creating a two-day lag on stock accuracy.",
    needKind: "explicit",
    whyNow:
      "The company published a tender for a warehouse management upgrade in March and is hiring an operations data assistant to handle document backlog. Both signals point to a document ingestion bottleneck that software alone will not solve.",
    score: 87,
    confidence: 82,
    status: "new",
    buyerRole: "Operations Director",
    person: {
      name: "Claire Bonnet",
      role: "Directrice des opérations",
      professionalUrl: "https://delmas-logistique.fr/equipe",
      email: "c.bonnet@delmas-logistique.fr",
      verificationLevel: "verified_person",
    },
    contacts: [
      {
        id: "c-1",
        kind: "email",
        label: "Ops mailbox",
        value: "operations@delmas-logistique.fr",
        sourceUrl: "https://delmas-logistique.fr/contact",
      },
    ],
    engagementMode: "freelance",
    hiringRole: "",
    buyerIntent: 84,
    contactability: 91,
    subject: "Delivery notes into your WMS without re-keying",
    hook: "Your March tender mentions a WMS upgrade while the ops assistant posting still lists manual delivery-note entry — that gap is usually where the schedule slips.",
    shortMessage: `Bonjour Claire,

I saw the warehouse management upgrade published in March, and the operations assistant role that still describes manual entry of delivery notes and supplier invoices.

I build document extraction pipelines that read scanned notes, validate them against your reference data and push clean records straight into the WMS or ERP, with a human review screen for anything ambiguous.

On a similar flow I handled more than 10,000 invoices in production with a validation-first design, so nothing enters the system unchecked.

Would a 20-minute look at your current document flow be useful before the WMS rollout locks in?

Zakariae`,
    longMessage: `Bonjour Claire,

Two public signals caught my attention: the March tender for a warehouse management upgrade, and the operations data assistant posting that still describes manual entry of delivery notes and supplier invoices.

In most WMS rollouts the software lands fine and the document ingestion stays manual, so stock accuracy keeps lagging by a day or two. That is the part I work on: OCR and extraction tuned to your document layouts, validation rules against supplier and article references, a human review queue for low-confidence fields, and a clean export into the WMS or Odoo.

A short pilot on one supplier flow is usually enough to measure the real gain before committing to anything wider.

Would a 20-minute call this week or next be useful?

Zakariae`,
    followUp: `Bonjour Claire,

Short follow-up on the delivery-note flow before your WMS rollout. If it is easier, I can send a one-page outline of how a pilot on a single supplier flow would run, with the numbers to measure.

Zakariae`,
    openingQuestion: "How many delivery notes per day still need manual re-keying before they reach the WMS?",
    proofProject: "FacetOCR — production document intelligence across 10,000+ invoices",
    evidence: [
      {
        id: "e-1",
        claimKind: "fact",
        signalType: "public_tender",
        claim: "Published a warehouse management system upgrade tender in March 2026",
        excerpt:
          "Fourniture et mise en oeuvre d'un système de gestion d'entrepôt incluant la reprise des flux documentaires fournisseurs.",
        sourceUrl: "https://www.boamp.fr",
        sourceQuality: 94,
      },
      {
        id: "e-2",
        claimKind: "fact",
        signalType: "hiring_signal",
        claim: "Hiring an operations data assistant for document entry",
        excerpt:
          "Saisie quotidienne des bons de livraison et factures fournisseurs, contrôle et rapprochement avant intégration.",
        sourceUrl: "https://delmas-logistique.fr/carrieres",
        sourceQuality: 88,
      },
      {
        id: "e-3",
        claimKind: "inference",
        signalType: "process_gap",
        claim: "Document ingestion is likely the constraint, not the WMS itself",
        excerpt:
          "A WMS upgrade combined with a manual entry role usually indicates that the ingestion layer was not part of the scope.",
        sourceUrl: "https://delmas-logistique.fr",
        sourceQuality: 61,
      },
    ],
  },
  {
    id: "opp-2",
    organizationName: "Atlas ERP Partners",
    organizationWebsite: "https://atlas-erp.ma",
    country: "Morocco",
    serviceId: "workflow-automation",
    serviceName: "AI Workflow and API Automation",
    title: "Integration team drowning in manual client onboarding steps",
    needStatement:
      "Each Odoo onboarding runs through spreadsheets, email threads and manual data migration with no orchestration or failure recovery.",
    needKind: "inferred",
    whyNow:
      "Atlas ERP announced three new enterprise clients this quarter and is recruiting two junior integration consultants. Their published methodology page still describes a checklist-driven onboarding with manual data loads.",
    score: 79,
    confidence: 71,
    status: "reviewed",
    buyerRole: "Head of Delivery",
    person: {
      name: "Yassine El Amrani",
      role: "Head of Delivery",
      professionalUrl: "https://atlas-erp.ma/about",
      email: "",
      verificationLevel: "likely_person",
    },
    contacts: [
      {
        id: "c-2",
        kind: "contact_form",
        label: "Contact form",
        value: "https://atlas-erp.ma/contact",
        sourceUrl: "https://atlas-erp.ma/contact",
      },
    ],
    engagementMode: "dual",
    hiringRole: "Integration Consultant",
    buyerIntent: 72,
    contactability: 64,
    subject: "Removing the manual steps from your Odoo onboarding",
    hook: "Three new enterprise clients this quarter and two open integration roles usually means the onboarding checklist is the bottleneck, not the headcount.",
    shortMessage: `Hi Yassine,

Congratulations on the three enterprise clients announced this quarter. Your methodology page still describes onboarding as a checklist with manual data loads, and you are hiring two integration consultants at the same time.

I build orchestrated onboarding workflows: data migration steps as observable jobs, automatic retries, approval gates for the risky operations, and a status view your client can actually read.

Happy to join the team on this if that is the plan, and equally happy to start as a short freelance pilot on one onboarding.

Which of the two would be more useful right now?

Zakariae`,
    longMessage: `Hi Yassine,

Congratulations on the three enterprise clients announced this quarter.

Reading your methodology page, onboarding is still described as a checklist with manual data loads and email coordination. With two integration consultants opening at the same time, the constraint is usually process orchestration rather than raw capacity.

What I would do: model each onboarding as a workflow with typed steps, run the migrations as observable jobs with automatic retry and rollback, add approval gates before anything writes to production, and expose a single status page per client.

I am open to both paths here: joining the team for the integration role, or running a freelance pilot on one live onboarding so you can measure the difference first.

Zakariae`,
    followUp: `Hi Yassine,

Following up briefly. If the integration role is already covered, the freelance pilot on a single onboarding still stands and takes about two weeks end to end.

Zakariae`,
    openingQuestion: "How many hours does one enterprise onboarding currently consume across the delivery team?",
    proofProject: "AI Business Workflow Automation — event-driven n8n and API orchestration",
    evidence: [
      {
        id: "e-4",
        claimKind: "fact",
        signalType: "hiring_signal",
        claim: "Two open integration consultant positions",
        excerpt:
          "You will handle client data migration, configuration checklists and go-live coordination for Odoo deployments.",
        sourceUrl: "https://atlas-erp.ma/careers",
        sourceQuality: 86,
      },
      {
        id: "e-5",
        claimKind: "fact",
        signalType: "company_announcement",
        claim: "Announced three new enterprise clients this quarter",
        excerpt: "We are proud to welcome three new industrial groups to our client portfolio this quarter.",
        sourceUrl: "https://atlas-erp.ma/news",
        sourceQuality: 78,
      },
      {
        id: "e-6",
        claimKind: "inference",
        signalType: "process_gap",
        claim: "Onboarding is checklist-driven with no orchestration layer",
        excerpt: "The published methodology lists manual data loads and spreadsheet tracking per client.",
        sourceUrl: "https://atlas-erp.ma/methodologie",
        sourceQuality: 58,
      },
    ],
  },
  {
    id: "opp-3",
    organizationName: "Neuroscan Diagnostics",
    organizationWebsite: "https://neuroscan-diagnostics.eu",
    country: "Belgium",
    serviceId: "reliable-rag",
    serviceName: "Reliable RAG and Knowledge Assistants",
    title: "Clinical support team searching protocols across scattered PDFs",
    needStatement:
      "Technical protocols, device manuals and regulatory notes live in four separate drives, so support answers are slow and inconsistent.",
    needKind: "explicit",
    whyNow:
      "A public job posting for a knowledge manager explicitly mentions consolidating protocol documentation, and their support portal FAQ was last updated eleven months ago.",
    score: 81,
    confidence: 76,
    status: "contacted",
    buyerRole: "Head of Clinical Support",
    person: {
      name: "Dr. Ineke Vermeulen",
      role: "Head of Clinical Support",
      professionalUrl: "https://neuroscan-diagnostics.eu/team",
      email: "i.vermeulen@neuroscan-diagnostics.eu",
      verificationLevel: "verified_person",
    },
    contacts: [
      {
        id: "c-3",
        kind: "phone",
        label: "Support line",
        value: "+32 2 555 01 20",
        sourceUrl: "https://neuroscan-diagnostics.eu/contact",
      },
    ],
    engagementMode: "freelance",
    hiringRole: "",
    buyerIntent: 77,
    contactability: 83,
    subject: "Protocol answers with the source attached",
    hook: "Your knowledge manager posting says protocol documentation is spread across four drives — that is exactly where support answers start diverging.",
    shortMessage: `Dear Dr. Vermeulen,

Your knowledge manager posting mentions consolidating protocol documentation currently spread across several drives.

I build retrieval assistants for exactly that situation: answers that quote the paragraph they came from, with the document and version attached, plus an evaluation suite so you can prove accuracy before the team relies on it.

Because the content is clinical, the assistant is designed to refuse rather than guess when retrieval confidence is low.

Would a short call on your current document landscape be useful?

Zakariae`,
    longMessage: `Dear Dr. Vermeulen,

Your knowledge manager posting mentions consolidating protocol documentation currently spread across several drives, and the support portal FAQ has not changed in about eleven months.

The approach I would suggest is a retrieval assistant scoped to your approved documents: every answer cites the exact paragraph and document version, access follows your existing permissions, and an evaluation set of real support questions measures accuracy before rollout. When retrieval confidence is low the assistant refuses and routes to a human instead of guessing.

I have built this pattern for multimodal technical documentation where diagrams matter as much as text.

Would a short call on your current document landscape be useful?

Zakariae`,
    followUp: `Dear Dr. Vermeulen,

Following up on the protocol retrieval note. If helpful I can share the evaluation methodology first, so accuracy is measurable before any tooling decision.

Zakariae`,
    openingQuestion: "Which protocol questions does the support team answer most often, and where do the answers currently diverge?",
    proofProject: "VLM Multimodal RAG — evidence-grounded answers across images and technical documents",
    evidence: [
      {
        id: "e-7",
        claimKind: "fact",
        signalType: "hiring_signal",
        claim: "Hiring a knowledge manager to consolidate protocol documentation",
        excerpt:
          "Consolidate clinical protocols, device manuals and regulatory notes currently distributed across multiple shared drives.",
        sourceUrl: "https://neuroscan-diagnostics.eu/careers",
        sourceQuality: 90,
      },
      {
        id: "e-8",
        claimKind: "inference",
        signalType: "content_staleness",
        claim: "Support knowledge base appears unmaintained",
        excerpt: "Public FAQ pages carry a last-updated date of eleven months ago.",
        sourceUrl: "https://neuroscan-diagnostics.eu/support",
        sourceQuality: 55,
      },
    ],
  },
  {
    id: "opp-4",
    organizationName: "Studio Kernel",
    organizationWebsite: "https://studiokernel.io",
    country: "France",
    serviceId: "llm-security",
    serviceName: "LLM Security and Evaluation",
    title: "Customer-facing AI assistant shipped without an evaluation gate",
    needStatement:
      "A public product changelog announces an AI assistant with document upload, but no evaluation, guardrails or injection testing is mentioned anywhere.",
    needKind: "inferred",
    whyNow:
      "The assistant went live six weeks ago and now accepts customer file uploads. Their engineering blog describes prompt templates but never mentions adversarial testing.",
    score: 74,
    confidence: 68,
    status: "replied",
    buyerRole: "CTO",
    person: {
      name: "Marc Lefevre",
      role: "Co-founder & CTO",
      professionalUrl: "https://studiokernel.io/team",
      email: "marc@studiokernel.io",
      verificationLevel: "verified_person",
    },
    contacts: [],
    engagementMode: "freelance",
    hiringRole: "",
    buyerIntent: 66,
    contactability: 79,
    subject: "Injection testing before your assistant reads customer files",
    hook: "Your changelog added document upload to the assistant six weeks ago — uploaded files are the most common prompt-injection carrier.",
    shortMessage: `Hi Marc,

The changelog entry adding document upload to your assistant caught my attention. Uploaded files are the most common carrier for prompt injection, and your engineering posts describe prompt templates but no adversarial testing.

I run focused LLM security assessments: an attack benchmark against your actual assistant, an evaluation dataset built from real usage, and a short remediation report with guardrails you can ship.

It usually takes a week and produces a measurable before/after.

Worth a look?

Zakariae`,
    longMessage: `Hi Marc,

The changelog entry adding document upload to your assistant caught my attention.

Uploaded documents are the most common prompt-injection carrier: instructions hidden in a PDF, a spreadsheet cell, or white-on-white text can redirect the assistant, exfiltrate context or bypass your system prompt. Your engineering posts describe the prompt architecture in detail but never mention adversarial testing or an evaluation gate.

What I would run: an attack benchmark against the live assistant, an evaluation dataset built from real usage patterns, a scored report of which attacks succeed, and concrete guardrails plus a regression suite so it stays fixed.

That is roughly a week of work and produces a measurable before/after.

Zakariae`,
    followUp: `Hi Marc,

Quick follow-up. Happy to send two example injection payloads against a sandbox version first, so the risk is concrete before any engagement.

Zakariae`,
    openingQuestion: "What happens today if an uploaded document contains instructions aimed at the assistant?",
    proofProject: "XGuardLM — LLM security and prompt-injection evaluation",
    evidence: [
      {
        id: "e-9",
        claimKind: "fact",
        signalType: "product_change",
        claim: "Added document upload to the customer-facing AI assistant",
        excerpt: "You can now upload contracts and specs directly into the assistant for instant summaries.",
        sourceUrl: "https://studiokernel.io/changelog",
        sourceQuality: 92,
      },
      {
        id: "e-10",
        claimKind: "inference",
        signalType: "risk_gap",
        claim: "No public sign of adversarial testing or evaluation gates",
        excerpt: "Engineering posts describe prompt templates and latency work, with no mention of evaluation or red teaming.",
        sourceUrl: "https://studiokernel.io/blog",
        sourceQuality: 57,
      },
    ],
  },
  {
    id: "opp-5",
    organizationName: "Cabinet Rousseau & Associés",
    organizationWebsite: "https://rousseau-associes.fr",
    country: "France",
    serviceId: "document-intelligence",
    serviceName: "Document Intelligence and OCR Automation",
    title: "Accounting practice scaling client volume on manual intake",
    needStatement:
      "Client receipts and invoices arrive by email and are typed into the accounting suite by junior staff during closing weeks.",
    needKind: "explicit",
    whyNow:
      "The firm announced two office openings and published a seasonal recruitment notice for accounting assistants dedicated to document intake.",
    score: 71,
    confidence: 74,
    status: "discovery_call",
    buyerRole: "Managing Partner",
    person: {
      name: "Sophie Rousseau",
      role: "Associée gérante",
      professionalUrl: "https://rousseau-associes.fr/cabinet",
      email: "contact@rousseau-associes.fr",
      verificationLevel: "verified_person",
    },
    contacts: [
      {
        id: "c-5",
        kind: "email",
        label: "Cabinet",
        value: "contact@rousseau-associes.fr",
        sourceUrl: "https://rousseau-associes.fr/contact",
      },
    ],
    engagementMode: "freelance",
    hiringRole: "",
    buyerIntent: 69,
    contactability: 88,
    subject: "Closing weeks without the typing marathon",
    hook: "Two new offices plus a seasonal intake recruitment usually means the closing bottleneck is document entry, not accounting expertise.",
    shortMessage: `Bonjour Sophie,

Two office openings and a seasonal recruitment for document intake assistants suggests closing weeks are constrained by typing rather than accounting work.

I build intake pipelines that read client receipts and invoices from a mailbox, extract the accounting fields, check them against the client ledger and hand anything uncertain to a reviewer in a single screen.

The point is not full automation, it is removing the mechanical part while keeping your control.

Would a short call after the current closing be useful?

Zakariae`,
    longMessage: `Bonjour Sophie,

Two office openings and a seasonal recruitment notice for document intake assistants suggests that closing weeks are constrained by typing rather than accounting expertise.

The pipeline I build reads client receipts and invoices straight from a dedicated mailbox, extracts the accounting fields, checks VAT and supplier references against the ledger, and presents only uncertain items in a single review screen. Everything keeps its source document attached for audit.

This is deliberately not full automation: it removes the mechanical part and keeps your team in control of what is posted.

Would a short call after the current closing be useful?

Zakariae`,
    followUp: `Bonjour Sophie,

Following up now that closing is behind you. Happy to run a measured test on one client folder so the gain is visible before any decision.

Zakariae`,
    openingQuestion: "How many client documents pass through manual intake during a typical closing week?",
    proofProject: "FacetOCR — production document intelligence across 10,000+ invoices",
    evidence: [
      {
        id: "e-11",
        claimKind: "fact",
        signalType: "hiring_signal",
        claim: "Seasonal recruitment for accounting document intake",
        excerpt: "Saisie et classement des pièces comptables clients pendant les périodes de clôture.",
        sourceUrl: "https://rousseau-associes.fr/recrutement",
        sourceQuality: 84,
      },
      {
        id: "e-12",
        claimKind: "fact",
        signalType: "company_announcement",
        claim: "Opening two additional offices",
        excerpt: "Le cabinet ouvre deux nouveaux bureaux pour accompagner la croissance de son portefeuille.",
        sourceUrl: "https://rousseau-associes.fr/actualites",
        sourceQuality: 80,
      },
    ],
  },
  {
    id: "opp-6",
    organizationName: "Helios Energy Services",
    organizationWebsite: "https://helios-energy.ma",
    country: "Morocco",
    serviceId: "workflow-automation",
    serviceName: "AI Workflow and API Automation",
    title: "Field intervention reports collected by WhatsApp and spreadsheets",
    needStatement:
      "Technicians send intervention reports and photos over messaging apps, and back office staff copy them into the maintenance tracker.",
    needKind: "inferred",
    whyNow:
      "A public tender response mentions a growing maintenance fleet, while the careers page seeks a back-office coordinator for report consolidation.",
    score: 66,
    confidence: 62,
    status: "new",
    buyerRole: "Operations Manager",
    person: null,
    contacts: [
      {
        id: "c-6",
        kind: "contact_form",
        label: "Contact form",
        value: "https://helios-energy.ma/contact",
        sourceUrl: "https://helios-energy.ma/contact",
      },
    ],
    engagementMode: "freelance",
    hiringRole: "",
    buyerIntent: 61,
    contactability: 52,
    subject: "Field reports that land structured, not as screenshots",
    hook: "A growing maintenance fleet plus a coordinator role for report consolidation is the classic signal of messaging-app data collection.",
    shortMessage: `Hello,

Your recent tender documentation describes a growing maintenance fleet, and the careers page seeks a coordinator to consolidate intervention reports.

I build structured field-report flows: a simple mobile form for technicians, photo attachment with automatic tagging, validation on required fields, and direct sync into your maintenance tracker with alerts on anomalies.

Would a short call with your operations manager be possible?

Zakariae`,
    longMessage: `Hello,

Your recent tender documentation describes a growing maintenance fleet, and the careers page seeks a back-office coordinator to consolidate intervention reports.

When field data arrives through messaging apps it is fast for the technician and expensive for everyone downstream: nothing is queryable, photos lose their context, and the consolidation work grows linearly with the fleet.

What I build instead: a simple mobile form the technicians actually use, automatic photo tagging by site and equipment, required-field validation before submission, and direct synchronisation into the maintenance tracker with alerts when an intervention looks abnormal.

Would a short call with your operations manager be possible?

Zakariae`,
    followUp: `Hello,

Short follow-up on the field-report flow. I can outline what a two-week pilot on a single region would cover if that is easier to evaluate.

Zakariae`,
    openingQuestion: "How are intervention reports consolidated today between the field and the maintenance tracker?",
    proofProject: "AI Business Workflow Automation — event-driven n8n and API orchestration",
    evidence: [
      {
        id: "e-13",
        claimKind: "fact",
        signalType: "hiring_signal",
        claim: "Recruiting a back-office coordinator for report consolidation",
        excerpt: "Consolidation des rapports d'intervention et suivi des équipes terrain.",
        sourceUrl: "https://helios-energy.ma/carrieres",
        sourceQuality: 76,
      },
      {
        id: "e-14",
        claimKind: "inference",
        signalType: "process_gap",
        claim: "Field data collection appears to run through messaging apps",
        excerpt: "Public service description references photo reports sent by technicians after each intervention.",
        sourceUrl: "https://helios-energy.ma/services",
        sourceQuality: 49,
      },
    ],
  },
  {
    id: "opp-7",
    organizationName: "Verdania Agritech",
    organizationWebsite: "https://verdania-agritech.eu",
    country: "Spain",
    serviceId: "reliable-rag",
    serviceName: "Reliable RAG and Knowledge Assistants",
    title: "Agronomy knowledge locked in ten years of field PDFs",
    needStatement:
      "A decade of agronomic trial reports is stored as PDFs with no search layer, so field advisors rely on individual memory.",
    needKind: "investigate",
    whyNow:
      "The company published a data strategy note mentioning historic trial archives, and recently hired a data engineer with a documentation mandate.",
    score: 63,
    confidence: 58,
    status: "proposal",
    buyerRole: "Head of Agronomy",
    person: {
      name: "Lucia Marin",
      role: "Head of Agronomy",
      professionalUrl: "https://verdania-agritech.eu/equipo",
      email: "",
      verificationLevel: "target_role",
    },
    contacts: [],
    engagementMode: "freelance",
    hiringRole: "",
    buyerIntent: 58,
    contactability: 44,
    subject: "Ten years of trial reports, finally searchable",
    hook: "Your data strategy note calls the historic trial archive an asset — right now it is an asset only the people who wrote it can use.",
    shortMessage: `Hola Lucia,

Your data strategy note describes the historic trial archive as a core asset, but a decade of PDF reports is only usable by the people who wrote them.

I build retrieval assistants over exactly this kind of archive: advisors ask a question in plain language and get the answer with the trial, year and page it came from, including tables and figures.

Would it be worth testing on a single crop family first?

Zakariae`,
    longMessage: `Hola Lucia,

Your data strategy note describes the historic trial archive as a core asset, and the recent data engineer hire suggests documentation is becoming a priority.

A decade of trial reports in PDF form is only usable by the people who ran the trials. A retrieval assistant scoped to that archive lets an advisor ask in plain language and receive the answer with the trial, the year and the exact page, including tables and figures rather than text only.

The honest first step is a scoped test on one crop family, evaluated against questions your advisors actually ask.

Zakariae`,
    followUp: `Hola Lucia,

Following up on the trial archive idea. If a full assistant is premature, a retrieval evaluation on 30 real advisor questions would already show what is recoverable.

Zakariae`,
    openingQuestion: "Which questions do field advisors ask most often that currently require calling a colleague?",
    proofProject: "VLM Multimodal RAG — evidence-grounded answers across images and technical documents",
    evidence: [
      {
        id: "e-15",
        claimKind: "fact",
        signalType: "company_announcement",
        claim: "Published a data strategy note referencing historic trial archives",
        excerpt: "Our historic trial archive represents one of the strongest agronomic datasets in the region.",
        sourceUrl: "https://verdania-agritech.eu/insights",
        sourceQuality: 71,
      },
      {
        id: "e-16",
        claimKind: "inference",
        signalType: "knowledge_gap",
        claim: "No public search or indexing layer over the archive",
        excerpt: "Trial reports are linked as individual PDF downloads without any search interface.",
        sourceUrl: "https://verdania-agritech.eu/recursos",
        sourceQuality: 46,
      },
    ],
  },
  {
    id: "opp-8",
    organizationName: "Northbridge Insurance Brokers",
    organizationWebsite: "https://northbridge-brokers.co.uk",
    country: "United Kingdom",
    serviceId: "document-intelligence",
    serviceName: "Document Intelligence and OCR Automation",
    title: "Policy comparison still done by reading PDFs line by line",
    needStatement:
      "Brokers manually compare insurer policy schedules to build client recommendations, a process the firm describes publicly as time intensive.",
    needKind: "explicit",
    whyNow:
      "Their service page openly states that policy comparison takes several days, and a recent hire announcement mentions expanding the analysis team.",
    score: 77,
    confidence: 73,
    status: "won",
    buyerRole: "Operations Director",
    person: {
      name: "James Whitfield",
      role: "Operations Director",
      professionalUrl: "https://northbridge-brokers.co.uk/about",
      email: "j.whitfield@northbridge-brokers.co.uk",
      verificationLevel: "verified_person",
    },
    contacts: [
      {
        id: "c-8",
        kind: "email",
        label: "Operations",
        value: "operations@northbridge-brokers.co.uk",
        sourceUrl: "https://northbridge-brokers.co.uk/contact",
      },
    ],
    engagementMode: "freelance",
    hiringRole: "",
    buyerIntent: 82,
    contactability: 90,
    subject: "Policy schedules compared in minutes, with the clause attached",
    hook: "Your own service page says policy comparison takes several days — that is the sentence a client reads right before asking why.",
    shortMessage: `Hi James,

Your service page states that a thorough policy comparison takes several days, and the analysis team is expanding.

I build extraction pipelines for structured documents like policy schedules: limits, exclusions and endorsements pulled into a comparable table, each value linked back to the clause it came from so the broker can verify instantly.

The output is a review tool, not an automated recommendation.

Would a short call be useful?

Zakariae`,
    longMessage: `Hi James,

Your service page states that a thorough policy comparison takes several days, and the recent announcement mentions expanding the analysis team.

Policy schedules are structurally repetitive but visually inconsistent between insurers, which is exactly the case where extraction pays off. Limits, exclusions, endorsements and premiums land in a comparable table, and every extracted value links back to the clause and page it came from so a broker verifies in seconds instead of re-reading.

Deliberately, the system never produces the recommendation itself. It prepares the comparison so your brokers spend their time on judgement.

Would a short call be useful?

Zakariae`,
    followUp: `Hi James,

Following up on the policy comparison note. Happy to run two anonymised schedules through the pipeline so you can judge the extraction quality directly.

Zakariae`,
    openingQuestion: "How many insurer schedules does a typical commercial comparison involve?",
    proofProject: "FacetOCR — production document intelligence across 10,000+ invoices",
    evidence: [
      {
        id: "e-17",
        claimKind: "fact",
        signalType: "public_statement",
        claim: "Publicly states that policy comparison takes several days",
        excerpt: "A thorough comparison across insurers typically takes our analysts several working days.",
        sourceUrl: "https://northbridge-brokers.co.uk/services",
        sourceQuality: 93,
      },
      {
        id: "e-18",
        claimKind: "fact",
        signalType: "hiring_signal",
        claim: "Expanding the policy analysis team",
        excerpt: "We are growing our analysis team to support increased commercial volume.",
        sourceUrl: "https://northbridge-brokers.co.uk/careers",
        sourceQuality: 81,
      },
    ],
  },
];

export const ORGANIZATIONS = [
  {
    id: "org-1",
    name: "Delmas Logistique",
    website: "https://delmas-logistique.fr",
    country: "France",
    city: "Lyon",
    description:
      "Regional third-party logistics operator running three warehouses and a supplier document flow tied to an ageing WMS.",
    services: ["Document AI", "AI Automation"],
    verticals: ["logistics", "distribution"],
    sourceType: "public-tender",
    lastScannedAt: "2026-08-03",
  },
  {
    id: "org-2",
    name: "Atlas ERP Partners",
    website: "https://atlas-erp.ma",
    country: "Morocco",
    city: "Casablanca",
    description:
      "Odoo integration partner delivering ERP rollouts for industrial and distribution groups across North Africa.",
    services: ["AI Automation", "Document AI"],
    verticals: ["ERP integrator", "consulting"],
    sourceType: "ats-page",
    lastScannedAt: "2026-08-03",
  },
  {
    id: "org-3",
    name: "Neuroscan Diagnostics",
    website: "https://neuroscan-diagnostics.eu",
    country: "Belgium",
    city: "Brussels",
    description:
      "Medical imaging device manufacturer with a clinical support team maintaining protocol and regulatory documentation.",
    services: ["Reliable RAG"],
    verticals: ["healthcare", "medtech"],
    sourceType: "official-website",
    lastScannedAt: "2026-08-02",
  },
  {
    id: "org-4",
    name: "Studio Kernel",
    website: "https://studiokernel.io",
    country: "France",
    city: "Paris",
    description:
      "Product studio shipping a B2B SaaS with a customer-facing AI assistant that recently added document upload.",
    services: ["LLM Assurance", "Reliable RAG"],
    verticals: ["software", "AI product"],
    sourceType: "web-discovery",
    lastScannedAt: "2026-08-02",
  },
  {
    id: "org-5",
    name: "Cabinet Rousseau & Associés",
    website: "https://rousseau-associes.fr",
    country: "France",
    city: "Nantes",
    description:
      "Accounting practice serving SMBs, expanding to two additional offices while intake remains largely manual.",
    services: ["Document AI"],
    verticals: ["accounting", "professional services"],
    sourceType: "official-website",
    lastScannedAt: "2026-08-01",
  },
  {
    id: "org-6",
    name: "Helios Energy Services",
    website: "https://helios-energy.ma",
    country: "Morocco",
    city: "Rabat",
    description:
      "Solar installation and maintenance company operating a growing field technician fleet across several regions.",
    services: ["AI Automation"],
    verticals: ["energy", "field services"],
    sourceType: "public-tender",
    lastScannedAt: "2026-08-01",
  },
  {
    id: "org-7",
    name: "Verdania Agritech",
    website: "https://verdania-agritech.eu",
    country: "Spain",
    city: "Valencia",
    description:
      "Agritech advisory group holding a decade of agronomic trial reports used by field advisors across the region.",
    services: ["Reliable RAG"],
    verticals: ["agriculture", "research"],
    sourceType: "web-discovery",
    lastScannedAt: "2026-07-31",
  },
  {
    id: "org-8",
    name: "Northbridge Insurance Brokers",
    website: "https://northbridge-brokers.co.uk",
    country: "United Kingdom",
    city: "Manchester",
    description:
      "Commercial insurance brokerage whose analysts compare insurer policy schedules manually for every client mandate.",
    services: ["Document AI", "Reliable RAG"],
    verticals: ["insurance", "financial services"],
    sourceType: "official-website",
    lastScannedAt: "2026-07-31",
  },
  {
    id: "org-9",
    name: "Fabrique Meunier",
    website: "https://fabrique-meunier.fr",
    country: "France",
    city: "Lille",
    description:
      "Industrial food producer digitising quality control records currently kept on printed inspection sheets.",
    services: ["Document AI", "AI Automation"],
    verticals: ["industry", "food production"],
    sourceType: "public-tender",
    lastScannedAt: "2026-07-30",
  },
];

export const DASHBOARD = {
  totals: { organizations: 42, opportunities: 24, hot: 9, verifiedPeople: 17 },
  pipeline: {
    total: 24,
    waiting: 9,
    contacted: 6,
    replied: 4,
    interviews: 2,
    proposals: 2,
    won: 1,
    rejected: 3,
  },
  byCountry: [
    { label: "France", value: 18 },
    { label: "Morocco", value: 11 },
    { label: "Belgium", value: 5 },
    { label: "Spain", value: 4 },
    { label: "United Kingdom", value: 3 },
    { label: "Netherlands", value: 1 },
  ],
  byService: [
    { label: "Document AI", value: 10 },
    { label: "AI Automation", value: 7 },
    { label: "Reliable RAG", value: 5 },
    { label: "LLM Assurance", value: 2 },
  ],
};

export type Run = {
  id: string;
  label: string;
  status: "running" | "completed" | "paused" | "failed";
  stage: string;
  progress: number;
  message: string;
  createdAt: string;
  organizationsFound: number;
  organizationsAnalyzed: number;
  opportunitiesCreated: number;
  target: number;
  failures: number;
  queue: Array<{
    id: string;
    label: string;
    kind: string;
    status: "queued" | "running" | "completed" | "failed" | "rejected" | "skipped";
    attempts: number;
    error?: string;
  }>;
  events: Array<{ id: string; level: "info" | "warn" | "error"; time: string; message: string }>;
};

export const RUNS: Run[] = [
  {
    id: "run-1",
    label: "Document AI · France & Morocco",
    status: "running",
    stage: "Analysis queue",
    progress: 68,
    message: "Analyzing candidate 19 of 28 · evidence gate rejected 4 weak candidates",
    createdAt: "4 Aug 2026, 21:42",
    organizationsFound: 28,
    organizationsAnalyzed: 19,
    opportunitiesCreated: 11,
    target: 30,
    failures: 1,
    queue: [
      { id: "q-1", label: "BOAMP · document management tenders", kind: "boamp", status: "completed", attempts: 1 },
      { id: "q-2", label: "TED · Europe procurement feed", kind: "ted", status: "completed", attempts: 1 },
      { id: "q-3", label: "Exa · workflow automation agencies", kind: "exa_discovery", status: "completed", attempts: 2 },
      { id: "q-4", label: "Analyze · Delmas Logistique", kind: "analyze_organization", status: "completed", attempts: 1 },
      { id: "q-5", label: "Analyze · Cabinet Rousseau & Associés", kind: "analyze_organization", status: "completed", attempts: 1 },
      { id: "q-6", label: "Analyze · Helios Energy Services", kind: "analyze_organization", status: "running", attempts: 1 },
      { id: "q-7", label: "Analyze · Groupe Vantour", kind: "analyze_organization", status: "rejected", attempts: 1, error: "Evidence below threshold: no dated public signal supporting the inferred need." },
      {
        id: "q-8",
        label: "Analyze · Ligne Verte SARL",
        kind: "analyze_organization",
        status: "failed",
        attempts: 3,
        error: "Company page returned 403 after three attempts; Firecrawl fallback disabled.",
      },
      { id: "q-9", label: "Analyze · Fabrique Meunier", kind: "analyze_organization", status: "queued", attempts: 0 },
      { id: "q-10", label: "Analyze · Atelier Vercors", kind: "analyze_organization", status: "queued", attempts: 0 },
    ],
    events: [
      { id: "ev-1", level: "info", time: "22:14", message: "Opportunity card created · Delmas Logistique · score 87" },
      { id: "ev-2", level: "warn", time: "22:12", message: "Candidate rejected · Groupe Vantour · evidence below threshold" },
      { id: "ev-3", level: "info", time: "22:10", message: "Contact verified · Claire Bonnet · official team page" },
      { id: "ev-4", level: "error", time: "22:07", message: "Fetch failed · ligne-verte.fr returned 403" },
      { id: "ev-5", level: "info", time: "22:03", message: "Analysis worker picked up 6 new candidates" },
      { id: "ev-6", level: "info", time: "21:58", message: "Exa discovery returned 14 candidates · 3 suppressed as known" },
      { id: "ev-7", level: "info", time: "21:49", message: "BOAMP feed parsed · 9 matching notices" },
      { id: "ev-8", level: "info", time: "21:42", message: "Run started · target 30 valid cards" },
    ],
  },
  {
    id: "run-2",
    label: "Reliable RAG · Europe",
    status: "completed",
    stage: "Completed",
    progress: 100,
    message: "Completed · 8 valid cards from 21 analyzed candidates",
    createdAt: "2 Aug 2026, 18:05",
    organizationsFound: 21,
    organizationsAnalyzed: 21,
    opportunitiesCreated: 8,
    target: 10,
    failures: 0,
    queue: [
      { id: "q2-1", label: "TED · Europe procurement feed", kind: "ted", status: "completed", attempts: 1 },
      { id: "q2-2", label: "Greenhouse · knowledge manager roles", kind: "greenhouse_discovery", status: "completed", attempts: 1 },
      { id: "q2-3", label: "Analyze · Neuroscan Diagnostics", kind: "analyze_organization", status: "completed", attempts: 1 },
      { id: "q2-4", label: "Analyze · Verdania Agritech", kind: "analyze_organization", status: "completed", attempts: 1 },
    ],
    events: [
      { id: "ev2-1", level: "info", time: "19:31", message: "Run completed · 8 valid cards" },
      { id: "ev2-2", level: "info", time: "19:12", message: "Opportunity card created · Neuroscan Diagnostics · score 81" },
      { id: "ev2-3", level: "info", time: "18:05", message: "Run started · target 10 valid cards" },
    ],
  },
  {
    id: "run-3",
    label: "LLM Assurance · AI product companies",
    status: "paused",
    stage: "Paused by operator",
    progress: 34,
    message: "Paused safely · queue preserved, no work lost",
    createdAt: "31 Jul 2026, 09:20",
    organizationsFound: 12,
    organizationsAnalyzed: 4,
    opportunitiesCreated: 2,
    target: 12,
    failures: 0,
    queue: [
      { id: "q3-1", label: "Exa · AI assistant product launches", kind: "exa_discovery", status: "completed", attempts: 1 },
      { id: "q3-2", label: "Analyze · Studio Kernel", kind: "analyze_organization", status: "completed", attempts: 1 },
      { id: "q3-3", label: "Analyze · Corvex Labs", kind: "analyze_organization", status: "queued", attempts: 0 },
    ],
    events: [
      { id: "ev3-1", level: "warn", time: "10:02", message: "Run paused by operator" },
      { id: "ev3-2", level: "info", time: "09:41", message: "Opportunity card created · Studio Kernel · score 74" },
      { id: "ev3-3", level: "info", time: "09:20", message: "Run started · target 12 valid cards" },
    ],
  },
];

export const PROVIDERS = [
  {
    provider: "codex",
    label: "Codex CLI",
    configured: true,
    active: true,
    model: "codex account default",
    message: "Active provider · Codex account default",
    state: "Ready",
  },
  {
    provider: "openai",
    label: "OpenAI API",
    configured: false,
    active: false,
    model: "gpt-5.6-terra",
    message: "Add OPENAI_API_KEY to .env.local.",
    state: "Configuration needed",
  },
  {
    provider: "anthropic",
    label: "Anthropic Claude",
    configured: false,
    active: false,
    model: "claude-sonnet-5",
    message: "Add ANTHROPIC_API_KEY to .env.local.",
    state: "Configuration needed",
  },
];

export const CONNECTORS = [
  { id: "exa", label: "Exa discovery", enabled: false, configured: false, message: "Optional: add EXA_API_KEY for semantic discovery." },
  { id: "tavily", label: "Tavily discovery", enabled: false, configured: false, message: "Optional: add TAVILY_API_KEY for a second independent web index." },
  { id: "boamp", label: "BOAMP France", enabled: true, configured: true, message: "Official French public-tender API; no key required." },
  { id: "ted", label: "TED Europe", enabled: true, configured: true, message: "Official active European tender API; no key required." },
  { id: "france-num", label: "France Num", enabled: true, configured: true, message: "Official French provider open-data seed; no key required." },
  { id: "greenhouse", label: "Greenhouse jobs", enabled: false, configured: false, message: "Requires Exa or Tavily to discover exact public posting URLs." },
  { id: "lever", label: "Lever jobs", enabled: false, configured: false, message: "Requires Exa or Tavily to discover exact public posting URLs." },
  { id: "firecrawl", label: "Firecrawl fallback", enabled: false, configured: false, message: "Add a free FIRECRAWL_API_KEY; keyless access is blocked on this network." },
];
