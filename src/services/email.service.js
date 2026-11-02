import nodemailer from "nodemailer";
import { google } from "googleapis";

// ── OAuth2 client setup ──────────────────────────────────────────────────────
const oauth2Client = new google.auth.OAuth2(
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET,
    "https://developers.google.com/oauthplayground" // same redirect URI used when you generated the refresh token
);

oauth2Client.setCredentials({
    refresh_token: process.env.REFRESH_TOKEN,
});

// ── Build a fresh transporter with a live access token on every call ─────────
const createTransporter = async () => {
    // googleapis auto-refreshes the access token using your refresh token
    const { token: accessToken } = await oauth2Client.getAccessToken();
    return nodemailer.createTransport({
        service: "gmail",
        auth: {
            type: "OAuth2",
            user: process.env.EMAIL_USER,
            clientId: process.env.CLIENT_ID,
            clientSecret: process.env.CLIENT_SECRET,
            refreshToken: process.env.REFRESH_TOKEN,
            accessToken,           // ← the missing piece that caused the 530 error
        },
    });
};

// ── Verify connection once on startup (informational only) ───────────────────
createTransporter()
    .then((transporter) =>
        transporter.verify((error, success) => {
            if (error) {
                console.log("Error connecting to email service", error);
            } else {
                console.log("Mail is ready to send", success);
            }
        })
    )
    .catch((err) => console.log("OAuth2 token error on startup:", err.message));

// ── Core send helper ─────────────────────────────────────────────────────────
const sendMail = async (to, subject, text, html) => {
    try {
        const transporter = await createTransporter(); // fresh access token every time
        const info = await transporter.sendMail({
            from: `"Banking System" <${process.env.EMAIL_USER}>`,
            to,
            subject,
            text,
            html,
        });
        return info;
    } catch (error) {
        console.log("Error sending message", error);
        throw error;
    }
};

// ── Email templates ──────────────────────────────────────────────────────────
export async function sendLoginAlertEmail(userEmail, name, loginDetails = {}) {
    const timeString = loginDetails.time || new Date().toLocaleString("en-US", { timeZone: "Asia/Karachi" });
    const ipAddress = loginDetails.ip || "Unknown IP";
    const userAgent = loginDetails.device || "Unknown Browser / Device";

    const subject = `Security Notification: Successful Sign-in to Your Account`;
    const text = `Dear ${name},

A successful sign-in to your banking system account was detected.

Session Details:
- Date & Time: ${timeString}
- IP Address: ${ipAddress}
- Device: ${userAgent}

If you made this login, no action is needed.
If this was NOT you, please secure your account immediately or contact support.

Best regards,
Banking System Team`;

    const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="border-bottom: 2px solid #10b981; padding-bottom: 16px; margin-bottom: 20px;">
            <h2 style="color: #0f172a; margin: 0; font-size: 22px;">AURA Banking System</h2>
            <p style="color: #64748b; margin: 4px 0 0 0; font-size: 13px;">Security Notification & Access Verification</p>
        </div>

        <h3 style="color: #0f172a; font-size: 18px; margin-top: 0;">New Account Sign-in Detected</h3>
        <p style="color: #334155; font-size: 15px; line-height: 1.6;">Dear <strong>${name}</strong>,</p>
        <p style="color: #334155; font-size: 14px; line-height: 1.6;">
            A successful login to your banking account was registered. Below are the details of the active session:
        </p>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #334155;">
                <tr>
                    <td style="padding: 6px 0; font-weight: 600; width: 35%;">Date & Time:</td>
                    <td style="padding: 6px 0; color: #0f172a;">${timeString}</td>
                </tr>
                <tr>
                    <td style="padding: 6px 0; font-weight: 600;">IP Address:</td>
                    <td style="padding: 6px 0; color: #0f172a;">${ipAddress}</td>
                </tr>
                <tr>
                    <td style="padding: 6px 0; font-weight: 600;">Device / Browser:</td>
                    <td style="padding: 6px 0; color: #0f172a;">${userAgent}</td>
                </tr>
            </table>
        </div>

        <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 12px 16px; border-radius: 4px; margin-bottom: 24px;">
            <p style="color: #991b1b; font-size: 13px; margin: 0; line-height: 1.5;">
                <strong>Did not perform this login?</strong> If you do not recognize this sign-in activity, please secure your account immediately by resetting your password.
            </p>
        </div>

        <p style="color: #64748b; font-size: 12px; border-top: 1px solid #f1f5f9; padding-top: 16px; margin-top: 24px;">
            This is an automated system notification from the AURA Spatial Financial Banking System. Please do not reply directly to this email.
        </p>
    </div>
    `;

    await sendMail(userEmail, subject, text, html);
}

export async function sendRegistrationEmail(useremail, name) {
    const subject = `Welcome to our platform, ${name}`;
    const text = `Welcome to our platform, ${name}. You can now login to your account and explore all the features our platform has to offer.`;
    const html = `
    <h1>Welcome to Our Platform</h1>
    <p>Dear ${name},</p>
    <p>Thank you for joining our platform. We are excited to have you with us.</p>
    <p>You can now login to your account and explore all the features our platform has to offer.</p>
    <p>Best regards,</p>
    <p>The Banking System Team</p>
    `;
    await sendMail(useremail, subject, text, html);
}

export const sendTransactionEmail = async (userEmail, name, amount, toAccount, transaction = {}) => {
    const subject = "Transaction successfull";
    const text = `
    Dear ${name},

    This is confirmation that your transaction of ${amount} to account ${toAccount} has been successfully processed.

    Transaction ID: ${transaction?.id || "N/A"}
    Date: ${transaction?.date || new Date().toLocaleString()}
    Amount: ${amount}
    Status: ${transaction?.status || "COMPLETED"}

    If you did not authorize this transaction, please contact our support team immediately.

    Thank you,
    Banking System Team
    `;
    const html = `
    <h1>Transaction Confirmation</h1>
    <p>Dear ${name},</p>
    <p>This is confirmation that your transaction of ${amount} to account ${toAccount} has been successfully processed.</p>
    <p>Transaction ID: ${transaction?.id || "N/A"}</p>
    <p>Date: ${transaction?.date || new Date().toLocaleString()}</p>
    <p>Amount: ${amount}</p>
    <p>Status: ${transaction?.status || "COMPLETED"}</p>
    <p>If you did not authorize this transaction, please contact our support team immediately.</p>
    <p>Thank you,</p>
    <p>The Banking System Team</p>
    `;
    await sendMail(userEmail, subject, text, html);
};

export default sendRegistrationEmail;
