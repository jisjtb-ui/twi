import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, ipcMain } from "electron";
import { SessionManager } from "./session/SessionManager.js";
import { MacroEngine } from "./macro/MacroEngine.js";
import { PostMacro } from "./macro/PostMacro.js";
import { RemoteServer } from "./remote/RemoteServer.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    webPreferences: {
      preload: path.join(dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  const sessions = new SessionManager(win);
  const engine = new MacroEngine(sessions);
  const postMacro = new PostMacro();
  const remote = new RemoteServer(sessions, engine, postMacro);
  const remotePort = await remote.listen();

  console.log("Mobile remote port:", remotePort);
  console.log("Mobile pairing key:", remote.token);

  win.on("resize", () => sessions.layout());
  win.on("closed", () => remote.close());

  ipcMain.handle("accounts:list", () =>
    sessions.list().map((item) => ({ id: item.id, url: item.view.webContents.getURL() }))
  );
  ipcMain.handle("accounts:add", async () => {
    const item = await sessions.add();
    return { id: item.id, url: item.view.webContents.getURL() };
  });
  ipcMain.handle("accounts:switch", (_event, id: string) => sessions.activate(id));
  ipcMain.handle("macro:post", (_event, data: { accountIds: string[]; text: string }) =>
    engine.execute(postMacro, data.accountIds, { text: data.text })
  );

  await win.loadFile(path.join(dirname, "ui.html"));
});
