export function shortAddress(address?: string) {
  if (!address) {
    return "—";
  }

  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function initials(value?: string) {
  if (!value) {
    return "?";
  }

  return value.trim().slice(0, 1).toUpperCase() || "?";
}

export function formatTime(timestamp: number) {
  if (!timestamp) {
    return "";
  }

  return new Date(timestamp * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateTime(timestamp: number) {
  if (!timestamp) {
    return "—";
  }

  return new Date(timestamp * 1000).toLocaleString();
}
