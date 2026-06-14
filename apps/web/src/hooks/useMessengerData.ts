import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";

import { db, normalizeAddress } from "../lib/db";
import type {
  ChatMember,
  ChatWithPreview,
  KnownUser,
  LocalChat,
  LocalMessage,
  SelfProfile,
} from "../components/types";

type UseMessengerDataArgs = {
  ownerAddress?: string;
  selectedChatId: string;
  selectedMemberAddress: string;
};

export function useMessengerData({
  ownerAddress,
  selectedChatId,
  selectedMemberAddress,
}: UseMessengerDataArgs) {
  const selfProfile = useLiveQuery(async (): Promise<
    SelfProfile | undefined
  > => {
    if (!ownerAddress) {
      return undefined;
    }

    const profile = await db.selfProfiles
      .where("ownerAddress")
      .equals(ownerAddress)
      .first();

    return profile as SelfProfile | undefined;
  }, [ownerAddress]);

  const chats =
    useLiveQuery(async (): Promise<LocalChat[]> => {
      if (!ownerAddress) {
        return [];
      }

      const result = await db.chats
        .where("ownerAddress")
        .equals(ownerAddress)
        .toArray();

      return result as LocalChat[];
    }, [ownerAddress]) ?? [];

  const knownUsers =
    useLiveQuery(async (): Promise<KnownUser[]> => {
      if (!ownerAddress) {
        return [];
      }

      const result = await db.knownUsers
        .where("ownerAddress")
        .equals(ownerAddress)
        .toArray();

      return result as KnownUser[];
    }, [ownerAddress]) ?? [];

  const chatMembers =
    useLiveQuery(async (): Promise<ChatMember[]> => {
      if (!ownerAddress) {
        return [];
      }

      const result = await db.chatMembers
        .where("ownerAddress")
        .equals(ownerAddress)
        .toArray();

      return result as ChatMember[];
    }, [ownerAddress]) ?? [];

  const messages =
    useLiveQuery(async (): Promise<LocalMessage[]> => {
      if (!ownerAddress) {
        return [];
      }

      const result = (await db.messages
        .where("ownerAddress")
        .equals(ownerAddress)
        .toArray()) as LocalMessage[];

      return result.sort((a, b) => {
        if (a.timestamp !== b.timestamp) {
          return a.timestamp - b.timestamp;
        }

        return a.sourceMessageIndex - b.sourceMessageIndex;
      });
    }, [ownerAddress]) ?? [];

  const knownUsersByAddress = useMemo(() => {
    const map = new Map<string, KnownUser>();

    for (const user of knownUsers) {
      map.set(normalizeAddress(user.userAddress), user);
    }

    return map;
  }, [knownUsers]);

  const selectedChat = useMemo(() => {
    return chats.find((chat) => chat.chatId === selectedChatId);
  }, [chats, selectedChatId]);

  const selectedMembers = useMemo(() => {
    return chatMembers.filter((member) => member.chatId === selectedChatId);
  }, [chatMembers, selectedChatId]);

  const selectedMessages = useMemo(() => {
    return messages.filter((message) => message.chatId === selectedChatId);
  }, [messages, selectedChatId]);

  const selectedMember = useMemo(() => {
    if (!selectedMemberAddress) {
      return undefined;
    }

    return knownUsersByAddress.get(normalizeAddress(selectedMemberAddress));
  }, [knownUsersByAddress, selectedMemberAddress]);

  const chatsWithPreview = useMemo<ChatWithPreview[]>(() => {
    return chats
      .map((chat) => {
        const chatMessages = messages.filter(
          (message) => message.chatId === chat.chatId
        );

        const lastMessage = chatMessages[chatMessages.length - 1];

        return {
          chat,
          lastMessage,
          membersCount: chatMembers.filter(
            (member) => member.chatId === chat.chatId
          ).length,
        };
      })
      .sort((a, b) => {
        const left = a.lastMessage?.timestamp ?? 0;
        const right = b.lastMessage?.timestamp ?? 0;

        if (left !== right) {
          return right - left;
        }

        return a.chat.name.localeCompare(b.chat.name);
      });
  }, [chats, chatMembers, messages]);

  return {
    selfProfile,
    chats,
    knownUsers,
    chatMembers,
    messages,
    knownUsersByAddress,
    selectedChat,
    selectedMembers,
    selectedMessages,
    selectedMember,
    chatsWithPreview,
  };
}
