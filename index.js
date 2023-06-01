
const express =require("express");
const { google } = require("googleapis");
const readline = require("readline");


const SCOPES = ["https://www.googleapis.com/auth/gmail.modify"];
const app=express();

const PORT=8000;


// Load credentials from a file
const credentials = require("./credentials.json");

// Create an OAuth2 client
const oAuth2Client = new google.auth.OAuth2(
  credentials.installed.client_id,
  credentials.installed.client_secret,
  credentials.installed.redirect_uris[0]
);

// Generate an OAuth2 access token
function getAccessToken() {
  return new Promise((resolve, reject) => {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
    });
    console.log("Authorize this app by visiting this URL:", authUrl);
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question("Enter the code from that page here: ", (code) => {
      rl.close();
      oAuth2Client.getToken(code, (err, token) => {
        if (err) {
          return reject("Error retrieving access token", err);
        }
        oAuth2Client.setCredentials(token);
        resolve(token);
      });
    });
  });
}

// Get the Gmail API client
async function getGmailClient() {
  const token = await getAccessToken();
  oAuth2Client.setCredentials(token);
  const gmail = google.gmail({ version: "v1", auth: oAuth2Client });
  return gmail;
}

// Check for new emails
async function checkEmails() {
  const gmail = await getGmailClient();
  const response = await gmail.users.messages.list({
    userId: "me",
    labelIds: ["INBOX"],
  });
  const emails = response.data.messages || [];
  for (const email of emails) {
    await processEmail(gmail, email);
  }
}

// Process an email
async function processEmail(gmail, email) {
  const emailData = await gmail.users.messages.get({
    userId: "me",
    id: email.id,
    format: "full",
  });

  const message = emailData.data;
  const threadId = message.threadId;

  // Check if the email has any prior replies
  const hasPriorReplies = message.payload.headers.some(
    (header) => header.name.toLowerCase() === "in-reply-to"
  );

  if (!hasPriorReplies) {
    // Send a reply to the email
    await sendReply(gmail, emailData);

    // Add a label to the email and move it to the labeled folder
    await addLabel(gmail, threadId, "Vacation Auto Reply");

    console.log("Replied to email:", message.snippet);
  } else {
    console.log("Skipping email with prior replies:", message.snippet);
  }
}

// Send a reply to the email
async function sendReply(gmail, emailData) {
  const message = emailData.data;
  const threadId = message.threadId;
  const reply = `Hello,\n\nThank you for your email. I am currently on vacation and will respond to your message when I return.\n\nBest regards,\nYour Name`;

  await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      threadId: threadId,
      raw: Buffer.from(
        `From: "Your Name" <manishkumarchaudhary287@gmail.com>\n` +
          `To: ${getHeader(message.payload.headers, "From")}\n` +
          `Subject: Re: ${getHeader(message.payload.headers, "Subject")}\n` +
          `In-Reply-To: ${message.id}\n` +
          `References: ${message.id}\n` +
          `Content-Type: text/plain; charset=utf-8\n` +
          `\n${reply}`
      ).toString("base64"),
    },
  });
}

// Add a label to the email and move it to the labeled folder
async function addLabel(gmail, threadId, labelName) {
  const labelsResponse = await gmail.users.labels.list({
    userId: "me",
  });
  const labels = labelsResponse.data.labels || [];
  let labelId = null;
  for (const label of labels) {
    if (label.name === labelName) {
      labelId = label.id;
      break;
    }
  }

  if (!labelId) {
    const createLabelResponse = await gmail.users.labels.create({
      userId: "me",
      requestBody: {
        name: labelName,
      },
    });
    labelId = createLabelResponse.data.id;
  }

  await gmail.users.threads.modify({
    userId: "me",
    id: threadId,
    requestBody: {
      addLabelIds: [labelId],
      removeLabelIds: ["INBOX"],
    },
  });
}

// Random interval between min and max in milliseconds
function getRandomInterval(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Main function
async function main() {
  while (true) {
    try {
      await checkEmails();
    } catch (error) {
      console.error("Error:", error);
    }

    const interval = getRandomInterval(45000, 120000);
    console.log(`Next check in ${interval / 1000} seconds...`);

    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

// Start the application
main().catch(console.error);

// Helper function to get a header value from an array of headers
function getHeader(headers, name) {
  const header = headers.find(
    (header) => header.name.toLowerCase() === name.toLowerCase()
  );
  return header ? header.value : "";
}

app.listen(PORT,(err)=>{
    if(err){
        console.log(err);
    }
    console.log("Server is running on 8000");
})
