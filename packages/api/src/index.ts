import express from "express";
import cors from "cors";
import { eventsRouter } from "./routes/events.js";
import { healthRouter } from "./routes/health.js";
import { config } from "./config.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/health", healthRouter);
app.use("/api/events", eventsRouter);

app.listen(config.port, () => {
  console.log(`Mithilesh's Argus API running on port ${config.port}`);
});
