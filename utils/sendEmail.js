const nodemailer = require('nodemailer');

let emailProvider = '';

const sanitizeEnv = (value) => {
  if (value == null) return '';
  let v = String(value).replace(/^\uFEFF/, '').trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim();
  }
  return v;
};

const getFromConfig = () => {
  const fromEmail = sanitizeEnv(
    process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM || process.env.EMAIL_USER,
  );
  const fromName = sanitizeEnv(process.env.EMAIL_FROM_NAME) || 'Digital Ration System';
  return { fromEmail, fromName };
};

const getResendConfig = () => ({
  apiKey: sanitizeEnv(process.env.RESEND_API_KEY),
  ...getFromConfig(),
});

const getGmailConfig = () => {
  const user = sanitizeEnv(process.env.EMAIL_USER);
  const pass = sanitizeEnv(process.env.EMAIL_PASS).replace(/\s/g, '');
  if (!user || !pass || pass.includes('your_16_char')) {
    return { user: '', pass: '' };
  }
  return { user, pass };
};

const getAccountOwnerEmail = () =>
  sanitizeEnv(process.env.EMAIL_USER || process.env.RESEND_FROM_EMAIL).toLowerCase();

/** Resend without own domain can only deliver to the account owner email. */
const canUseResendForRecipient = (toEmail) => {
  const { apiKey } = getResendConfig();
  if (!apiKey || !apiKey.startsWith('re_')) return false;

  const owner = getAccountOwnerEmail();
  if (!owner) return true;

  return toEmail.toLowerCase() === owner;
};

const sendViaGmail = async ({ to, subject, html, text }) => {
  const { user, pass } = getGmailConfig();
  if (!user || !pass) {
    return {
      ok: false,
      error:
        'Gmail App Password required to email any user. Set EMAIL_PASS in server/.env — create at https://myaccount.google.com/apppasswords',
    };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user, pass },
    });

    await transporter.verify();
    await transporter.sendMail({
      from: `"Digital Ration System" <${user}>`,
      to,
      subject,
      html,
      ...(text ? { text } : {}),
    });

    emailProvider = 'gmail';
    return { ok: true };
  } catch (err) {
    const hint =
      err.message?.includes('535') || err.message?.includes('BadCredentials')
        ? 'Invalid Gmail App Password. Use a new 16-character App Password (not your normal Gmail password).'
        : err.message;
    return { ok: false, error: hint };
  }
};

const sendViaResend = async ({ to, subject, html, text }) => {
  const { apiKey, fromEmail, fromName } = getResendConfig();

  if (!apiKey) {
    return { ok: false, error: 'RESEND_API_KEY missing' };
  }

  if (!canUseResendForRecipient(to)) {
    return {
      ok: false,
      error:
        'Resend cannot send to other Gmail users without your own domain (gmail.com cannot be added). Use Gmail SMTP instead.',
    };
  }

  const fromCustom = fromEmail ? `${fromName} <${fromEmail}>` : null;
  const fromTest = `Digital Ration <onboarding@resend.dev>`;

  try {
    const { Resend } = require('resend');
    const resend = new Resend(apiKey);

    const attemptSend = async (from) =>
      resend.emails.send({ from, to: [to], subject, html, ...(text ? { text } : {}) });

    let result = fromCustom ? await attemptSend(fromCustom) : await attemptSend(fromTest);

    if (result.error && fromCustom) {
      const msg = String(result.error.message || '').toLowerCase();
      if (msg.includes('not verified') || msg.includes('domain')) {
        result = await attemptSend(fromTest);
      }
    }

    const { data, error } = result;
    if (error) {
      return { ok: false, error: error.message || JSON.stringify(error) };
    }

    emailProvider = 'resend';
    return { ok: true, id: data?.id };
  } catch (err) {
    return { ok: false, error: err.message || 'Resend send failed' };
  }
};

/** Gmail first — sends OTP to ANY Gmail/user address */
const sendEmail = async (payload) => {
  const gmail = await sendViaGmail(payload);
  if (gmail.ok) return gmail;

  if (canUseResendForRecipient(payload.to)) {
    const resend = await sendViaResend(payload);
    if (resend.ok) return resend;
    return { ok: false, error: gmail.error };
  }

  return { ok: false, error: gmail.error };
};

const verifyEmailConfig = async () => {
  emailProvider = '';
  const { user, pass } = getGmailConfig();
  const { apiKey } = getResendConfig();

  if (user && pass) {
    emailProvider = 'gmail';
    console.log(`✅ Gmail SMTP ready — can send OTP to ANY user email (${user})`);
    return true;
  }

  if (apiKey && apiKey.startsWith('re_')) {
    emailProvider = 'resend';
    const owner = getAccountOwnerEmail();
    console.log(`✅ Resend configured — OTP only works for: ${owner || 'account owner email'}`);
    console.warn('   To email ANY Gmail user, add Gmail App Password (EMAIL_PASS) in server/.env');
    return true;
  }

  console.warn('⚠️  No email configured. Add EMAIL_PASS (Gmail App Password) in server/.env');
  return false;
};

const isEmailConfigured = () => !!emailProvider;

const sendAdminLoginNotification = async (adminEmail, adminName) => {
  const loginTime = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'full',
    timeStyle: 'long',
  });

  const notifyTo = sanitizeEnv(process.env.ADMIN_NOTIFY_EMAIL) || getGmailConfig().user || getFromConfig().fromEmail;

  const result = await sendEmail({
    to: notifyTo,
    subject: 'Admin Login Alert - Digital Ration System',
    html: `
      <div style="font-family:Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h2>Admin Login Detected</h2>
        <p><strong>Name:</strong> ${adminName}</p>
        <p><strong>Email:</strong> ${adminEmail}</p>
        <p><strong>Time:</strong> ${loginTime}</p>
      </div>
    `,
  });

  if (result.ok) console.log(`✅ Admin login alert sent to ${notifyTo}`);
  return result.ok;
};

module.exports = {
  verifyEmailConfig,
  isEmailConfigured,
  sendAdminLoginNotification,
};
