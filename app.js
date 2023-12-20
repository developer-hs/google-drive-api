import express from "express";
import path from "path";
import fs from "fs";
import readline from "readline";
import multer from "multer";
import mime from "mime";
import dotenv from "dotenv";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import { google } from "googleapis";
import streamifier from "streamifier";

dotenv.config();
process.env.NODE_ENV =
  process.env.NODE_ENV && process.env.NODE_ENV.trim().toLowerCase() == "production" ? "production" : "development";

export const app = express();
export const __dirname = path.resolve();

const allowlist = [
  "https://storemap-389307.du.r.appspot.com",
  "https://storemap.store",
  "http://localhost:8080",
  "https://localhost:8000",
  "http://127.0.0.1:8080",
  "https://127.0.0.1:8000",
];

const corsOptionsDelegate = (req, callback) => {
  let corsOptions;

  if (allowlist.indexOf(req.header("Origin")) !== -1) {
    corsOptions = { origin: true, credentials: true }; // reflect (enable) the requested origin in the CORS response
  } else {
    corsOptions = { origin: false }; // disable CORS for this request
  }

  callback(null, { origin: true, credentials: true }); // callback expects two parameters: error and options
};

const appInit = async () => {
  app.set("view engine", "ejs"); // 템플릿 엔진 설정
  app.set("views", path.join(__dirname, "views"));
  // 레이아웃 파일 경로 설정 (선택사항)
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  // 정적 파일 경로 설정 (선택사항)
  app.use(express.static(__dirname + "/public")); // apply css , js
  app.use(cors(corsOptionsDelegate)); // cors setting
};

appInit();

app.get("/", (req, res) => {
  return res.sendFile(__dirname + "/views/index.html");
});

const removeFileInServiceAuth = async (res) => {
  try {
    // 소유자의 이메일 주소
    const serviceEmail = process.env.SERVICE_AUTH_EMAIL;

    // 소유자의 파일 검색
    const fileLisRes = await drive.files.list({
      pageSize: 10,
      fields: "nextPageToken, files(id, name)",
    });
    const files = fileLisRes.data.files;
    if (files.length) {
      console.log("Files:");
      files.map(async (file) => {
        console.log(`${file.name} (${file.id})`);
        await drive.files.delete({
          fileId: file.id,
        });
      });
    } else {
      console.log("No files found.");
    }

    return res.status(200);
  } catch (err) {
    console.error(err);
    return res.status(500).send(err);
  }
};

const storage = multer.memoryStorage({
  filename: function (req, file, cb) {
    // 파일 이름 인코딩
    const id = uuidv4();
    const ext = path.extname(file.originalname);
    file.originalname = Buffer.from(file.originalname.replace(ext, ""), "latin1").toString("utf8") + "_" + id + ext;
    cb(null, file.originalname);
  },
});

const upload = multer({ storage });

const keys = JSON.parse(fs.readFileSync(__dirname + "/env/utilityapp-399403-feb51c49e333.json"));
const auth = new google.auth.JWT(
  keys.client_email,
  null,
  keys.private_key,
  ["https://www.googleapis.com/auth/drive"],
  process.env.OWNER_WORKSPACE_EMAIL // 도메인 전체 위임을 위한 이메일 주소
);

const drive = google.drive({ version: "v3", auth });

const folderIdGetOrCraate = async (parentFolderId, folderName, folderResponse) => {
  return new Promise(async (resolve, reject) => {
    if (folderResponse.data.files.length > 0) {
      // order_images 폴더안에 주문일 폴더가 이미 존재하는 경우
      resolve(folderResponse.data.files[0].id);
    } else {
      try {
        // 주문일 폴더가 존재하지 않는 경우, 주문날자로 새로운 폴더 생성
        const folderMetadata = {
          name: folderName,
          mimeType: "application/vnd.google-apps.folder",
          parents: [parentFolderId],
        };

        const folder = await drive.files.create({
          resource: folderMetadata,
          fields: "id",
        });

        const permissionsRes = await drive.permissions.create({
          fileId: folder.data.id,
          transferOwnership: true,
          fields: "id",
          resource: {
            role: "owner",
            type: "user",
            emailAddress: ownerEmail,
          },
        });

        console.log(permissionsRes);

        resolve(folder.data.id);
      } catch (error) {
        console.log(error);
        reject(error);
      }
    }
  });
};

app.post("/upload", upload.array("files"), async (req, res) => {
  try {
    const { order_id } = req.query;
    const files = req.files;

    const firstFolderName = process.env.FIRST_PARENT_FOLDER_ID;
    let secondFolderId, thirdFolderId; // secondFolderId = 주문일 thirdFolderId = 주문번호
    const secondFolderName = order_id.split("-")[0]; // 주문일
    const thirdFolderName = order_id; // 주문번호

    // order_images 폴더 안에 주문일 폴더가 있는지 확인
    const secondParentFolderSearchRes = await drive.files.list({
      q: `${firstFolderName} in parents and mimeType='application/vnd.google-apps.folder' and name='${secondFolderName}'`,
      spaces: "drive",
      fields: "files(id, name)",
    });

    //
    secondFolderId = await folderIdGetOrCraate(firstFolderName, secondFolderName, secondParentFolderSearchRes);

    const thirdParentFolderSearchRes = await drive.files.list({
      q: `'${secondFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and name='${thirdFolderName}'`,
      spaces: "drive",
      fields: "files(id, name)",
    });

    thirdFolderId = await folderIdGetOrCraate(secondFolderId, thirdFolderName, thirdParentFolderSearchRes);

    for (const file of files) {
      const fileRes = await drive.files.create({
        requestBody: {
          name: file.originalname,
          parents: [thirdFolderId],
        },
        media: {
          mimeType: file.mimetype,
          body: streamifier.createReadStream(file.buffer), // file.buffer를 스트림으로 변환합니다.
        },
        fields: "id",
      });
    }

    console.log("file upload success");
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.log(error);

    return res.status(500).json({ ok: false });
  }
});

app.post("/users/upload", upload.single("file"), async (req, res) => {
  const OAuth2 = google.auth.OAuth2;
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

    fs.unlinkSync(req.file.path); // 업로드가 완료된 후 임시 파일 삭제
  }
});
