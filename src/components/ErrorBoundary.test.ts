import { describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

describe("ErrorBoundary", () => {
  it("guarda o erro no estado para exibir o fallback", () => {
    const error = new Error("falhou");

    expect(ErrorBoundary.getDerivedStateFromError(error)).toEqual({ error });
  });

  it("avisa quem estiver interessado e registra o erro", () => {
    const onError = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const boundary = new ErrorBoundary({ children: null, onError });
    const error = new Error("falhou");

    boundary.componentDidCatch(error, { componentStack: "em Teste" });

    expect(onError).toHaveBeenCalledWith(error);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("usa o fallback informado", () => {
    const boundary = new ErrorBoundary({ children: "conteúdo", fallback: "plano B" });
    boundary.state = { error: new Error("x") };

    expect(boundary.render()).toBe("plano B");
  });

  it("sem erro, renderiza os filhos", () => {
    const boundary = new ErrorBoundary({ children: "conteúdo" });

    expect(boundary.render()).toBe("conteúdo");
  });
});
