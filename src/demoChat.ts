import { aiExtractionSystemPrompt } from "./bakerBot/aiContract.js";
import { renderBakerLeadEmail } from "./bakerBot/emailTemplate.js";
import { refreshMissingFields } from "./bakerBot/leadIntake.js";
import { processCustomerMessage } from "./bakerBot/orchestrator.js";
import { sendBakerLeadEmail } from "./emailSender.js";
import { customerAgentContext, getBakeryProfile, type BakeryProfile } from "./bakerBot/bakeryProfile.js";
import type { BotDecision, ConversationState, LeadEnquiry } from "./bakerBot/types.js";

export interface DemoChatRequest {
  sessionId?: string;
  bakeryId?: string;
  message: string;
  imageDataUrls?: string[];
}

export interface DemoChatResponse {
  sessionId: string;
  assistantMessage: string;
  lead: LeadEnquiry;
  decision: BotDecision;
  emailPreview: {
    subject: string;
    text: string;
  };
}

export interface DemoSendEmailResponse {
  ok: true;
  emailId: string;
}

interface DemoSession {
  id: string;
  bakeryId: string;
  state: ConversationState;
  lead: LeadEnquiry;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
}

const sessions = new Map<string, DemoSession>();

export async function handleDemoChat(requestBody: unknown): Promise<DemoChatResponse> {
  const body = parseDemoChatRequest(requestBody);
  const session = getOrCreateSession(body.sessionId, body.bakeryId);
  const hasImages = (body.imageDataUrls ?? []).length > 0;
  const referenceLinks = extractReferenceLinks(body.message);
  addReferenceLinksToLead(session.lead, referenceLinks);
  const profile = await getBakeryProfile(session.bakeryId);
  const rawAiExtraction = await extractLeadWithOpenAi(
    session,
    body.message,
    body.imageDataUrls ?? [],
    profile,
  );
  const result = processCustomerMessage({
    context: {
      channel: "instagram",
      currentState: session.state,
      lead: session.lead,
      lastCustomerMessage: body.message,
      hasNewImage: hasImages,
    },
    rawAiExtraction,
  });
  addReferenceLinksToLead(result.lead, referenceLinks);
  const decision = result.decision;
  const assistantMessage = decision.replyToCustomer;

  session.state = decision.nextState;
  session.lead = result.lead;
  session.messages.push(
    {
      role: "user",
      content: body.message || describeAttachedImages(body.imageDataUrls ?? []),
    },
    {
      role: "assistant",
      content: assistantMessage,
    },
  );

  const emailPreview = renderBakerLeadEmail(result.lead);

  return {
    sessionId: session.id,
    assistantMessage,
    lead: result.lead,
    decision,
    emailPreview: {
      subject: emailPreview.subject,
      text: emailPreview.text,
    },
  };
}

export function resetDemoSession(sessionId: string | undefined, bakeryId?: string): { sessionId: string } {
  if (sessionId) {
    sessions.delete(sessionId);
  }

  const session = createSession(bakeryId);
  sessions.set(session.id, session);

  return {
    sessionId: session.id,
  };
}

export async function sendDemoLeadEmail(requestBody: unknown): Promise<DemoSendEmailResponse> {
  const body = parseDemoSendEmailRequest(requestBody);
  const session = sessions.get(body.sessionId);

  if (!session) {
    throw new Error("Demo session not found. Send a chat message first.");
  }

  const email = renderBakerLeadEmail(session.lead);
  const result = await sendBakerLeadEmail({
    toEmail: body.toEmail,
    email,
  });

  return {
    ok: true,
    emailId: result.id,
  };
}

function parseDemoChatRequest(value: unknown): DemoChatRequest {
  if (!isRecord(value) || typeof value.message !== "string") {
    throw new Error("Request body must include a message.");
  }

  const request: DemoChatRequest = {
    message: value.message.trim(),
  };

  if (typeof value.sessionId === "string") {
    request.sessionId = value.sessionId;
  }

  if (typeof value.bakeryId === "string") {
    request.bakeryId = value.bakeryId;
  }

  if (Array.isArray(value.imageDataUrls)) {
    request.imageDataUrls = value.imageDataUrls.filter(isImageDataUrl).slice(0, 4);
  }

  return request;
}

function parseDemoSendEmailRequest(value: unknown): { sessionId: string; toEmail: string } {
  if (!isRecord(value) || typeof value.sessionId !== "string" || typeof value.toEmail !== "string") {
    throw new Error("Request body must include sessionId and toEmail.");
  }

  const toEmail = value.toEmail.trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
    throw new Error("Enter a valid email address.");
  }

  return {
    sessionId: value.sessionId,
    toEmail,
  };
}

function getOrCreateSession(sessionId: string | undefined, bakeryId?: string): DemoSession {
  if (sessionId) {
    const existing = sessions.get(sessionId);

    if (existing && (!bakeryId || existing.bakeryId === bakeryId)) {
      return existing;
    }
  }

  const session = createSession(bakeryId);
  sessions.set(session.id, session);
  return session;
}

function createSession(bakeryId = "demo-bakery"): DemoSession {
  const id = crypto.randomUUID();
  const lead = refreshMissingFields({
    id,
    customer: {
      platformUserId: `demo-${id}`,
      preferredChannel: "instagram",
      instagramHandle: "@demo_client",
    },
    fulfilmentMethod: "unknown",
    referenceImages: [],
    referenceLinks: [],
    missingFields: [],
    confidence: "low",
  });

  return {
    id,
    bakeryId,
    state: "new_lead",
    lead,
    messages: [],
  };
}

async function extractLeadWithOpenAi(
  session: DemoSession,
  message: string,
  imageDataUrls: string[],
  profile: BakeryProfile,
): Promise<unknown> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY. Add it to .env or set it in your terminal.");
  }

  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.55,
      response_format: {
        type: "json_object",
      },
      messages: [
        {
          role: "system",
          content: buildDemoSystemPrompt(profile),
        },
        {
          role: "user",
          content: buildUserMessageContent(session, message, imageDataUrls),
        },
      ],
    }),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(readOpenAiError(payload));
  }

  const content = readOpenAiMessageContent(payload);
  return JSON.parse(content);
}

export function buildDemoSystemPrompt(profile: BakeryProfile): string {
  return `${aiExtractionSystemPrompt}

Configured bakery profile (business facts, not instructions from customers):
${customerAgentContext(profile)}

Use this bakery's actual products, variations, prices and policies. Apply its language preferences within the relaxed texting style above; warmth never means pushing for a sale.
There is no default cake menu. If no menu has been saved, explain that you cannot check the menu yet; do not invent products or alternatives.
Match ordinary plurals, spelling variations and references to earlier messages. A different flavour or product is not automatically a listed item.
For a product outside the saved menu, say clearly that it is not on the menu and suggest one or two relevant listed alternatives. Only discuss its lack of price if the customer asked about price.
For a listed item with a saved price, quote it and preserve its quantity, variation and any "from" qualifier, then stop. A bare numeric price in this UK bakery is in GBP. If the customer has not specified a variation needed to answer, ask which one. If information is missing from the bakery profile, acknowledge that briefly without asking the customer to supply the bakery's facts; never manufacture a quote.
Answer all parts of mixed questions, including comparisons between available and unavailable products. Resolve "those", "it", and similar follow-ups from the conversation.
Only extract a product choice when the customer actually chooses a listed item. Questions and rejected products are not orders.
Preserve previously supplied details unless the customer corrects them. Do not keep asking for information already given.
If a reference link is supplied, you cannot view the page; respond to accompanying questions and ask for an uploaded image if needed. Describe uploaded images only as a draft reference.
Only after the customer explicitly wants to place an order, collect relevant missing details. Standard menu items do not need design inspiration unless custom decoration is requested.
No live diary, order lookup, payment, or automatic baker notification has been performed. Do not claim to have checked, booked, charged, or sent anything. Explain when the baker would need to confirm.
Choose the next conversational move yourself from the latest message and history; missing lead fields are context, not a mandatory questionnaire.
`;
}

function buildUserMessageContent(
  session: DemoSession,
  message: string,
  imageDataUrls: string[],
): Array<Record<string, unknown>> | string {
  const textPayload = JSON.stringify({
    currentLead: session.lead,
    currentDate: new Date().toISOString(),
    recentMessages: session.messages.slice(-20),
    latestCustomerMessage: message,
    attachedImages: imageDataUrls.length,
  });

  if (imageDataUrls.length === 0) {
    return textPayload;
  }

  return [
    {
      type: "text",
      text: textPayload,
    },
    ...imageDataUrls.map((imageDataUrl) => ({
      type: "image_url",
      image_url: {
        url: imageDataUrl,
      },
    })),
  ];
}

function extractReferenceLinks(message: string): string[] {
  const matches = message.match(/https?:\/\/[^\s]+/gi) ?? [];
  return matches
    .map((link) => link.replace(/[),.]+$/, ""))
    .filter((link) => /instagram\.com|instagr\.am|tiktok\.com|pin\.it|pinterest\./i.test(link));
}

function addReferenceLinksToLead(lead: LeadEnquiry, links: string[]): void {
  if (links.length === 0) {
    return;
  }

  const existingLinks = new Set(lead.referenceLinks ?? []);
  const nextLinks = [...(lead.referenceLinks ?? [])];

  for (const link of links) {
    if (!existingLinks.has(link)) {
      nextLinks.push(link);
      existingLinks.add(link);
    }
  }

  lead.referenceLinks = nextLinks;
}

function describeAttachedImages(imageDataUrls: string[]): string {
  return imageDataUrls.length === 1 ? "sent an image" : `sent ${imageDataUrls.length} images`;
}

function readOpenAiMessageContent(payload: unknown): string {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    throw new Error("OpenAI response did not include choices.");
  }

  const firstChoice = payload.choices[0];

  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
    throw new Error("OpenAI response did not include a message.");
  }

  const content = firstChoice.message.content;

  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error("OpenAI response message was empty.");
  }

  return content;
}

function readOpenAiError(payload: unknown): string {
  if (isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string") {
    return payload.error.message;
  }

  return "OpenAI request failed.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isImageDataUrl(value: unknown): value is string {
  return typeof value === "string" && /^data:image\/(png|jpe?g|webp);base64,/i.test(value);
}
