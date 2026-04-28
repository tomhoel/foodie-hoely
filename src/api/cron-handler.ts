// src/api/cron-handler.ts
import { verifyCronAuth, cronAuthResponse } from './cron-auth';
import { logEvent } from './logger';

export interface AlertArgs {
  subject: string;
  body: string;
  to: string;
  from: string;
}

export interface CronHandlerDeps {
  cronSecret: string;
  alertEmail: string;
  alertFrom: string;
  sendAlert: (args: AlertArgs) => Promise<void>;
}

export interface WrapCronHandlerArgs<T> {
  name: string;
  fn: () => Promise<T>;
}

export function wrapCronHandler<T>(args: WrapCronHandlerArgs<T>, deps: CronHandlerDeps) {
  return async function handler(req: Request): Promise<Response> {
    const startedAt = Date.now();
    const auth = verifyCronAuth({
      authorizationHeader: req.headers.get('authorization'),
      expectedSecret: deps.cronSecret,
    });
    if (!auth.ok) {
      logEvent({ event: 'cron.auth_failed', name: args.name, status: auth.status });
      return cronAuthResponse(auth);
    }

    try {
      const result = await args.fn();
      const durationMs = Date.now() - startedAt;
      logEvent({ event: 'cron.success', name: args.name, durationMs, result });
      return Response.json(result);
    } catch (e) {
      const durationMs = Date.now() - startedAt;
      const err = e instanceof Error ? e : new Error(String(e));
      logEvent({
        event: 'cron.failure',
        name: args.name,
        durationMs,
        error: err.message,
        stack: err.stack,
      });

      // Fire alert; never let alert failure mask the original error.
      if (deps.alertEmail) {
        try {
          await deps.sendAlert({
            subject: `[Foodie alert] cron ${args.name} failed`,
            body: `Cron: ${args.name}\nDuration: ${durationMs}ms\nError: ${err.message}\n\nStack:\n${err.stack ?? '(no stack)'}`,
            to: deps.alertEmail,
            from: deps.alertFrom,
          });
        } catch (alertErr) {
          logEvent({
            event: 'cron.alert_failed',
            name: args.name,
            error: alertErr instanceof Error ? alertErr.message : String(alertErr),
          });
        }
      }

      return Response.json({ error: err.message }, { status: 500 });
    }
  };
}

/**
 * Production-mode dependency builder. Lazy-imports Resend to keep tests fast.
 * Returns the deps blob ready to pass to `wrapCronHandler`.
 */
export async function buildProductionDeps(args: {
  cronSecret: string;
  alertEmail: string;
  alertFrom: string;
  resendApiKey: string;
}): Promise<CronHandlerDeps> {
  const { buildResendSender, sendEmail } = await import('../email/client');
  const sender = await buildResendSender(args.resendApiKey);
  return {
    cronSecret: args.cronSecret,
    alertEmail: args.alertEmail,
    alertFrom: args.alertFrom,
    sendAlert: async (a: AlertArgs) => {
      await sendEmail({
        sender,
        from: a.from,
        to: a.to,
        subject: a.subject,
        html: `<pre style="white-space:pre-wrap;font-family:Menlo,Consolas,monospace;font-size:12px;">${escapeHtml(a.body)}</pre>`,
        text: a.body,
      });
    },
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
