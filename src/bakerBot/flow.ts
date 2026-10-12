import { getBlockingMissingFields, getMissingLeadFields } from "./leadIntake.js";
import type { BakeryItem, BakeryProfile } from "./bakeryProfile.js";
import type { CustomerIntent } from "./intent.js";
import type { BotDecision, ConversationState, LeadEnquiry, LeadField } from "./types.js";

export interface FlowInput {
  intent: CustomerIntent;
  lead: LeadEnquiry;
  currentState: ConversationState;
  customerMessage: string;
}

export function decideFlowReply(input: FlowInput): BotDecision {
  switch (input.intent) {
    case "greeting":
      return decision(input.currentState, "ask_follow_up", "hey, what were you looking to order?");
    case "thanks":
      return decision(input.currentState, "ask_follow_up", "no worries");
    case "small_talk":
      return decision(input.currentState, "ask_follow_up", "i’m good thanks! what can i help you with today?");
    case "pricing_question":
      return decision(
        "collecting_order_details",
        "ask_follow_up",
        buildPricingReply(input.lead, input.customerMessage),
      );
    case "order_status":
      return decision(
        "order_lookup",
        "lookup_order",
        "of course, send over your order ref or the name and date it was booked under and i’ll check",
      );
    case "image_reference":
      return decision(
        "collecting_order_details",
        "ask_follow_up",
        "perfect, i can use that as inspo. is there anything you’d want changed from the picture?",
      );
    case "menu_question":
      return decision(input.currentState, "ask_follow_up", "one sec, let me check that for you");
    case "order_detail":
    case "unknown":
      return decideOrderCollectionReply(input);
  }
}

export function buildMenuReply(message: string): string | null {
  const normalized = message.toLowerCase();

  if (isQuestion(normalized) && /\b(size|sizes|inch|inches)\b/.test(normalized)) {
    return "we do 4 inch, 6 inch, 8 inch and 10 inch cakes";
  }

  if (isQuestion(normalized) && /\b(flavour|flavours|flavor|flavors|sponge)\b/.test(normalized)) {
    return "for sponge flavours we’ve got vanilla, chocolate, red velvet, lemon, coffee and carrot";
  }

  if (isQuestion(normalized) && /\b(filling|fillings|buttercream|jam|biscoff|curd)\b/.test(normalized)) {
    return "for fillings we’ve got vanilla buttercream, chocolate buttercream, strawberry jam, raspberry jam, lotus biscoff and lemon curd";
  }

  if (isQuestion(normalized) && /\b(layer|layers)\b/.test(normalized)) {
    return "we can do 2, 3 or 4 layers of sponge";
  }

  if (isQuestion(normalized) && /\b(topper|toppers|personalised|personalized|acrylic|charm)\b/.test(normalized)) {
    return "for toppers we can do hand written, charm topper, cake topper or an acrylic topper with a standard message";
  }

  if (isQuestion(normalized) && /\b(inspo|inspiration|decor|decoration|design ideas?|pictures?|pics?)\b/.test(normalized)) {
    return "yes, send over any inspo pics here and i can take the details from them x";
  }

  return null;
}

export function buildProfileMenuReply(message: string, profile: BakeryProfile): string | null {
  const items = profile.products.items;
  if (items.length === 0) return null;

  const normalized = normalizeForMatch(message);
  const matchedItem = items.find((item) => mentionsItem(normalized, item.name));
  const asksPrice = /\b(how much|price|pricing|cost|quote|charges?|£)\b/.test(normalized);
  const asksAvailability = /\b(do you|do u|can you|can u|have you|have u|can i|get|order|sell|stock|offer|make|menu|available)\b/.test(normalized);

  if (matchedItem) {
    if (asksPrice) return priceReply(matchedItem);
    if (asksAvailability) return availableItemReply(matchedItem);
    return null;
  }

  const asksForWholeMenu = /\b(menu|what do you (sell|offer|make)|what (cakes|products|items) do you)\b/.test(normalized)
    || (/\b(prices?|pricing)\b/.test(normalized) && !extractRequestedItem(message));
  if (asksForWholeMenu) return `we currently do ${formatItemList(items, true)}.`;

  const requestedItem = extractRequestedItem(message);
  if ((asksPrice || asksAvailability) && requestedItem) {
    const alternatives = formatItemList(items.slice(0, 3), true);
    return `we don't currently offer ${requestedItem}, so there isn't a price for that. we do ${alternatives} if you'd like one of those instead.`;
  }

  return null;
}

function decideOrderCollectionReply(input: FlowInput): BotDecision {
  const missingFields = getMissingLeadFields(input.lead);
  const blockingMissingFields = getBlockingMissingFields(input.lead);
  const nextField = chooseNextField(missingFields, input.customerMessage);

  if (!nextField) {
    return decision(
      "ready_for_baker_review",
      "send_to_baker",
      "perfect, i’ve got the main details. i’ll check the diary and come back to you",
      true,
    );
  }

  return decision(
    blockingMissingFields.length === 0 ? "ready_for_baker_review" : "collecting_order_details",
    nextField === "designOrReference" ? "request_image" : "ask_follow_up",
    questionForField(nextField, input.lead),
    false,
  );
}

function chooseNextField(missingFields: LeadField[], customerMessage: string): LeadField | null {
  const normalized = customerMessage.toLowerCase();
  const order: LeadField[] = [
    "productType",
    "designOrReference",
    "servingsOrQuantity",
    "eventDate",
    "fulfilmentMethod",
    "allergies",
  ];

  if (/\b(price|pricing|cost|quote|how much)\b/.test(normalized)) {
    return null;
  }

  return order.find((field) => missingFields.includes(field)) ?? null;
}

function questionForField(field: LeadField, lead: LeadEnquiry): string {
  switch (field) {
    case "productType":
      return "what were you looking to order?";
    case "designOrReference":
      return "do you have any inspo pics or a design in mind?";
    case "servingsOrQuantity":
      return lead.productType?.toLowerCase().includes("cupcake")
        ? "roughly how many cupcakes would you need?"
        : "roughly how many people is it for?";
    case "eventDate":
      return "what date would you need it for?";
    case "fulfilmentMethod":
      return "would you be collecting or need delivery?";
    case "allergies":
      return "any allergies i should note?";
    case "customerContact":
      return "what name is best to put this under?";
  }
}

function buildPricingReply(lead: LeadEnquiry, customerMessage: string): string {
  const normalized = customerMessage.toLowerCase();

  if (/\b10\s*(inch|inches|")\b/.test(normalized)) {
    return lead.flavour
      ? "for a 10 inch it depends on the design and finish, send over any inspo and i can check properly x"
      : "for a 10 inch it depends on the flavour and design lovely, what kind of cake were you thinking? x";
  }

  return "it depends on the size and design lovely, what kind of cake were you thinking? x";
}

function decision(
  nextState: ConversationState,
  action: BotDecision["action"],
  replyToCustomer: string,
  shouldEmailBaker = false,
): BotDecision {
  return {
    nextState,
    action,
    replyToCustomer,
    shouldEmailBaker,
  };
}

function isQuestion(message: string): boolean {
  return /\?/.test(message) || /\b(what|which|list|options|available|do you do|have you got|have u got|can you do|can u do)\b/.test(message);
}

function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9£]+/g, " ").trim();
}

function mentionsItem(message: string, itemName: string): boolean {
  const name = normalizeForMatch(itemName);
  if (!name) return false;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}(?:s|es)?\\b`, "i").test(message);
}

function extractRequestedItem(message: string): string | null {
  const normalized = message.toLowerCase().replace(/[?!.,]+$/g, "").trim();
  const patterns = [
    /(?:do|can) (?:you|u) (?:sell|stock|offer|do|make|have)\s+(?:any\s+|a\s+|an\s+)?(.+)$/,
    /(?:have|do) (?:you|u) got\s+(?:any\s+|a\s+|an\s+)?(.+)$/,
    /(?:can|could) (?:i|we) (?:get|order|have)\s+(?:any\s+|a\s+|an\s+)?(.+?)(?:\s+for\s+.+)?$/,
    /how much (?:is|are|for|does)?\s*(?:a\s+|an\s+|the\s+)?(.+?)(?:\s+cost)?$/,
    /(?:price|cost) (?:of|for)\s+(?:a\s+|an\s+|the\s+)?(.+)$/,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const item = match?.[1]?.trim();
    if (item && item.length <= 60) return item;
  }
  return null;
}

function priceReply(item: BakeryItem): string {
  if (!item.price) {
    return `we do ${item.name}, but i don't have a set price saved for it yet. i can get the baker to confirm it for you.`;
  }
  const variation = item.variations ? ` for ${item.variations}` : "";
  return `our ${item.name} is ${formatPrice(item.price)}${variation}.`;
}

function availableItemReply(item: BakeryItem): string {
  const price = item.price ? ` — ${formatPrice(item.price)}` : "";
  const variation = item.variations ? ` for ${item.variations}` : "";
  return `yes, we do ${item.name}${variation}${price}.`;
}

function formatItemList(items: BakeryItem[], includePrices: boolean): string {
  const labels = items.map((item) => {
    const price = includePrices && item.price ? ` (${formatPrice(item.price)}${item.variations ? ` for ${item.variations}` : ""})` : "";
    return `${item.name}${price}`;
  });
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}

function formatPrice(price: string): string {
  const trimmed = price.trim();
  return /^\d+(?:\.\d{1,2})?$/.test(trimmed) ? `£${trimmed}` : trimmed;
}
