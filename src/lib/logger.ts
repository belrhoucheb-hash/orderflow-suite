// Lichte logger-wrapper. `debug` is een no-op in productie zodat PII zoals
// foto-paden, AI-resultaten of tenant-id's niet in browser-consoles bij
// klanten belanden. `warn` en `error` blijven altijd actief, omdat die
// signalen in productie wel zichtbaar moeten blijven voor diagnose.
//
// Gebruik:
//   import { logger } from "@/lib/logger";
//   logger.debug("VehicleCheck", "uploading", side, { checkId });
//   logger.error("VehicleCheck", "upload failed", err);

const isDev = import.meta.env.MODE === "development";

function format(scope: string): string {
  return `[${scope}]`;
}

export const logger = {
  debug(scope: string, ...args: unknown[]): void {
    if (!isDev) return;
    // eslint-disable-next-line no-console
    console.log(format(scope), ...args);
  },
  warn(scope: string, ...args: unknown[]): void {
    // eslint-disable-next-line no-console
    console.warn(format(scope), ...args);
  },
  error(scope: string, ...args: unknown[]): void {
    // eslint-disable-next-line no-console
    console.error(format(scope), ...args);
  },
};
