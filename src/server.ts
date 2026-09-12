import "dotenv/config";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join } from "node:path";
import { URL } from "node:url";
import { getWebhookVerifyResponse } from "./bakerBot/channels.js";
import { generateItemDescription, getSetupWelcome, processSetupMessage, resetSetupSession, saveOnboardingProfile } from "./bakerBot/bakeryProfile.js";
import { handleDemoChat, resetDemoSession, sendDemoLeadEmail } from "./demoChat.js";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";
const whatsappVerifyToken = process.env.WHATSAPP_VERIFY_TOKEN ?? "bakerspal_whatsapp_verify_2026";
const instagramVerifyToken = process.env.INSTAGRAM_VERIFY_TOKEN ?? "bakerspal_instagram_verify_2026";

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (request.method === "GET" && requestUrl.pathname === "/health") {
    sendJson(response, 200, {
      ok: true,
      service: "bakers-pal-webhook",
    });
    return;
  }

  if (request.method === "GET" && isStaticRoute(requestUrl.pathname)) {
    await handleStaticFile(requestUrl.pathname, response);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/demo/chat") {
    await handleDemoChatRequest(request, response);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/demo/reset") {
    await handleDemoResetRequest(request, response);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/demo/send-email") {
    await handleDemoSendEmailRequest(request, response);
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/setup/welcome") {
    const sessionId = requestUrl.searchParams.get("sessionId") ?? undefined;
    const bakeryId = requestUrl.searchParams.get("bakeryId") ?? undefined;
    sendJson(response, 200, await getSetupWelcome(sessionId, bakeryId));
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/setup/chat") {
    await handleSetupChatRequest(request, response);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/setup/reset") {
    await handleSetupResetRequest(request, response);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/onboarding/save") {
    await handleOnboardingSaveRequest(request, response);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/onboarding/generate-description") {
    await handleDescriptionRequest(request, response);
    return;
  }

  if (requestUrl.pathname !== "/webhooks/whatsapp" && requestUrl.pathname !== "/webhooks/instagram") {
    sendJson(response, 404, {
      error: "Not found",
    });
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/webhooks/whatsapp") {
    handleWhatsAppVerification(requestUrl, response);
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/webhooks/instagram") {
    handleInstagramVerification(requestUrl, response);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/webhooks/whatsapp") {
    await handleWhatsAppWebhook(request, response);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/webhooks/instagram") {
    await handleInstagramWebhook(request, response);
    return;
  }

  sendJson(response, 405, {
    error: "Method not allowed",
  });
});

server.listen(port, host, () => {
  console.log(`BakersPal webhook server listening on http://${host}:${port}`);
  console.log(`Demo chat app: http://localhost:${port}`);
  console.log(`WhatsApp verification endpoint: /webhooks/whatsapp`);
  console.log(`Instagram verification endpoint: /webhooks/instagram`);
});

async function handleStaticFile(pathname: string, response: ServerResponse): Promise<void> {
  const filePath = pathname === "/" ? "index.html" : pathname.slice(1);
  const fullPath = join(process.cwd(), "public", filePath);

  try {
    const file = await readFile(fullPath);

    response.writeHead(200, {
      "content-type": contentTypeForPath(fullPath),
      "cache-control": "no-store",
    });
    response.end(file);
  } catch {
    sendJson(response, 404, {
      error: "Not found",
    });
  }
}

async function handleDemoChatRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody(request);
    const result = await handleDemoChat(body);

    sendJson(response, 200, result);
  } catch (error) {
    sendJson(response, 400, {
      error: error instanceof Error ? error.message : "Demo chat request failed.",
    });
  }
}

async function handleDemoResetRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody(request);
    const sessionId = isRecord(body) && typeof body.sessionId === "string" ? body.sessionId : undefined;
    const bakeryId = isRecord(body) && typeof body.bakeryId === "string" ? body.bakeryId : undefined;

    sendJson(response, 200, resetDemoSession(sessionId, bakeryId));
  } catch (error) {
    sendJson(response, 400, {
      error: error instanceof Error ? error.message : "Demo reset request failed.",
    });
  }
}

async function handleDemoSendEmailRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody(request);
    const result = await sendDemoLeadEmail(body);

    sendJson(response, 200, result);
  } catch (error) {
    sendJson(response, 400, {
      error: error instanceof Error ? error.message : "Demo email send failed.",
    });
  }
}

async function handleSetupChatRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    sendJson(response, 200, await processSetupMessage(await readJsonBody(request)));
  } catch (error) {
    sendJson(response, 400, { error: error instanceof Error ? error.message : "Setup chat request failed." });
  }
}

async function handleSetupResetRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const body = await readJsonBody(request);
    const sessionId = isRecord(body) && typeof body.sessionId === "string" ? body.sessionId : undefined;
    const bakeryId = isRecord(body) && typeof body.bakeryId === "string" ? body.bakeryId : undefined;
    sendJson(response, 200, await resetSetupSession(sessionId, bakeryId));
  } catch (error) {
    sendJson(response, 400, { error: error instanceof Error ? error.message : "Setup reset failed." });
  }
}

async function handleOnboardingSaveRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try { sendJson(response, 200, { profile: await saveOnboardingProfile(await readJsonBody(request)) }); }
  catch (error) { sendJson(response, 400, { error: error instanceof Error ? error.message : "Could not save onboarding." }); }
}

async function handleDescriptionRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try { sendJson(response, 200, { description: await generateItemDescription(await readJsonBody(request)) }); }
  catch (error) { sendJson(response, 400, { error: error instanceof Error ? error.message : "Could not generate a description." }); }
}

function handleWhatsAppVerification(requestUrl: URL, response: ServerResponse): void {
  const challenge = getWebhookVerifyResponse(
    requestUrl.searchParams.get("hub.mode") ?? undefined,
    requestUrl.searchParams.get("hub.verify_token") ?? undefined,
    requestUrl.searchParams.get("hub.challenge") ?? undefined,
    whatsappVerifyToken,
  );

  if (!challenge) {
    sendJson(response, 403, {
      error: "Webhook verification failed",
    });
    return;
  }

  response.writeHead(200, {
    "content-type": "text/plain",
  });
  response.end(challenge);
}

function handleInstagramVerification(requestUrl: URL, response: ServerResponse): void {
  const challenge = getWebhookVerifyResponse(
    requestUrl.searchParams.get("hub.mode") ?? undefined,
    requestUrl.searchParams.get("hub.verify_token") ?? undefined,
    requestUrl.searchParams.get("hub.challenge") ?? undefined,
    instagramVerifyToken,
  );

  if (!challenge) {
    sendJson(response, 403, {
      error: "Webhook verification failed",
    });
    return;
  }

  response.writeHead(200, {
    "content-type": "text/plain",
  });
  response.end(challenge);
}

async function handleWhatsAppWebhook(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    const payload = await readJsonBody(request);
    const summary = summarizeWhatsAppPayload(payload);

    console.log("Received WhatsApp webhook:", JSON.stringify(summary, null, 2));

    sendJson(response, 200, {
      ok: true,
    });
  } catch (error) {
    console.error("Failed to process WhatsApp webhook:", error);
    sendJson(response, 400, {
      error: "Invalid webhook payload",
    });
  }
}

async function handleInstagramWebhook(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    const payload = await readJsonBody(request);
    const summary = summarizeInstagramPayload(payload);

    console.log("Received Instagram webhook:", JSON.stringify(summary, null, 2));

    sendJson(response, 200, {
      ok: true,
    });
  } catch (error) {
    console.error("Failed to process Instagram webhook:", error);
    sendJson(response, 400, {
      error: "Invalid webhook payload",
    });
  }
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function summarizeWhatsAppPayload(payload: unknown): unknown {
  if (!isRecord(payload)) {
    return payload;
  }

  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  const changes = entries.flatMap((entry) => {
    if (!isRecord(entry) || !Array.isArray(entry.changes)) {
      return [];
    }

    return entry.changes;
  });

  return changes.map((change) => {
    if (!isRecord(change) || !isRecord(change.value)) {
      return change;
    }

    return {
      field: change.field,
      messages: Array.isArray(change.value.messages) ? change.value.messages.length : 0,
      statuses: Array.isArray(change.value.statuses) ? change.value.statuses.length : 0,
      metadata: change.value.metadata,
    };
  });
}

function summarizeInstagramPayload(payload: unknown): unknown {
  if (!isRecord(payload)) {
    return payload;
  }

  const entries = Array.isArray(payload.entry) ? payload.entry : [];

  return entries.map((entry) => {
    if (!isRecord(entry)) {
      return entry;
    }

    const messaging = Array.isArray(entry.messaging) ? entry.messaging : [];
    const changes = Array.isArray(entry.changes) ? entry.changes : [];

    return {
      id: entry.id,
      time: entry.time,
      messagingEvents: messaging.length,
      changes: changes.length,
    };
  });
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, {
    "content-type": "application/json",
  });
  response.end(JSON.stringify(body));
}

function isStaticRoute(pathname: string): boolean {
  return pathname === "/" || pathname === "/app.js" || pathname === "/styles.css";
}

function contentTypeForPath(pathname: string): string {
  switch (extname(pathname)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
