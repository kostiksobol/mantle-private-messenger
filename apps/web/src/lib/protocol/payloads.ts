/**
 * Creator-rooted chat protocol.
 *
 * MainConnector record is RSA-encrypted for one recipient:
 *   { chatKey, creator }
 *
 * UserContract owner is always the author of decrypted chat events.
 *
 * ChatCreation:
 *   { event: "ChatCreation", name }
 *
 * Invitation:
 *   { event: "Invitation", invited }
 *
 * Membership is discovered by starting from creator and then reading every
 * known member's UserContract. Each Invitation adds its invited user.
 */

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

export type MessagePayload = {
  event: "Message";
  text: string;
};

export type ChatEventPayload =
  | ChatCreationPayload
  | InvitationPayload
  | MessagePayload;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

export function encodePayload(payload: object) {
  return JSON.stringify(payload);
}

export function createMainInvitationPayload(input: {
  chatKey: string;
  creator: string;
}): MainInvitationPayload {
  return {
    chatKey: input.chatKey,
    creator: input.creator,
  };
}

export function createChatCreationPayload(input: {
  name: string;
}): ChatCreationPayload {
  return {
    event: "ChatCreation",
    name: input.name,
  };
}

export function createInvitationPayload(input: {
  invited: string;
}): InvitationPayload {
  return {
    event: "Invitation",
    invited: input.invited,
  };
}

export function createMessagePayload(input: {
  text: string;
}): MessagePayload {
  return {
    event: "Message",
    text: input.text,
  };
}

export function parseMainInvitationPayload(
  value: string
): MainInvitationPayload | undefined {
  const parsed = parseJson(value);

  if (!isObject(parsed)) {
    return undefined;
  }

  if (
    typeof parsed.chatKey !== "string" ||
    typeof parsed.creator !== "string"
  ) {
    return undefined;
  }

  return {
    chatKey: parsed.chatKey,
    creator: parsed.creator,
  };
}

export function parseChatEventPayload(
  value: string
): ChatEventPayload | undefined {
  const parsed = parseJson(value);

  if (!isObject(parsed) || typeof parsed.event !== "string") {
    return undefined;
  }

  if (parsed.event === "ChatCreation") {
    if (typeof parsed.name !== "string") {
      return undefined;
    }

    return {
      event: "ChatCreation",
      name: parsed.name,
    };
  }

  if (parsed.event === "Invitation") {
    if (typeof parsed.invited !== "string") {
      return undefined;
    }

    return {
      event: "Invitation",
      invited: parsed.invited,
    };
  }

  if (parsed.event === "Message") {
    if (typeof parsed.text !== "string") {
      return undefined;
    }

    return {
      event: "Message",
      text: parsed.text,
    };
  }

  return undefined;
}
