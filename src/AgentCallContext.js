import { createContext, useContext } from "react";

export const AgentCallContext = createContext(null);

export function useAgentCalls() {
  const context = useContext(AgentCallContext);
  if (!context) throw new Error("useAgentCalls must be used inside AgentCallProvider");
  return context;
}
