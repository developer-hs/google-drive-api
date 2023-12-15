import express from "express";
import path from "path";
import fs from "fs";
import readline from "readline";
import multer from "multer";
import mime from "mime";
import dotenv from "dotenv";
import { google } from "googleapis";

dotenv.config();
const storage = multer.memoryStorage({});

const OAuth2 = google.auth.OAuth2;
const upload = multer({ dest: "uploads/" });

process.env.NODE_ENV =
  process.env.NODE_ENV && process.env.NODE_ENV.trim().toLowerCase() == "production" ? "production" : "development";

export const app = express();

export const __dirname = path.resolve();

const appInit = async () => {
  app.set("view engine", "ejs"); // 템플릿 엔진 설정
  app.set("views", path.join(__dirname, "views"));
  // 레이아웃 파일 경로 설정 (선택사항)
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  // 정적 파일 경로 설정 (선택사항)
  app.use(express.static(__dirname + "/public")); // apply css , js
};

appInit();

const auth = new google.auth.GoogleAuth({
  keyFile: __dirname + "/env/utilityapp-399403-24a680662fd9.json",
  scopes: ["https://www.googleapis.com/auth/drive.file"],
});

const drive = google.drive({ version: "v3", auth });

app.get("/", (req, res) => {
  console.log(req);
  return res.sendFile(__dirname + "/views/index.html");
});

app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const response = await drive.files.create({
      requestBody: {
        name: req.file.originalname,
        parents: [process.env.DRIVE_FORDER_ID],
      },
      media: {
        mimeType: req.file.mimetype,
        body: fs.createReadStream(req.file.path),
      },
    });

    res.send("File uploaded successfully.");
  } catch (error) {
    console.log(error);
    res.status(500).send("Failed to upload file.");
  }
});

app.post("/users/upload", upload.single("file"), async (req, res) => {
  // Load client secrets from a local file.
  fs.readFile(
    "./env/client_secret_209733163609-vg2b70am3talq49anjitjddujlssu4b5.apps.googleusercontent.com.json",
    (err, content) => {
      if (err) return console.log("Error loading client secret file:", err);
      // Authorize a client with credentials, then call the Google Drive API.
      authorize(JSON.parse(content), uploadFile);
    }
  );

  function authorize(credentials, callback) {
    const { client_secret, client_id, redirect_uris } = credentials.web;
    console.log(redirect_uris);
    const oAuth2Client = new OAuth2(client_id, client_secret, redirect_uris[0]);

    // Check if we have previously stored a token.
    fs.readFile("token.json", (err, token) => {
      if (err) return getAccessToken(oAuth2Client, callback);
      oAuth2Client.setCredentials(JSON.parse(token));
      callback(oAuth2Client);
    });
  }

  function getAccessToken(oAuth2Client, callback) {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: "offline",
      scope: ["https://www.googleapis.com/auth/drive.file"],
    });
    console.log("Authorize this app by visiting this url:", authUrl);
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question("Enter the code from that page here: ", (code) => {
      rl.close();

      oAuth2Client.getToken(code, (err, token) => {
        if (err) return console.error("Error retrieving access token", err);
        oAuth2Client.setCredentials(token);
        // Store the token to disk for later program executions
        fs.writeFile("token.json", JSON.stringify(token), (err) => {
          if (err) console.error(err);
          console.log("Token stored to", "token.json");
        });
        callback(oAuth2Client);
      });
    });
  }

  async function uploadFile(auth) {
    const folderId = process.env.DRIVE_FORDER_ID; // Replace with your folder's ID

    const readStream = fs.createReadStream(req.file.path);
    const mimeType = mime.getType(req.file.path);
    const drive = google.drive({ version: "v3", auth });

    try {
      const response = await drive.files.create({
        requestBody: {
          name: req.file.originalname,
          mimeType: mimeType,
          parents: [folderId],
        },
        media: {
          mimeType: mimeType,
          body: readStream,
        },
      });

      console.log("File ID: " + response.data.id);
      res.send("File upload success!");
    } catch (err) {
      console.error("The API returned an error: " + err);
      res.status(500).send("File upload failed.");
    }
  }
});
