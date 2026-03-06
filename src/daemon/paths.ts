import path from "node:path";
import { resolveGatewayProfileSuffix } from "./constants.js";

const windowsAbsolutePath = /^[a-zA-Z]:[\\/]/;
const windowsUncPath = /^\\\\/;

export function resolveHomeDir(env: Record<string, string | undefined>): string {
  const home = env.HOME?.trim() || env.USERPROFILE?.trim();
  if (!home) {
    throw new Error("Missing HOME");
  }
  return home;
}

export function resolveUserPathWithHome(input: string, home?: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (trimmed.startsWith("~")) {
    if (!home) {
      throw new Error("Missing HOME");
    }
    const expanded = trimmed.replace(/^~(?=$|[\\/])/, home);
    return path.resolve(expanded);
  }
  if (windowsAbsolutePath.test(trimmed) || windowsUncPath.test(trimmed)) {
    return trimmed;
  }
  return path.resolve(trimmed);
}

export function resolveGatewayStateDir(env: Record<string, string | undefined>): string {
  // OPENCLAW_STATE_DIR is the primary override — use it directly as the state dir path.
  // White-label deployments (e.g. TheMachine) should set OPENCLAW_STATE_DIR=~/.themachine.
  const override = env.OPENCLAW_STATE_DIR?.trim();
  if (override) {
    const home = override.startsWith("~") ? resolveHomeDir(env) : undefined;
    return resolveUserPathWithHome(override, home);
  }
  const systemHome = resolveHomeDir(env);
  const suffix = resolveGatewayProfileSuffix(env.OPENCLAW_PROFILE);
  // Respect OPENCLAW_HOME as a HOME directory override (consistent with config/paths.ts).
  // With OPENCLAW_HOME=/srv/myapp, state dir becomes /srv/myapp/.openclaw.
  const openclawHome = env.OPENCLAW_HOME?.trim();
  const effectiveHome = openclawHome
    ? resolveUserPathWithHome(openclawHome, systemHome)
    : systemHome;
  return path.join(effectiveHome, `.openclaw${suffix}`);
}
