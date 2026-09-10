/**
 * @jest-environment node
 */

// api/send-contact.js reads process.env and builds its nodemailer transport at module
// load time, so each test sets the env it needs and re-requires the handler.

const mockSendMail = jest.fn();

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail: (...args) => mockSendMail(...args) }))
}));

const TO_CONTACT = 'info@gjsdillon.co.uk';
const TO_CRM = '6aa15b6a07cc4-gjs-dillon-uat@uat-app.co.uk';

const loadHandler = (env = {}) => {
  jest.resetModules();
  process.env.SMTP_HOST = 'smtp.example.com';
  process.env.SMTP_PORT = '587';
  process.env.SMTP_USER = 'user';
  process.env.SMTP_PASS = 'pass';
  delete process.env.TO_CONTACT;
  delete process.env.TO_CRM;
  Object.assign(process.env, env);
  return require('../api/send-contact.js');
};

const validBody = () => ({
  firstName: 'Test',
  lastName: 'Lead',
  email: 'someone@example.com',
  message: 'Please get in touch',
  gdprConsent: true
});

const makeReq = (body = validBody()) => ({ method: 'POST', headers: {}, body });

const makeRes = () => {
  const res = {};
  res.setHeader = jest.fn();
  res.end = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.status = jest.fn(() => res);
  return res;
};

const statusOf = (res) => res.status.mock.calls[0][0];

beforeEach(() => {
  mockSendMail.mockReset();
  mockSendMail.mockResolvedValue({});
});

describe('POST /api/send-contact', () => {
  it('sends the enquiry to both info@ and the CRM', async () => {
    const handler = loadHandler();
    const res = makeRes();

    await handler(makeReq(), res);

    expect(statusOf(res)).toBe(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
    expect(mockSendMail).toHaveBeenCalledTimes(2);

    const [primary, crm] = mockSendMail.mock.calls.map(([opts]) => opts);
    expect(primary.to).toBe(TO_CONTACT);
    expect(crm.to).toBe(TO_CRM);

    // The CRM copy must carry the same content and reply-to as the info@ copy,
    // differing only by recipient and the X-Origin marker.
    expect(crm.subject).toBe(primary.subject);
    expect(crm.html).toBe(primary.html);
    expect(crm.text).toBe(primary.text);
    expect(crm.replyTo).toBe('someone@example.com');
    expect(primary.headers['X-Origin']).toBe('standard-contact');
    expect(crm.headers['X-Origin']).toBe('standard-contact-crm');
  });

  it('still succeeds when the CRM send fails, having already sent to info@', async () => {
    const handler = loadHandler();
    const res = makeRes();
    jest.spyOn(console, 'error').mockImplementation(() => {});

    mockSendMail
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('CRM unreachable'));

    await handler(makeReq(), res);

    expect(statusOf(res)).toBe(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
    expect(mockSendMail).toHaveBeenCalledTimes(2);
    expect(mockSendMail.mock.calls[0][0].to).toBe(TO_CONTACT);

    console.error.mockRestore();
  });

  it('returns 500 when the info@ send fails', async () => {
    const handler = loadHandler();
    const res = makeRes();
    jest.spyOn(console, 'error').mockImplementation(() => {});

    mockSendMail.mockRejectedValueOnce(new Error('SMTP down'));

    await handler(makeReq(), res);

    expect(statusOf(res)).toBe(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to send contact email' });
    expect(mockSendMail).toHaveBeenCalledTimes(1);

    console.error.mockRestore();
  });

  it('sends only to info@ when TO_CRM is empty', async () => {
    const handler = loadHandler({ TO_CRM: '' });
    const res = makeRes();

    await handler(makeReq(), res);

    expect(statusOf(res)).toBe(200);
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail.mock.calls[0][0].to).toBe(TO_CONTACT);
  });

  it('honours TO_CONTACT and TO_CRM overrides', async () => {
    const handler = loadHandler({
      TO_CONTACT: 'someone-else@gjsdillon.co.uk',
      TO_CRM: 'live-crm@example.com'
    });
    const res = makeRes();

    await handler(makeReq(), res);

    expect(mockSendMail.mock.calls.map(([opts]) => opts.to))
      .toEqual(['someone-else@gjsdillon.co.uk', 'live-crm@example.com']);
  });

  it('rejects a submission without GDPR consent before sending anything', async () => {
    const handler = loadHandler();
    const res = makeRes();

    await handler(makeReq({ ...validBody(), gdprConsent: false }), res);

    expect(statusOf(res)).toBe(400);
    expect(mockSendMail).not.toHaveBeenCalled();
  });
});
