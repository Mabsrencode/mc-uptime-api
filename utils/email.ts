import nodemailer from "nodemailer";
import environments from "../lib/environments";
import logger from "./loggers";
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: environments.EMAIL_USER,
    pass: environments.EMAIL_PASS,
  },
});

export async function sendEmail(to: string, subject: string, text: string) {
  const mailOptions = {
    from: environments.EMAIL_USER,
    to,
    subject,
    text,
  };

  try {
    await transporter.sendMail(mailOptions);
    logger.info(`Email sent to ${to}`);
  } catch (error) {
    logger.error("Error sending email:", error);
  }
}
