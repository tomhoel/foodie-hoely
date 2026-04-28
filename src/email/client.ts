/**
 * Minimal interface against the resend SDK we actually use. Lets us inject a
 * fake in tests without pulling the real Resend client into the test process.
 */
export interface EmailSender {
  emails: {
    send: (args: {
      from: string;
      to: string[];
      subject: string;
      html: string;
      text: string;
    }) => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
  };
}

export interface SendEmailArgs {
  sender: EmailSender;
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendEmailResult {
  messageId: string;
}

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const res = await args.sender.emails.send({
    from: args.from,
    to: [args.to],
    subject: args.subject,
    html: args.html,
    text: args.text,
  });
  if (res.error) throw new Error(`sendEmail: ${res.error.message}`);
  if (!res.data) throw new Error('sendEmail: no message id returned');
  return { messageId: res.data.id };
}

/**
 * Production helper — instantiates a real Resend client from the API key.
 * Imported lazily so tests don't pay the cost of loading the SDK.
 */
export async function buildResendSender(apiKey: string): Promise<EmailSender> {
  if (!apiKey) throw new Error('buildResendSender: RESEND_API_KEY is required');
  const { Resend } = await import('resend');
  return new Resend(apiKey) as unknown as EmailSender;
}
