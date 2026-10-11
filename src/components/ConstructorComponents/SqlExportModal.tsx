import { useEffect, useState } from "react";
import { Alert, Button, Modal, Segmented, message } from "antd";
import { CopyOutlined, DownloadOutlined } from "@ant-design/icons";
import CodeMirror from "@uiw/react-codemirror";
import { sql, MySQL, PostgreSQL } from "@codemirror/lang-sql";
import { EditorView } from "@codemirror/view";

import type { CustomEdge, CustomNode } from "../../types/diagramER";
import {
  downloadTextFile,
  generateSqlScript,
  type SqlDialect,
} from "../../utils/sqlExport";

interface Props {
  open: boolean;
  onClose: () => void;
  dialect: SqlDialect;
  onDialectChange: (dialect: SqlDialect) => void;
  diagramName: string;
  nodes: CustomNode[];
  edges: CustomEdge[];
}

export function SqlExportModal({
  open,
  onClose,
  dialect,
  onDialectChange,
  diagramName,
  nodes,
  edges,
}: Props) {
  const [messageApi, contextHolder] = message.useMessage();
  const [script, setScript] = useState("");
  const [skippedFields, setSkippedFields] = useState(0);
  const [skippedViews, setSkippedViews] = useState(0);

  useEffect(() => {
    if (!open) return;

    const generated = generateSqlScript(nodes, edges, dialect, diagramName);
    setScript(generated.sql);
    setSkippedFields(generated.skippedFields);
    setSkippedViews(generated.skippedViews);
  }, [open, dialect, nodes, edges, diagramName]);

  const handleDownload = () => {
    const suffix = dialect === "mysql" ? "mysql" : "postgres";
    downloadTextFile(`${diagramName || "diagrama"}_${suffix}.sql`, script);
    messageApi.success("Script SQL exportado com sucesso!");
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(script);
      messageApi.success("Script SQL copiado para a área de transferência!");
    } catch {
      messageApi.error("Não foi possível copiar o script.");
    }
  };

  const hasTables = nodes.some((node) => node.type === "entityNode");

  return (
    <Modal
      title="Exportar para banco de dados"
      open={open}
      onCancel={onClose}
      width={800}
      height={400}
      okText="Baixar .sql"
      okButtonProps={{ icon: <DownloadOutlined />, disabled: !hasTables }}
      onOk={handleDownload}
      cancelText="Fechar"
      destroyOnHidden
    >
      {contextHolder}

      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          position: "relative",
          paddingBottom: 16,
        }}
      >
        <Segmented
          value={dialect}
          onChange={(value) => onDialectChange(value as SqlDialect)}
          options={[
            { label: "MySQL", value: "mysql" },
            { label: "PostgreSQL", value: "postgres" },
          ]}
        />
        <Button
          icon={<CopyOutlined />}
          onClick={handleCopy}
          disabled={!hasTables}
          style={{ position: "absolute", right: 0 }}
        >
          Copiar
        </Button>
      </div>

      {skippedFields > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={`${skippedFields} atributo(s) sem nome ou tipo foram ignorados na exportação.`}
        />
      )}

      {skippedViews > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={`${skippedViews} view(s) sem consulta foram ignoradas na exportação.`}
        />
      )}

      {!hasTables ? (
        <Alert type="info" showIcon message="Nenhuma entidade para exportar." />
      ) : (
        <CodeMirror
          value={script}
          height="380px"
          extensions={[
            sql({ dialect: dialect === "mysql" ? MySQL : PostgreSQL }),
            EditorView.lineWrapping,
          ]}
          onChange={setScript}
        />
      )}
    </Modal>
  );
}
