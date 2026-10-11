import { useState } from "react";
import { Alert, Button, Drawer, Empty, Input, Progress, Space, Spin, Tag, Typography } from "antd";
import { AimOutlined, BulbOutlined, CheckOutlined, EyeInvisibleOutlined, ThunderboltOutlined } from "@ant-design/icons";
import {
  describeAction,
  type AiAnalysis,
  type AiSuggestion,
  type SuggestionCategory,
  type SuggestionSeverity,
} from "../../utils/aiSuggestions";

const { Text, Paragraph } = Typography;

const SEVERITY: Record<SuggestionSeverity, { color: string; label: string; rank: number }> = {
  alta: { color: "red", label: "Alta", rank: 0 },
  media: { color: "orange", label: "Média", rank: 1 },
  baixa: { color: "blue", label: "Baixa", rank: 2 },
};

const CATEGORY: Record<SuggestionCategory, string> = {
  normalizacao: "Normalização",
  chaves: "Chaves",
  tipos: "Tipos",
  integridade: "Integridade",
  nomenclatura: "Nomenclatura",
  desempenho: "Desempenho",
  modelagem: "Modelagem",
};

const scoreColor = (score: number) => (score >= 80 ? "#2F7D32" : score >= 60 ? "#faad14" : "#d4380d");

interface Props {
  open: boolean;
  onClose: () => void;
  analysis: AiAnalysis | null;
  analyzing: boolean;
  error: string | null;
  canApply: boolean;
  applied: Set<string>;
  dismissed: Set<string>;
  onAnalyze: (focus: string) => void;
  onApply: (suggestion: AiSuggestion) => void;
  onDismiss: (suggestion: AiSuggestion) => void;
  onShowDismissed: () => void;
  onLocate: (suggestion: AiSuggestion) => void;
}

export default function AiAnalysisDrawer({
  open,
  onClose,
  analysis,
  analyzing,
  error,
  canApply,
  applied,
  dismissed,
  onAnalyze,
  onApply,
  onDismiss,
  onShowDismissed,
  onLocate,
}: Props) {
  const [focus, setFocus] = useState("");

  const visible = (analysis?.suggestions ?? [])
    .filter((suggestion) => !dismissed.has(suggestion.id))
    .sort((a, b) => SEVERITY[a.severity].rank - SEVERITY[b.severity].rank);
  const hiddenCount = (analysis?.suggestions ?? []).filter((s) => dismissed.has(s.id)).length;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={460}
      title={
        <Space>
          <BulbOutlined />
          Análise da IA
        </Space>
      }
    >
      <Input.TextArea
        aria-label="Foco da análise"
        placeholder="O que a IA deve observar? (opcional) Ex.: normalização, tipos de dados, índices"
        autoSize={{ minRows: 2, maxRows: 4 }}
        value={focus}
        maxLength={1000}
        onChange={(e) => setFocus(e.target.value)}
        disabled={analyzing}
      />
      <Button
        type="primary"
        icon={<ThunderboltOutlined />}
        loading={analyzing}
        onClick={() => onAnalyze(focus)}
        style={{ marginTop: 8, width: "100%", backgroundColor: "#2F7D32" }}
      >
        {analysis ? "Analisar de novo" : "Analisar modelo"}
      </Button>

      {error && <Alert type="error" showIcon message={error} style={{ marginTop: 16 }} />}

      {analyzing && (
        <div style={{ textAlign: "center", padding: 32 }}>
          <Spin />
          <Text type="secondary" style={{ display: "block", marginTop: 8 }}>
            Analisando o modelo…
          </Text>
        </div>
      )}

      {!analyzing && !analysis && !error && (
        <Empty
          style={{ marginTop: 32 }}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="A IA revisa normalização, chaves, tipos, integridade, nomes e índices e sugere melhorias."
        />
      )}

      {!analyzing && analysis && (
        <div data-testid="ai-analysis" style={{ marginTop: 16 }}>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <Progress
              type="circle"
              size={72}
              percent={analysis.score}
              strokeColor={scoreColor(analysis.score)}
              format={(value) => <span data-testid="ai-score">{value}</span>}
            />
            <Paragraph style={{ margin: 0, flex: 1 }}>{analysis.summary}</Paragraph>
          </div>

          <Text type="secondary" style={{ display: "block", fontSize: 12, margin: "12px 0" }}>
            Sugestões geradas por IA podem conter erros. Revise antes de aplicar; tudo pode ser desfeito.
          </Text>

          {visible.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nenhuma sugestão pendente." />
          ) : (
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              {visible.map((suggestion) => {
                const isApplied = applied.has(suggestion.id);
                const target = suggestion.table
                  ? suggestion.column
                    ? `${suggestion.table}.${suggestion.column}`
                    : suggestion.table
                  : null;
                return (
                  <div
                    key={suggestion.id}
                    data-testid="ai-suggestion"
                    style={{
                      border: "1px solid #f0f0f0",
                      borderRadius: 8,
                      padding: 12,
                      background: isApplied ? "#f6ffed" : "#ffffff",
                    }}
                  >
                    <Space size={4} wrap style={{ marginBottom: 6 }}>
                      <Tag color={SEVERITY[suggestion.severity].color}>{SEVERITY[suggestion.severity].label}</Tag>
                      <Tag>{CATEGORY[suggestion.category]}</Tag>
                    </Space>
                    <Text strong style={{ display: "block" }}>
                      {suggestion.title}
                    </Text>
                    <Paragraph style={{ margin: "4px 0 8px", fontSize: 13 }}>{suggestion.description}</Paragraph>

                    {target && (
                      <Button
                        type="link"
                        size="small"
                        icon={<AimOutlined />}
                        style={{ padding: 0, marginBottom: 8 }}
                        onClick={() => onLocate(suggestion)}
                      >
                        {target}
                      </Button>
                    )}

                    {suggestion.action && (
                      <div
                        style={{
                          background: "#fafafa",
                          borderRadius: 6,
                          padding: "6px 8px",
                          fontSize: 12,
                          fontFamily: "monospace",
                          marginBottom: 8,
                        }}
                      >
                        {describeAction(suggestion.action)}
                      </div>
                    )}

                    <Space size={6}>
                      {suggestion.action && (
                        <Button
                          size="small"
                          type={isApplied ? "default" : "primary"}
                          icon={isApplied ? <CheckOutlined /> : undefined}
                          disabled={!canApply || isApplied}
                          onClick={() => onApply(suggestion)}
                        >
                          {isApplied ? "Aplicada" : "Aplicar"}
                        </Button>
                      )}
                      <Button size="small" icon={<EyeInvisibleOutlined />} onClick={() => onDismiss(suggestion)}>
                        Ignorar
                      </Button>
                    </Space>
                  </div>
                );
              })}
            </Space>
          )}

          {hiddenCount > 0 && (
            <Button type="link" size="small" style={{ marginTop: 8, padding: 0 }} onClick={onShowDismissed}>
              Mostrar {hiddenCount} {hiddenCount === 1 ? "sugestão ignorada" : "sugestões ignoradas"}
            </Button>
          )}
        </div>
      )}
    </Drawer>
  );
}
