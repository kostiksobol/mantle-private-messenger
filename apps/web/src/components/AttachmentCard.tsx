import { useEffect, useState } from "react";

import {
  MAX_CACHED_ATTACHMENT_SIZE_BYTES,
  cacheAttachmentFromIpfs,
} from "@mantle/messenger-core/ipfs/attachmentCache";
import { decryptFileBlob } from "@mantle/messenger-core/ipfs/fileCrypto";
import { downloadIpfsUrl } from "@mantle/messenger-core/ipfs/localIpfs";
import type {
  LocalAttachmentFile,
  LocalMessageAttachment,
} from "@mantle/messenger-core/db";

type AttachmentCardProps = {
  attachment: LocalMessageAttachment;
  cachedFile?: LocalAttachmentFile;
  ownerAddress?: string;
  chatId: string;
  chatKey: string;
  ipfsConnected: boolean;
};

const CACHE_OPERATION_TIMEOUT_MS = 120_000;
const DOWNLOAD_OPERATION_TIMEOUT_MS = 30 * 60_000;

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error);
}

function isImage(mime: string) {
  return mime.startsWith("image/");
}

function isVideo(mime: string) {
  return mime.startsWith("video/");
}

function triggerDownload(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = fileName || "attachment";
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 30_000);
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  let timeoutId: number | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  }
}

async function decryptAttachmentToBlob(
  attachment: LocalMessageAttachment,
  chatKey: string
) {
  const encryptedBlob = await downloadIpfsUrl(attachment.url);

  return decryptFileBlob(
    chatKey,
    encryptedBlob,
    attachment.iv,
    attachment.mime || "application/octet-stream"
  );
}

export function AttachmentCard({
  attachment,
  cachedFile,
  ownerAddress,
  chatId,
  chatKey,
  ipfsConnected,
}: AttachmentCardProps) {
  const [localCachedFile, setLocalCachedFile] = useState<LocalAttachmentFile>();
  const [objectUrl, setObjectUrl] = useState<string>();
  const [loadingCache, setLoadingCache] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [attemptedAutoCache, setAttemptedAutoCache] = useState(false);
  const [error, setError] = useState<string>();

  const activeCachedFile = cachedFile ?? localCachedFile;
  const isCached = activeCachedFile !== undefined;

  const mime =
    activeCachedFile?.mime || attachment.mime || "application/octet-stream";

  const declaredSize = Math.max(
    attachment.size,
    attachment.encryptedSize ?? 0
  );

  const tooLargeToCache = declaredSize > MAX_CACHED_ATTACHMENT_SIZE_BYTES;

  useEffect(() => {
    setLocalCachedFile(undefined);
    setObjectUrl(undefined);
    setAttemptedAutoCache(false);
    setError(undefined);
    setLoadingCache(false);
    setDownloading(false);
  }, [attachment.url]);

  useEffect(() => {
    if (!activeCachedFile) {
      setObjectUrl(undefined);
      return;
    }

    setLoadingCache(false);
    setError(undefined);

    const nextObjectUrl = URL.createObjectURL(activeCachedFile.blob);
    setObjectUrl(nextObjectUrl);

    return () => {
      URL.revokeObjectURL(nextObjectUrl);
    };
  }, [activeCachedFile]);

  useEffect(() => {
    if (
      !ownerAddress ||
      !ipfsConnected ||
      isCached ||
      loadingCache ||
      attemptedAutoCache ||
      tooLargeToCache
    ) {
      return;
    }

    let cancelled = false;

    async function autoCache() {
      setAttemptedAutoCache(true);
      setLoadingCache(true);
      setError(undefined);

      try {
        const nextCachedFile = await withTimeout(
          cacheAttachmentFromIpfs({
            ownerAddress: ownerAddress || "",
            chatId,
            chatKey,
            attachment,
          }),
          CACHE_OPERATION_TIMEOUT_MS,
          "File decrypt timed out"
        );

        if (!cancelled) {
          setLocalCachedFile(nextCachedFile);
          setLoadingCache(false);
          setError(undefined);
        }
      } catch (caughtError) {
        if (!cancelled) {
          setError(errorMessage(caughtError));
          setLoadingCache(false);
        }
      }
    }

    void autoCache();

    return () => {
      cancelled = true;
    };
  }, [
    attemptedAutoCache,
    attachment,
    chatId,
    chatKey,
    ipfsConnected,
    isCached,
    loadingCache,
    ownerAddress,
    tooLargeToCache,
  ]);

  async function downloadWithoutCaching() {
    if (!ipfsConnected || downloading) {
      return;
    }

    setDownloading(true);
    setError(undefined);

    try {
      const decryptedBlob = await withTimeout(
        decryptAttachmentToBlob(attachment, chatKey),
        DOWNLOAD_OPERATION_TIMEOUT_MS,
        "File download timed out"
      );

      triggerDownload(decryptedBlob, attachment.name || "attachment");
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    } finally {
      setDownloading(false);
    }
  }

  const hasDecryptedFile = objectUrl !== undefined;

  const statusText =
    error && !hasDecryptedFile
      ? error
      : downloading
        ? "Preparing download..."
        : loadingCache && !hasDecryptedFile
          ? "Decrypting file..."
          : !isCached && !ipfsConnected
            ? "Connect IPFS to receive this file."
            : !isCached && tooLargeToCache && ipfsConnected
              ? "Large file. It will not be stored locally."
              : "";

  const showManualDownload =
    !hasDecryptedFile && ipfsConnected && !loadingCache;

  return (
    <div className={isCached ? "attachmentCard cached" : "attachmentCard"}>
      <div className="attachmentIcon">{isCached ? "✓" : "•"}</div>

      <div className="attachmentInfo">
        <strong>{attachment.name || "attachment"}</strong>

        <span>
          {attachment.mime || "application/octet-stream"} ·{" "}
          {formatFileSize(attachment.size)}
        </span>

        {statusText && (
          <small className={error && !hasDecryptedFile ? "attachmentError" : undefined}>
            {statusText}
          </small>
        )}

        {objectUrl && isImage(mime) && (
          <img
            className="attachmentPreviewImage"
            src={objectUrl}
            alt={attachment.name || "attachment"}
          />
        )}

        {objectUrl && isVideo(mime) && (
          <video
            className="attachmentPreviewVideo"
            src={objectUrl}
            controls
          />
        )}

        {objectUrl && (
          <div className="attachmentActions">
            <a href={objectUrl} target="_blank" rel="noreferrer">
              Open
            </a>

            <a href={objectUrl} download={attachment.name || "attachment"}>
              Download
            </a>
          </div>
        )}

        {showManualDownload && (
          <div className="attachmentActions">
            <button
              type="button"
              disabled={downloading}
              onClick={() => {
                void downloadWithoutCaching();
              }}
            >
              {downloading ? "Downloading..." : "Download"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
