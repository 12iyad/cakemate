export type MessagingChannel = "whatsapp" | "instagram";

export type ConversationState =
  | "new_lead"
  | "collecting_order_details"
  | "waiting_for_images"
  | "ready_for_baker_review"
  | "baker_handoff"
  | "order_lookup";

export type FulfilmentMethod = "pickup" | "delivery" | "unknown";

export type LeadConfidence = "low" | "medium" | "high";

export type LeadAction =
  | "ask_follow_up"
  | "request_image"
  | "send_to_baker"
  | "handoff_to_baker"
  | "lookup_order";

export interface CustomerIdentity {
  name?: string;
  phone?: string;
  instagramHandle?: string;
  whatsappId?: string;
  platformUserId: string;
  preferredChannel: MessagingChannel;
}

export interface ReferenceImage {
  id: string;
  url: string;
  description?: string;
  colors?: string[];
  detectedText?: string;
  confidence?: LeadConfidence;
}

export interface LeadEnquiry {
  id: string;
  customer: CustomerIdentity;
  productType?: string;
  occasion?: string;
  eventDate?: string;
  servingsOrQuantity?: string;
  flavour?: string;
  filling?: string;
  designNotes?: string;
  messageOnCake?: string;
  budget?: string;
  allergies?: string;
  fulfilmentMethod: FulfilmentMethod;
  deliveryAddressOrArea?: string;
  preferredTime?: string;
  referenceImages: ReferenceImage[];
  referenceLinks?: string[];
  missingFields: LeadField[];
  confidence: LeadConfidence;
  originalMessage?: string;
  aiSummary?: string;
}

export type LeadField =
  | "customerContact"
  | "productType"
  | "eventDate"
  | "servingsOrQuantity"
  | "designOrReference"
  | "fulfilmentMethod"
  | "allergies";

export interface ConversationContext {
  channel: MessagingChannel;
  currentState: ConversationState;
  lead: LeadEnquiry;
  lastCustomerMessage?: string;
  hasNewImage: boolean;
}

export interface BotDecision {
  nextState: ConversationState;
  action: LeadAction;
  replyToCustomer: string;
  shouldEmailBaker: boolean;
}

export type OrderStatus =
  | "quoted"
  | "deposit_pending"
  | "confirmed"
  | "in_progress"
  | "ready"
  | "delivered"
  | "cancelled";

export interface BakerOrder {
  id: string;
  orderReference: string;
  customer: CustomerIdentity;
  eventDate: string;
  productType: string;
  status: OrderStatus;
  statusMessage?: string;
  createdAt: string;
}
