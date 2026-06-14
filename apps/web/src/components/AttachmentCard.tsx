import { useEffect, useMemo, useState } from "react";

import {
  MAX_CACHED_ATTACHMENT_SIZE_BYTES,
  cacheAttachmentFromIpfs,
} from "../lib/ipfs/attachmentCache";
import { decryptFileBlob } from "../lib/ipfs/fileCrypto";
import { downloadIpfsUrl } from "../lib/ipfs/localIpfs";
import type {
  LocalAttachmentFile,
  LocalMessageAttachment,
} from "../lib/db";

type AttachmentCardProps = {
  attachment: LocalMessageAttachment;
  cachedFile?: LocalAttachmentFile;
  ownerAddress?: string;
  chatId: string;
  chatKey: string;
  ipfsConnected: boolean;
};

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

export function AttachmentCard({
  attachment,
  cachedFile,
  ownerAddress,
  chatId,
  chatKey,
  ipfsConnected,
}: AttachmentCardProps) {
  const [objectUrl, setObjectUrl] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [attemptedAutoLoad, setAttemptedAutoLoad] = useState(false);
  const [error, setError] = useState<string>();

  const mime = cachedFile?.mime || attachment.mime || "application/octet-stream";
  const isCached = cachedFile !== undefined;

  const declaredSize = Math.max(
    attachment.size,
    attachment.encryptedSize ?? 0
  );

  const tooLargeToCache = declaredSize > MAX_CACHED_ATTACHMENT_SIZE_BYTES;

  const statusText = useMemo(() => {
    if (isCached) {
      return "Stored locally";
    }

    if (!ipfsConnected) {
      return "IPFS is not connected. File content is unavailable.";
    }

    if (tooLargeToCache) {
      return "Large file. It will not be stored locally.";
    }

    if (loading) {
      return "Loading encrypted file from IPFS...";
    }

    if (error) {
      return error;
    }

    return "Preparing file...";
  }, [error, ipfsConnected, isCached, loading, tooLargeToCache]);

  useEffect(() => {
    if (!cachedFile) {
      setObjectUrl(undefined);
      return;
    }

    const nextObjectUrl = URL.createObjectURL(cachedFile.blob);
    setObjectUrl(nextObjectUrl);

    return () => {
      URL.revokeObjectURL(nextObjectUrl);
    };
  }, [cachedFile]);

  useEffect(() => {
    if (
      !ownerAddress ||
      !ipfsConnected ||
      isCached ||
      loading ||
      attemptedAutoLoad ||
      tooLargeToCache
    ) {
      return;
    }

    let cancelled = false;

    async function autoLoad() {
      setAttemptedAutoLoad(true);
      setLoading(true);
      setError(undefined);

      try {
        await cacheAttachmentFromIpfs({
          ownerAddress,
          chatId,
          chatKey,
          attachment,
        });
      } catch (caughtError) {
        if (!cancelled) {
          setError(errorMessage(caughtError));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void autoLoad();

    return () => {
      cancelled = true;
    };
  }, [
    attemptedAutoLoad,
    attachment,
    chatId,
    chatKey,
    ipfsConnected,
    isCached,
    loading,
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
      const encryptedBlob = await downloadIpfsUrl(attachment.url);
      const decryptedBlob = await decryptFileBlob(
        chatKey,
        encryptedBlob,
        attachment.iv,
        attachment.mime
      );

      triggerDownload(decryptedBlob, attachment.name || "attachment");
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className={isCached ? "attachmentCard cached" : "attachmentCard"}>
      <div className="attachmentIcon">{isCached ? "✓" : "•"}</div>

      <div className="attachmentInfo">
        <strong>{attachment.name || "attachment"}</strong>

        <span>
          {attachment.mime || "application/octet-stream"} ·{" "}
          {formatFileSize(attachment.size)}
        </span>

        {attachment.encryptedSize !== undefined && (
          <small>Encrypted: {formatFileSize(attachment.encryptedSize)}</small>
        )}

        <small className={error ? "attachmentError" : undefined}>
          {statusText}
        </small>

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
              Open in new tab
            </a>

            <a href={objectUrl} download={attachment.name || "attachment"}>
              Download
            </a>
          </div>
        )}

        {!isCached && tooLargeToCache && (
          <div className="attachmentActions">
            <button
              type="button"
              disabled={!ipfsConnected || downloading}
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
