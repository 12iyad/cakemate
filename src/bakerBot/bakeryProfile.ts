export interface BakeryProfile {
  bakeryId: string;
  business: {
    bakerName?: string;
    name?: string;
    story?: string;
    location?: string;
    openingHours?: string;
  };
  products: {
    summary?: string;
    catalogue?: string[];
    pricingNotes?: string;
    customisationNotes?: string;
  };
  ordering: {
    orderMethod?: string;
    leadTime?: string;
    deposit?: string;
    collection?: boolean;
    delivery?: boolean;
    deliveryAreas?: string;
    paymentProcess?: string;
  };
  policies: {
    cancellations?: string;
    refunds?: string;
    allergens?: string;
    dietaryOptions?: string;
    escalationRules?: string;
  };
  languageProfile: {
    warmth: "low" | "medium" | "high";
    formality: "casual" | "balanced" | "professional";
    replyLength: "short" | "medium" | "detailed";
    emojiFrequency: "none" | "low" | "medium";
    preferredPhrases: string[];
    bannedPhrases: string[];
    askOneQuestionAtATime: boolean;
  };
}

export interface SetupResponse {
  sessionId: string;
  bakeryId: string;
  profile: BakeryProfile;
  assistantMessage: string;
  progress: number;
  completedSteps: string[];
  nextStep: string;
}

interface SetupSession {
  id: string;
  bakeryId: string;
  profile: BakeryProfile;
  currentStep: SetupStep;
  completedSteps: Set<SetupStep>;
}

type SetupStep = "welcome" | "business" | "products" | "ordering" | "policies" | "personality" | "test" | "complete";

const bakeryProfiles = new Map<string, BakeryProfile>();
const setupSessions = new Map<string, SetupSession>();

export function getBakeryProfile(bakeryId = "demo-bakery"): BakeryProfile {
  const existing = bakeryProfiles.get(bakeryId);
  if (existing) return existing;
  const profile = createProfile(bakeryId);
  bakeryProfiles.set(bakeryId, profile);
  return profile;
}

export function getSetupWelcome(sessionId?: string, bakeryId?: string): SetupResponse {
  const session = getOrCreateSession(sessionId, bakeryId);
  return responseFor(
    session,
    "hey, i’m your cakemate setup assistant. before i start building your agent — what’s your name, and what got you into baking?",
  );
}

export function processSetupMessage(input: unknown): SetupResponse {
  if (!isRecord(input) || typeof input.message !== "string") {
    throw new Error("Request body must include a message.");
  }

  const session = getOrCreateSession(
    typeof input.sessionId === "string" ? input.sessionId : undefined,
    typeof input.bakeryId === "string" ? input.bakeryId : undefined,
  );
  const message = input.message.trim();

  if (!message) {
    throw new Error("Write a message before sending it.");
  }

  learnFromMessage(session.profile, session.currentStep, message);
  session.completedSteps.add(session.currentStep);
  session.currentStep = nextStep(session.currentStep);
  bakeryProfiles.set(session.bakeryId, session.profile);

  return responseFor(session, questionFor(session));
}

export function resetSetupSession(sessionId?: string, bakeryId?: string): SetupResponse {
  if (sessionId) {
    setupSessions.delete(sessionId);
  }

  const normalizedBakeryId = bakeryId?.trim() || "demo-bakery";
  bakeryProfiles.set(normalizedBakeryId, createProfile(normalizedBakeryId));
  return getSetupWelcome(undefined, normalizedBakeryId);
}

export function customerAgentContext(profile: BakeryProfile): string {
  return JSON.stringify({
    business: profile.business,
    products: profile.products,
    ordering: profile.ordering,
    policies: profile.policies,
    languageProfile: profile.languageProfile,
  });
}

function getOrCreateSession(sessionId?: string, requestedBakeryId?: string): SetupSession {
  if (sessionId) {
    const existing = setupSessions.get(sessionId);
    if (existing) return existing;
  }

  const id = crypto.randomUUID();
  const bakeryId = requestedBakeryId?.trim() || "demo-bakery";
  const profile = getBakeryProfile(bakeryId);
  const session: SetupSession = { id, bakeryId, profile, currentStep: "welcome", completedSteps: new Set() };
  setupSessions.set(id, session);
  return session;
}

function createProfile(bakeryId: string): BakeryProfile {
  return {
    bakeryId,
    business: {},
    products: { catalogue: [] },
    ordering: {},
    policies: {},
    languageProfile: {
      warmth: "medium",
      formality: "casual",
      replyLength: "short",
      emojiFrequency: "low",
      preferredPhrases: [],
      bannedPhrases: [],
      askOneQuestionAtATime: true,
    },
  };
}

function learnFromMessage(profile: BakeryProfile, step: SetupStep, message: string): void {
  const lower = message.toLowerCase();

  // Test-mode feedback can arrive at any point, so it always updates the language profile.
  if (/too formal/.test(lower)) profile.languageProfile.formality = "casual";
  if (/too long/.test(lower)) profile.languageProfile.replyLength = "short";
  if (/no emojis?/.test(lower)) profile.languageProfile.emojiFrequency = "none";

  if (step === "welcome") {
    const bakerName = capture(message, /(?:my name(?:'s| is)?|i(?:'m| am))\s+([a-z][a-z '-]{1,40})/i);
    if (bakerName) profile.business.bakerName = bakerName;
    profile.business.story = message;
  }

  if (step === "business") {
    const businessName = capture(message, /(?:called|name(?:'s| is)?|business(?: is|'s))\s+([\w&' -]{2,60})/i);
    const location = capture(message, /(?:based in|from|in)\s+([a-z][a-z ,' -]{2,50})/i);
    if (businessName) profile.business.name = businessName;
    if (location) profile.business.location = location;
    if (!profile.business.name) profile.business.name = message;
  }

  if (step === "products") {
    profile.products.summary = message;
    profile.products.catalogue = splitCatalogue(message);
    const money = message.match(/(?:£\s?\d+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?\s?(?:pounds?|quid))/gi);
    if (money?.length) profile.products.pricingNotes = money.join(", ");
  }

  if (step === "ordering") {
    profile.ordering.orderMethod = message;
    const leadTime = capture(message, /(?:need|need at least|lead time(?: is)?|usually need)\s+([^.,;]+(?:days?|weeks?|hours?)[^.,;]*)/i);
    const deposit = capture(message, /((?:£\s?\d+(?:\.\d{1,2})?|\d+\s?(?:pounds?|quid))\s*(?:deposit)?)/i);
    const deliveryAreas = capture(message, /(?:deliver(?:y)? (?:to|around|in)|areas? (?:are|include))\s+([^.;]+)/i);
    if (leadTime) profile.ordering.leadTime = leadTime;
    if (deposit) profile.ordering.deposit = deposit;
    if (/\b(collection|collect|pickup|pick up)\b/.test(lower)) profile.ordering.collection = true;
    if (/\b(deliver|delivery)\b/.test(lower)) profile.ordering.delivery = true;
    if (deliveryAreas) profile.ordering.deliveryAreas = deliveryAreas;
  }

  if (step === "policies") {
    profile.policies.allergens = message;
    if (/\b(cancel|refund)\b/.test(lower)) profile.policies.cancellations = message;
    if (/\b(dietary|vegan|gluten|halal)\b/.test(lower)) profile.policies.dietaryOptions = message;
    if (/\b(ask me|escalat|not sure|complicated|custom)\b/.test(lower)) profile.policies.escalationRules = message;
  }

  if (step === "personality") {
    if (/less friendly|short.?direct|brief/.test(lower)) {
      profile.languageProfile.warmth = "low";
      profile.languageProfile.replyLength = "short";
    }
    if (/warm|friendly|like me/.test(lower)) profile.languageProfile.warmth = "high";
    if (/professional|premium/.test(lower)) profile.languageProfile.formality = "professional";
    if (/no emoji|without emoji/.test(lower)) profile.languageProfile.emojiFrequency = "none";
    if (/few emoji|low emoji/.test(lower)) profile.languageProfile.emojiFrequency = "low";
    if (/i(?: would|'d) say|i say/.test(lower)) profile.languageProfile.preferredPhrases.push(message);
    if (/don't say|do not say|hate the word/.test(lower)) profile.languageProfile.bannedPhrases.push(message);
  }
}

function questionFor(session: SetupSession): string {
  const name = session.profile.business.bakerName ? ` ${session.profile.business.bakerName.split(" ")[0]},` : "";
  switch (session.currentStep) {
    case "business": return `love that${name} — what’s the bakery called, and where are you based?`;
    case "products": return "nice. what do you actually sell day to day? tell me the main things, sizes, flavours and any custom bits — messy notes are completely fine.";
    case "ordering": return "got it. how do customers normally order from you — how much notice do you need, do you take a deposit, and is it collection, delivery or both?";
    case "policies": return "i’ve got the basics. what should the agent be careful about: allergens, dietary requests, cancellations, refunds, unavailable dates or complicated orders?";
    case "personality": return "last bit: how should your assistant sound? try: warm & friendly, short & direct, premium, professional, or ‘like me’. you can also tell me words you’d never say.";
    case "test": return "perfect — i’m cooking up your cakemate agent. or should i say brownie mate, depending on the menu. switch to Customer agent and try a real enquiry; its replies will now use what you’ve taught me.";
    case "complete": return "your profile is ready to test. keep chatting here whenever you want to teach your agent a new rule or phrase.";
    default: return "tell me a little about your bakery.";
  }
}

function nextStep(step: SetupStep): SetupStep {
  const steps: SetupStep[] = ["welcome", "business", "products", "ordering", "policies", "personality", "test", "complete"];
  return steps[Math.min(steps.indexOf(step) + 1, steps.length - 1)] ?? "complete";
}

function responseFor(session: SetupSession, assistantMessage: string): SetupResponse {
  const completedSteps = ["welcome", "business", "products", "ordering", "policies", "personality"].filter((step) => session.completedSteps.has(step as SetupStep));
  return {
    sessionId: session.id,
    bakeryId: session.bakeryId,
    profile: session.profile,
    assistantMessage,
    progress: Math.round((completedSteps.length / 6) * 100),
    completedSteps,
    nextStep: session.currentStep,
  };
}

function splitCatalogue(value: string): string[] {
  return value.split(/[,;\n]|\band\b/gi).map((item) => item.trim()).filter((item) => item.length > 2).slice(0, 8);
}

function capture(value: string, expression: RegExp): string | undefined {
  const match = value.match(expression);
  return match?.[1]?.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
