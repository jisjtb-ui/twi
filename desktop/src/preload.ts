import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("xMulti", {
  listAccounts: () => ipcRenderer.invoke("accounts:list"),
  addAccount: () => ipcRenderer.invoke("accounts:add"),
  switchAccount: (id: string) => ipcRenderer.invoke("accounts:switch", id),
  post: (accountIds: string[], text: string) =>
    ipcRenderer.invoke("macro:post", { accountIds, text })
});
