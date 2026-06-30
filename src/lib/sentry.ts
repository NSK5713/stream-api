import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN?.trim() ?? "";
const enabled = Boolean(dsn);

export function initSentry(): void {
  if (!enabled) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1,
    sendDefaultPii: false,
  });

  process.on("uncaughtException", (error) => {
    Sentry.captureException(error);
    console.error("[fatal] uncaughtException", error);
  });

  process.on("unhandledRejection", (reason) => {
    Sentry.captureException(reason instanceof Error ? reason : new Error(String(reason)));
    console.error("[fatal] unhandledRejection", reason);
  });
}

export function isSentryEnabled(): boolean {
  return enabled;
}

export { Sentry };
