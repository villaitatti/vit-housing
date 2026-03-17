import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { INVITATION_EXPIRY_DAYS, PASSWORD_RESET_EXPIRY_HOURS, EMAIL_CHANGE_EXPIRY_HOURS } from '@vithousing/shared';
import { getEffectiveConfigValue } from './config.service.js';

let sesClient: SESClient | null = null;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function getSESConfig() {
  const region = await getEffectiveConfigValue('ses', 'region') || process.env.AWS_REGION || 'eu-west-1';
  const accessKeyId = await getEffectiveConfigValue('ses', 'access_key_id') || process.env.AWS_ACCESS_KEY_ID || '';
  const secretAccessKey = await getEffectiveConfigValue('ses', 'secret_access_key') || process.env.AWS_SECRET_ACCESS_KEY || '';
  const fromAddress = await getEffectiveConfigValue('ses', 'from_address') || process.env.SES_FROM_ADDRESS || 'noreply@example.com';
  const invitationBaseUrl = await getEffectiveConfigValue('ses', 'invitation_base_url') || process.env.INVITATION_BASE_URL || 'http://localhost:5175';
  return { region, accessKeyId, secretAccessKey, fromAddress, invitationBaseUrl };
}

async function getClient(): Promise<SESClient> {
  if (!sesClient) {
    const config = await getSESConfig();
    sesClient = new SESClient({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }
  return sesClient;
}

export function refreshSESClient(): void {
  sesClient = null;
}

interface InvitationEmailParams {
  to: string;
  token: string;
  role: string;
  lang: string;
  firstName?: string;
  lastName?: string;
  expiresAt: Date;
}

function formatInvitationExpiry(date: Date, lang: string): string {
  const locale = lang.toLowerCase() === 'it' ? 'it-IT' : 'en-US';

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Europe/Rome',
  }).format(date);
}

export async function sendInvitationEmail({
  to,
  token,
  role,
  lang,
  firstName,
  lastName,
  expiresAt,
}: InvitationEmailParams): Promise<void> {
  const config = await getSESConfig();
  const client = await getClient();
  const language = lang.toLowerCase();
  const registrationUrl = `${config.invitationBaseUrl}/${language}/register?token=${token}`;
  const recipientName = [firstName, lastName].filter(Boolean).join(' ').trim();
  const formattedExpiry = formatInvitationExpiry(expiresAt, language);

  const isEnglish = language === 'en';

  const subject = isEnglish
    ? 'You have been invited to Villa I Tatti Housing'
    : 'Sei stato invitato a Villa I Tatti Housing';

  const roleName = isEnglish
    ? role === 'HOUSE_LANDLORD'
      ? 'Landlord'
      : 'User'
    : role === 'HOUSE_LANDLORD'
      ? 'Proprietario'
      : 'Utente';

  const introCopy = isEnglish
    ? role === 'HOUSE_LANDLORD'
      ? 'You have been invited to join Villa I Tatti Housing as a landlord.'
      : 'You have been invited to join Villa I Tatti Housing as a user.'
    : role === 'HOUSE_LANDLORD'
      ? 'Sei stato invitato a unirti a Villa I Tatti Housing come proprietario.'
      : 'Sei stato invitato a unirti a Villa I Tatti Housing come utente.';

  const greeting = recipientName
    ? isEnglish
      ? `Hello ${recipientName},`
      : `Ciao ${recipientName},`
    : isEnglish
      ? 'Hello,'
      : 'Ciao,';

  const ctaLabel = isEnglish ? 'Complete Registration' : 'Completa la registrazione';
  const expiryCopy = isEnglish
    ? `This invitation is single use and expires on ${formattedExpiry} (Europe/Rome), ${INVITATION_EXPIRY_DAYS} days after it was sent.`
    : `Questo invito è monouso e scade il ${formattedExpiry} (Europa/Roma), ${INVITATION_EXPIRY_DAYS} giorni dopo l'invio.`;
  const ignoreCopy = isEnglish
    ? 'If you were not expecting this invitation, you can ignore this email.'
    : "Se non ti aspettavi questo invito, puoi ignorare questa email.";

  const htmlBody = isEnglish
    ? `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to Villa I Tatti Housing</h2>
        <p>${greeting}</p>
        <p>${introCopy}</p>
        <p>Click the button below to complete your registration as <strong>${roleName}</strong>.</p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="${registrationUrl}" style="background-color: #0f172a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            ${ctaLabel}
          </a>
        </p>
        <p style="color: #666; font-size: 14px;">${expiryCopy}</p>
        <p style="color: #666; font-size: 14px;">If the button doesn't work, copy this link: <a href="${registrationUrl}">${registrationUrl}</a></p>
        <p style="color: #666; font-size: 14px;">${ignoreCopy}</p>
      </div>
    `
    : `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Benvenuto su Villa I Tatti Housing</h2>
        <p>${greeting}</p>
        <p>${introCopy}</p>
        <p>Clicca il pulsante qui sotto per completare la registrazione come <strong>${roleName}</strong>.</p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="${registrationUrl}" style="background-color: #0f172a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            ${ctaLabel}
          </a>
        </p>
        <p style="color: #666; font-size: 14px;">${expiryCopy}</p>
        <p style="color: #666; font-size: 14px;">Se il pulsante non funziona, copia questo link: <a href="${registrationUrl}">${registrationUrl}</a></p>
        <p style="color: #666; font-size: 14px;">${ignoreCopy}</p>
      </div>
    `;

  const textBody = isEnglish
    ? `${greeting}

${introCopy}

Complete your registration as ${roleName}: ${registrationUrl}

${expiryCopy}

${ignoreCopy}`
    : `${greeting}

${introCopy}

Completa la registrazione come ${roleName}: ${registrationUrl}

${expiryCopy}

${ignoreCopy}`;

  const command = new SendEmailCommand({
    Source: config.fromAddress,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: {
        Html: { Data: htmlBody, Charset: 'UTF-8' },
        Text: { Data: textBody, Charset: 'UTF-8' },
      },
    },
  });

  await client.send(command);
}

interface EmailChangeVerificationParams {
  to: string;
  token: string;
  lang: string;
  firstName?: string;
}

export async function sendEmailChangeVerification({
  to,
  token,
  lang,
  firstName,
}: EmailChangeVerificationParams): Promise<void> {
  const config = await getSESConfig();
  const client = await getClient();
  const language = lang.toLowerCase();
  const confirmUrl = `${config.invitationBaseUrl}/${language}/confirm-email-change?token=${token}`;

  const isEnglish = language === 'en';
  const safeFirstName = firstName ? escapeHtml(firstName) : undefined;

  const subject = isEnglish
    ? 'Confirm your new email address — Villa I Tatti Housing'
    : 'Conferma il tuo nuovo indirizzo email — Villa I Tatti Housing';

  const greeting = safeFirstName
    ? isEnglish
      ? `Hello ${safeFirstName},`
      : `Ciao ${safeFirstName},`
    : isEnglish
      ? 'Hello,'
      : 'Ciao,';

  const introCopy = isEnglish
    ? 'You requested to change the email address on your Villa I Tatti Housing account to this address.'
    : 'Hai richiesto di cambiare l\'indirizzo email del tuo account Villa I Tatti Housing con questo indirizzo.';

  const ctaLabel = isEnglish ? 'Confirm Email Change' : 'Conferma Cambio Email';

  const expiryCopy = isEnglish
    ? `This link is single use and expires in ${EMAIL_CHANGE_EXPIRY_HOURS} hour(s).`
    : `Questo link è monouso e scade tra ${EMAIL_CHANGE_EXPIRY_HOURS} ora/e.`;

  const ignoreCopy = isEnglish
    ? 'If you did not request this change, you can ignore this email.'
    : 'Se non hai richiesto questo cambio, puoi ignorare questa email.';

  const htmlBody = isEnglish
    ? `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Confirm Your New Email</h2>
        <p>${greeting}</p>
        <p>${introCopy}</p>
        <p>Click the button below to confirm the change.</p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="${confirmUrl}" style="background-color: #0f172a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            ${ctaLabel}
          </a>
        </p>
        <p style="color: #666; font-size: 14px;">${expiryCopy}</p>
        <p style="color: #666; font-size: 14px;">If the button doesn't work, copy this link: <a href="${confirmUrl}">${confirmUrl}</a></p>
        <p style="color: #666; font-size: 14px;">${ignoreCopy}</p>
      </div>
    `
    : `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Conferma il Tuo Nuovo Indirizzo Email</h2>
        <p>${greeting}</p>
        <p>${introCopy}</p>
        <p>Clicca il pulsante qui sotto per confermare il cambio.</p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="${confirmUrl}" style="background-color: #0f172a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            ${ctaLabel}
          </a>
        </p>
        <p style="color: #666; font-size: 14px;">${expiryCopy}</p>
        <p style="color: #666; font-size: 14px;">Se il pulsante non funziona, copia questo link: <a href="${confirmUrl}">${confirmUrl}</a></p>
        <p style="color: #666; font-size: 14px;">${ignoreCopy}</p>
      </div>
    `;

  const textBody = isEnglish
    ? `${greeting}

${introCopy}

Confirm your email change: ${confirmUrl}

${expiryCopy}

${ignoreCopy}`
    : `${greeting}

${introCopy}

Conferma il cambio email: ${confirmUrl}

${expiryCopy}

${ignoreCopy}`;

  const command = new SendEmailCommand({
    Source: config.fromAddress,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: {
        Html: { Data: htmlBody, Charset: 'UTF-8' },
        Text: { Data: textBody, Charset: 'UTF-8' },
      },
    },
  });

  await client.send(command);
}

interface EmailChangedNotificationParams {
  to: string;
  newEmail: string;
  lang: string;
  firstName?: string;
}

export async function sendEmailChangedNotification({
  to,
  newEmail,
  lang,
  firstName,
}: EmailChangedNotificationParams): Promise<void> {
  const config = await getSESConfig();
  const client = await getClient();
  const language = lang.toLowerCase();

  const isEnglish = language === 'en';
  const safeFirstName = firstName ? escapeHtml(firstName) : undefined;
  const safeNewEmail = escapeHtml(newEmail);

  const subject = isEnglish
    ? 'Your email address has been changed — Villa I Tatti Housing'
    : 'Il tuo indirizzo email è stato modificato — Villa I Tatti Housing';

  const greeting = safeFirstName
    ? isEnglish
      ? `Hello ${safeFirstName},`
      : `Ciao ${safeFirstName},`
    : isEnglish
      ? 'Hello,'
      : 'Ciao,';

  const bodyCopy = isEnglish
    ? `The email address on your Villa I Tatti Housing account has been changed to <strong>${safeNewEmail}</strong>.`
    : `L'indirizzo email del tuo account Villa I Tatti Housing è stato modificato in <strong>${safeNewEmail}</strong>.`;

  const warningCopy = isEnglish
    ? 'If you did not make this change, please contact support immediately.'
    : 'Se non hai effettuato questa modifica, contatta immediatamente il supporto.';

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>${isEnglish ? 'Email Address Changed' : 'Indirizzo Email Modificato'}</h2>
      <p>${greeting}</p>
      <p>${bodyCopy}</p>
      <p style="color: #b91c1c; font-weight: bold;">${warningCopy}</p>
    </div>
  `;

  const textBody = isEnglish
    ? `${greeting}

The email address on your Villa I Tatti Housing account has been changed to ${newEmail}.

${warningCopy}`
    : `${greeting}

L'indirizzo email del tuo account Villa I Tatti Housing è stato modificato in ${newEmail}.

${warningCopy}`;

  const command = new SendEmailCommand({
    Source: config.fromAddress,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: {
        Html: { Data: htmlBody, Charset: 'UTF-8' },
        Text: { Data: textBody, Charset: 'UTF-8' },
      },
    },
  });

  await client.send(command);
}

interface PasswordResetEmailParams {
  to: string;
  token: string;
  lang: string;
  firstName?: string;
}

export async function sendPasswordResetEmail({
  to,
  token,
  lang,
  firstName,
}: PasswordResetEmailParams): Promise<void> {
  const config = await getSESConfig();
  const client = await getClient();
  const language = lang.toLowerCase();
  const resetUrl = `${config.invitationBaseUrl}/${language}/reset-password?token=${token}`;

  const isEnglish = language === 'en';

  const subject = isEnglish
    ? 'Reset your Villa I Tatti Housing password'
    : 'Reimposta la tua password di Villa I Tatti Housing';

  const greeting = firstName
    ? isEnglish
      ? `Hello ${firstName},`
      : `Ciao ${firstName},`
    : isEnglish
      ? 'Hello,'
      : 'Ciao,';

  const introCopy = isEnglish
    ? 'We received a request to reset your password for Villa I Tatti Housing.'
    : 'Abbiamo ricevuto una richiesta di reimpostazione della password per Villa I Tatti Housing.';

  const ctaLabel = isEnglish ? 'Reset Password' : 'Reimposta Password';

  const expiryCopy = isEnglish
    ? `This link is single use and expires in ${PASSWORD_RESET_EXPIRY_HOURS} hour(s).`
    : `Questo link è monouso e scade tra ${PASSWORD_RESET_EXPIRY_HOURS} ora/e.`;

  const ignoreCopy = isEnglish
    ? 'If you did not request a password reset, you can ignore this email.'
    : 'Se non hai richiesto la reimpostazione della password, puoi ignorare questa email.';

  const htmlBody = isEnglish
    ? `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Reset Your Password</h2>
        <p>${greeting}</p>
        <p>${introCopy}</p>
        <p>Click the button below to choose a new password.</p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background-color: #0f172a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            ${ctaLabel}
          </a>
        </p>
        <p style="color: #666; font-size: 14px;">${expiryCopy}</p>
        <p style="color: #666; font-size: 14px;">If the button doesn't work, copy this link: <a href="${resetUrl}">${resetUrl}</a></p>
        <p style="color: #666; font-size: 14px;">${ignoreCopy}</p>
      </div>
    `
    : `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Reimposta la Tua Password</h2>
        <p>${greeting}</p>
        <p>${introCopy}</p>
        <p>Clicca il pulsante qui sotto per scegliere una nuova password.</p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background-color: #0f172a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            ${ctaLabel}
          </a>
        </p>
        <p style="color: #666; font-size: 14px;">${expiryCopy}</p>
        <p style="color: #666; font-size: 14px;">Se il pulsante non funziona, copia questo link: <a href="${resetUrl}">${resetUrl}</a></p>
        <p style="color: #666; font-size: 14px;">${ignoreCopy}</p>
      </div>
    `;

  const textBody = isEnglish
    ? `${greeting}

${introCopy}

Reset your password: ${resetUrl}

${expiryCopy}

${ignoreCopy}`
    : `${greeting}

${introCopy}

Reimposta la password: ${resetUrl}

${expiryCopy}

${ignoreCopy}`;

  const command = new SendEmailCommand({
    Source: config.fromAddress,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: {
        Html: { Data: htmlBody, Charset: 'UTF-8' },
        Text: { Data: textBody, Charset: 'UTF-8' },
      },
    },
  });

  await client.send(command);
}
