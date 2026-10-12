import { validateAiLeadExtraction } from "./aiContract.js";
import { applyAiExtractionToLead } from "./leadIntake.js";
import type { BotDecision, ConversationContext, LeadEnquiry } from "./types.js";

export interface ProcessCustomerMessageInput {
  context: ConversationContext;
  rawAiExtraction: unknown;
}

export interface ProcessCustomerMessageResult {
  lead: LeadEnquiry;
  decision: BotDecision;
}

export function processCustomerMessage(
  input: ProcessCustomerMessageInput,
): ProcessCustomerMessageResult {
  const extraction = validateAiLeadExtraction(input.rawAiExtraction);
  const lead = applyAiExtractionToLead(input.context.lead, extraction);
  // The model owns the wording and conversational move; code only maps metadata.
  const move = extraction.conversationMove ?? "chat";
  const decision: BotDecision = {
    nextState: move === "chat" ? input.context.currentState
      : move === "request_image" ? "waiting_for_images"
      : move === "baker_review" ? "ready_for_baker_review"
      : move === "order_lookup" ? "order_lookup"
      : "collecting_order_details",
    action: move === "request_image" ? "request_image"
      : move === "order_lookup" ? "lookup_order"
      : move === "baker_review" ? "handoff_to_baker"
      : "ask_follow_up",
    replyToCustomer: extraction.replyToCustomer,
    shouldEmailBaker: false,
  };

  return {
    lead,
    decision: {
      ...decision,
      replyToCustomer: extraction.replyToCustomer,
    },
  };
}
