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
    } catch (error) {
        console.log("Error sending message", error);
    }
};

// ── Email templates ──────────────────────────────────────────────────────────
async function sendRegistrationEmail(useremail, name) {
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

export default sendRegistrationEmail;
