import { listRouteBindings, listAcpBindings } from "../../config/bindings.js";
import { loadConfig } from "../../config/config.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateRoutingListParams,
} from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

/**
 * routing.list — Returns the current channel-to-agent binding configuration.
 *
 * Reads cfg.bindings[] (both route-type and acp-type) and returns
 * a normalised list of RouteBindingEntry objects so the Gateway UI
 * can display the channel-per-agent mapping.
 *
 * ZZ-20260311-005: Discord channel-per-agent binding display
 */
export const routingHandlers: GatewayRequestHandlers = {
  "routing.list": ({ params, respond }) => {
    if (!validateRoutingListParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid routing.list params: ${formatValidationErrors(validateRoutingListParams.errors)}`,
        ),
      );
      return;
    }

    const cfg = loadConfig();
    const routeBindings = listRouteBindings(cfg);
    const acpBindings = listAcpBindings(cfg);

    const bindings = [
      ...routeBindings.map((b) => ({
        agentId: b.agentId,
        channel: b.match.channel ?? "",
        peerKind: b.match.peer?.kind ?? undefined,
        peerId: b.match.peer?.id ?? undefined,
        guildId: b.match.guildId ?? undefined,
        comment: b.comment ?? undefined,
        type: "route" as const,
      })),
      ...acpBindings.map((b) => ({
        agentId: b.agentId,
        channel: b.match.channel ?? "",
        peerKind: b.match.peer?.kind ?? undefined,
        peerId: b.match.peer?.id ?? undefined,
        guildId: b.match.guildId ?? undefined,
        comment: b.comment ?? undefined,
        type: "acp" as const,
      })),
    ];

    respond(true, { bindings }, undefined);
  },
};
