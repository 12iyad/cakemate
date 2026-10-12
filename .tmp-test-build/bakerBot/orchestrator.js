import { validateAiLeadExtraction } from "./aiContract.js";
import { decideNextStep } from "./conversation.js";
import { applyAiExtractionToLead } from "./leadIntake.js";
export function processCustomerMessage(input) {
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
