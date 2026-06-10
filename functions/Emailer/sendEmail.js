const nodemailer = require('nodemailer');   
const Handlebars = require('handlebars');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const { defineSecret } = require('firebase-functions/params');
const emailerPrivateKey = defineSecret('squidly-gmail-service-account-key');

const StandardAttachments = [
  {
    filename: 'squidly-logo.png',
    cid: 'logo@squidly.com.au',
    path: path.join(__dirname, 'templates', 'logo.png'),
  }
];

async function getTransporter(from, PRIVATE_KEY) {
  const auth = new google.auth.JWT({
      email: PRIVATE_KEY.client_email,
      key: PRIVATE_KEY.private_key,
      scopes: ['https://mail.google.com/'],
      subject: from, // Delegates as this user
  });

  const accessToken = await auth.getAccessToken();

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      type: 'OAuth2',
      user: from,
      accessToken: accessToken.token,
      clientId: PRIVATE_KEY.client_id,
    },
  });
}

function toSubject({firstName, lastName, company}) {
    return `${firstName} ${lastName} - ${company}`;
}

function getTemplate(templateName, data) {
    const templatePathHTML = path.join(__dirname, `templates/${templateName}-html.hbs`);
    const templatePathText = path.join(__dirname, `templates/${templateName}-text.hbs`);
    const sourceHTML = fs.readFileSync(templatePathHTML, 'utf8');
    const sourceText = fs.readFileSync(templatePathText, 'utf8');

    let attachments = StandardAttachments.filter(attachment => sourceHTML.match(attachment.cid));
    const toHTML = Handlebars.compile(sourceHTML);
    const toText = Handlebars.compile(sourceText);
    return {
      html: toHTML(data),
      text: toText(data),
      subject: toSubject(data),
      attachments,
    };
}

async function sendEmail({from, to, templateName, data, subject}, privateKey = null) {
  const PRIVATE_KEY = privateKey ? privateKey : JSON.parse(emailerPrivateKey.value());

  let transporter = null;
  let mailOptions = null;
  try {
    transporter = await getTransporter(from, PRIVATE_KEY, subject || from);
    mailOptions = getTemplate(templateName, data);
    mailOptions.from = from;
    mailOptions.to = to;
    if (subject) {
      mailOptions.subject = subject;
    }
  } catch (error) {
    return { error: true, message: `Error setting up email transporter: ${error.message}` };
  }
    
  return await new Promise((resolve) => {
    transporter.sendMail(mailOptions, function(error, info){
        if (error) {
          resolve({error: true, message: error.message});
        } else {
          resolve({error: false, message: info.response});
        }
    });
  });
}


module.exports = {
  sendEmail,
  emailerPrivateKey,
};