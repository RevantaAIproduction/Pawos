const fs = require("fs");
let code = fs.readFileSync("src/renderer/services/ipc/useIpcBridge.ts", "utf8");
code = code.replace(/\\n/g, "\n");
fs.writeFileSync("src/renderer/services/ipc/useIpcBridge.ts", code);

