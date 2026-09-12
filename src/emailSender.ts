import type { BakerLeadEmail } from "./bakerBot/emailTemplate.js";

export interface SendEmailInput {
  toEmail: string;
  email: BakerLeadEmail;
}

export interface SendEmailResult {
  id: string;
}

export async function sendBakerLeadEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.EMAIL_FROM ?? "onboarding@resend.dev";

  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY. Add it to .env before sending real emails.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: `cakemate.ai <${fromEmail}>`,
      to: [input.toEmail],
      subject: input.email.subject,
      html: input.email.html,
      text: input.email.text,
    }),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(readResendError(payload));
  }

  if (!isRecord(payload) || typeof payload.id !== "string") {
    throw new Error("Resend did not return an email id.");
  }

  return {
    id: payload.id,
  };
}

function readResendError(payload: unknown): string {
  if (isRecord(payload) && typeof payload.message === "string") {
    return payload.message;
  }

  if (isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string") {
    return payload.error.message;
  }

  return "Resend email request failed.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
