import type { GatewayBrowserClient } from "../gateway.ts";
import type { AgentsListResult, ToolsCatalogResult, RoutingListResult } from "../types.ts";
import { saveConfig } from "./config.ts";
import type { ConfigState } from "./config.ts";

export type AgentsState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  agentsLoading: boolean;
  agentsError: string | null;
  agentsList: AgentsListResult | null;
  agentsSelectedId: string | null;
  toolsCatalogLoading: boolean;
  toolsCatalogError: string | null;
  toolsCatalogResult: ToolsCatalogResult | null;
  /** Binding entries from routing.list — channel-per-agent routing config. */
  routeBindings: RoutingListResult["bindings"] | null;
  routeBindingsLoading: boolean;
  routeBindingsError: string | null;
};

export type AgentsConfigSaveState = AgentsState & ConfigState;

export async function loadAgents(state: AgentsState) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.agentsLoading) {
    return;
  }
  state.agentsLoading = true;
  state.agentsError = null;
  try {
    const res = await state.client.request<AgentsListResult>("agents.list", {});
    if (res) {
      state.agentsList = res;
      const selected = state.agentsSelectedId;
      const known = res.agents.some((entry) => entry.id === selected);
      if (!selected || !known) {
        state.agentsSelectedId = res.defaultId ?? res.agents[0]?.id ?? null;
      }
    }
  } catch (err) {
    state.agentsError = String(err);
  } finally {
    state.agentsLoading = false;
  }
}

export async function loadToolsCatalog(state: AgentsState, agentId?: string | null) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.toolsCatalogLoading) {
    return;
  }
  state.toolsCatalogLoading = true;
  state.toolsCatalogError = null;
  try {
    const res = await state.client.request<ToolsCatalogResult>("tools.catalog", {
      agentId: agentId ?? state.agentsSelectedId ?? undefined,
      includePlugins: true,
    });
    if (res) {
      state.toolsCatalogResult = res;
    }
  } catch (err) {
    state.toolsCatalogError = String(err);
  } finally {
    state.toolsCatalogLoading = false;
  }
}

export async function saveAgentsConfig(state: AgentsConfigSaveState) {
  const selectedBefore = state.agentsSelectedId;
  await saveConfig(state);
  await loadAgents(state);
  if (selectedBefore && state.agentsList?.agents.some((entry) => entry.id === selectedBefore)) {
    state.agentsSelectedId = selectedBefore;
  }
}

/**
 * loadRouteBindings — Fetches channel-to-agent bindings from routing.list.
 * ZZ-20260311-005: Used to display per-agent channel bindings in the agents UI.
 */
export async function loadRouteBindings(state: AgentsState) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.routeBindingsLoading) {
    return;
  }
  state.routeBindingsLoading = true;
  state.routeBindingsError = null;
  try {
    const res = await state.client.request<{ bindings: AgentsState["routeBindings"] }>(
      "routing.list",
      {},
    );
    if (res) {
      state.routeBindings = res.bindings ?? [];
    }
  } catch (err) {
    state.routeBindingsError = String(err);
  } finally {
    state.routeBindingsLoading = false;
  }
}
