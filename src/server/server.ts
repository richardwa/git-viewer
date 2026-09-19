import express, { Request, Response } from "express";
import path from "path";
import { configureRoutes } from "./routes";

const app = express();
const port = process.env.PORT || 5177;

configureRoutes(app);

// Serve frontend from built Vite dist
const distPath = path.resolve(__dirname, "../../dist");
app.use(express.static(distPath));

// default to index.html for Router
app.use((req: Request, res: Response) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
