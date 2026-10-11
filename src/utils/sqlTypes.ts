const LENGTH_TYPES = new Set(["CHAR", "VARCHAR", "BINARY", "VARBINARY"]);
const PRECISION_TYPES = new Set(["DATETIME", "TIMESTAMP", "TIME"]);

export const SIZED_TYPES = new Set([...LENGTH_TYPES, ...PRECISION_TYPES, "DECIMAL", "BIT"]);

export function isSizedType(type: string | null | undefined): boolean {
  return !!type && SIZED_TYPES.has(type.toUpperCase());
}

export function normalizeSize(size: string | null | undefined): string {
  return (size ?? "").replace(/\s+/g, "");
}

export function isValidSize(type: string | null | undefined, size: string | null | undefined): boolean {
  const value = normalizeSize(size);
  if (!value) return true;
  if (!isSizedType(type)) return false;

  const upper = type!.toUpperCase();
  if (upper === "DECIMAL") {
    const match = /^(\d+)(?:,(\d+))?$/.exec(value);
    if (!match) return false;
    const precision = Number(match[1]);
    const scale = match[2] === undefined ? 0 : Number(match[2]);
    return precision >= 1 && precision <= 65 && scale <= precision && scale <= 30;
  }

  if (!/^\d+$/.test(value)) return false;
  const number = Number(value);
  if (upper === "BIT") return number >= 1 && number <= 64;
  if (PRECISION_TYPES.has(upper)) return number <= 6;
  return number >= 1;
}

export function sizePlaceholder(type: string | null | undefined): string {
  const upper = (type ?? "").toUpperCase();
  if (upper === "VARCHAR" || upper === "VARBINARY") return "255";
  if (upper === "CHAR" || upper === "BINARY" || upper === "BIT") return "1";
  if (upper === "DECIMAL") return "10,2";
  if (PRECISION_TYPES.has(upper)) return "0-6";
  return "";
}

export function formatTypeWithSize(type: string | null | undefined, size: string | null | undefined): string {
  const value = normalizeSize(size);
  if (!type) return "";
  return value && isSizedType(type) ? `${type}(${value})` : type;
}
