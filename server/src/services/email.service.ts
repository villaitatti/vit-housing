import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { getEffectiveConfigValue } from './config.service.js';

let sesClient: SESClient | null = null;

async function getSESConfig() {
  const region = await getEffectiveConfigValue('s3', 'region') || process.env.AWS_REGION || 'eu-west-1';
  const accessKeyId = await getEffectiveConfigValue('s3', 'access_key_id') || process.env.AWS_ACCESS_KEY_ID || '';
  const secretAccessKey = await getEffectiveConfigValue('s3', 'secret_access_key') || process.env.AWS_SECRET_ACCESS_KEY || '';
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

export async function sendInvitationEmail(
  to: string,
  token: string,
  role: string,
  lang: string,
): Promise<void> {
  const config = await getSESConfig();
  const client = await getClient();
  const language = lang.toLowerCase();
  const registrationUrl = `${config.invitationBaseUrl}/${language}/register?token=${token}`;

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

  const htmlBody = isEnglish
    ? `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to Villa I Tatti Housing</h2>
        <p>You have been invited to join the Villa I Tatti Housing platform as a <strong>${roleName}</strong>.</p>
        <p>Click the button below to complete your registration:</p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="${registrationUrl}" style="background-color: #0f172a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            Complete Registration
          </a>
        </p>
        <p style="color: #666; font-size: 14px;">This invitation expires in 7 days.</p>
        <p style="color: #666; font-size: 14px;">If the button doesn't work, copy this link: <a href="${registrationUrl}">${registrationUrl}</a></p>
      </div>
    `
    : `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Benvenuto su Villa I Tatti Housing</h2>
        <p>Sei stato invitato a unirti alla piattaforma Villa I Tatti Housing come <strong>${roleName}</strong>.</p>
        <p>Clicca il pulsante qui sotto per completare la registrazione:</p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="${registrationUrl}" style="background-color: #0f172a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            Completa Registrazione
          </a>
        </p>
        <p style="color: #666; font-size: 14px;">Questo invito scade tra 7 giorni.</p>
        <p style="color: #666; font-size: 14px;">Se il pulsante non funziona, copia questo link: <a href="${registrationUrl}">${registrationUrl}</a></p>
      </div>
    `;

  const command = new SendEmailCommand({
    Source: config.fromAddress,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: {
        Html: { Data: htmlBody, Charset: 'UTF-8' },
      },
    },
  });

  await client.send(command);
}
