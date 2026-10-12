import { aiExtractionSystemPrompt } from "./bakerBot/aiContract.js";
import { cakeMenuPrompt } from "./bakerBot/cakeMenu.js";
import { renderBakerLeadEmail } from "./bakerBot/emailTemplate.js";
import { buildMenuReply, buildProfileMenuReply, decideFlowReply } from "./bakerBot/flow.js";
import { detectCustomerIntent } from "./bakerBot/intent.js";
import { refreshMissingFields } from "./bakerBot/leadIntake.js";
import { processCustomerMessage } from "./bakerBot/orchestrator.js";
import { sendBakerLeadEmail } from "./emailSender.js";
import { customerAgentContext, getBakeryProfile } from "./bakerBot/bakeryProfile.js";
const sessions = new Map();
export async function handleDemoChat(requestBody) {
    const body = parseDemoChatRequest(requestBody);
    const session = getOrCreateSession(body.sessionId, body.bakeryId);
    const hasImages = (body.imageDataUrls ?? []).length > 0;
    const referenceLinks = extractReferenceLinks(body.message);
    addReferenceLinksToLead(session.lead, referenceLinks);
    const intent = detectCustomerIntent(body.message, hasImages);
    const profile = await getBakeryProfile(session.bakeryId);
    const directReply = getDirectReply(body.message, intent.intent, session, profile);
    if (referenceLinks.length > 0 && !hasImages) {
        const reply = "send over a screenshot or pic of the cake and i can take the details from that";
        session.messages.push({
            role: "user",
            content: body.message,
        }, {
            role: "assistant",
            content: reply,
        });
        const emailPreview = renderBakerLeadEmail(session.lead);
        const decision = {
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
        session.messages.push({
            role: "user",
            content: body.message || describeAttachedImages(body.imageDataUrls ?? []),
        }, {
            role: "assistant",
            content: directReply.replyToCustomer,
        });
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
    const rawAiExtraction = await extractLeadWithOpenAi(session, body.message, body.imageDataUrls ?? [], intent.intent, profile);
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
    const assistantMessage = makeReplyMoreBritish(flowDecision.replyToCustomer, session.messages);
    flowDecision.replyToCustomer = assistantMessage;
    session.state = flowDecision.nextState;
    session.lead = result.lead;
    session.messages.push({
        role: "user",
        content: body.message || describeAttachedImages(body.imageDataUrls ?? []),
    }, {
        role: "assistant",
        content: assistantMessage,
    });
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
export function resetDemoSession(sessionId, bakeryId) {
    if (sessionId) {
        sessions.delete(sessionId);
    }
    const session = createSession(bakeryId);
    sessions.set(session.id, session);
    return {
        sessionId: session.id,
    };
}
export async function sendDemoLeadEmail(requestBody) {
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
function parseDemoChatRequest(value) {
    if (!isRecord(value) || typeof value.message !== "string") {
        throw new Error("Request body must include a message.");
    }
    const request = {
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
function parseDemoSendEmailRequest(value) {
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
function getOrCreateSession(sessionId, bakeryId) {
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
function createSession(bakeryId = "demo-bakery") {
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
async function extractLeadWithOpenAi(session, message, imageDataUrls, intent, profile) {
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
function buildDemoSystemPrompt(profile) {
    const fallbackMenu = profile.products.items.length === 0 && profile.products.catalogue.length === 0
        ? `\n${cakeMenuPrompt}\n`
        : "";
    return `${aiExtractionSystemPrompt}
${fallbackMenu}

Configured bakery profile:
${customerAgentContext(profile)}

Profile behaviour:
- Treat this profile as the bakery's source of truth. Use its products, ordering rules, policies and language style where provided.
- Do not invent details the profile does not contain.
- Only say an item is available when it appears in products.items or products.catalogue.
- If the customer asks for an item that is not sold, clearly say it is not currently on the menu, then naturally recommend up to three items that are on the menu.
- If a saved menu item has a price, give that exact price when the customer asks. If an unavailable item is requested, explain that it has no price because it is not sold; never invent one.
- Do not save an unavailable requested item as the customer's chosen product.
- If the profile says to escalate or you are unsure, collect the enquiry and leave the final decision to the baker.

Demo context:
- You are replying inside a fake Instagram DM chat for a bakery.
- Sound like the baker's actual DM tone: friendly, quick, slightly informal, never corporate.
- The voice is a UK girl running a cake page, not an American chatbot.
- Write like a person texting from a bakery account.
- Keep replyToCustomer lowercase like a casual Instagram DM.
- Use "x" only occasionally, roughly once every four or five replies. Never add it to consecutive replies.
- Vary acknowledgements and sentence structure based on the conversation. Do not repeat a stock line or follow the same question script every time.
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

Good reply examples (vary these; do not copy them as a script):
- "hey, what were you looking to order?"
- "aw that sounds cute. what date would you need it for?"
- "perfect, and roughly how many people is it for?"
- "we don't currently do cupcakes, but we do brownies and cookies if either of those works for you."
- "our brownie box is £20 for six."
- "no worries, send over the picture and i can take the details from there."
- "thank you, i’ll check the diary and get the baker to come back to you x"

Bad reply examples:
- "Hi there! What type of cake are you looking for, and when is your event?"
- "Awesome! What kind of cake are you looking for?"
- "Absolutely, I'd be excited to help."
- "I can assist you with your order requirements."
- "Please provide the required information."
- "Your enquiry has been submitted for review."`;
}
function buildUserMessageContent(session, message, imageDataUrls, intent) {
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
function makeReplyMoreBritish(reply, messages) {
    const naturalReply = reply
        .replace(/\bawesome\b/gi, "lovely")
        .replace(/\bamazing\b/gi, "lovely")
        .replace(/\babsolutely\b/gi, "of course")
        .replace(/\bsuper excited\b/gi, "happy")
        .replace(/\bHi there[!,]?\s*/gi, "hey ")
        .replace(/\bWhat type of cake are you looking for\b/gi, "what cake are you after")
        .replace(/\byour event\b/gi, "you need it for")
        .toLowerCase()
        .trim();
    const recentAssistantReplies = messages
        .filter((message) => message.role === "assistant")
        .slice(-3);
    const recentlyUsedX = recentAssistantReplies.some((message) => /(?:^|\s)x[.!?]?$/i.test(message.content.trim()));
    return recentlyUsedX
        ? naturalReply.replace(/(?:\s+)x([.!?]?)$/i, "$1").trim()
        : naturalReply;
}
function extractReferenceLinks(message) {
    const matches = message.match(/https?:\/\/[^\s]+/gi) ?? [];
    return matches
        .map((link) => link.replace(/[),.]+$/, ""))
        .filter((link) => /instagram\.com|instagr\.am|tiktok\.com|pin\.it|pinterest\./i.test(link));
}
function addReferenceLinksToLead(lead, links) {
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
function describeAttachedImages(imageDataUrls) {
    return imageDataUrls.length === 1 ? "sent an image" : `sent ${imageDataUrls.length} images`;
}
function readOpenAiMessageContent(payload) {
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
function readOpenAiError(payload) {
    if (isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string") {
        return payload.error.message;
    }
    return "OpenAI request failed.";
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isImageDataUrl(value) {
    return typeof value === "string" && /^data:image\/(png|jpe?g|webp);base64,/i.test(value);
}
function getDirectReply(message, intent, session, profile) {
    if (intent === "menu_question" || intent === "pricing_question") {
        const menuReply = buildProfileMenuReply(message, profile)
            ?? (profile.products.items.length === 0 ? buildMenuReply(message) : null);
        if (menuReply) {
            return {
                nextState: session.state,
                action: "ask_follow_up",
                replyToCustomer: menuReply,
                shouldEmailBaker: false,
            };
        }
    }
    if (intent === "greeting" || intent === "thanks" || intent === "small_talk" || intent === "order_status") {
        return decideFlowReply({
            intent,
            lead: session.lead,
            currentState: session.state,
            customerMessage: message,
        });
    }
    return null;
}
