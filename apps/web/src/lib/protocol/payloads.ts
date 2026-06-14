export type MainInvitationPayload = {
  chatKey: string;
  inviter: string;
};

export type ChatCreationPayload = {
  event: "ChatCreation";
  name: string;
};

export type InvitationPayload = {
  event: "Invitation";
  invited: string;
  invitedBy: string;
};

export type MessagePayload = {
  event: "Message";
  text: string;
};

export type ChatEventPayload =
  | ChatCreationPayload
  | InvitationPayload
  | MessagePayload;

export function encodePayload(payload: object) {
  return JSON.stringify(payload);
}

export function createMainInvitationPayload(input: {
  chatKey: string;
  inviter: string;
}): MainInvitationPayload {
  return {
    chatKey: input.chatKey,
    inviter: input.inviter,
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
  invitedBy: string;
}): InvitationPayload {
  return {
    event: "Invitation",
    invited: input.invited,
    invitedBy: input.invitedBy,
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

export function parseMainInvitationPayload(text: string) {
  try {
    const value = JSON.parse(text) as Partial<MainInvitationPayload>;

    if (
      typeof value.chatKey === "string" &&
      typeof value.inviter === "string"
    ) {
      return {
        chatKey: value.chatKey,
        inviter: value.inviter,
      };
    }

    return undefined;
  } catch {
    return undefined;
  }
}

export function parseChatEventPayload(text: string): ChatEventPayload | undefined {
  try {
    const value = JSON.parse(text) as Partial<ChatEventPayload>;

    if (value.event === "ChatCreation") {
      if (typeof value.name === "string") {
        return {
          event: "ChatCreation",
          name: value.name,
        };
      }
    }

    if (value.event === "Invitation") {
      if (
        typeof value.invited === "string" &&
        typeof value.invitedBy === "string"
      ) {
        return {
          event: "Invitation",
          invited: value.invited,
          invitedBy: value.invitedBy,
        };
      }
    }

    if (value.event === "Message") {
      if (typeof value.text === "string") {
        return {
          event: "Message",
          text: value.text,
        };
      }
    }

    return undefined;
  } catch {
    return undefined;
  }
}
