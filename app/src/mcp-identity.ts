export interface PersonalOpsMcpIdentity {
  clientId: string;
  requestedBy: string;
  origin: string;
}

const DEFAULT_IDENTITY: PersonalOpsMcpIdentity = {
  clientId: "codex-mcp",
  requestedBy: "codex",
  origin: "assistant-mcp",
};

export function getPersonalOpsMcpIdentity(env: NodeJS.ProcessEnv = process.env): PersonalOpsMcpIdentity {
  return {
    clientId: env.PERSONAL_OPS_CLIENT_ID?.trim() || DEFAULT_IDENTITY.clientId,
    requestedBy: env.PERSONAL_OPS_REQUESTED_BY?.trim() || DEFAULT_IDENTITY.requestedBy,
    origin: env.PERSONAL_OPS_ORIGIN?.trim() || DEFAULT_IDENTITY.origin,
  };
}

export function getPersonalOpsMcpHeaders(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const identity = getPersonalOpsMcpIdentity(env);
  return {
    "x-personal-ops-client": identity.clientId,
    "x-personal-ops-origin": identity.origin,
    "x-personal-ops-requested-by": identity.requestedBy,
  };
}
