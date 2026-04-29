import { getApp } from "./app.js";
import { appConfig } from "./config.js";

const app = await getApp();

app.listen(appConfig.port, () => {
  console.log(`Server listening on http://localhost:${appConfig.port}`);
});
