import { validateAiLeadExtraction } from "./aiContract.js";
import { decideNextStep } from "./conversation.js";
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
  const decision = decideNextStep({
    ...input.context,
    lead,
  });

  return {
    lead,
    decision: {
      ...decision,
      replyToCustomer: extraction.replyToCustomer,
    },
  };
}
