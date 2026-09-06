import { hostingerConnector } from "./hostinger";
import { cloudflareConnector } from "./cloudflare";
import type { ProviderConnector } from "./types";

/**
 * Registro de conectores disponibles.
 *
 * Para agregar un proveedor con API:
 *   1. crear src/lib/connectors/<proveedor>.ts implementando ProviderConnector
 *   2. registrarlo acá
 *   3. en la base: update providers set integration_key = '<key>',
 *      integration_status = 'disponible' where name = '<Proveedor>'
 *
 * La UI y la server action son genéricas: no hay que tocar nada más.
 */
export const CONNECTORS: Record<string, ProviderConnector> = {
  [hostingerConnector.key]: hostingerConnector,
  [cloudflareConnector.key]: cloudflareConnector,
};

export function getConnector(key: string | null): ProviderConnector | null {
  if (!key) return null;
  return CONNECTORS[key] ?? null;
}

/** ¿Está cargada la credencial de este conector en el servidor? */
export function hasCredential(connector: ProviderConnector): boolean {
  if (!connector.envVar) return true;
  return Boolean(process.env[connector.envVar]);
}

export type { ProviderConnector, SyncResult } from "./types";
export { MissingCredentialError } from "./types";
