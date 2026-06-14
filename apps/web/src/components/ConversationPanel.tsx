import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { RefObject } from "react";

import { db, normalizeAddress } from "../lib/db";
import { formatTime, shortAddress } from "./format";
import { AttachmentCard } from "./AttachmentCard";
import type { ChatMember, KnownUser, LocalChat, LocalMessage } from "./types";
import type { LocalIpfsStatus } from "../lib/ipfs/localIpfs";

type ConversationPanelProps = {
  selectedChat?: LocalChat;
  selectedMembers: ChatMember[];
  selectedMessages: LocalMessage[];
  knownUsersByAddress: ReadonlyMap<string, KnownUser>;
  ownerAddress?: string;
  appChainName: string;
  ipfsStatus: LocalIpfsStatus;
  messageText: string;
  busy: boolean;
  messageScrollerRef: RefObject<HTMLDivElement | null>;
  onMessageTextChange: (value: string) => void;
  onSendMessage: (attachmentFiles?: File[]) => Promise<void>;
};

function userLabel(
  address: string | undefined,
  knownUsersByAddress: ReadonlyMap<string, KnownUser>
) {
  if (!address) {
    return "Unknown user";
  }

  const user = knownUsersByAddress.get(normalizeAddress(address));

  return user?.name || user?.login || shortAddress(address);
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function systemMessageText(
  message: LocalMessage,
  selectedChat: LocalChat,
  knownUsersByAddress: ReadonlyMap<string, KnownUser>
) {
  if (message.event === "ChatCreation") {
    return message.content || `Chat created: ${selectedChat.name}`;
  }

  if (message.event === "Invitation") {
    const author = userLabel(message.authorAddress, knownUsersByAddress);
    const invited = userLabel(message.invitedAddress, knownUsersByAddress);

    return `${author} invited ${invited}.`;
  }

  return message.content;
}

export function ConversationPanel({
  selectedChat,
  selectedMembers,
  selectedMessages,
  knownUsersByAddress,
  ownerAddress,
  ipfsStatus,
  messageText,
  busy,
  messageScrollerRef,
  onMessageTextChange,
  onSendMessage,
}: ConversationPanelProps) {
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const ipfsConnected = ipfsStatus.state === "connected";

  const cachedAttachmentFiles = useLiveQuery(
    async () => {
      if (!selectedChat || !ownerAddress) {
        return [];
      }

      return db.attachmentFiles
        .where("ownerAddress")
        .equals(normalizeAddress(ownerAddress))
        .filter((file) => file.chatId === selectedChat.chatId)
        .toArray();
    },
    [ownerAddress, selectedChat?.chatId],
    []
  ) ?? [];


  useEffect(() => {
    if (!ipfsConnected && attachmentFiles.length > 0) {
      setAttachmentFiles([]);
    }
  }, [attachmentFiles.length, ipfsConnected]);



  function addAttachmentFiles(files: FileList | null) {
    if (!files || files.length === 0) {
      return;
    }

    setAttachmentFiles((current) => [...current, ...Array.from(files)]);
  }

  function removeAttachmentFile(indexToRemove: number) {
    setAttachmentFiles((current) =>
      current.filter((_, index) => index !== indexToRemove)
    );
  }

  async function sendCurrentMessage() {
    await onSendMessage(attachmentFiles);
    setAttachmentFiles([]);
  }

  return (
    <section className="conversationPanel">
      {selectedChat ? (
        <>
          <header className="conversationHeader">
            <div>
              <h1>{selectedChat.name}</h1>
              <p>
                {selectedMembers.length} members · {selectedMessages.length}{" "}
                messages
              </p>
            </div>

          </header>

          <div ref={messageScrollerRef} className="messageScroller">
            {selectedMessages.length === 0 ? (
              <div className="emptyConversation">
                <span>No visible messages yet.</span>
              </div>
            ) : (
              selectedMessages.map((message) => {
                const key =
                  message.id ??
                  `${message.authorUserContract}:${message.sourceMessageIndex}`;

                const event = message.event ?? "Message";

                if (event !== "Message") {
                  return (
                    <div key={key} className="systemEvent">
                      <span className="systemEventLabel">{event}</span>
                      <span>
                        {systemMessageText(
                          message,
                          selectedChat,
                          knownUsersByAddress
                        )}
                      </span>
                      <time>{formatTime(message.timestamp)}</time>
                    </div>
                  );
                }

                const isMine =
                  ownerAddress !== undefined &&
                  normalizeAddress(message.authorAddress) === ownerAddress;

                const author = knownUsersByAddress.get(
                  normalizeAddress(message.authorAddress)
                );

                const authorName =
                  author?.name ||
                  author?.login ||
                  shortAddress(message.authorAddress);

                return (
                  <article
                    key={key}
                    className={isMine ? "messageBubble mine" : "messageBubble"}
                  >
                    {!isMine && (
                      <div className="messageAuthor">{authorName}</div>
                    )}

                    <div className="messageText">{message.content}</div>

                    <div className="messageMeta">
                      <span>{formatTime(message.timestamp)}</span>
                    </div>
                    {message.attachments && message.attachments.length > 0 && (
                      <div className="attachmentList">
                        {message.attachments.map((attachment) => (
                          <AttachmentCard
                            attachment={attachment}
                            cachedFile={cachedAttachmentFiles.find(
                              (file) => file.url === attachment.url
                            )}
                            ownerAddress={ownerAddress}
                            chatId={selectedChat.chatId}
                            chatKey={selectedChat.chatKey}
                            ipfsConnected={ipfsConnected}
                            key={`${message.id ?? message.sourceMessageIndex}:${attachment.url}`}
                          />
                        ))}
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </div>

          <form
            className="composer"
            data-ipfs-connected={ipfsConnected ? "true" : "false"}
            onSubmit={(event) => {
              event.preventDefault();
              void sendCurrentMessage();
            }}
          >
            <textarea
              placeholder="Write a message..."
              value={messageText}
              onChange={(event) => onMessageTextChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendCurrentMessage();
                }
              }}
            />

            {attachmentFiles.length > 0 && (
              <div className="composerAttachmentDrafts">
                {attachmentFiles.map((file, index) => (
                  <div
                    className="composerAttachmentDraft"
                    key={`${file.name}:${file.size}:${index}`}
                  >
                    <div>
                      <strong>{file.name || "attachment"}</strong>
                      <span>
                        {(file.type || "application/octet-stream")} ·{" "}
                        {formatFileSize(file.size)}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeAttachmentFile(index)}
                      disabled={busy}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="composerFooter">
              {ipfsConnected ? (
                <label className="attachButton">
                  Attach
                  <input
                    type="file"
                    multiple
                    onChange={(event) => {
                      addAttachmentFiles(event.currentTarget.files);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              ) : (
                <button
                  type="button"
                  className="attachButton disabled"
                  disabled
                  title="Connect IPFS to send files"
                >
                  Attach
                </button>
              )}

              <button
                disabled={
                  busy || (!messageText.trim() && attachmentFiles.length === 0)
                }
              >
                Send
              </button>
            </div>
          </form>
        </>
      ) : (
        <div className="noChatSelected">
          <div className="brandMark">M</div>
          <h1>Select a chat</h1>
          <p>Choose a chat from the left sidebar or create a new one.</p>
        </div>
      )}
    </section>
  );
}
