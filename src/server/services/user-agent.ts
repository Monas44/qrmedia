import UAParser from 'ua-parser-js';
import type { DeviceType } from '../../shared/types';

export interface ParsedUserAgent {
  device_type: DeviceType;
  os: string | null;
  browser: string | null;
}

export function parseUserAgent(userAgent: string | null): ParsedUserAgent {
  if (!userAgent) return { device_type: 'desktop', os: null, browser: null };
  const { device, os, browser } = new UAParser(userAgent).getResult();
  return {
    device_type: toDeviceType(device.type, os.name),
    os: os.name ?? null,
    browser: browser.name ?? null,
  };
}

function toDeviceType(type: string | undefined, osName: string | undefined): DeviceType {
  if (type === 'tablet') return 'tablet';
  if (type === 'mobile' || type === 'wearable') return 'mobile';
  // Sem tipo explícito, iOS/Android ainda são quase sempre celular.
  if (!type && (osName === 'iOS' || osName === 'Android')) return 'mobile';
  return 'desktop';
}
