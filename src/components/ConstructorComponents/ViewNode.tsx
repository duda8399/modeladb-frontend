import { memo, useMemo, useState } from "react";
import { Alert, Button, Card, Input, Modal, Tooltip, Typography } from "antd";
import { CloseOutlined, EyeOutlined, WarningFilled } from "@ant-design/icons";
import { Handle, Position, useStore } from "reactflow";
import CodeMirror from "@uiw/react-codemirror";
import { sql as sqlLanguage } from "@codemirror/lang-sql";
import { EditorView } from "@codemirror/view";
import DeleteModal from "./DeleteModal";
import { analyzeViewSql } from "../../utils/viewSql";
import { normalizeSqlName } from "../../utils/identifiers";
import type { ViewNodeData } from "../../types/diagramER";

const { Text } = Typography;

const HEADER_COLOR = "#1565C0";

interface Props {
  id: string;
  data: Partial<ViewNodeData>;
  duplicateName?: boolean;
  validateName?: (value: string) => string | null;
  onDelete?: () => void;
  onRename?: (value: string) => boolean | void;
  onSqlChange?: (sql: string) => void;
}

const diagramNamesSelector = (state: { nodeInternals: Map<string, { type?: string; data?: { name?: string } }> }) =>
  Array.from(state.nodeInternals.values())
    .filter((node) => node.type === "entityNode" || node.type === "viewNode")
    .map((node) => normalizeSqlName(node.data?.name ?? ""))
    .join("\n");

export default memo(function ViewNode({ data, duplicateName, validateName, onDelete, onRename, onSqlChange }: Props) {
  const sql = data.sql ?? "";
  const [draftName, setDraftName] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);
  const [openEditor, setOpenEditor] = useState(false);
  const [draftSql, setDraftSql] = useState(sql);
  const diagramNames = useStore(diagramNamesSelector);

  const name = isEditingName ? draftName : data.name || "view";
  const nameProblem = isEditingName ? validateName?.(draftName) ?? null : null;

  const analysis = useMemo(() => analyzeViewSql(sql), [sql]);
  const draftAnalysis = useMemo(() => analyzeViewSql(draftSql), [draftSql]);
  const knownNames = useMemo(() => new Set(diagramNames.split("\n")), [diagramNames]);
  const unknownTables = draftAnalysis.tables.filter((table) => !knownNames.has(normalizeSqlName(table)));

  const openSqlEditor = () => {
    setDraftSql(sql);
    setOpenEditor(true);
  };

  return (
    <>
      <DeleteModal
        open={openDelete}
        setOpen={setOpenDelete}
        description={
          <span>
            Tem certeza que deseja excluir a view <b>{name}</b>?
          </span>
        }
        onConfirm={() => onDelete?.()}
      />

      <Modal
        open={openEditor}
        onCancel={() => setOpenEditor(false)}
        title={`Consulta da view ${name}`}
        width={760}
        okText="Salvar"
        cancelText="Cancelar"
        onOk={() => {
          onSqlChange?.(draftSql.trim());
          setOpenEditor(false);
        }}
        destroyOnHidden
      >
        <Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
          Escreva o SELECT que define a view. Ele é exportado como CREATE VIEW {name} AS ...
        </Text>
        <CodeMirror
          value={draftSql}
          height="260px"
          placeholder="SELECT ... FROM ..."
          extensions={[sqlLanguage(), EditorView.lineWrapping]}
          onChange={setDraftSql}
        />
        {draftSql.trim() && !/^\s*(select|with|values|table)\b/i.test(draftSql) && (
          <Alert
            type="warning"
            showIcon
            style={{ marginTop: 12 }}
            message="A consulta de uma view normalmente começa com SELECT ou WITH."
          />
        )}
        {unknownTables.length > 0 && (
          <Alert
            type="info"
            showIcon
            style={{ marginTop: 12 }}
            message={`Não estão no diagrama: ${unknownTables.join(", ")}`}
          />
        )}
      </Modal>

      <Card
        size="small"
        style={{ width: 260 }}
        styles={{
          header: { background: HEADER_COLOR, padding: "6px 10px" },
          body: { padding: 0 },
        }}
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <EyeOutlined style={{ color: "#FFFFFF" }} />
            <Tooltip open={nameProblem ? true : undefined} title={nameProblem}>
            <Input
              aria-label="Nome da view"
              status={nameProblem ? "error" : undefined}
              value={name}
              onChange={(e) => setDraftName(e.target.value)}
              onFocus={() => {
                setDraftName(data.name || "view");
                setIsEditingName(true);
              }}
              onBlur={() => {
                setIsEditingName(false);
                const next = draftName.trim();
                if (next === (data.name || "view") || validateName?.(next)) return;
                onRename?.(next);
              }}
              onPressEnter={(e) => (e.target as HTMLInputElement).blur()}
              size="small"
              style={{
                fontWeight: "bold",
                padding: 0,
                background: "transparent",
                color: "#FFFFFF",
                border: "none",
                borderRadius: 0,
                textAlign: "center",
              }}
            />
            </Tooltip>
            {duplicateName && (
              <Tooltip title="Outro item do diagrama tem este mesmo nome. Renomeie um deles.">
                <WarningFilled aria-label="Nome repetido" style={{ color: "#ff7875" }} />
              </Tooltip>
            )}
            <CloseOutlined
              aria-label="Excluir view"
              style={{ cursor: "pointer", color: "#FFFFFF" }}
              onClick={() => setOpenDelete(true)}
            />
          </div>
        }
      >
        {!sql ? (
          <div style={{ padding: "8px 10px", color: "#8c8c8c", fontSize: 12 }}>Sem consulta definida</div>
        ) : (
          <>
            {analysis.columns.map((column, index) => (
              <div
                key={`${column}-${index}`}
                title={column}
                style={{
                  borderTop: index === 0 ? undefined : "1px solid #f0f0f0",
                  padding: "6px 10px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {column}
              </div>
            ))}
            {analysis.tables.length > 0 && (
              <div
                style={{
                  borderTop: "1px solid #e0e0e0",
                  background: "#f5f8fc",
                  padding: "4px 10px",
                  fontSize: 12,
                  color: "#555555",
                }}
              >
                Fonte: {analysis.tables.join(", ")}
              </div>
            )}
          </>
        )}

        <div style={{ borderTop: "1px solid #f0f0f0", padding: 6 }}>
          <Button
            type="text"
            style={{ background: "#d9d9d9", color: "#333333", width: "100%" }}
            onClick={openSqlEditor}
          >
            Editar consulta
          </Button>
        </div>

        {[Position.Left, Position.Right].map((pos) => (
          <Handle
            key={pos}
            type="target"
            id={pos}
            position={pos}
            isConnectable={false}
            style={{ opacity: 0, pointerEvents: "none" }}
          />
        ))}
      </Card>
    </>
  );
});
