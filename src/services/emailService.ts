import nodemailer from 'nodemailer'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { logInfo, logError, logWarn } from '../utils/logger.js'

// Ensure environment variables are loaded
// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
// Load .env from the server root (two levels up from src/services)
dotenv.config({ path: join(__dirname, '../../.env') })

/**
 * Email Service - Provider-Agnostic Implementation
 * 
 * This service uses nodemailer with SMTP, but is designed to be easily migratable.
 * 
 * To migrate to a different email provider (e.g., SendGrid, AWS SES, Mailgun):
 * 1. Create a new adapter class implementing the IEmailProvider interface
 * 2. Update the EmailService class to use the new adapter
 * 3. Update environment variables accordingly
 * 
 * Current implementation supports:
 * - SMTP (nodemailer)
 * - Retry logic with exponential backoff
 * - Connection verification
 * - Comprehensive error logging
 * 
 * Example migration to SendGrid:
 * - Replace nodemailer with @sendgrid/mail
 * - Update sendEmail method to use SendGrid API
 * - Keep the same public interface (sendEmail, sendPasswordSetupEmail, etc.)
 */

interface EmailOptions {
  to: string
  subject: string
  html: string
  text?: string
}

class EmailService {
  private transporter: nodemailer.Transporter | null = null
  private isInitialized: boolean = false
  private initializationPromise: Promise<void> | null = null

  constructor() {
    // Ensure dotenv is loaded
    dotenv.config({ path: join(__dirname, '../../.env') })
    this.initializeTransporter()
    // Verify connection asynchronously and store promise
    this.initializationPromise = this.verifyConnection()
  }

  private initializeTransporter() {
    if (
      process.env.EMAIL_HOST &&
      process.env.EMAIL_USER &&
      process.env.EMAIL_PASS
    ) {
      const port = parseInt(process.env.EMAIL_PORT || '587')
      const isSecure = port === 465
      const isMailerSend = process.env.EMAIL_HOST.includes('mailersend')

      // MailerSend specific configuration
      const transporterConfig: any = {
        host: process.env.EMAIL_HOST,
        port: port,
        secure: isSecure, // true for 465, false for other ports
        requireTLS: !isSecure, // Require TLS for non-SSL ports (like 587)
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
        tls: {
          // Do not fail on invalid certificates
          rejectUnauthorized: false,
          ciphers: 'SSLv3',
        },
      }

      // MailerSend specific settings
      if (isMailerSend) {
        transporterConfig.secure = false // MailerSend uses STARTTLS on port 587
        transporterConfig.requireTLS = true
        transporterConfig.tls = {
          rejectUnauthorized: false,
          ciphers: 'SSLv3',
        }
      }

      this.transporter = nodemailer.createTransport(transporterConfig)

      logInfo('Email service transporter created', {
        host: process.env.EMAIL_HOST,
        port: port,
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        isMailerSend,
        secure: transporterConfig.secure,
        requireTLS: transporterConfig.requireTLS,
      })
    } else {
      const missing = []
      if (!process.env.EMAIL_HOST) missing.push('EMAIL_HOST')
      if (!process.env.EMAIL_USER) missing.push('EMAIL_USER')
      if (!process.env.EMAIL_PASS) missing.push('EMAIL_PASS')
      logWarn('Email configuration incomplete. Email service will be disabled.', {
        missing: missing.join(', '),
      })
    }
  }

  private async verifyConnection(): Promise<void> {
    if (!this.transporter) {
      logWarn('Email transporter not initialized, cannot verify connection', {
        hasHost: !!process.env.EMAIL_HOST,
        hasUser: !!process.env.EMAIL_USER,
        hasPass: !!process.env.EMAIL_PASS,
      })
      return
    }

    try {
      logInfo('Verifying email service connection...', {
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT,
        user: process.env.EMAIL_USER,
      })
      await this.transporter.verify()
      this.isInitialized = true
      logInfo('Email service connection verified successfully', {
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT,
      })
    } catch (error: any) {
      logError('Email service connection verification failed', {
        error: error.message,
        code: error.code,
        command: error.command,
        response: error.response,
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT,
        user: process.env.EMAIL_USER,
        stack: error.stack,
      })
      // Don't set transporter to null, allow retry on first send
      this.isInitialized = false
    }
  }

  async sendEmail(options: EmailOptions, retries: number = 3): Promise<boolean> {
    // Wait for initialization to complete if still in progress
    if (this.initializationPromise) {
      await this.initializationPromise
      this.initializationPromise = null
    }

    if (!this.transporter) {
      logWarn('Email service not configured. Skipping email send.', {
        hasTransporter: false,
        emailHost: process.env.EMAIL_HOST ? 'set' : 'missing',
        emailUser: process.env.EMAIL_USER ? 'set' : 'missing',
        emailPass: process.env.EMAIL_PASS ? 'set' : 'missing',
      })
      return false
    }

    // If not yet verified, try to verify now (in case verification is still pending)
    if (!this.isInitialized) {
      await this.verifyConnection()
      if (!this.isInitialized) {
        logWarn('Email service connection not verified. Attempting to send anyway...', {
          host: process.env.EMAIL_HOST,
          port: process.env.EMAIL_PORT,
          user: process.env.EMAIL_USER,
        })
      }
    }

    const fromEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER
    if (!fromEmail) {
      logError('EMAIL_FROM and EMAIL_USER are both missing. Cannot send email.', {
        emailFrom: process.env.EMAIL_FROM,
        emailUser: process.env.EMAIL_USER,
      })
      return false
    }

    // Retry logic with exponential backoff
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        logInfo('Attempting to send email', {
          to: options.to,
          subject: options.subject,
          from: fromEmail,
          host: process.env.EMAIL_HOST,
          port: process.env.EMAIL_PORT,
          attempt: `${attempt}/${retries}`,
        })

        const info = await this.transporter.sendMail({
          from: fromEmail,
          to: options.to,
          subject: options.subject,
          html: options.html,
          text: options.text || options.html.replace(/<[^>]*>/g, ''),
        })
        
        logInfo('Email sent successfully', {
          to: options.to,
          subject: options.subject,
          messageId: info.messageId,
          response: info.response,
          accepted: info.accepted,
          rejected: info.rejected,
          attempt,
        })
        return true
      } catch (error: any) {
        const isLastAttempt = attempt === retries
        const shouldRetry = !isLastAttempt && (
          error.code === 'ECONNRESET' ||
          error.code === 'ETIMEDOUT' ||
          error.code === 'ECONNREFUSED' ||
          error.response?.includes('timeout') ||
          error.response?.includes('connection')
        )

        logError(`Error sending email (attempt ${attempt}/${retries})`, {
          error: error.message,
          code: error.code,
          command: error.command,
          response: error.response,
          to: options.to,
          subject: options.subject,
          host: process.env.EMAIL_HOST,
          port: process.env.EMAIL_PORT,
          user: process.env.EMAIL_USER,
          willRetry: shouldRetry,
          stack: error.stack,
        })

        if (shouldRetry) {
          // Exponential backoff: wait 1s, 2s, 4s...
          const delay = Math.pow(2, attempt - 1) * 1000
          logInfo(`Retrying email send after ${delay}ms...`, {
            to: options.to,
            attempt: attempt + 1,
          })
          await new Promise(resolve => setTimeout(resolve, delay))
          
          // Try to reinitialize transporter if connection was lost
          if (error.code === 'ECONNRESET' || error.code === 'ECONNREFUSED') {
            this.initializeTransporter()
            await this.verifyConnection()
          }
        } else {
          // Last attempt failed or non-retryable error
          return false
        }
      }
    }

    return false
  }

  async sendPasswordSetupEmail(email: string, name: string, setupUrl: string): Promise<boolean> {
    const html = `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="X-UA-Compatible" content="IE=edge">
          <title>Setup Your Renotags Password</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              line-height: 1.6; 
              color: #333; 
              background: linear-gradient(135deg, #0E0E0E 0%, #1a1a1a 100%);
              padding: 20px;
              min-height: 100vh;
            }
            .email-wrapper {
              max-width: 600px; 
              margin: 0 auto;
            }
            .email-container { 
              background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
              border-radius: 16px;
              overflow: hidden;
              box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
              border: 1px solid rgba(168, 255, 0, 0.2);
            }
            .header { 
              background: linear-gradient(135deg, #A8FF00 0%, #06B6D4 100%); 
              color: #0E0E0E; 
              padding: 50px 30px; 
              text-align: center;
              position: relative;
              overflow: hidden;
            }
            .header::before {
              content: '';
              position: absolute;
              top: -50%;
              left: -50%;
              width: 200%;
              height: 200%;
              background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
              animation: pulse 3s ease-in-out infinite;
            }
            @keyframes pulse {
              0%, 100% { transform: scale(1); opacity: 0.5; }
              50% { transform: scale(1.1); opacity: 0.8; }
            }
            .header h1 { 
              margin: 0 0 10px 0; 
              font-size: 32px; 
              font-weight: 800;
              position: relative;
              z-index: 1;
            }
            .header .icon {
              font-size: 48px;
              margin-bottom: 10px;
              position: relative;
              z-index: 1;
            }
            .content { 
              background: #ffffff; 
              padding: 50px 40px; 
            }
            .content p {
              margin-bottom: 20px;
              color: #333;
              font-size: 16px;
              line-height: 1.8;
            }
            .content strong {
              color: #0E0E0E;
              font-weight: 600;
            }
            .button-container {
              text-align: center;
              margin: 40px 0;
            }
            .button { 
              display: inline-block; 
              padding: 18px 48px; 
              background: linear-gradient(135deg, #A8FF00 0%, #8FE000 100%);
              color: #0E0E0E; 
              text-decoration: none; 
              border-radius: 12px; 
              font-weight: 700;
              font-size: 16px;
              box-shadow: 0 4px 15px rgba(168, 255, 0, 0.4);
              transition: all 0.3s ease;
              letter-spacing: 0.5px;
            }
            .button:hover {
              transform: translateY(-2px);
              box-shadow: 0 6px 20px rgba(168, 255, 0, 0.6);
            }
            .link-container {
              background: #f8f9fa;
              border-left: 4px solid #A8FF00;
              padding: 20px;
              border-radius: 8px;
              margin: 30px 0;
            }
            .link-text {
              word-break: break-all; 
              color: #666; 
              font-size: 13px;
              font-family: 'Courier New', monospace;
              line-height: 1.6;
            }
            .info-box {
              background: #e3f2fd;
              border-left: 4px solid #2196F3;
              padding: 20px;
              margin: 30px 0;
              border-radius: 8px;
            }
            .info-box strong {
              color: #1976D2;
              display: block;
              margin-bottom: 10px;
              font-size: 16px;
            }
            .info-box p {
              margin: 0;
              color: #1565C0;
              font-size: 14px;
              line-height: 1.6;
            }
            .steps {
              background: #f0f4ff;
              border-radius: 8px;
              padding: 25px;
              margin: 30px 0;
            }
            .steps h3 {
              color: #0E0E0E;
              margin-bottom: 15px;
              font-size: 18px;
            }
            .steps ol {
              margin-left: 20px;
              color: #333;
            }
            .steps li {
              margin-bottom: 10px;
              line-height: 1.6;
            }
            .footer {
              background: #0E0E0E;
              padding: 30px;
              text-align: center;
              color: #888;
              font-size: 12px;
              border-top: 1px solid rgba(168, 255, 0, 0.1);
            }
            .footer p {
              margin: 6px 0;
              color: #888;
            }
            .footer a {
              color: #A8FF00;
              text-decoration: none;
            }
            @media only screen and (max-width: 600px) {
              .content { padding: 35px 25px; }
              .header { padding: 40px 25px; }
              .header h1 { font-size: 26px; }
              .button { padding: 16px 36px; font-size: 15px; }
            }
          </style>
        </head>
        <body>
          <div class="email-wrapper">
            <div class="email-container">
              <div class="header">
                <div class="icon">🎉</div>
                <h1>Welcome to Renotags!</h1>
                <p style="margin: 0; font-size: 16px; opacity: 0.9;">Let's get you started</p>
              </div>
              <div class="content">
                <p>Hi <strong>${name}</strong>,</p>
                <p>Thank you for joining Renotags! We're thrilled to have you on board. To complete your registration and start your journey with us, please set up your password by clicking the button below:</p>
                
                <div class="button-container">
                  <a href="${setupUrl}" class="button">Set Up My Password</a>
                </div>

                <div class="link-container">
                  <p style="margin: 0 0 10px 0; font-size: 14px; color: #666; font-weight: 600;">Or copy and paste this link:</p>
                  <div class="link-text">${setupUrl}</div>
                </div>

                <div class="steps">
                  <h3>What happens next?</h3>
                  <ol>
                    <li>Click the button above to set up your password</li>
                    <li>Choose a strong, secure password</li>
                    <li>You'll receive an email verification link</li>
                    <li>Verify your email to activate your account</li>
                    <li>Start earning points and exploring Renotags!</li>
                  </ol>
                </div>

                <div class="info-box">
                  <strong>⏰ Link Expiration</strong>
                  <p>This setup link will expire in 24 hours for security reasons. If it expires, please contact our support team for assistance.</p>
                </div>

                <p style="margin-top: 30px;">If you didn't sign up for Renotags, you can safely ignore this email.</p>
                
                <p style="margin-top: 30px;">Best regards,<br><strong style="color: #A8FF00;">The Renotags Team</strong></p>
              </div>
              <div class="footer">
                <p>© ${new Date().getFullYear()} Renotags. All rights reserved.</p>
                <p>This is an automated message, please do not reply.</p>
                <p style="margin-top: 15px;">
                  <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}">Visit Renotags</a> | 
                  <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/privacy">Privacy Policy</a>
                </p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `

    return this.sendEmail({
      to: email,
      subject: '🎉 Welcome to Renotags - Set Up Your Password',
      html,
    })
  }

  async sendVerificationEmail(email: string, name: string, verificationUrl: string): Promise<boolean> {
    const html = `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="X-UA-Compatible" content="IE=edge">
          <title>Verify Your Email - Renotags</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              line-height: 1.6; 
              color: #333; 
              background: linear-gradient(135deg, #0E0E0E 0%, #1a1a1a 100%);
              padding: 20px;
              min-height: 100vh;
            }
            .email-wrapper {
              max-width: 600px; 
              margin: 0 auto;
            }
            .email-container { 
              background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
              border-radius: 16px;
              overflow: hidden;
              box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
              border: 1px solid rgba(168, 255, 0, 0.2);
            }
            .header { 
              background: linear-gradient(135deg, #A8FF00 0%, #06B6D4 100%); 
              color: #0E0E0E; 
              padding: 50px 30px; 
              text-align: center;
              position: relative;
              overflow: hidden;
            }
            .header::before {
              content: '';
              position: absolute;
              top: -50%;
              left: -50%;
              width: 200%;
              height: 200%;
              background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
              animation: pulse 3s ease-in-out infinite;
            }
            @keyframes pulse {
              0%, 100% { transform: scale(1); opacity: 0.5; }
              50% { transform: scale(1.1); opacity: 0.8; }
            }
            .header h1 { 
              margin: 0 0 10px 0; 
              font-size: 32px; 
              font-weight: 800;
              position: relative;
              z-index: 1;
            }
            .header .icon {
              font-size: 48px;
              margin-bottom: 10px;
              position: relative;
              z-index: 1;
            }
            .content { 
              background: #ffffff; 
              padding: 50px 40px; 
            }
            .content p {
              margin-bottom: 20px;
              color: #333;
              font-size: 16px;
              line-height: 1.8;
            }
            .content strong {
              color: #0E0E0E;
              font-weight: 600;
            }
            .button-container {
              text-align: center;
              margin: 40px 0;
            }
            .button { 
              display: inline-block; 
              padding: 18px 48px; 
              background: linear-gradient(135deg, #A8FF00 0%, #8FE000 100%);
              color: #0E0E0E; 
              text-decoration: none; 
              border-radius: 12px; 
              font-weight: 700;
              font-size: 16px;
              box-shadow: 0 4px 15px rgba(168, 255, 0, 0.4);
              transition: all 0.3s ease;
              letter-spacing: 0.5px;
            }
            .button:hover {
              transform: translateY(-2px);
              box-shadow: 0 6px 20px rgba(168, 255, 0, 0.6);
            }
            .link-container {
              background: #f8f9fa;
              border-left: 4px solid #A8FF00;
              padding: 20px;
              border-radius: 8px;
              margin: 30px 0;
            }
            .link-text {
              word-break: break-all; 
              color: #666; 
              font-size: 13px;
              font-family: 'Courier New', monospace;
              line-height: 1.6;
            }
            .info-box {
              background: #e3f2fd;
              border-left: 4px solid #2196F3;
              padding: 16px;
              margin: 30px 0;
              border-radius: 6px;
            }
            .info-box strong {
              color: #1976D2;
              display: block;
              margin-bottom: 8px;
            }
            .info-box p {
              margin: 0;
              color: #1565C0;
              font-size: 14px;
            }
            .footer {
              background: #0E0E0E;
              padding: 30px;
              text-align: center;
              color: #888;
              font-size: 12px;
              border-top: 1px solid rgba(168, 255, 0, 0.1);
            }
            .footer p {
              margin: 6px 0;
              color: #888;
            }
            .footer a {
              color: #A8FF00;
              text-decoration: none;
            }
            @media only screen and (max-width: 600px) {
              .content { padding: 35px 25px; }
              .header { padding: 40px 25px; }
              .header h1 { font-size: 26px; }
              .button { padding: 16px 36px; font-size: 15px; }
            }
          </style>
        </head>
        <body>
          <div class="email-wrapper">
            <div class="email-container">
              <div class="header">
                <div class="icon">✨</div>
                <h1>Verify Your Email</h1>
                <p style="margin: 0; font-size: 16px; opacity: 0.9;">Complete your Renotags registration</p>
              </div>
              <div class="content">
                <p>Hi <strong>${name}</strong>,</p>
                <p>Thank you for setting up your password! We're excited to have you join the Renotags community. To complete your registration and access all features, please verify your email address.</p>
                
                <div class="button-container">
                  <a href="${verificationUrl}" class="button">Verify Email Address</a>
                </div>

                <div class="link-container">
                  <p style="margin: 0 0 10px 0; font-size: 14px; color: #666; font-weight: 600;">Or copy and paste this link:</p>
                  <div class="link-text">${verificationUrl}</div>
                </div>

                <div class="info-box">
                  <strong>⏰ Link Expiration</strong>
                  <p>This verification link will expire in 24 hours for security reasons. If it expires, you can request a new verification email from your dashboard.</p>
                </div>

                <p style="margin-top: 30px;">If you didn't create a Renotags account, you can safely ignore this email.</p>
                
                <p style="margin-top: 30px;">Best regards,<br><strong style="color: #A8FF00;">The Renotags Team</strong></p>
              </div>
              <div class="footer">
                <p>© ${new Date().getFullYear()} Renotags. All rights reserved.</p>
                <p>This is an automated message, please do not reply.</p>
                <p style="margin-top: 15px;">
                  <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}">Visit Renotags</a> | 
                  <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/privacy">Privacy Policy</a>
                </p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `

    return this.sendEmail({
      to: email,
      subject: '✨ Verify Your Renotags Email',
      html,
    })
  }

  async sendOnboardingConfirmation(email: string, name: string): Promise<boolean> {
    const html = `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Welcome to Renotags</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              line-height: 1.6; 
              color: #333; 
              background-color: #f4f4f4;
              padding: 20px;
            }
            .email-container { 
              max-width: 600px; 
              margin: 0 auto; 
              background-color: #ffffff;
              border-radius: 12px;
              overflow: hidden;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            .header { 
              background: linear-gradient(135deg, #A8FF00 0%, #0E0E0E 100%); 
              color: white; 
              padding: 40px 30px; 
              text-align: center; 
            }
            .header h1 { 
              margin: 0; 
              font-size: 28px; 
              font-weight: 700;
            }
            .content { 
              background: #ffffff; 
              padding: 40px 30px; 
            }
            .content ul {
              margin: 20px 0;
              padding-left: 20px;
            }
            .content li {
              margin: 8px 0;
              color: #333;
            }
            .footer {
              background: #f9f9f9;
              padding: 24px 30px;
              text-align: center;
              color: #666;
              font-size: 12px;
              border-top: 1px solid #e0e0e0;
            }
          </style>
        </head>
        <body>
          <div class="email-container">
            <div class="header">
              <h1>Welcome to Renotags! 🎉</h1>
            </div>
            <div class="content">
              <p>Hi <strong>${name}</strong>,</p>
              <p>Thank you for joining the Renotags onboarding! We're excited to have you on board.</p>
              <p>You're now part of an exclusive group that will get:</p>
              <ul>
                <li>Early access to cross-chain naming tools</li>
                <li>VIP perks and airdrop alerts</li>
                <li>Product updates and community unlocks</li>
              </ul>
              <p>We'll keep you updated on all the latest developments. Stay tuned!</p>
              <p>Best regards,<br><strong>The Renotags Team</strong></p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} Renotags. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `

    return this.sendEmail({
      to: email,
      subject: 'Welcome to Renotags - Onboarding Confirmation',
      html,
    })
  }

  async sendPasswordResetEmail(email: string, name: string, resetUrl: string): Promise<boolean> {
    const html = `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="X-UA-Compatible" content="IE=edge">
          <title>Reset Your Password - Renotags</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              line-height: 1.6; 
              color: #333; 
              background: linear-gradient(135deg, #0E0E0E 0%, #1a1a1a 100%);
              padding: 20px;
              min-height: 100vh;
            }
            .email-wrapper {
              max-width: 600px; 
              margin: 0 auto;
            }
            .email-container { 
              background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
              border-radius: 16px;
              overflow: hidden;
              box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
              border: 1px solid rgba(168, 255, 0, 0.2);
            }
            .header { 
              background: linear-gradient(135deg, #A8FF00 0%, #06B6D4 100%); 
              color: #0E0E0E; 
              padding: 50px 30px; 
              text-align: center;
              position: relative;
              overflow: hidden;
            }
            .header::before {
              content: '';
              position: absolute;
              top: -50%;
              left: -50%;
              width: 200%;
              height: 200%;
              background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
              animation: pulse 3s ease-in-out infinite;
            }
            @keyframes pulse {
              0%, 100% { transform: scale(1); opacity: 0.5; }
              50% { transform: scale(1.1); opacity: 0.8; }
            }
            .header h1 { 
              margin: 0 0 10px 0; 
              font-size: 32px; 
              font-weight: 800;
              position: relative;
              z-index: 1;
            }
            .header .icon {
              font-size: 48px;
              margin-bottom: 10px;
              position: relative;
              z-index: 1;
            }
            .content { 
              background: #ffffff; 
              padding: 50px 40px; 
            }
            .content p {
              margin-bottom: 20px;
              color: #333;
              font-size: 16px;
              line-height: 1.8;
            }
            .content strong {
              color: #0E0E0E;
              font-weight: 600;
            }
            .button-container {
              text-align: center;
              margin: 40px 0;
            }
            .button { 
              display: inline-block; 
              padding: 18px 48px; 
              background: linear-gradient(135deg, #A8FF00 0%, #8FE000 100%);
              color: #0E0E0E; 
              text-decoration: none; 
              border-radius: 12px; 
              font-weight: 700;
              font-size: 16px;
              box-shadow: 0 4px 15px rgba(168, 255, 0, 0.4);
              transition: all 0.3s ease;
              letter-spacing: 0.5px;
            }
            .button:hover {
              transform: translateY(-2px);
              box-shadow: 0 6px 20px rgba(168, 255, 0, 0.6);
            }
            .link-container {
              background: #f8f9fa;
              border-left: 4px solid #A8FF00;
              padding: 20px;
              border-radius: 8px;
              margin: 30px 0;
            }
            .link-text {
              word-break: break-all; 
              color: #666; 
              font-size: 13px;
              font-family: 'Courier New', monospace;
              line-height: 1.6;
            }
            .warning {
              background: #fff3cd;
              border-left: 4px solid #ff9800;
              padding: 20px;
              margin: 30px 0;
              border-radius: 8px;
            }
            .warning strong {
              color: #e65100;
              display: block;
              margin-bottom: 10px;
              font-size: 16px;
            }
            .warning p {
              margin: 0;
              color: #856404;
              font-size: 14px;
              line-height: 1.6;
            }
            .security-box {
              background: #f3e5f5;
              border-left: 4px solid #9c27b0;
              padding: 20px;
              margin: 30px 0;
              border-radius: 8px;
            }
            .security-box strong {
              color: #7b1fa2;
              display: block;
              margin-bottom: 10px;
              font-size: 16px;
            }
            .security-box p {
              margin: 0;
              color: #6a1b9a;
              font-size: 14px;
              line-height: 1.6;
            }
            .footer {
              background: #0E0E0E;
              padding: 30px;
              text-align: center;
              color: #888;
              font-size: 12px;
              border-top: 1px solid rgba(168, 255, 0, 0.1);
            }
            .footer p {
              margin: 6px 0;
              color: #888;
            }
            .footer a {
              color: #A8FF00;
              text-decoration: none;
            }
            @media only screen and (max-width: 600px) {
              .content { padding: 35px 25px; }
              .header { padding: 40px 25px; }
              .header h1 { font-size: 26px; }
              .button { padding: 16px 36px; font-size: 15px; }
            }
          </style>
        </head>
        <body>
          <div class="email-wrapper">
            <div class="email-container">
              <div class="header">
                <div class="icon">🔒</div>
                <h1>Reset Your Password</h1>
                <p style="margin: 0; font-size: 16px; opacity: 0.9;">Secure your Renotags account</p>
              </div>
              <div class="content">
                <p>Hi <strong>${name}</strong>,</p>
                <p>We received a request to reset your password for your Renotags account. No worries - it happens to the best of us! Click the button below to create a new secure password:</p>
                
                <div class="button-container">
                  <a href="${resetUrl}" class="button">Reset My Password</a>
                </div>

                <div class="link-container">
                  <p style="margin: 0 0 10px 0; font-size: 14px; color: #666; font-weight: 600;">Or copy and paste this link:</p>
                  <div class="link-text">${resetUrl}</div>
                </div>

                <div class="warning">
                  <strong>⏰ Link Expiration</strong>
                  <p>This password reset link will expire in <strong>1 hour</strong> for security reasons. If it expires, you can request a new one from the login page.</p>
                </div>

                <div class="security-box">
                  <strong>🔐 Security Notice</strong>
                  <p>If you didn't request a password reset, please ignore this email. Your password will remain unchanged and your account is secure. If you're concerned about your account security, please contact our support team immediately.</p>
                </div>

                <p style="margin-top: 30px;">Best regards,<br><strong style="color: #A8FF00;">The Renotags Team</strong></p>
              </div>
              <div class="footer">
                <p>© ${new Date().getFullYear()} Renotags. All rights reserved.</p>
                <p>This is an automated message, please do not reply.</p>
                <p style="margin-top: 15px;">
                  <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}">Visit Renotags</a> | 
                  <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/privacy">Privacy Policy</a>
                </p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `

    return this.sendEmail({
      to: email,
      subject: '🔒 Reset Your Renotags Password',
      html,
    })
  }

  async sendOnboardingUpdate(email: string, name: string, step: number): Promise<boolean> {
    const html = `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Onboarding Update - Renotags</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              line-height: 1.6; 
              color: #333; 
              background-color: #f4f4f4;
              padding: 20px;
            }
            .email-container { 
              max-width: 600px; 
              margin: 0 auto; 
              background-color: #ffffff;
              border-radius: 12px;
              overflow: hidden;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            .header { 
              background: linear-gradient(135deg, #A8FF00 0%, #06B6D4 100%); 
              color: #0E0E0E; 
              padding: 40px 30px; 
              text-align: center; 
            }
            .header h1 { 
              margin: 0; 
              font-size: 28px; 
              font-weight: 700;
            }
            .content { 
              background: #ffffff; 
              padding: 40px 30px; 
            }
            .footer {
              background: #f9f9f9;
              padding: 24px 30px;
              text-align: center;
              color: #666;
              font-size: 12px;
              border-top: 1px solid #e0e0e0;
            }
          </style>
        </head>
        <body>
          <div class="email-container">
            <div class="header">
              <h1>Onboarding Update 📧</h1>
            </div>
            <div class="content">
              <p>Hi <strong>${name}</strong>,</p>
              <p>Great progress! You've completed step <strong>${step}</strong> of your onboarding.</p>
              <p>Keep going to unlock all the benefits of Renotags!</p>
              <p>Best regards,<br><strong>The Renotags Team</strong></p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} Renotags. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `

    return this.sendEmail({
      to: email,
      subject: `Renotags Onboarding - Step ${step} Complete`,
      html,
    })
  }
}

export const emailService = new EmailService()
