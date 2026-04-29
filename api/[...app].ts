import { getApp } from "../server/src/app.js";

export default async function handler(req: any, res: any) {
  const app = await getApp();
  return app(req, res);
}
