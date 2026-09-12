import { getBlockingMissingFields, getMissingLeadFields } from "./leadIntake.js";
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
      return decision(input.currentState, "ask_follow_up", "hey lovely x");
    case "thanks":
      return decision(input.currentState, "ask_follow_up", "no worries x");
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
        "of course, send over your order ref or the name/date it was booked under and i’ll check x",
      );
    case "image_reference":
      return decision(
        "collecting_order_details",
        "ask_follow_up",
        "perfect, i can use that as inspo. is there anything you’d want changed from the picture? x",
      );
    case "menu_question":
      return decision(input.currentState, "ask_follow_up", "one sec lovely x");
    case "order_detail":
    case "unknown":
      return decideOrderCollectionReply(input);
  }
}

export function buildMenuReply(message: string): string | null {
  const normalized = message.toLowerCase();

  if (isQuestion(normalized) && /\b(size|sizes|inch|inches)\b/.test(normalized)) {
    return "we do 4 inch, 6 inch, 8 inch and 10 inch cakes x";
  }

  if (isQuestion(normalized) && /\b(flavour|flavours|flavor|flavors|sponge)\b/.test(normalized)) {
    return "for sponge flavours we’ve got vanilla, chocolate, red velvet, lemon, coffee and carrot x";
  }

  if (isQuestion(normalized) && /\b(filling|fillings|buttercream|jam|biscoff|curd)\b/.test(normalized)) {
    return "for fillings we’ve got vanilla buttercream, chocolate buttercream, strawberry jam, raspberry jam, lotus biscoff and lemon curd x";
  }

  if (isQuestion(normalized) && /\b(layer|layers)\b/.test(normalized)) {
    return "we can do 2, 3 or 4 layers of sponge x";
  }

  if (isQuestion(normalized) && /\b(topper|toppers|personalised|personalized|acrylic|charm)\b/.test(normalized)) {
    return "for toppers we can do hand written, charm topper, cake topper or an acrylic topper with a standard message x";
  }

  if (isQuestion(normalized) && /\b(inspo|inspiration|decor|decoration|design ideas?|pictures?|pics?)\b/.test(normalized)) {
    return "yes send over any inspo pics here and i can take the details from them x";
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
      "perfect, i’ve got the main details. i’ll check the diary and come back to you x",
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
      return "what cake are you after? x";
    case "designOrReference":
      return "do you have any inspo pics or a design in mind? x";
    case "servingsOrQuantity":
      return lead.productType?.toLowerCase().includes("cupcake")
        ? "roughly how many cupcakes would you need? x"
        : "roughly how many people is it for? x";
    case "eventDate":
      return "what date would you need it for? x";
    case "fulfilmentMethod":
      return "would you be collecting or need delivery? x";
    case "allergies":
      return "any allergies i should note? x";
    case "customerContact":
      return "what name is best to put this under? x";
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
