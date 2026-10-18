import { isAbsolute, relative, resolve } from 'node:path';

type EnvVars = Record<string, string | undefined>;

export class StorageConfigError extends Error {}

const isInside = (dir: string, file: string) => {
  const rel = relative(resolve(dir), resolve(file));
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
};

/**
 * Decide onde fica o arquivo SQLite.
 *
 * Fora do Railway: DATABASE_PATH ou ./data/qr.db.
 * No Railway: o banco PRECISA estar dentro do volume, senão é apagado a cada
 * deploy. Sem volume, ou com DATABASE_PATH fora dele, lança erro: o deploy
 * falha e o Railway mantém a versão anterior no ar, com os dados intactos.
 * ALLOW_EPHEMERAL_DB=true desliga a trava (só para testes descartáveis).
 */
export function resolveDatabasePath(env: EnvVars): string {
  const configured = env.DATABASE_PATH?.trim();
  if (!env.RAILWAY_ENVIRONMENT || env.ALLOW_EPHEMERAL_DB === 'true') return configured || './data/qr.db';

  const volume = env.RAILWAY_VOLUME_MOUNT_PATH?.trim();
  if (!volume) {
    throw new StorageConfigError(
      'Nenhum volume do Railway está montado: o banco seria APAGADO a cada deploy. ' +
        'Crie um volume no serviço (mount path /data) e faça o deploy de novo.',
    );
  }

  const path = configured || `${volume.replace(/\/+$/, '')}/qr.db`;
  if (!isInside(volume, path)) {
    throw new StorageConfigError(
      `DATABASE_PATH="${configured}" está fora do volume montado em "${volume}": o banco seria APAGADO a cada deploy. ` +
        `Remova a variável DATABASE_PATH (o padrão é ${volume}/qr.db) ou aponte para dentro do volume.`,
    );
  }
  return path;
}
