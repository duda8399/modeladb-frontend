import type { VersionSummary } from "../services/versionsService";

export function formatVersionDate(value: string): string {
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function versionTitle(version: VersionSummary, all: VersionSummary[]): string {
  if (version.label) return version.label;
  if (version.kind === "MANUAL") return "Versão salva manualmente";
  if (version.kind === "AUTO") return "Salvamento automático";

  const source = all.find((v) => v.id === version.restoredFromId);
  if (!source) return "Antes de restaurar uma versão anterior";
  return source.label
    ? `Antes de restaurar "${source.label}"`
    : `Antes de restaurar a versão de ${formatVersionDate(source.createdAt)}`;
}
