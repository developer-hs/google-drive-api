import { app } from "./app.js";

const PORT = process.env.PORT || 8000;

app.listen(PORT, async () => {
  console.log(`CORS-enabled web server listening on port http://localhost:${PORT}`);
});
