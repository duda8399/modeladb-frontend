import { describe, expect, it } from "vitest";
import { formatVersionDate, versionTitle } from "./versionLabels";
import type { VersionSummary } from "../services/versionsService";

const version = (partial: Partial<VersionSummary>): VersionSummary => ({
  id: "v",
  diagramId: "d",
  name: "Loja",
  label: null,
  kind: "AUTO",
  tableCount: 0,
  viewCount: 0,
  relationCount: 0,
  createdById: null,
  createdByName: null,
  restoredFromId: null,
  createdAt: "2026-10-11T15:42:00",
  ...partial,
});

describe("versionTitle", () => {
  it("usa o nome dado pela pessoa quando existe", () => {
    expect(versionTitle(version({ label: "Entrega 1", kind: "MANUAL" }), [])).toBe("Entrega 1");
  });

  it("títulos padrão de versões automáticas e manuais", () => {
    expect(versionTitle(version({ kind: "AUTO" }), [])).toBe("Salvamento automático");
    expect(versionTitle(version({ kind: "MANUAL" }), [])).toBe("Versão salva manualmente");
  });

  it("backup de restauração aponta para a versão restaurada", () => {
    const named = version({ id: "a", label: "Entrega 1" });
    const unnamed = version({ id: "b" });
    expect(versionTitle(version({ kind: "RESTORE", restoredFromId: "a" }), [named])).toBe(
      'Antes de restaurar "Entrega 1"',
    );
    expect(versionTitle(version({ kind: "RESTORE", restoredFromId: "b" }), [unnamed])).toBe(
      `Antes de restaurar a versão de ${formatVersionDate(unnamed.createdAt)}`,
    );
    expect(versionTitle(version({ kind: "RESTORE", restoredFromId: "sumiu" }), [])).toBe(
      "Antes de restaurar uma versão anterior",
    );
  });

  it("data no formato brasileiro", () => {
    expect(formatVersionDate("2026-10-11T15:42:00")).toBe("11/10/2026, 15:42");
  });
});
