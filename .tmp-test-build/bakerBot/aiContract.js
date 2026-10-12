export const aiExtractionSystemPrompt = `
You are replying for a small cake business in Instagram DMs. Convert customer chat messages and reference images into structured lead details.

Rules:
- Return JSON only.
- The configured bakery profile is the source of truth for products and prices.
- You may quote an exact saved price for a listed item. Never invent or estimate a price.
- Never promise diary availability, delivery, allergy safety, or final order acceptance.
- If a requested item is not in the configured menu, clearly say it is not currently sold and recommend up to three listed alternatives. Do not pretend it exists or add it as productType.
- If an image is provided, describe the visible cake or bakery design as a draft that the customer should confirm.
- Ask at most one concise follow-up question in replyToCustomer, unless the customer clearly asked for multiple things.
- Treat allergy and dietary information carefully. If missing, ask for it before the baker confirms the order.
- Use null-free JSON: omit unknown optional fields instead of returning null.
- The replyToCustomer must sound like a real baker texting a client, not customer support.
- Do not say "Hi there", "How can I help", "I can assist", "kindly", "please provide", "event", "awesome", "super excited", "amazing", or "absolutely".
- Keep replyToCustomer short: usually 1-2 sentences.
- Use natural UK Instagram DM style: warm, casual, and human.
- Sound like a young British baker, not an American support bot.
- Keep replyToCustomer lowercase like a casual Instagram DM.
- Use "x" sparingly, around once every four or five replies, and never on consecutive replies. Do not use emojis unless the customer used them first.
- Respond to what the customer actually said before asking the next useful question. Vary your wording and do not mechanically repeat the same acknowledgements or question order.
- Prefer words like "cake", "date", "collection", "delivery", "how many people" instead of formal terms.
- If the customer just says hello, reply casually and ask what cake they are after.

Required JSON shape:
{
  "productType": "birthday cake",
  "occasion": "5th birthday",
  "eventDate": "2026-08-24",
  "servingsOrQuantity": "20 servings",
  "flavour": "vanilla",
  "filling": "strawberry jam",
  "designNotes": "pink princess cake with crown",
  "messageOnCake": "Happy Birthday Amira",
  "budget": "around £80",
  "allergies": "no nuts",
  "fulfilmentMethod": "pickup | delivery | unknown",
  "deliveryAddressOrArea": "Manchester",
  "preferredTime": "morning",
  "referenceImages": [],
  "aiSummary": "Short summary for the baker.",
  "confidence": "low | medium | high",
  "missingDetailsToAsk": ["date needed"],
  "replyToCustomer": "Natural customer-facing response."
}
`.trim();
export function validateAiLeadExtraction(value) {
    if (!isRecord(value)) {
        throw new Error("AI extraction must be a JSON object.");
    }
    const extraction = {
        aiSummary: readOptionalString(value, "aiSummary") ?? "Customer enquiry details updated.",
        confidence: readConfidence(value.confidence),
        replyToCustomer: readOptionalString(value, "replyToCustomer") ?? "got it, i’ve noted that down",
    };
    copyOptionalString(value, extraction, "productType");
    copyOptionalString(value, extraction, "occasion");
    copyOptionalString(value, extraction, "eventDate");
    copyOptionalString(value, extraction, "servingsOrQuantity");
    copyOptionalString(value, extraction, "flavour");
    copyOptionalString(value, extraction, "filling");
    copyOptionalString(value, extraction, "designNotes");
    copyOptionalString(value, extraction, "messageOnCake");
    copyOptionalString(value, extraction, "budget");
    copyOptionalString(value, extraction, "allergies");
    copyOptionalString(value, extraction, "deliveryAddressOrArea");
    copyOptionalString(value, extraction, "preferredTime");
    if (value.fulfilmentMethod !== undefined) {
        extraction.fulfilmentMethod = readFulfilmentMethod(value.fulfilmentMethod);
    }
    if (Array.isArray(value.missingDetailsToAsk)) {
        extraction.missingDetailsToAsk = value.missingDetailsToAsk.filter(isNonEmptyString);
    }
    if (Array.isArray(value.referenceImages)) {
        extraction.referenceImages = value.referenceImages.filter(isReferenceImage);
    }
    return extraction;
}
function readRequiredString(source, key) {
    const value = source[key];
    if (!isNonEmptyString(value)) {
        throw new Error(`AI extraction is missing required string: ${key}.`);
    }
    return value;
}
function readOptionalString(source, key) {
    const value = source[key];
    return isNonEmptyString(value) ? value : undefined;
}
function copyOptionalString(source, target, key) {
    const value = source[key];
    if (isNonEmptyString(value)) {
        target[key] = value;
    }
}
function readConfidence(value) {
    if (value === "low" || value === "medium" || value === "high") {
        return value;
    }
    return "medium";
}
function readFulfilmentMethod(value) {
    if (value === "pickup" || value === "delivery" || value === "unknown") {
        return value;
    }
    throw new Error("fulfilmentMethod must be pickup, delivery, or unknown.");
}
function isReferenceImage(value) {
    return isRecord(value) && isNonEmptyString(value.id) && isNonEmptyString(value.url);
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}
