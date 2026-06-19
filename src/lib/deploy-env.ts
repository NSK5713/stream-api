export const NSKANIME_ORIGINS = ["https://nskanime.uk", "https://www.nskanime.uk"];

/** True when running on Railway or with NODE_ENV=production. */
export function isDeployedRuntime(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    Boolean(process.env.RAILWAY_ENVIRONMENT) ||
    Boolean(process.env.RAILWAY_PROJECT_ID) ||
    Boolean(process.env.RAILWAY_SERVICE_ID)
  );
}
