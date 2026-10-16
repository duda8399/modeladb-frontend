import { describe, expect, it } from "vitest";
import { dedupeNodeNames, duplicateNameIds, findNameConflict, nameError, nameKey, uniqueName } from "./entityNames";

const entity = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: "entityNode",
  data: { name, ...extra },
});
const view = (id: string, name: string) => ({ id, type: "viewNode", data: { name } });
const note = (id: string, name: string) => ({ id, type: "noteNode", data: { name } });

describe("entityNames", () => {
  it("nameKey segue a normalização do export SQL", () => {
    expect(nameKey("  Matrícula ")).toBe(nameKey("matricula"));
    expect(nameKey("Item Pedido")).toBe(nameKey("item_pedido"));
    expect(nameKey("Cliente")).not.toBe(nameKey("Clientes"));
  });

  it("findNameConflict ignora o próprio nó, excluídos e nós sem nome de tabela", () => {
    const nodes = [
      entity("a", "Cliente"),
      entity("b", "Pedido", { deleted: true }),
      note("n", "Produto"),
      view("v", "resumo"),
    ];
    expect(findNameConflict(nodes, "cliente")?.id).toBe("a");
    expect(findNameConflict(nodes, "cliente", "a")).toBeUndefined();
    expect(findNameConflict(nodes, "Pedido")).toBeUndefined();
    expect(findNameConflict(nodes, "Produto")).toBeUndefined();
    expect(findNameConflict(nodes, "RESUMO")?.id).toBe("v");
  });

  it("nameError explica o conflito e recusa nome vazio", () => {
    const nodes = [entity("a", "Cliente"), view("v", "resumo")];
    expect(nameError(nodes, "  ")).toBe("O nome não pode ficar vazio.");
    expect(nameError(nodes, "CLIENTE", "x")).toBe('Já existe uma entidade chamada "Cliente".');
    expect(nameError(nodes, "Resumo", "x")).toBe('Já existe uma view chamada "resumo".');
    expect(nameError(nodes, "Cliente", "a")).toBeNull();
  });

  it("uniqueName acrescenta o primeiro sufixo livre", () => {
    const nodes = [entity("a", "Entidade"), entity("b", "entidade_2"), entity("c", "Entidade_4")];
    expect(uniqueName("Entidade", nodes)).toBe("Entidade_3");
    expect(uniqueName("Pedido", nodes)).toBe("Pedido");
  });

  it("duplicateNameIds marca todos os nós repetidos", () => {
    const nodes = [entity("a", "Cliente"), entity("b", "cliente"), view("v", "Cliente"), entity("c", "Pedido")];
    expect([...duplicateNameIds(nodes)].sort()).toEqual(["a", "b", "v"]);
    expect(duplicateNameIds(nodes)).toBe(duplicateNameIds(nodes));
  });

  it("dedupeNodeNames mantém o primeiro e renomeia os seguintes", () => {
    const { nodes, renamed } = dedupeNodeNames([
      entity("a", "Cliente"),
      entity("b", "cliente"),
      note("n", "Cliente"),
      view("v", "Cliente"),
      entity("e", ""),
    ]);
    expect(nodes.map((n) => n.data.name)).toEqual(["Cliente", "cliente_2", "Cliente", "Cliente_3", "Entidade"]);
    expect(renamed).toEqual([
      { from: "cliente", to: "cliente_2" },
      { from: "Cliente", to: "Cliente_3" },
    ]);
  });
});
