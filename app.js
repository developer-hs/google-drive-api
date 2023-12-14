import express from "express";
import path from "path";

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

app.get("/", (req, res) => {
  return res.sendFile(__dirname + "/views/index.html");
});
