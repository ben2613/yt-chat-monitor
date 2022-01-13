require('dotenv').config();
var fs = require('fs');
var readline = require('readline');
var { google } = require('googleapis');
const { exit } = require('process');
const { default: axios } = require('axios');
var OAuth2 = google.auth.OAuth2;

// If modifying these scopes, delete your previously saved credentials
// at ~/.credentials/youtube-nodejs-quickstart.json
var SCOPES = ['https://www.googleapis.com/auth/youtube.readonly'];
var TOKEN_DIR = (process.env.HOME || process.env.HOMEPATH ||
  process.env.USERPROFILE) + '/.credentials/';
var TOKEN_PATH = TOKEN_DIR + 'youtube-nodejs-quickstart.json';
const YT_LINK = process.env.YT_LINK;
const DISCORD_HOOK = process.env.DISCORD_HOOK;
let channelId = null;
const videoId = YT_LINK.replace('https://www.youtube.com/watch?v=', '');
if (videoId.length === 0) {
  console.error('videoId not found in YT_LINK, expected like https://www.youtube.com/watch?v=fubvvxtNEY4');
  exit();
}
let pageToken = undefined;

// Load client secrets from a local file.
fs.readFile('client_secret.json', function processClientSecrets(err, content) {
  if (err) {
    console.log('Error loading client secret file: ' + err);
    return;
  }
  // Authorize a client with the loaded credentials, then call the YouTube API.
  authorize(JSON.parse(content), async (auth) => { 
    while (true) {
      await getChat(auth, pageToken);
      await new Promise(resolve => setTimeout(resolve, 15000)); // sleep
    }
  });
});

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 *
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
  var clientSecret = credentials.installed.client_secret;
  var clientId = credentials.installed.client_id;
  var redirectUrl = credentials.installed.redirect_uris[0];
  var oauth2Client = new OAuth2(clientId, clientSecret, redirectUrl);

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, function (err, token) {
    if (err) {
      getNewToken(oauth2Client, callback);
    } else {
      oauth2Client.credentials = JSON.parse(token);
      oauth2Client.on('tokens', (tokens) => {
        if (tokens.refresh_token) {
          let new_token = JSON.parse(token);
          new_token.access_token = tokens.access_token;
          new_token.expiry_date = tokens.expiry_date;
          fs.writeFile(TOKEN_PATH, JSON.stringify(new_token), (err) => {
            if (err) throw err;
            console.log('Token stored to ' + TOKEN_PATH);
          });
        }
      })

      callback(oauth2Client);
    }
  });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 *
 * @param {google.auth.OAuth2} oauth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback to call with the authorized
 *     client.
 */
function getNewToken(oauth2Client, callback) {
  var authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES
  });
  console.log('Authorize this app by visiting this url: ', authUrl);
  var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  rl.question('Enter the code from that page here: ', function (code) {
    rl.close();
    oauth2Client.getToken(code, function (err, token) {
      if (err) {
        console.log('Error while trying to retrieve access token', err);
        return;
      }
      oauth2Client.credentials = token;
      storeToken(token);
      callback(oauth2Client);
    });
  });
}

/**
 * Store token to disk be used in later program executions.
 *
 * @param {Object} token The token to store to disk.
 */
function storeToken(token) {
  try {
    fs.mkdirSync(TOKEN_DIR);
  } catch (err) {
    if (err.code != 'EEXIST') {
      throw err;
    }
  }
  fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
    if (err) throw err;
    console.log('Token stored to ' + TOKEN_PATH);
  });
}

/**
 * Lists the names and IDs of up to 10 files.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
async function getChat(auth, pToken) {
  var service = google.youtube('v3');
  try {
    const videoResponse = await service.videos.list({
      auth: auth,
      part: 'snippet,liveStreamingDetails',
      id: videoId,
    })
    if (videoResponse.data.items.length === 0) {
      console.log('Video not found for ')
      return;
    }
    // record the channel Id
    if (!channelId) {
      channelId = videoResponse.data.items[0].snippet.channelId;
    }
    const chatId = videoResponse.data.items[0].liveStreamingDetails.activeLiveChatId;
    const chatResponse = await service.liveChatMessages.list({
      auth: auth,
      part: 'snippet,authorDetails',
      liveChatId: chatId,
      pageToken: pToken,
    });
    pageToken = chatResponse.data.nextPageToken;
    console.log('pageToken' + pageToken);
    chatResponse.data.items.forEach(item => {
      // if the channel owner write something
      if (item.snippet.authorChannelId === channelId) {
        console.log(`${item.authorDetails.displayName} : ${item.snippet.displayMessage}`);
        axios.post(DISCORD_HOOK, {
          username: 'RoBot',
          content: `${item.authorDetails.displayName} : ${item.snippet.displayMessage}`,
          avatar_url: 'https://cdn.discordapp.com/avatars/420049078391537666/fc168ee4bc312698f701acab0c94e94c.webp?size=160',
        });
      }
    });
  } catch (e) {
    console.log('The API returned an error: ' + e);
    return;
  }
}
