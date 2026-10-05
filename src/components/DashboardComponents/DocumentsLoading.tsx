import { Spin } from "antd";

// Indicador exibido enquanto a lista de diagramas e carregada do backend.
export function DocumentsLoading() {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "64px 0",
        width: "100%",
      }}
    >
      <Spin size="large" tip="Carregando documentos...">
        <div style={{ width: 200, height: 60 }} />
      </Spin>
    </div>
  );
}
