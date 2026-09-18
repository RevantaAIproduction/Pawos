const fs = require("fs");
let lines = fs.readFileSync("src/renderer/services/ipc/ipcBridgeImplementation.ts", "utf8").split("\n");
if (lines[284] === "  }") {
  lines[284] = "  },";
}
fs.writeFileSync("src/renderer/services/ipc/ipcBridgeImplementation.ts", lines.join("\n"));

