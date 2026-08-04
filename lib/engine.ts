import "server-only";
import {
  addEvent, claimQueueItem, countNewRunOpportunities, enqueueOrganizationAnalysis, finalizeRunIfDone,
  getOrganization, getResearchRun, heartbeatRun, listRunQueue, saveIntelligenceAnalysis,
  skipQueuedRunWork, targetOpportunitiesForRun, updateQueueItem,
} from "@/lib/db";
import { recoverInterruptedQueue } from "@/lib/recovery";
import { analyzeOrganization } from "@/lib/analyzer";
import { activeLlmProvider, modelForProvider } from "@/lib/llm";
import { crawlOrganization, discoverFranceNum, discoverWithExa, organizationFromManualUrl } from "@/lib/sources";
import { discoverBoamp, discoverGreenhouseJobs, discoverLeverJobs, discoverTed, discoverWithTavily } from "@/lib/discovery-connectors";
import type { Organization, QueueItem } from "@/lib/types";

declare global {
   
  var __opportunityRadarWorkers: Map<string, Promise<void>> | undefined;
   
  var __opportunityRadarControllers: Map<string, AbortController> | undefined;
}
const workers = global.__opportunityRadarWorkers ||= new Map();
const controllers = global.__opportunityRadarControllers ||= new Map();
const sourceKinds: QueueItem["kind"][] = [
  "boamp", "ted", "france_num", "exa_discovery", "tavily_discovery",
  "greenhouse_discovery", "lever_discovery", "manual_url",
];
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function targetOpportunities(item: QueueItem): number {
  const value = Number(item.payload.targetOpportunities ?? item.payload.maxOrganizations ?? 30);
  return Math.max(1, Math.min(200, Number.isFinite(value) ? value : 30));
}

function sourceCandidateLimit(target: number): number {
  return Math.max(60, Math.min(200, target * 4));
}

function candidateBudget(target: number): number {
  const configured = Number(process.env.OPPORTUNITY_RADAR_CANDIDATE_MULTIPLIER || 20);
  const multiplier = Math.max(5, Math.min(50, Number.isFinite(configured) ? configured : 20));
  return Math.max(target + 50, Math.min(2_000, target * multiplier));
}

async function processSource(item: QueueItem, signal: AbortSignal): Promise<void> {
  const run = getResearchRun(item.runId);
  if (!run) throw new Error("Research run disappeared.");
  const progress = (message: string) => {
    heartbeatRun(item.runId, "source discovery", message);
    updateQueueItem(item.id, { progress: 45 });
  };
  let organizations: Organization[] = [];
  const target = targetOpportunities(item);
  if (countNewRunOpportunities(item.runId) >= target) {
    updateQueueItem(item.id, { status: "skipped", progress: 100, error: "Valid-card target already reached." });
    return;
  }
  const searchLimit = sourceCandidateLimit(target);
  const discoveryInput = {
    query: String(item.payload.query || run.query), countries: run.countries,
    country: String(item.payload.country || ""), services: run.services,
    strategy: String(item.payload.strategy || ""), maxOrganizations: searchLimit,
  };
  if (item.kind === "boamp") organizations = await discoverBoamp(discoveryInput, progress);
  else if (item.kind === "ted") organizations = await discoverTed(discoveryInput, progress);
  else if (item.kind === "france_num") organizations = await discoverFranceNum(searchLimit, progress);
  else if (item.kind === "exa_discovery") organizations = await discoverWithExa(discoveryInput, progress);
  else if (item.kind === "tavily_discovery") organizations = await discoverWithTavily(discoveryInput, progress);
  else if (item.kind === "greenhouse_discovery") organizations = await discoverGreenhouseJobs(discoveryInput, progress);
  else if (item.kind === "lever_discovery") organizations = await discoverLeverJobs(discoveryInput, progress);
  else if (item.kind === "manual_url") organizations = [organizationFromManualUrl(String(item.payload.url || ""))];
  if (signal.aborted) throw Object.assign(new Error("Stopped by user."), { name: "AbortError" });
  const budget = candidateBudget(target);
  let queued = 0;
  for (const organization of organizations) {
    if (countNewRunOpportunities(item.runId) >= target) break;
    if (enqueueOrganizationAnalysis(item.runId, organization, budget)) queued++;
  }
  updateQueueItem(item.id, { status: "completed", progress: 100 });
  heartbeatRun(item.runId, "source complete", `${item.label} completed.`);
  addEvent(item.runId, "success", "source", `${item.label} completed: ${organizations.length} organization(s) found, ${queued} new analysis task(s).`);
}

async function processOrganization(item: QueueItem, signal: AbortSignal): Promise<void> {
  const run = getResearchRun(item.runId);
  const organization = item.organizationId ? getOrganization(item.organizationId) : null;
  if (!run || !organization) throw new Error("Queued organization no longer exists.");
  updateQueueItem(item.id, { progress: 10 });
  heartbeatRun(item.runId, "website research", `Collecting public evidence for ${organization.name}…`);
  const pages = await crawlOrganization(organization, (message) => heartbeatRun(item.runId, "website research", message));
  updateQueueItem(item.id, { progress: 45 });
  const provider = activeLlmProvider();
  const model = modelForProvider(provider);
  heartbeatRun(item.runId, "LLM analysis", `${provider} · ${model} is analyzing ${pages} public page(s) for ${organization.name}…`);
  const result = await analyzeOrganization(organization, run.services, {
    signal,
    onActivity: (message) => heartbeatRun(item.runId, "LLM analysis", `${organization.name}: ${message}`),
  });
  updateQueueItem(item.id, { progress: 85 });
  const refresh = item.payload.refresh === true;
  const target = targetOpportunitiesForRun(item.runId);
  const saved = saveIntelligenceAnalysis(organization.id, result.analysis,
    refresh ? {} : { runId: item.runId, targetOpportunities: target });
  const accepted = refresh ? saved.opportunities > 0 : saved.newOpportunities > 0;
  heartbeatRun(item.runId, "saving card",
    `${organization.name}: ${accepted ? "saving a new valid card" : "candidate did not add a new valid card"}…`);
  const rejection = saved.marketMismatch
    ? `Outside requested market: ${organization.country || organization.city || "location unverified"} does not match ${run.countries.join(", ")}.`
    : saved.targetReached
    ? "Valid-card target reached while this analysis was finishing."
    : saved.opportunities && !saved.newOpportunities && !refresh
      ? "Previously detected opportunity; refreshed but not counted toward the new-card target."
      : result.refusalReason || "Insufficient evidence for an actionable opportunity.";
  updateQueueItem(item.id, {
    status: accepted ? "completed" : "rejected", progress: 100,
    error: accepted ? null : rejection,
  });
  heartbeatRun(item.runId, "analysis complete", `${organization.name}: analysis completed.`);
  addEvent(item.runId, accepted ? "success" : "warning", "analysis",
    accepted
      ? `${organization.name}: one ${refresh ? "refreshed" : "new"} valid card, ${saved.evidence} evidence item(s), ${saved.people} contact target(s).`
      : `${organization.name}: ${rejection}`);
  if (!refresh && countNewRunOpportunities(item.runId) >= target) {
    const skipped = skipQueuedRunWork(item.runId, `Target reached: ${target} new valid opportunity cards.`);
    heartbeatRun(item.runId, "target reached", `Target reached: ${target}/${target} new valid cards. ${skipped} queued task(s) skipped.`);
  }
}

function interruptionStatus(runId: string): "queued" | "skipped" {
  return getResearchRun(runId)?.desiredState === "paused" ? "queued" : "skipped";
}

async function sourceLoop(runId: string, controller: AbortController): Promise<void> {
  while (!controller.signal.aborted) {
    const run = getResearchRun(runId);
    if (!run || run.desiredState !== "running") return;
    const target = targetOpportunitiesForRun(runId);
    if (countNewRunOpportunities(runId) >= target) {
      skipQueuedRunWork(runId, `Target reached: ${target} new valid opportunity cards.`);
      return;
    }
    const item = claimQueueItem(runId, sourceKinds);
    if (!item) return;
    try { await processSource(item, controller.signal); }
    catch (error) {
      const stopped = controller.signal.aborted || (error instanceof Error && error.name === "AbortError");
      updateQueueItem(item.id, {
        status: stopped ? interruptionStatus(runId) : "failed", progress: stopped ? 0 : 100,
        error: error instanceof Error ? error.message : String(error),
      });
      addEvent(runId, stopped ? "warning" : "error", "source", `${item.label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

async function analysisLoop(runId: string, controller: AbortController): Promise<void> {
  while (!controller.signal.aborted) {
    const run = getResearchRun(runId);
    if (!run || run.desiredState !== "running") return;
    const refresh = listRunQueue(runId).some((candidate) => candidate.payload.refresh === true);
    const target = targetOpportunitiesForRun(runId);
    if (!refresh && countNewRunOpportunities(runId) >= target) {
      skipQueuedRunWork(runId, `Target reached: ${target} new valid opportunity cards.`);
      return;
    }
    const item = claimQueueItem(runId, ["analyze_organization"]);
    if (!item) {
      const sourceStillOpen = listRunQueue(runId).some((candidate) => sourceKinds.includes(candidate.kind) && ["queued", "running"].includes(candidate.status));
      if (!sourceStillOpen) return;
      await wait(500);
      continue;
    }
    try { await processOrganization(item, controller.signal); }
    catch (error) {
      const stopped = controller.signal.aborted || (error instanceof Error && error.name === "AbortError");
      updateQueueItem(item.id, {
        status: stopped ? interruptionStatus(runId) : "failed", progress: stopped ? 0 : 100,
        error: error instanceof Error ? error.message : String(error),
      });
      addEvent(runId, stopped ? "warning" : "error", "analysis", `${item.label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

async function orchestrate(runId: string, controller: AbortController): Promise<void> {
  recoverInterruptedQueue(runId);
  heartbeatRun(runId, "starting", "Discovery workers are filling a candidate pool while analysis workers pursue the new-valid-card target.");
  try {
    const analysisWorkerCount = Math.max(1, Math.min(4, Number(process.env.OPPORTUNITY_RADAR_ANALYSIS_WORKERS || 3)));
    await Promise.all([
      sourceLoop(runId, controller),
      ...Array.from({ length: analysisWorkerCount }, () => analysisLoop(runId, controller)),
    ]);
  } finally {
    controllers.delete(runId);
    finalizeRunIfDone(runId);
    workers.delete(runId);
  }
}

export function kickResearchRun(runId: string): void {
  if (workers.has(runId)) return;
  const controller = new AbortController();
  controllers.set(runId, controller);
  const task = orchestrate(runId, controller).catch((error) => {
    addEvent(runId, "error", "engine", error instanceof Error ? error.message : String(error));
    finalizeRunIfDone(runId);
  });
  workers.set(runId, task);
}

export function stopResearchWorker(runId: string): void {
  controllers.get(runId)?.abort();
}
