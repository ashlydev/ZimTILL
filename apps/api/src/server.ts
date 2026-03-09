import { createApp } from "./app";
import { env } from "./config/env";

const app = createApp();
const port = Number(process.env.PORT || 3000);

if (!Number.isFinite(port) || port <= 0) {
  throw new Error(`Invalid PORT value: ${process.env.PORT ?? "(unset)"}`);
}

// eslint-disable-next-line no-console
console.log("API starting...", { port, nodeEnv: env.NODE_ENV });

const server = app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Novoriq Stock Plattform API listening on port ${port}`);
});

server.on("error", (error) => {
  // eslint-disable-next-line no-console
  console.error("API startup failed", { message: error.message });
  process.exit(1);
});
