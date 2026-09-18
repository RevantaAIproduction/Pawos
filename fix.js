const fs = require("fs");
let lines = fs.readFileSync("src/renderer/ui/Dashboard/sections/SubscriptionSection.tsx", "utf8").split("\n");
let startIdx = lines.findIndex(l => l.includes("ipc.entitlementGetSnapshot"));
let endIdx = lines.findIndex(l => l.includes("{/* Payment Panels */}"));

let newLines = [
  "    ipc.billingGetGoRefreshesRemaining().then(setGoRefreshesRemaining).catch(() => {});",
  "  };",
  "",
  "  useEffect(() => {",
  "    refresh();",
  "  }, []);",
  "",
  "  return (",
  "    <div>",
  "      <div style={{",
  "        background: \"rgba(255, 255, 255, 0.03)\",",
  "        borderRadius: 8,",
  "        padding: \"20px\",",
  "        marginBottom: \"24px\",",
  "        display: \"flex\",",
  "        justifyContent: \"space-between\",",
  "        alignItems: \"center\"",
  "      }}>",
  "        <div>",
  "          <div style={{ fontSize: \"0.85em\", color: \"rgba(255, 255, 255, 0.5)\", marginBottom: 4 }}>Current Plan</div>",
  "          <div style={{ fontSize: \"1.2em\", fontWeight: 600 }}>{TIER_LABELS[currentTier]}</div>",
  "        </div>",
  "        ",
  "        <div style={{ display: \"flex\", gap: 12 }}>",
  "          <button",
  "            onClick={() => onUpgrade()}",
  "            style={{",
  "              padding: \"8px 16px\",",
  "              backgroundColor: \"#404040\",",
  "              color: \"#fff\",",
  "              border: \"none\",",
  "              borderRadius: 4,",
  "              cursor: \"pointer\",",
  "              fontSize: \"0.9em\",",
  "              fontWeight: 500,",
  "              whiteSpace: \"nowrap\",",
  "            }}",
  "          >",
  "            Adjust plan",
  "          </button>",
  "        </div>",
  "      </div>",
  ""
];

let finalFile = [
  ...lines.slice(0, startIdx + 1),
  ...newLines,
  ...lines.slice(endIdx)
].join("\n");

fs.writeFileSync("src/renderer/ui/Dashboard/sections/SubscriptionSection.tsx", finalFile);

