export type {
  ChatMember,
  KnownUser,
  LocalChat,
  LocalMessage,
  LocalMessageAttachment,
  LocalMessageEvent,
  SelfProfile,
} from "@mantle/messenger-core/db";

import type {
  LocalChat,
  LocalMessage,
} from "@mantle/messenger-core/db";

export type ChatWithPreview = {
  chat: LocalChat;
  lastMessage?: LocalMessage;
  membersCount: number;
};
