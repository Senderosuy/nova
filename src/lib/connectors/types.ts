import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resultado uniforme de una sincronización, sea cual sea el proveedor.
 */
export type SyncResult = {
  created: number;
  updated: number;
  message: string;
};

/**
 * Contrato que implementa todo conector de proveedor.
 * Agregar un proveedor nuevo = crear un archivo con este shape
 * y registrarlo en ./index.ts. Nada más cambia.
 */
export type ProviderConnector = {
  /** Clave que se guarda en providers.integration_key */
  key: string;
  /** Nombre legible del proveedor */
  label: string;
  /** Variable de entorno con la credencial (server-side, nunca NEXT_PUBLIC_) */
  envVar: string | null;
  /** Qué trae este conector */
  capabilities: string[];
  /** Sincroniza contra la API del proveedor y persiste en la base */
  sync: (supabase: SupabaseClient, providerId: string) => Promise<SyncResult>;
};

/** Error de credencial faltante, uniforme para todos los conectores. */
export class MissingCredentialError extends Error {
  constructor(envVar: string) {
    super(
      `Falta la credencial ${envVar} en las variables de entorno del servidor.`
    );
    this.name = "MissingCredentialError";
  }
}
