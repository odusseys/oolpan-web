export default async function handler(req: any, res: any) {
  const { getApp } = await import("../server/src/app.js");
  const app = await getApp();
  return app(req, res);
}
