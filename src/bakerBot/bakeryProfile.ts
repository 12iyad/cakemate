import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface BakeryProfile {
  bakeryId: string;
  setupComplete: boolean;
  business: { bakerName?: string; name?: string; story?: string; location?: string; openingHours?: string };
  products: { summary?: string; catalogue: string[]; pricingNotes?: string; customisationNotes?: string };
  ordering: { orderMethod?: string; leadTime?: string; deposit?: string; collection?: boolean; delivery?: boolean; deliveryAreas?: string; paymentProcess?: string };
  policies: { cancellations?: string; refunds?: string; allergens?: string; dietaryOptions?: string; escalationRules?: string };
  languageProfile: { warmth: "low" | "medium" | "high"; formality: "casual" | "balanced" | "professional"; replyLength: "short" | "medium" | "detailed"; emojiFrequency: "none" | "low" | "medium"; preferredPhrases: string[]; bannedPhrases: string[]; askOneQuestionAtATime: boolean };
}

export interface SetupResponse { sessionId: string; bakeryId: string; profile: BakeryProfile; assistantMessage: string; progress: number; completedSteps: string[]; nextStep: string; }

interface SetupSession { id: string; bakeryId: string; profile: BakeryProfile; messages: Array<{ role: "baker" | "agent"; content: string }>; }
interface AiSetupReply { profileUpdates?: unknown; assistantMessage?: string; readyForTest?: boolean; }

const profileFile = join(process.cwd(), "data", "bakery-profiles.json");
const bakeryProfiles = new Map<string, BakeryProfile>();
const setupSessions = new Map<string, SetupSession>();
let profilesLoaded = false;

export async function getBakeryProfile(bakeryId = "demo-bakery"): Promise<BakeryProfile> {
  await loadProfiles();
  const existing = bakeryProfiles.get(bakeryId);
  if (existing) return existing;
  const profile = createProfile(bakeryId);
  bakeryProfiles.set(bakeryId, profile);
  await saveProfiles();
  return profile;
}

export async function getSetupWelcome(sessionId?: string, bakeryId?: string): Promise<SetupResponse> {
  const session = await getOrCreateSession(sessionId, bakeryId);
  const returning = session.profile.business.name;
  const assistantMessage = returning
    ? `welcome back — i’ve still got ${returning}. what would you like your cakemate to learn or change today?`
    : "hey, i’m your cakemate setup assistant. before i start building your agent — what’s your name, and what got you into baking?";
  session.messages.push({ role: "agent", content: assistantMessage });
  return responseFor(session, assistantMessage);
}

export async function processSetupMessage(input: unknown): Promise<SetupResponse> {
  if (!isRecord(input) || typeof input.message !== "string") throw new Error("Request body must include a message.");
  const session = await getOrCreateSession(
    typeof input.sessionId === "string" ? input.sessionId : undefined,
    typeof input.bakeryId === "string" ? input.bakeryId : undefined,
  );
  const message = input.message.trim();
  if (!message) throw new Error("Write a message before sending it.");

  session.messages.push({ role: "baker", content: message });
  const aiReply = await askSetupAgent(session);
  applyProfileUpdates(session.profile, aiReply.profileUpdates);
  session.profile.setupComplete = Boolean(aiReply.readyForTest) && hasEnoughContext(session.profile);
  bakeryProfiles.set(session.bakeryId, session.profile);
  await saveProfiles();

  const assistantMessage = aiReply.assistantMessage?.trim() || "i’ve noted that. what else would you like your agent to know?";
  session.messages.push({ role: "agent", content: assistantMessage });
  return responseFor(session, assistantMessage);
}

export async function resetSetupSession(sessionId?: string, bakeryId?: string): Promise<SetupResponse> {
  if (sessionId) setupSessions.delete(sessionId);
  const id = bakeryId?.trim() || "demo-bakery";
  await loadProfiles();
  bakeryProfiles.set(id, createProfile(id));
  await saveProfiles();
  return getSetupWelcome(undefined, id);
}

export function customerAgentContext(profile: BakeryProfile): string {
  return JSON.stringify({ business: profile.business, products: profile.products, ordering: profile.ordering, policies: profile.policies, languageProfile: profile.languageProfile });
}

async function getOrCreateSession(sessionId?: string, requestedBakeryId?: string): Promise<SetupSession> {
  if (sessionId) { const existing = setupSessions.get(sessionId); if (existing) return existing; }
  const bakeryId = requestedBakeryId?.trim() || "demo-bakery";
  const session: SetupSession = { id: crypto.randomUUID(), bakeryId, profile: await getBakeryProfile(bakeryId), messages: [] };
  setupSessions.set(session.id, session);
  return session;
}

async function askSetupAgent(session: SetupSession): Promise<AiSetupReply> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY. Add it to .env before using the setup agent.");
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model: process.env.OPENAI_MODEL ?? "gpt-4o-mini", temperature: 0.45, response_format: { type: "json_object" }, messages: [
      { role: "system", content: setupSystemPrompt() },
      { role: "user", content: JSON.stringify({ bakeryProfile: session.profile, conversation: session.messages.slice(-16) }) },
    ] }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) throw new Error(readOpenAiError(payload));
  const content = readOpenAiContent(payload);
  const parsed: unknown = JSON.parse(content);
  if (!isRecord(parsed)) throw new Error("Setup agent returned an invalid response.");
  const assistantMessage = readString(parsed.assistantMessage);
  return { profileUpdates: parsed.profileUpdates, ...(assistantMessage ? { assistantMessage } : {}), readyForTest: parsed.readyForTest === true };
}

function setupSystemPrompt(): string {
  return `You are Cakemate's baker onboarding agent. You are helping a baker train an AI employee, not filling in a form.

Have a natural, warm conversation. Understand what the baker says, update the structured profile, then ask only the single most useful next question. Do not repeat a question if the answer is already in the profile. Learn their actual language and preferences from their wording. Do not invent business facts, prices, availability, policies, or personality traits.

Explore only what is useful: bakery name and story, products and variations, prices, ordering method, lead time, deposits, collection/delivery, payments, policies, allergens/dietary requests, escalation rules, and voice. When enough useful context exists to make a safe first customer-agent test, say you have built the first version and invite them to test it.

Return JSON only:
{
  "profileUpdates": { "business": {}, "products": {}, "ordering": {}, "policies": {}, "languageProfile": {} },
  "assistantMessage": "short natural reply with one useful next question",
  "readyForTest": false
}

profileUpdates must contain only facts stated or clearly implied by the baker. Products.catalogue and the phrase arrays are string arrays. The customer-facing agent must never promise availability, pricing, delivery, allergy safety, or final acceptance without the baker.`;
}

function applyProfileUpdates(profile: BakeryProfile, value: unknown): void {
  if (!isRecord(value)) return;
  patchStrings(profile.business, value.business, ["bakerName", "name", "story", "location", "openingHours"]);
  patchStrings(profile.products, value.products, ["summary", "pricingNotes", "customisationNotes"]);
  patchStringArray(profile.products, value.products, "catalogue");
  patchStrings(profile.ordering, value.ordering, ["orderMethod", "leadTime", "deposit", "deliveryAreas", "paymentProcess"]);
  patchBooleans(profile.ordering, value.ordering, ["collection", "delivery"]);
  patchStrings(profile.policies, value.policies, ["cancellations", "refunds", "allergens", "dietaryOptions", "escalationRules"]);
  if (isRecord(value.languageProfile)) {
    const style = value.languageProfile;
    if (style.warmth === "low" || style.warmth === "medium" || style.warmth === "high") profile.languageProfile.warmth = style.warmth;
    if (style.formality === "casual" || style.formality === "balanced" || style.formality === "professional") profile.languageProfile.formality = style.formality;
    if (style.replyLength === "short" || style.replyLength === "medium" || style.replyLength === "detailed") profile.languageProfile.replyLength = style.replyLength;
    if (style.emojiFrequency === "none" || style.emojiFrequency === "low" || style.emojiFrequency === "medium") profile.languageProfile.emojiFrequency = style.emojiFrequency;
    if (typeof style.askOneQuestionAtATime === "boolean") profile.languageProfile.askOneQuestionAtATime = style.askOneQuestionAtATime;
    patchStringArray(profile.languageProfile, style, "preferredPhrases"); patchStringArray(profile.languageProfile, style, "bannedPhrases");
  }
}

function patchStrings<T extends object>(target: T, source: unknown, keys: string[]): void { const record = target as Record<string, unknown>; if (isRecord(source)) for (const key of keys) { const value = readString(source[key]); if (value) record[key] = value; } }
function patchBooleans<T extends object>(target: T, source: unknown, keys: string[]): void { const record = target as Record<string, unknown>; if (isRecord(source)) for (const key of keys) if (typeof source[key] === "boolean") record[key] = source[key]; }
function patchStringArray<T extends object>(target: T, source: unknown, key: string): void { const record = target as Record<string, unknown>; if (isRecord(source) && Array.isArray(source[key])) record[key] = source[key].filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 20); }

function hasEnoughContext(profile: BakeryProfile): boolean { return Boolean(profile.business.name && profile.products.catalogue.length > 0 && profile.ordering.orderMethod); }
function responseFor(session: SetupSession, assistantMessage: string): SetupResponse { const completed = profileProgress(session.profile); return { sessionId: session.id, bakeryId: session.bakeryId, profile: session.profile, assistantMessage, progress: completed.length * 25, completedSteps: completed, nextStep: session.profile.setupComplete ? "complete" : "setup" }; }
function profileProgress(profile: BakeryProfile): string[] { return [profile.business.name ? "business" : "", profile.products.catalogue.length ? "products" : "", profile.ordering.orderMethod ? "ordering" : "", profile.policies.allergens || profile.languageProfile.preferredPhrases.length ? "behaviour" : ""].filter(Boolean); }
function createProfile(bakeryId: string): BakeryProfile { return { bakeryId, setupComplete: false, business: {}, products: { catalogue: [] }, ordering: {}, policies: {}, languageProfile: { warmth: "medium", formality: "casual", replyLength: "short", emojiFrequency: "low", preferredPhrases: [], bannedPhrases: [], askOneQuestionAtATime: true } }; }
async function loadProfiles(): Promise<void> { if (profilesLoaded) return; profilesLoaded = true; try { const value: unknown = JSON.parse(await readFile(profileFile, "utf8")); if (isRecord(value)) for (const [id, profile] of Object.entries(value)) if (isRecord(profile)) bakeryProfiles.set(id, normaliseProfile(id, profile)); } catch { /* No local profiles yet. */ } }
async function saveProfiles(): Promise<void> { await mkdir(dirname(profileFile), { recursive: true }); await writeFile(profileFile, JSON.stringify(Object.fromEntries(bakeryProfiles), null, 2), "utf8"); }
function normaliseProfile(id: string, value: Record<string, unknown>): BakeryProfile { const profile = createProfile(id); applyProfileUpdates(profile, value); profile.setupComplete = value.setupComplete === true; return profile; }
function readOpenAiContent(payload: unknown): string { if (!isRecord(payload) || !Array.isArray(payload.choices) || !isRecord(payload.choices[0]) || !isRecord(payload.choices[0].message) || typeof payload.choices[0].message.content !== "string") throw new Error("OpenAI response did not include a message."); return payload.choices[0].message.content; }
function readOpenAiError(payload: unknown): string { return isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string" ? payload.error.message : "OpenAI request failed."; }
function readString(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
