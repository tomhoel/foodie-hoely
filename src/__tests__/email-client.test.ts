import { describe, it, expect, vi } from 'vitest';
import { sendEmail, type EmailSender } from '../email/client';

describe('sendEmail', () => {
  it('forwards subject/html/text + from/to to the underlying sender', async () => {
    const send = vi.fn(async () => ({ data: { id: 'msg-123' }, error: null }));
    const fake: EmailSender = { emails: { send } };

    const out = await sendEmail({
      sender: fake,
      from: 'Foodie <onboarding@resend.dev>',
      to: 'tom@example.com',
      subject: 'Test',
      html: '<p>hi</p>',
      text: 'hi',
    });

    expect(out).toEqual({ messageId: 'msg-123' });
    expect(send).toHaveBeenCalledOnce();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const args = (send.mock.calls as any)[0][0] as Parameters<EmailSender['emails']['send']>[0];
    expect(args.from).toBe('Foodie <onboarding@resend.dev>');
    expect(args.to).toEqual(['tom@example.com']);
    expect(args.subject).toBe('Test');
    expect(args.html).toBe('<p>hi</p>');
    expect(args.text).toBe('hi');
  });

  it('throws with a useful message when the sender returns an error', async () => {
    const send = vi.fn(async () => ({ data: null, error: { message: 'invalid api key' } }));
    const fake: EmailSender = { emails: { send } };

    await expect(
      sendEmail({
        sender: fake,
        from: 'x@y.z',
        to: 't@u.v',
        subject: 'x',
        html: 'x',
        text: 'x',
      })
    ).rejects.toThrow(/invalid api key/);
  });
});
