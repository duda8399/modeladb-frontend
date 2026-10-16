import { describe, expect, it } from "vitest";
import {
  dedupeFieldNames,
  duplicateFieldIds,
  fieldNameError,
  findFieldConflict,
  introducesDuplicateFieldName,
  uniqueFieldName,
} from "./fieldNames";

const f = (id: string, name: string | null, deleted = false) => ({ id, name, deleted });

describe("fieldNames", () => {
  it("findFieldConflict compara como o export SQL e ignora o próprio campo e excluídos", () => {
    const fields = [f("a", "Endereço"), f("b", "velho", true), f("c", null)];
    expect(findFieldConflict(fields, " ENDERECO ")?.id).toBe("a");
    expect(findFieldConflict(fields, "endereco", "a")).toBeUndefined();
    expect(findFieldConflict(fields, "velho")).toBeUndefined();
    expect(findFieldConflict(fields, "")).toBeUndefined();
  });

  it("fieldNameError cita o atributo existente", () => {
    expect(fieldNameError([f("a", "email")], "EMAIL", "x")).toBe('Já existe o atributo "email" nesta entidade.');
    expect(fieldNameError([f("a", "email")], "", "x")).toBeNull();
  });

  it("duplicateFieldIds marca todos os repetidos e ignora nomes vazios", () => {
    const fields = [f("a", "nome"), f("b", "Nome"), f("c", null), f("d", null), f("e", "x")];
    expect([...duplicateFieldIds(fields)].sort()).toEqual(["a", "b"]);
  });

  it("introducesDuplicateFieldName só acusa repetições novas", () => {
    const before = [f("a", "nome"), f("b", "Nome"), f("c", "x")];
    expect(introducesDuplicateFieldName(before, [...before, f("d", "NOME")])).toBe(false);
    expect(introducesDuplicateFieldName(before, [f("a", "nome"), f("b", "Nome"), f("c", "nome")])).toBe(false);
    expect(introducesDuplicateFieldName(before, [f("a", "nome"), f("b", "y"), f("c", "Y")])).toBe(true);
  });

  it("uniqueFieldName usa o primeiro sufixo livre", () => {
    expect(uniqueFieldName("fk_a_id", [f("1", "fk_a_id"), f("2", "FK_A_ID_2")])).toBe("fk_a_id_3");
    expect(uniqueFieldName("nome", undefined)).toBe("nome");
  });

  it("dedupeFieldNames mantém o primeiro e renomeia os seguintes", () => {
    const { fields, renamed } = dedupeFieldNames([f("a", "nome"), f("b", "Nome"), f("c", null), f("d", "nome", true)]);
    expect(fields.map((x) => x.name)).toEqual(["nome", "Nome_2", null, "nome"]);
    expect(renamed).toEqual([{ from: "Nome", to: "Nome_2" }]);
  });
});
