import { aiExtractionSystemPrompt } from "./bakerBot/aiContract.js";
import { cakeMenuPrompt } from "./bakerBot/cakeMenu.js";
import { renderBakerLeadEmail } from "./bakerBot/emailTemplate.js";
import { buildMenuReply, decideFlowReply } from "./bakerBot/flow.js";
import { detectCustomerIntent } from "./bakerBot/intent.js";
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
  const intent = detectCustomerIntent(body.message, hasImages);
  const directReply = getDirectReply(body.message, intent.intent, session);

  if (referenceLinks.length > 0 && !hasImages) {
    const reply = "send over a screenshot or pic of the cake and i can take the details from that x";

    session.messages.push(
      {
        role: "user",
        content: body.message,
      },
      {
        role: "assistant",
        content: reply,
      },
    );

    const emailPreview = renderBakerLeadEmail(session.lead);
    const decision: BotDecision = {
      nextState: "waiting_for_images",
      action: "request_image",
      replyToCustomer: reply,
      shouldEmailBaker: false,
    };

    return {
      sessionId: session.id,
      assistantMessage: reply,
      lead: session.lead,
      decision,
      emailPreview: {
        subject: emailPreview.subject,
        text: emailPreview.text,
      },
    };
  }

  if (directReply) {
    session.messages.push(
      {
        role: "user",
        content: body.message || describeAttachedImages(body.imageDataUrls ?? []),
      },
      {
        role: "assistant",
        content: directReply.replyToCustomer,
      },
    );

    const emailPreview = renderBakerLeadEmail(session.lead);

    return {
      sessionId: session.id,
      assistantMessage: directReply.replyToCustomer,
      lead: session.lead,
      decision: directReply,
      emailPreview: {
        subject: emailPreview.subject,
        text: emailPreview.text,
      },
    };
  }

  const rawAiExtraction = await extractLeadWithOpenAi(
    session,
    body.message,
    body.imageDataUrls ?? [],
    intent.intent,
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
  const flowDecision = decideFlowReply({
    intent: intent.intent,
    lead: result.lead,
    currentState: session.state,
    customerMessage: body.message,
  });

  const assistantMessage = makeReplyMoreBritish(flowDecision.replyToCustomer);
  flowDecision.replyToCustomer = assistantMessage;

  session.state = flowDecision.nextState;
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
    decision: flowDecision,
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

    if (existing) {
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
  intent: string,
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
          content: buildDemoSystemPrompt(await getBakeryProfile(session.bakeryId)),
        },
        {
          role: "user",
          content: buildUserMessageContent(session, message, imageDataUrls, intent),
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

function buildDemoSystemPrompt(profile: BakeryProfile): string {
  return `${aiExtractionSystemPrompt}

${cakeMenuPrompt}

Configured bakery profile:
${customerAgentContext(profile)}

Profile behaviour:
- Treat this profile as the bakery's source of truth. Use its products, ordering rules, policies and language style where provided.
- Do not invent details the profile does not contain.
- If the profile says to escalate or you are unsure, collect the enquiry and leave the final decision to the baker.

Demo context:
- You are replying inside a fake Instagram DM chat for a bakery.
- Sound like the baker's actual DM tone: friendly, quick, slightly informal, never corporate.
- The voice is a UK girl running a cake page, not an American chatbot.
- Write like a person texting from a bakery account.
- Keep replyToCustomer lowercase like a casual Instagram DM.
- Use "x" naturally sometimes, especially after helpful or reassuring messages.
- Do not over-greet. If the customer opens with "hello", do not say "Hi there!".
- Never use American hype words like "awesome", "amazing", "super", "absolutely", or "excited".
- Use UK casual words like "lovely", "perfect", "no worries", "hiya", "aw", "sure", "brill" sparingly.
- Usually ask for only one missing detail at a time.
- The backend flow controller decides the next conversational move. Focus on extracting accurate details.
- If the client is asking about menu options, just answer that specific question and stop.
- Do not ask for the date/allergies/collection in the same reply as a menu options answer.
- Do not end the conversation just because minimum details exist. If the client asks a menu/options question, answer it.
- Only say you will check the diary/details when the client seems done choosing and there are no obvious questions to answer.
- If the client asks "what are your list of cake sizes", reply with the cake sizes.
- If images are attached, describe the visible cake/decor briefly and ask what they want kept or changed.
- Preserve details already present in currentLead unless the customer corrects them.

Good reply examples:
- "hey lovely, what cake are you after? x"
- "aw that sounds cute, what date would you need it for? x"
- "perfect, and roughly how many people is it for?"
- "no worries, send over the picture and i can take the details from there x"
- "we do 4 inch, 6 inch, 8 inch and 10 inch cakes x"
- "for sponge flavours we’ve got vanilla, chocolate, red velvet, lemon, coffee and carrot x"
- "thank you, i’ll check the diary and get the baker to come back to you with availability x"

Bad reply examples:
- "Hi there! What type of cake are you looking for, and when is your event?"
- "Awesome! What kind of cake are you looking for?"
- "Absolutely, I'd be excited to help."
- "I can assist you with your order requirements."
- "Please provide the required information."
- "Your enquiry has been submitted for review."`;
}

function buildUserMessageContent(
  session: DemoSession,
  message: string,
  imageDataUrls: string[],
  intent: string,
): Array<Record<string, unknown>> | string {
  const textPayload = JSON.stringify({
    currentLead: session.lead,
    recentMessages: session.messages.slice(-8),
    latestCustomerMessage: message,
    detectedIntent: intent,
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

function makeReplyMoreBritish(reply: string): string {
  return reply
    .replace(/\bawesome\b/gi, "lovely")
    .replace(/\bamazing\b/gi, "lovely")
    .replace(/\babsolutely\b/gi, "of course")
    .replace(/\bsuper excited\b/gi, "happy")
    .replace(/\bHi there[!,]?\s*/gi, "hey ")
    .replace(/\bWhat type of cake are you looking for\b/gi, "what cake are you after")
    .replace(/\byour event\b/gi, "you need it for")
    .toLowerCase()
    .trim();
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

function getDirectReply(
  message: string,
  intent: ReturnType<typeof detectCustomerIntent>["intent"],
  session: DemoSession,
): BotDecision | null {
  if (intent === "menu_question") {
    const menuReply = buildMenuReply(message);

    if (menuReply) {
      return {
        nextState: session.state,
        action: "ask_follow_up",
        replyToCustomer: menuReply,
        shouldEmailBaker: false,
      };
    }
  }

  if (intent === "greeting" || intent === "thanks" || intent === "order_status") {
    return decideFlowReply({
      intent,
      lead: session.lead,
      currentState: session.state,
      customerMessage: message,
    });
  }

  return null;
}
