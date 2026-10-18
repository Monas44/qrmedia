import { describe, expect, it } from 'vitest';
import { resolveDatabasePath, StorageConfigError } from '../src/server/lib/storage';

const railway = { RAILWAY_ENVIRONMENT: 'production' };

describe('caminho do banco', () => {
  it('fora do Railway usa DATABASE_PATH ou ./data/qr.db', () => {
    expect(resolveDatabasePath({})).toBe('./data/qr.db');
    expect(resolveDatabasePath({ DATABASE_PATH: '/tmp/x.db' })).toBe('/tmp/x.db');
  });

  it('no Railway sem volume recusa iniciar', () => {
    expect(() => resolveDatabasePath(railway)).toThrow(StorageConfigError);
    expect(() => resolveDatabasePath({ ...railway, DATABASE_PATH: '/data/qr.db' })).toThrow(/Nenhum volume/);
  });

  it('no Railway com volume usa <volume>/qr.db por padrão', () => {
    expect(resolveDatabasePath({ ...railway, RAILWAY_VOLUME_MOUNT_PATH: '/data' })).toBe('/data/qr.db');
    expect(resolveDatabasePath({ ...railway, RAILWAY_VOLUME_MOUNT_PATH: '/data/' })).toBe('/data/qr.db');
  });

  it('no Railway recusa DATABASE_PATH fora do volume (o caso que apagou os links)', () => {
    const env = { ...railway, RAILWAY_VOLUME_MOUNT_PATH: '/data', DATABASE_PATH: './data/qr.db' };
    expect(() => resolveDatabasePath(env)).toThrow(/fora do volume/);
    expect(() => resolveDatabasePath({ ...env, DATABASE_PATH: '/database/qr.db' })).toThrow(StorageConfigError);
    expect(() => resolveDatabasePath({ ...env, DATABASE_PATH: '/data' })).toThrow(StorageConfigError);
  });

  it('aceita DATABASE_PATH dentro do volume', () => {
    expect(resolveDatabasePath({ ...railway, RAILWAY_VOLUME_MOUNT_PATH: '/data', DATABASE_PATH: '/data/sub/qr.db' })).toBe('/data/sub/qr.db');
  });

  it('ALLOW_EPHEMERAL_DB desliga a trava', () => {
    expect(resolveDatabasePath({ ...railway, ALLOW_EPHEMERAL_DB: 'true' })).toBe('./data/qr.db');
  });
});
