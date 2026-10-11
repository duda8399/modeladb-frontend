import { createContext, useContext } from "react";

// Acoes que as arestas customizadas precisam disparar no Constructor (ex.:
// excluir com cascata de FK). Passado por contexto para nao precisar enfiar
// callbacks no `data` de cada aresta, que e sincronizado via colaboracao.
interface EdgeActions {
  onRemove: (edgeId: string) => void;
  onEdit: (edgeId: string) => void;
  readOnly: boolean;
}

export const EdgeActionsContext = createContext<EdgeActions>({
  onRemove: () => {},
  onEdit: () => {},
  readOnly: true,
});

export const useEdgeActions = () => useContext(EdgeActionsContext);
