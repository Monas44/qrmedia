import { useEffect, useState } from 'react';
import type { AppConfigDTO } from '@shared/types';
import { api } from './api';

let cached: Promise<AppConfigDTO> | null = null;

export function useAppConfig(): AppConfigDTO {
  const [config, setConfig] = useState<AppConfigDTO>({ base_url: window.location.origin, timezone: 'America/Sao_Paulo' });
  useEffect(() => {
    cached ??= api.get<AppConfigDTO>('/config');
    cached.then(setConfig, () => {
      cached = null;
    });
  }, []);
  return config;
}
