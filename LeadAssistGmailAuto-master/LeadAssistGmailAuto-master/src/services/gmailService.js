const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class GmailService {
  constructor() {
    this.gmail = null;
    this.auth = null;
    this.initialized = false;
  }

  async initialize() {
    try {
      // Use OAuth2 for Gmail API (service accounts can't send emails from personal Gmail)
      if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN) {
        this.auth = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
          process.env.GOOGLE_REDIRECT_URI || 'urn:ietf:wg:oauth:2.0:oob'
        );
        
        this.auth.setCredentials({
          refresh_token: process.env.GOOGLE_REFRESH_TOKEN
        });
      } else {
        throw new Error('Gmail OAuth2 credentials not found. Please set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN environment variables.');
      }

      this.gmail = google.gmail({ version: 'v1', auth: this.auth });
      this.initialized = true;
      logger.info('Gmail service initialized successfully with OAuth2');
    } catch (error) {
      logger.error('Failed to initialize Gmail service:', error);
      throw error;
    }
  }

  async sendProcessStartedEmail(to, jobRequest) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      const from = process.env.NOTIFICATION_EMAIL || 'noreply@leadgeneration.com';
      const analysis = jobRequest.analysis || {};
      
      const subject = `Lead Generation Started: ${jobRequest.nameOfList}`;
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Lead Generation Started</title>
        </head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #007bff;">🚀 Lead Generation Process Started!</h2>
            
            <p>Hello,</p>
            
            <p>We've detected a new lead generation request from your Google Sheet. Our system has analyzed your requirements and processing has begun automatically.</p>
            
            <div style="background-color: #e8f4fd; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #007bff;">
                <h3 style="margin-top: 0; color: #0056b3;">Job Details:</h3>
                <p><strong>List Name:</strong> ${jobRequest.nameOfList}</p>
                <p><strong>Business Types:</strong> ${jobRequest.businessTypes.join(', ')}</p>
                <p><strong>Locations:</strong> ${jobRequest.locations.join(', ')}</p>
            </div>

            <div style="background-color: #e8f5e8; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #28a745;">
                <h3 style="margin-top: 0; color: #155724;">📊 Database Analysis Results:</h3>
                <p><strong>Total Queries Generated:</strong> ${analysis.totalQueries || 0}</p>
                <p><strong>Existing Leads Found:</strong> ${analysis.existingLeads || 0}</p>
                <p><strong>Queries with Existing Data:</strong> ${analysis.queriesWithExistingLeads || 0}</p>
                <p><strong>New Queries to Process:</strong> <span style="color: #d73527; font-weight: bold;">${analysis.queriesToProcess || 0}</span></p>
                <p><strong>Status:</strong> <span style="color: #28a745; font-weight: bold;">Processing Started</span></p>
            </div>
            
            <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #ffc107;">
                <p style="margin: 0; color: #856404;">
                    <strong>⏱️ Processing Time:</strong> ${analysis.queriesToProcess > 0 ? 
                      `Scraping ${analysis.queriesToProcess} new queries. This may take 15-60 minutes.` : 
                      'Using existing data only. Processing will be quick (~5 minutes).'
                    }<br/>
                    You'll receive another email with the complete results when finished.
                </p>
            </div>
            
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
            
            <p style="color: #888; font-size: 12px;">
                This is an automated message from your Lead Generation System. 
                Please do not reply to this email.
            </p>
        </body>
        </html>
      `;

      const textContent = `
🚀 Lead Generation Process Started!

Hello,

We've detected a new lead generation request from your Google Sheet. Our system has analyzed your requirements and processing has begun automatically.

Job Details:
- List Name: ${jobRequest.nameOfList}
- Business Types: ${jobRequest.businessTypes.join(', ')}
- Locations: ${jobRequest.locations.join(', ')}

📊 Database Analysis Results:
- Total Queries Generated: ${analysis.totalQueries || 0}
- Existing Leads Found: ${analysis.existingLeads || 0}
- Queries with Existing Data: ${analysis.queriesWithExistingLeads || 0}
- New Queries to Process: ${analysis.queriesToProcess || 0}
- Status: Processing Started

⏱️ Processing Time: ${analysis.queriesToProcess > 0 ? 
  `Scraping ${analysis.queriesToProcess} new queries. This may take 15-60 minutes.` : 
  'Using existing data only. Processing will be quick (~5 minutes).'
}
You'll receive another email with the complete results when finished.

This is an automated message from your Lead Generation System.
      `;

      await this.sendEmail(from, to, subject, textContent, htmlContent);
      logger.info(`Process started email sent to ${to} for job: ${jobRequest.nameOfList}`);

    } catch (error) {
      logger.error('Error sending process started email:', error);
      throw error;
    }
  }

  async sendCompletionEmail(to, jobRequest, filePath, jobStats) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      const from = process.env.NOTIFICATION_EMAIL || 'noreply@leadgeneration.com';
      const subject = `Lead Generation Complete: ${jobRequest.nameOfList}`;
      const fileName = path.basename(filePath);
      
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Lead Generation Complete</title>
        </head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #28a745;">Lead Generation Completed Successfully!</h2>
            
            <p>Hello,</p>
            
            <p>Your lead generation job has been completed successfully. Here are the results:</p>
            
            <div style="background-color: #e8f5e8; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #28a745;">
                <h3 style="margin-top: 0; color: #155724;">Job Results:</h3>
                <p><strong>List Name:</strong> ${jobRequest.nameOfList}</p>
                <p><strong>Business Types:</strong> ${jobRequest.businessTypes.join(', ')}</p>
                <p><strong>Locations:</strong> ${jobRequest.locations.join(', ')}</p>
                <p><strong>Total Leads Found:</strong> ${jobStats.leadsFound || 0}</p>
                <p><strong>Queries Processed:</strong> ${jobStats.queriesProcessed || 0}</p>
                <p><strong>Processing Time:</strong> ${jobStats.processingTime || 'N/A'}</p>
            </div>
            
            <p>Your lead generation file is attached to this email as: <strong>${fileName}</strong></p>
            
            <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #ffc107;">
                <p style="margin: 0; color: #856404;">
                    <strong>Note:</strong> Please download and save the attached file. 
                    The file will be available for download from our system for 30 days.
                </p>
            </div>
            
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
            
            <p style="color: #888; font-size: 12px;">
                This is an automated message from your Lead Generation System. 
                Please do not reply to this email.
            </p>
        </body>
        </html>
      `;

      const textContent = `
Lead Generation Completed Successfully!

Hello,

Your lead generation job has been completed successfully. Here are the results:

Job Results:
- List Name: ${jobRequest.nameOfList}
- Business Types: ${jobRequest.businessTypes.join(', ')}
- Locations: ${jobRequest.locations.join(', ')}
- Total Leads Found: ${jobStats.leadsFound || 0}
- Queries Processed: ${jobStats.queriesProcessed || 0}
- Processing Time: ${jobStats.processingTime || 'N/A'}

Your lead generation file is attached to this email as: ${fileName}

Note: Please download and save the attached file. The file will be available for download from our system for 30 days.

This is an automated message from your Lead Generation System.
      `;

      await this.sendEmailWithAttachment(from, to, subject, textContent, htmlContent, filePath);
      logger.info(`Completion email sent to ${to} for job: ${jobRequest.nameOfList}`);

    } catch (error) {
      logger.error('Error sending completion email:', error);
      throw error;
    }
  }

  async sendEmail(from, to, subject, textContent, htmlContent) {
    try {
      const message = this.createEmailMessage(from, to, subject, textContent, htmlContent);
      const encodedMessage = Buffer.from(message).toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const result = await this.gmail.users.messages.send({
        userId: 'me',
        resource: {
          raw: encodedMessage
        }
      });

      logger.info('Email sent successfully:', result.data.id);

    } catch (error) {
      logger.error('Error sending email:', error);
      throw error;
    }
  }

  async sendEmailWithAttachment(from, to, subject, textContent, htmlContent, attachmentPath) {
    try {
      const message = this.createEmailMessageWithAttachment(from, to, subject, textContent, htmlContent, attachmentPath);
      const encodedMessage = Buffer.from(message).toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const result = await this.gmail.users.messages.send({
        userId: 'me',
        resource: {
          raw: encodedMessage
        }
      });

      logger.info('Email with attachment sent successfully:', result.data.id);

    } catch (error) {
      logger.error('Error sending email with attachment:', error);
      throw error;
    }
  }

  createEmailMessage(from, to, subject, textContent, htmlContent) {
    const boundary = 'boundary_' + Date.now();
    
    let message = `From: ${from}\r\n`;
    message += `To: ${to}\r\n`;
    message += `Subject: ${subject}\r\n`;
    message += `MIME-Version: 1.0\r\n`;
    message += `Content-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n`;
    
    // Text part
    message += `--${boundary}\r\n`;
    message += `Content-Type: text/plain; charset=utf-8\r\n\r\n`;
    message += `${textContent}\r\n\r\n`;
    
    // HTML part
    message += `--${boundary}\r\n`;
    message += `Content-Type: text/html; charset=utf-8\r\n\r\n`;
    message += `${htmlContent}\r\n\r\n`;
    
    message += `--${boundary}--`;
    
    return message;
  }

  createEmailMessageWithAttachment(from, to, subject, textContent, htmlContent, attachmentPath) {
    const boundary = 'boundary_' + Date.now();
    const fileName = path.basename(attachmentPath);
    const fileContent = fs.readFileSync(attachmentPath);
    const encodedAttachment = fileContent.toString('base64');
    
    let message = `From: ${from}\r\n`;
    message += `To: ${to}\r\n`;
    message += `Subject: ${subject}\r\n`;
    message += `MIME-Version: 1.0\r\n`;
    message += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;
    
    // Text/HTML content
    message += `--${boundary}\r\n`;
    message += `Content-Type: multipart/alternative; boundary="text_boundary"\r\n\r\n`;
    
    message += `--text_boundary\r\n`;
    message += `Content-Type: text/plain; charset=utf-8\r\n\r\n`;
    message += `${textContent}\r\n\r\n`;
    
    message += `--text_boundary\r\n`;
    message += `Content-Type: text/html; charset=utf-8\r\n\r\n`;
    message += `${htmlContent}\r\n\r\n`;
    
    message += `--text_boundary--\r\n\r\n`;
    
    // Attachment
    message += `--${boundary}\r\n`;
    message += `Content-Type: application/octet-stream; name="${fileName}"\r\n`;
    message += `Content-Disposition: attachment; filename="${fileName}"\r\n`;
    message += `Content-Transfer-Encoding: base64\r\n\r\n`;
    message += encodedAttachment + '\r\n';
    
    message += `--${boundary}--`;
    
    return message;
  }
}

module.exports = new GmailService(); 