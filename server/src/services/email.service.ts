import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { INVITATION_EXPIRY_DAYS } from '@vithousing/shared';
import { getEffectiveConfigValue } from './config.service.js';

let sesClient: SESClient | null = null;

async function getSESConfig() {
  const region = await getEffectiveConfigValue('ses', 'region') || process.env.AWS_REGION || 'eu-west-1';
  const accessKeyId = await getEffectiveConfigValue('ses', 'access_key_id') || process.env.AWS_ACCESS_KEY_ID || '';
  const secretAccessKey = await getEffectiveConfigValue('ses', 'secret_access_key') || process.env.AWS_SECRET_ACCESS_KEY || '';
  const fromAddress = await getEffectiveConfigValue('ses', 'from_address') || process.env.SES_FROM_ADDRESS || 'noreply@example.com';
  const invitationBaseUrl = await getEffectiveConfigValue('ses', 'invitation_base_url') || process.env.INVITATION_BASE_URL || 'http://localhost:5173';
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
