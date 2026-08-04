export type RunStatus = "queued" | "running" | "pausing" | "paused" | "stopping" | "stopped" | "completed" | "failed";
export type QueueStatus = "queued" | "running" | "completed" | "failed" | "rejected" | "skipped";
export type OpportunityStatus = "new" | "reviewed" | "contacted" | "replied" | "discovery_call" | "pilot" | "proposal" | "won" | "lost" | "snoozed" | "eliminated";
export type NeedKind = "explicit" | "inferred" | "investigate";
export type VerificationLevel = "verified_person" | "likely_person" | "target_role" | "company_contact";
export type ContactKind = "email" | "phone" | "contact_form";
export type LeadReadiness = "ready_to_contact" | "needs_enrichment" | "research_only";
export type EngagementMode = "freelance" | "dual";

export type ServiceDefinition = {
  id: string;
  name: string;
  shortName: string;
  promise: string;
  problems: string[];
  sectors: string[];
  deliverables: string[];
  proofProject: string;
  proofUrl: string;
  keywords: string[];
  negativeKeywords: string[];
};

export type Organization = {
  id: string;
  name: string;
  website: string;
  domain: string;
  country: string;
  city: string;
  sizeBand: string;
  description: string;
  services: string[];
  verticals: string[];
  sourceType: string;
  sourceUrl: string;
  lastScannedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EvidenceItem = {
  id: string;
  organizationId: string;
  documentId: string;
  claimKind: "fact" | "inference" | "unknown";
  signalType: string;
  claim: string;
  excerpt: string;
  sourceUrl: string;
  eventDate: string | null;
  sourceQuality: number;
  createdAt: string;
};

export type Person = {
  id: string;
  organizationId: string;
  name: string;
  role: string;
  professionalUrl: string;
  email: string;
  contactUrl: string;
  verificationLevel: VerificationLevel;
  sourceUrl: string;
  observedAt: string;
};

export type OrganizationContact = {
  id: string;
  organizationId: string;
  kind: ContactKind;
  value: string;
  label: string;
  sourceUrl: string;
  observedAt: string;
};

export type Opportunity = {
  id: string;
  organizationId: string;
  organizationName: string;
  organizationWebsite: string;
  country: string;
  serviceId: string;
  serviceName: string;
  title: string;
  needStatement: string;
  needKind: NeedKind;
  whyNow: string;
  score: number;
  confidence: number;
  status: OpportunityStatus;
  buyerRole: string;
  person: Person | null;
  contacts: OrganizationContact[];
  leadReadiness: LeadReadiness;
  engagementMode: EngagementMode;
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
  evidence: EvidenceItem[];
  createdAt: string;
  updatedAt: string;
};

export type ResearchRun = {
  id: string;
  label: string;
  query: string;
  countries: string[];
  services: string[];
  status: RunStatus;
  desiredState: "running" | "paused" | "stopped";
  stage: string;
  progress: number;
  message: string;
  sourcesTotal: number;
  sourcesCompleted: number;
  organizationsFound: number;
  organizationsAnalyzed: number;
  opportunitiesCreated: number;
  failures: number;
  createdAt: string;
  updatedAt: string;
  heartbeatAt: string;
  completedAt: string | null;
};

export type QueueItem = {
  id: string;
  runId: string;
  kind: "boamp" | "ted" | "france_num" | "exa_discovery" | "tavily_discovery" | "greenhouse_discovery" | "lever_discovery" | "manual_url" | "analyze_organization";
  label: string;
  position: number;
  status: QueueStatus;
  progress: number;
  organizationId: string | null;
  payload: Record<string, unknown>;
  attempts: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DashboardSnapshot = {
  totals: {
    organizations: number;
    opportunities: number;
    hot: number;
    verifiedPeople: number;
    contacted: number;
    replied: number;
    won: number;
  };
  pipeline: {
      total: number;
      waiting: number;
      contacted: number;
      replied: number;
      interviews: number;
      proposals: number;
      won: number;
      rejected: number;
    };
    byCountry: Array<{ label: string; value: number }>;
  byService: Array<{ label: string; value: number }>;
  byStatus: Array<{ label: string; value: number }>;
  recentOpportunities: Opportunity[];
  activeRun: ResearchRun | null;
};
