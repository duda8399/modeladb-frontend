import type { CollabEdge, CollabField, CollabNode, OperationDraft } from "../stores/diagramCollabStore";
import type { FkAction, TableCheck, TableIndex } from "../types/diagramER";
import { defaultCheckName, defaultIndexName } from "./sqlExport";
import { isValidSize } from "./sqlTypes";
import { nameError } from "./entityNames";
import { fieldNameError } from "./fieldNames";

export type SuggestionCategory =
  | "normalizacao"
  | "chaves"
  | "tipos"
  | "integridade"
  | "nomenclatura"
  | "desempenho"
  | "modelagem";

export type SuggestionSeverity = "alta" | "media" | "baixa";

export type SuggestionAction = {
  type:
    | "rename_table"
    | "rename_column"
    | "set_column_type"
    | "set_column_flag"
    | "set_default"
    | "add_column"
    | "add_index"
    | "add_check"
    | "set_fk_action";
  table: string;
  column: string | null;
  newName: string | null;
  dataType: string | null;
  size: string | null;
  flag: "notNull" | "unique" | null;
  value: boolean | null;
  columns: string[] | null;
  expression: string | null;
  defaultValue: string | null;
  onDelete: FkAction | null;
  onUpdate: FkAction | null;
};

export type AiSuggestion = {
  id: string;
  category: SuggestionCategory;
  severity: SuggestionSeverity;
  title: string;
  description: string;
  table: string | null;
  column: string | null;
  action: SuggestionAction | null;
};

export type AiAnalysis = {
  score: number;
  summary: string;
  suggestions: AiSuggestion[];
};

export type ActionPlan = { ops: OperationDraft[] } | { error: string };

const lower = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

const liveFields = (node: CollabNode): CollabField[] =>
  (node.data.fields ?? []).filter((field) => !field.deleted);

export function findTable(nodes: CollabNode[], name: string | null): CollabNode | undefined {
  return nodes.find((node) => node.type === "entityNode" && !node.data.deleted && lower(node.data.name) === lower(name));
}

function findField(node: CollabNode, name: string | null): CollabField | undefined {
  return liveFields(node).find((field) => lower(field.name) === lower(name));
}

function setField(node: CollabNode, field: CollabField, key: string, value: unknown): OperationDraft | null {
  const previousValue = (field as unknown as Record<string, unknown>)[key];
  if ((previousValue ?? null) === (value ?? null)) return null;
  return { type: "SET_FIELD_PROP", targetId: node.id, payload: { fieldId: field.id, key, value }, previousValue };
}

export function planSuggestion(
  action: SuggestionAction,
  nodes: CollabNode[],
  edges: CollabEdge[],
  newId: () => string = () => crypto.randomUUID(),
): ActionPlan {
  const table = findTable(nodes, action.table);
  if (!table) return { error: `A tabela ${action.table} não existe mais no diagrama.` };

  const tableName = table.data.name ?? action.table;
  const field = action.column ? findField(table, action.column) : undefined;
  const needsField = !["rename_table", "add_column", "add_index", "add_check"].includes(action.type);
  if (needsField && !field) return { error: `A coluna ${tableName}.${action.column} não existe mais.` };

  const ops: (OperationDraft | null)[] = [];

  switch (action.type) {
    case "rename_table": {
      const newName = action.newName?.trim();
      if (!newName) return { error: "A sugestão não informou o novo nome." };
      const conflict = nameError(nodes, newName, table.id);
      if (conflict) return { error: conflict };
      ops.push({ type: "SET_NODE_PROP", targetId: table.id, payload: { key: "name", value: newName }, previousValue: table.data.name });
      break;
    }

    case "rename_column": {
      const newName = action.newName?.trim();
      if (!newName) return { error: "A sugestão não informou o novo nome." };
      if (fieldNameError(liveFields(table), newName, field?.id)) {
        return { error: `Já existe a coluna ${tableName}.${newName}.` };
      }
      ops.push(setField(table, field!, "name", newName));
      edges
        .filter(
          (edge) =>
            !edge.data?.deleted &&
            !edge.data?.junctionId &&
            (edge.data?.targetNodeId ?? edge.target) === table.id &&
            edge.data?.fkFieldName === field!.name,
        )
        .forEach((edge) =>
          ops.push({
            type: "SET_EDGE_PROP",
            targetId: edge.id,
            payload: { key: "fkFieldName", value: newName },
            previousValue: edge.data?.fkFieldName,
          }),
        );
      break;
    }

    case "set_column_type": {
      if (!action.dataType) return { error: "A sugestão não informou o tipo." };
      const size = action.size?.replace(/\s+/g, "") || null;
      if (!isValidSize(action.dataType, size)) return { error: `Tamanho ${size} inválido para ${action.dataType}.` };
      ops.push(setField(table, field!, "type", action.dataType), setField(table, field!, "size", size));
      break;
    }

    case "set_column_flag": {
      if (!action.flag || action.value === null) return { error: "A sugestão está incompleta." };
      ops.push(setField(table, field!, action.flag, action.value));
      break;
    }

    case "set_default": {
      if (!action.defaultValue?.trim()) return { error: "A sugestão não informou o valor padrão." };
      if (field!.ai) return { error: "Colunas com auto incremento não têm valor padrão." };
      ops.push(setField(table, field!, "defaultValue", action.defaultValue.trim()));
      break;
    }

    case "add_column": {
      const name = action.column?.trim();
      if (!name || !action.dataType) return { error: "A sugestão está incompleta." };
      if (fieldNameError(liveFields(table), name)) {
        return { error: `A coluna ${tableName}.${name} já existe.` };
      }
      const size = action.size?.replace(/\s+/g, "") || null;
      if (!isValidSize(action.dataType, size)) return { error: `Tamanho ${size} inválido para ${action.dataType}.` };
      ops.push({
        type: "ADD_FIELD",
        targetId: table.id,
        payload: {
          id: newId(),
          name,
          type: action.dataType,
          size,
          defaultValue: action.defaultValue?.trim() || null,
          pk: false,
          fk: false,
          notNull: action.value === true,
          unique: false,
          ai: false,
          order: liveFields(table).length,
        },
      });
      break;
    }

    case "add_index": {
      const columns = (action.columns ?? []).map((name) => findField(table, name));
      if (!columns.length || columns.some((c) => !c)) return { error: "Alguma coluna do índice não existe mais." };
      const indexes = (table.data.indexes as TableIndex[] | undefined) ?? [];
      const columnIds = columns.map((c) => c!.id);
      if (indexes.some((index) => index.columns.join() === columnIds.join())) {
        return { error: "Já existe um índice com essas colunas." };
      }
      const name = defaultIndexName(tableName, columns.map((c) => c!.name ?? ""));
      ops.push({
        type: "SET_NODE_PROP",
        targetId: table.id,
        payload: { key: "indexes", value: [...indexes, { id: newId(), name, columns: columnIds, unique: action.value === true }] },
        previousValue: table.data.indexes,
      });
      break;
    }

    case "add_check": {
      const expression = action.expression?.trim();
      if (!expression) return { error: "A sugestão não informou a condição." };
      const checks = (table.data.checks as TableCheck[] | undefined) ?? [];
      if (checks.some((check) => lower(check.expression) === lower(expression))) {
        return { error: "Esse CHECK já existe." };
      }
      ops.push({
        type: "SET_NODE_PROP",
        targetId: table.id,
        payload: {
          key: "checks",
          value: [...checks, { id: newId(), name: defaultCheckName(tableName, checks.length), expression }],
        },
        previousValue: table.data.checks,
      });
      break;
    }

    case "set_fk_action": {
      const edge = edges.find(
        (e) =>
          !e.data?.deleted &&
          !e.data?.junctionId &&
          (e.data?.targetNodeId ?? e.target) === table.id &&
          e.data?.fkFieldName === field!.name,
      );
      if (!edge) return { error: `Não há relacionamento usando ${tableName}.${field!.name}.` };
      if ((action.onDelete === "SET NULL" || action.onUpdate === "SET NULL") && (field!.notNull || field!.pk)) {
        return { error: "SET NULL exige que a chave estrangeira aceite NULL." };
      }
      (["onDelete", "onUpdate"] as const).forEach((key) => {
        const value = action[key] === "NO ACTION" ? null : action[key];
        if (action[key] === null || (edge.data?.[key] ?? null) === value) return;
        ops.push({ type: "SET_EDGE_PROP", targetId: edge.id, payload: { key, value }, previousValue: edge.data?.[key] ?? null });
      });
      break;
    }
  }

  const finalOps = ops.filter((op): op is OperationDraft => !!op);
  return finalOps.length ? { ops: finalOps } : { error: "O diagrama já está assim." };
}

export function describeAction(action: SuggestionAction): string {
  const target = action.column ? `${action.table}.${action.column}` : action.table;
  const type = action.dataType ? `${action.dataType}${action.size ? `(${action.size})` : ""}` : "";
  switch (action.type) {
    case "rename_table":
    case "rename_column":
      return `Renomear ${target} para ${action.newName}`;
    case "set_column_type":
      return `Mudar ${target} para ${type}`;
    case "set_column_flag":
      return `${action.value ? "Marcar" : "Desmarcar"} ${action.flag === "notNull" ? "NOT NULL" : "UNIQUE"} em ${target}`;
    case "set_default":
      return `DEFAULT ${action.defaultValue} em ${target}`;
    case "add_column":
      return `Criar ${target} ${type}`;
    case "add_index":
      return `Criar ${action.value ? "índice único" : "índice"} em ${action.table} (${(action.columns ?? []).join(", ")})`;
    case "add_check":
      return `Criar CHECK (${action.expression}) em ${action.table}`;
    case "set_fk_action":
      return [
        action.onDelete && `ON DELETE ${action.onDelete}`,
        action.onUpdate && `ON UPDATE ${action.onUpdate}`,
      ]
        .filter(Boolean)
        .join(" e ") + ` em ${target}`;
  }
}
