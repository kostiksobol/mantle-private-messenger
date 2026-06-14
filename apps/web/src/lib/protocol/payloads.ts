export type MainInvitationPayload = {
  chatKey: string;
  creator: string;
};

export type ChatCreationPayload = {
  event: "ChatCreation";
  name: string;
};

export type InvitationPayload = {
  event: "Invitation";
  invited: string;
};

export type MessageAttachmentPayload = {
  url: string;
  name: string;
  mime: string;
  size: number;
  encryptedSize?: number;
};

export type MessagePayload = {
  event: "Message";
  text: string;
  attachments?: MessageAttachmentPayload[];
};

export type ChatEventPayload =
  | ChatCreationPayload
  | InvitationPayload
  | MessagePayload;

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseAttachments(value: unknown): MessageAttachmentPayload[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return undefined;

  const attachments: MessageAttachmentPayload[] = [];

  for (const item of value) {
    if (!isRecord(item)) return undefined;

    const { url, name, mime, size, encryptedSize } = item;

    if (!isString(url) || !url) return undefined;
    if (!isString(name) || !name) return undefined;
    if (!isString(mime) || !mime) return undefined;
    if (!isNumber(size) || size < 0) return undefined;

    if (
      encryptedSize !== undefined &&
      (!isNumber(encryptedSize) || encryptedSize < 0)
    ) {
      return undefined;
    }

    attachments.push({
      url,
      name,
      mime,
      size,
      ...(encryptedSize !== undefined ? { encryptedSize } : {}),
    });
  }

  return attachments;
}

export function encodePayload(payload: MainInvitationPayload | ChatEventPayload) {
  return JSON.stringify(payload);
}

export function createMainInvitationPayload(
  chatKey: string,
  creator: string
): MainInvitationPayload {
  return {
    chatKey,
    creator,
  };
}

export function createChatCreationPayload(name: string): ChatCreationPayload {
  return {
    event: "ChatCreation",
    name,
  };
}

export function createInvitationPayload(invited: string): InvitationPayload {
  return {
    event: "Invitation",
    invited,
  };
}

export function createMessagePayload(
  text: string,
  attachments?: MessageAttachmentPayload[]
): MessagePayload {
  return {
    event: "Message",
    text,
    ...(attachments && attachments.length > 0 ? { attachments } : {}),
  };
}

export function parseMainInvitationPayload(
  value: unknown
): MainInvitationPayload | undefined {
  const parsed = parseJson(value);

  if (!isRecord(parsed)) return undefined;

  const { chatKey, creator } = parsed;

  if (!isString(chatKey) || !chatKey) return undefined;
  if (!isString(creator) || !creator) return undefined;

  return {
    chatKey,
    creator,
  };
}

export function parseChatEventPayload(
  value: unknown
): ChatEventPayload | undefined {
  const parsed = parseJson(value);

  if (!isRecord(parsed)) return undefined;

  if (parsed.event === "ChatCreation") {
    if (!isString(parsed.name) || !parsed.name) return undefined;

    return {
      event: "ChatCreation",
      name: parsed.name,
    };
  }

  if (parsed.event === "Invitation") {
    if (!isString(parsed.invited) || !parsed.invited) return undefined;

    return {
      event: "Invitation",
      invited: parsed.invited,
    };
  }

  if (parsed.event === "Message") {
    if (!isString(parsed.text)) return undefined;

    const attachments = parseAttachments(parsed.attachments);

    if (parsed.attachments !== undefined && !attachments) {
      return undefined;
    }

    return {
      event: "Message",
      text: parsed.text,
      ...(attachments && attachments.length > 0 ? { attachments } : {}),
    };
  }

  return undefined;
}
