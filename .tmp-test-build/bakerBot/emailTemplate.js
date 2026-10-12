import { formatMissingFields } from "./leadIntake.js";
export function renderBakerLeadEmail(lead) {
    const subject = `New Bakery Enquiry - ${display(lead.productType)} for ${display(lead.eventDate)}`;
    const sections = [
        section("Customer Details", [
            ["Name", lead.customer.name],
            ["Contact", lead.customer.phone],
            ["Platform", lead.customer.preferredChannel],
            ["Instagram", lead.customer.instagramHandle],
            ["WhatsApp ID", lead.customer.whatsappId],
            ["Platform User ID", lead.customer.platformUserId],
        ]),
        section("Order Details", [
            ["Product", lead.productType],
            ["Occasion", lead.occasion],
            ["Date Needed", lead.eventDate],
            ["Servings/Quantity", lead.servingsOrQuantity],
            ["Flavour", lead.flavour],
            ["Filling", lead.filling],
            ["Theme/Design", lead.designNotes],
            ["Message on Cake", lead.messageOnCake],
            ["Budget", lead.budget],
            ["Allergies/Dietary", lead.allergies],
        ]),
        section("Fulfilment", [
            ["Delivery/Pickup", lead.fulfilmentMethod],
            ["Address/Area", lead.deliveryAddressOrArea],
            ["Preferred Time", lead.preferredTime],
        ]),
        referenceImagesSection(lead),
        referenceLinksSection(lead),
        `AI Summary\n${display(lead.aiSummary)}`,
        `Missing Details\n${formatMissingFields(lead.missingFields)}`,
        `Recommended Next Action\n${recommendedNextAction(lead)}`,
    ];
    const text = [
        "New customer enquiry received.",
        "",
        ...sections,
        "",
        "Note: This is a lead summary, not a confirmed order. Please confirm availability, pricing, and any allergy-sensitive details before accepting.",
    ].join("\n\n");
    return {
        subject,
        text,
        html: renderHtml(subject, sections),
    };
}
function referenceLinksSection(lead) {
    if (!lead.referenceLinks || lead.referenceLinks.length === 0) {
        return "Reference Links\nNone provided.";
    }
    return `Reference Links\n${lead.referenceLinks
        .map((link, index) => `${index + 1}. ${link}`)
        .join("\n")}`;
}
function section(title, rows) {
    const body = rows.map(([label, value]) => `${label}: ${display(value)}`).join("\n");
    return `${title}\n${body}`;
}
function referenceImagesSection(lead) {
    if (lead.referenceImages.length === 0) {
        return "Reference Images\nNone provided.";
    }
    const lines = lead.referenceImages.map((image, index) => {
        const description = image.description ? ` - ${image.description}` : "";
        return `${index + 1}. ${image.url}${description}`;
    });
    return `Reference Images\n${lines.join("\n")}`;
}
function recommendedNextAction(lead) {
    if (lead.confidence === "low") {
        return "Review manually and ask follow-up questions before quoting.";
    }
    if (lead.missingFields.length > 0) {
        return "Ask for the missing details before sending a final quote.";
    }
    return "Check availability and reply with quote or next steps.";
}
function renderHtml(subject, sections) {
    const renderedSections = sections
        .map((sectionText) => `<pre>${escapeHtml(sectionText)}</pre>`)
        .join("\n");
    return [
        "<!doctype html>",
        '<html lang="en">',
        "<body>",
        `<h1>${escapeHtml(subject)}</h1>`,
        "<p>New customer enquiry received.</p>",
        renderedSections,
        "<p><strong>Note:</strong> This is a lead summary, not a confirmed order.</p>",
        "</body>",
        "</html>",
    ].join("\n");
}
function display(value) {
    return value && value.trim().length > 0 ? value : "Not provided";
}
function escapeHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
