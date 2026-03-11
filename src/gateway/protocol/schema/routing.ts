import { Type } from "@sinclair/typebox";
import { NonEmptyString } from "./primitives.js";

export const RoutingListParamsSchema = Type.Object({}, { additionalProperties: false });

/**
 * A single resolved channel-to-agent binding entry.
 * Derived from cfg.bindings[] (route-type bindings only).
 */
export const RouteBindingEntrySchema = Type.Object(
  {
    /** Agent that receives messages matched by this binding. */
    agentId: NonEmptyString,
    /** Channel id (e.g. "discord", "telegram"). */
    channel: Type.String(),
    /** Peer kind: "channel", "dm", "group", etc. (from match.peer.kind). */
    peerKind: Type.Optional(Type.String()),
    /** Peer id: e.g. Discord channel snowflake. */
    peerId: Type.Optional(Type.String()),
    /** Guild/server id (Discord). */
    guildId: Type.Optional(Type.String()),
    /** Optional human-readable comment from config. */
    comment: Type.Optional(Type.String()),
    /** Binding type: "route" or "acp". */
    type: Type.String(),
  },
  { additionalProperties: false },
);

export const RoutingListResultSchema = Type.Object(
  {
    bindings: Type.Array(RouteBindingEntrySchema),
  },
  { additionalProperties: false },
);
