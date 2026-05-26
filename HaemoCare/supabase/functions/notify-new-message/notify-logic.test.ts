import { resolveRecipientId, buildExpoMessages } from './notify-logic';

const LINK = { clinician_id: 'clin-1', patient_user_id: 'pat-1' };

describe('resolveRecipientId', () => {
  it('notifies the patient when the clinician sent the message', () => {
    expect(resolveRecipientId(LINK, 'clin-1')).toBe('pat-1');
  });

  it('notifies the clinician when the patient sent the message', () => {
    expect(resolveRecipientId(LINK, 'pat-1')).toBe('clin-1');
  });

  it('never returns the sender as the recipient', () => {
    expect(resolveRecipientId(LINK, 'clin-1')).not.toBe('clin-1');
    expect(resolveRecipientId(LINK, 'pat-1')).not.toBe('pat-1');
  });
});

describe('buildExpoMessages', () => {
  it('builds one payload per token with generic title + chat deep-link data', () => {
    const msgs = buildExpoMessages(['tok-a', 'tok-b'], 'hello', 'link-9');
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toEqual({
      to: 'tok-a',
      title: 'HaemoCare',
      body: 'hello',
      data: { type: 'chat', linkId: 'link-9' },
      sound: 'default',
    });
    expect(msgs[1].to).toBe('tok-b');
  });

  it('shows "📷 Photo" for an attachment-only (null/empty body) message', () => {
    expect(buildExpoMessages(['t'], null, 'l')[0].body).toBe('📷 Photo');
    expect(buildExpoMessages(['t'], '   ', 'l')[0].body).toBe('📷 Photo');
  });

  it('returns an empty array when there are no tokens', () => {
    expect(buildExpoMessages([], 'hi', 'l')).toEqual([]);
  });
});
