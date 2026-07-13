export function colorForUserId(userId: string): string {
  let hash = 0;

  for (let i = 0; i < userId.length; i++) {
    hash = (hash << 5) - hash + userId.charCodeAt(i);
    hash |= 0;
  }

  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 45%)`;
}

export function initialFor(label: string): string {
  return label.charAt(0).toUpperCase() || "?";
}
