import nodemailer from 'nodemailer'
import { logInfo, logError } from '../utils/logger.js'

interface EmailOptions {
  to: string
  subject: string
  html: string
  text?: string
}

class EmailService {
  private transporter: nodemailer.Transporter | null = null

  constructor() {
    this.initializeTransporter()
  }

  private initializeTransporter() {
    if (
      process.env.EMAIL_HOST &&
      process.env.EMAIL_USER &&
      process.env.EMAIL_PASS
    ) {
      this.transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT || '587'),
        secure: false, // true for 465, false for other ports
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      })
      logInfo('Email service initialized')
    } else {
      console.warn('⚠️ Email configuration not found. Email service will be disabled.')
    }
  }

  async sendEmail(options: EmailOptions): Promise<boolean> {
    if (!this.transporter) {
      console.warn('Email service not configured. Skipping email send.')
      return false
    }

    try {
      await this.transporter.sendMail({
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || options.html.replace(/<[^>]*>/g, ''),
      })
      logInfo(`Email sent successfully`, { to: options.to, subject: options.subject })
      return true
    } catch (error) {
      logError('Error sending email', error)
      return false
    }
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
            .content p {
              margin-bottom: 16px;
              color: #333;
              font-size: 16px;
            }
            .button-container {
              text-align: center;
              margin: 30px 0;
            }
            .button { 
              display: inline-block; 
              padding: 16px 40px; 
              background: #A8FF00; 
              color: #0E0E0E; 
              text-decoration: none; 
              border-radius: 8px; 
              font-weight: 600;
              font-size: 16px;
              transition: background 0.3s ease;
            }
            .button:hover {
              background: #8FE000;
            }
            .link-text {
              word-break: break-all; 
              color: #666; 
              font-size: 14px;
              background: #f5f5f5;
              padding: 12px;
              border-radius: 6px;
              margin: 20px 0;
            }
            .warning {
              background: #fff3cd;
              border-left: 4px solid #ffc107;
              padding: 16px;
              margin: 24px 0;
              border-radius: 4px;
            }
            .warning strong {
              color: #856404;
            }
            .footer {
              background: #f9f9f9;
              padding: 24px 30px;
              text-align: center;
              color: #666;
              font-size: 12px;
              border-top: 1px solid #e0e0e0;
            }
            .footer p {
              margin: 4px 0;
            }
            @media only screen and (max-width: 600px) {
              .content { padding: 30px 20px; }
              .header { padding: 30px 20px; }
              .header h1 { font-size: 24px; }
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
              <p>Thank you for joining Renotags! To complete your registration, please set up your password by clicking the button below:</p>
              
              <div class="button-container">
                <a href="${setupUrl}" class="button">Set Up Password</a>
              </div>

              <p>Or copy and paste this link into your browser:</p>
              <div class="link-text">${setupUrl}</div>

              <div class="warning">
                <strong>⚠️ Security Notice:</strong> This link will expire in 24 hours. If you didn't request this, please ignore this email.
              </div>

              <p>After setting up your password, you'll receive an email verification link to activate your account.</p>
              
              <p>Best regards,<br><strong>The Renotags Team</strong></p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} Renotags. All rights reserved.</p>
              <p>This is an automated message, please do not reply.</p>
            </div>
          </div>
        </body>
      </html>
    `

    return this.sendEmail({
      to: email,
      subject: 'Set Up Your Renotags Password',
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
          <title>Verify Your Email - Renotags</title>
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
            .content p {
              margin-bottom: 16px;
              color: #333;
              font-size: 16px;
            }
            .button-container {
              text-align: center;
              margin: 30px 0;
            }
            .button { 
              display: inline-block; 
              padding: 16px 40px; 
              background: #A8FF00; 
              color: #0E0E0E; 
              text-decoration: none; 
              border-radius: 8px; 
              font-weight: 600;
              font-size: 16px;
            }
            .button:hover {
              background: #8FE000;
            }
            .link-text {
              word-break: break-all; 
              color: #666; 
              font-size: 14px;
              background: #f5f5f5;
              padding: 12px;
              border-radius: 6px;
              margin: 20px 0;
            }
            .footer {
              background: #f9f9f9;
              padding: 24px 30px;
              text-align: center;
              color: #666;
              font-size: 12px;
              border-top: 1px solid #e0e0e0;
            }
            @media only screen and (max-width: 600px) {
              .content { padding: 30px 20px; }
              .header { padding: 30px 20px; }
            }
          </style>
        </head>
        <body>
          <div class="email-container">
            <div class="header">
              <h1>Verify Your Email 🎉</h1>
            </div>
            <div class="content">
              <p>Hi <strong>${name}</strong>,</p>
              <p>Thank you for setting up your password! Please verify your email address to complete your registration and access your dashboard.</p>
              
              <div class="button-container">
                <a href="${verificationUrl}" class="button">Verify Email Address</a>
              </div>

              <p>Or copy and paste this link into your browser:</p>
              <div class="link-text">${verificationUrl}</div>

              <p><strong>This link will expire in 24 hours.</strong></p>
              
              <p>Best regards,<br><strong>The Renotags Team</strong></p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} Renotags. All rights reserved.</p>
              <p>This is an automated message, please do not reply.</p>
            </div>
          </div>
        </body>
      </html>
    `

    return this.sendEmail({
      to: email,
      subject: 'Verify Your Renotags Email',
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
