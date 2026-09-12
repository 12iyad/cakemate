import type { MessagingChannel } from "./types.js";

export interface WhatsAppChannelConfig {
  channel: "whatsapp";
  accessToken: string;
  phoneNumberId: string;
  verifyToken: string;
  graphApiVersion: string;
}

export interface InstagramChannelConfig {
  channel: "instagram";
  pageAccessToken: string;
  verifyToken: string;
  graphApiVersion: string;
}

export type ChannelConfig = WhatsAppChannelConfig | InstagramChannelConfig;

export const firstMvpChannel: MessagingChannel = "instagram";

export function loadWhatsAppChannelConfig(env: Record<string, string | undefined>): WhatsAppChannelConfig {
  return {
    channel: "whatsapp",
    accessToken: readRequiredEnv(env, "WHATSAPP_ACCESS_TOKEN"),
    phoneNumberId: readRequiredEnv(env, "WHATSAPP_PHONE_NUMBER_ID"),
    verifyToken: readRequiredEnv(env, "WHATSAPP_VERIFY_TOKEN"),
    graphApiVersion: env.WHATSAPP_GRAPH_API_VERSION ?? "v20.0",
  };
}

export function loadInstagramChannelConfig(env: Record<string, string | undefined>): InstagramChannelConfig {
  return {
    channel: "instagram",
    pageAccessToken: readRequiredEnv(env, "INSTAGRAM_PAGE_ACCESS_TOKEN"),
    verifyToken: readRequiredEnv(env, "INSTAGRAM_VERIFY_TOKEN"),
    graphApiVersion: env.INSTAGRAM_GRAPH_API_VERSION ?? "v20.0",
  };
}

export function getWebhookVerifyResponse(
  mode: string | undefined,
  token: string | undefined,
  challenge: string | undefined,
  expectedVerifyToken: string,
): string | null {
  if (mode === "subscribe" && token === expectedVerifyToken && challenge) {
    return challenge;
  }

  return null;
}

function readRequiredEnv(env: Record<string, string | undefined>, key: string): string {
  const value = env[key];

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}.`);
  }

  return value;
}
