import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button, Result } from "antd";

type Props = {
  children: ReactNode;
  fallback?: ReactNode | ((reset: () => void) => ReactNode);
  onError?: (error: Error) => void;
};

type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Erro de renderização capturado", error, info.componentStack);
    this.props.onError?.(error);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;

    const { fallback } = this.props;

    if (typeof fallback === "function") return fallback(this.reset);
    if (fallback !== undefined) return fallback;

    return (
      <Result
        status="error"
        title="Algo deu errado nesta tela"
        subTitle="Um erro inesperado interrompeu a exibição. As alterações já sincronizadas não foram perdidas."
        extra={[
          <Button key="retry" type="primary" onClick={this.reset}>
            Tentar novamente
          </Button>,
          <Button key="home" onClick={() => window.location.assign("/")}>
            Voltar ao início
          </Button>,
        ]}
      />
    );
  }
}
