const fs = require('fs');
let code = fs.readFileSync('src/main/ipc/connectivityIpc.entitlement.test.ts', 'utf8');

code = code.replace(/connectivity:connect — Go is rejected for github \(Pro-and-above\) before sdk\.connect\(\) ever runs/g, 'connectivity:connect — Go is rejected for jira before sdk.connect() ever runs');
code = code.replace(/const connectFn = vi\.fn\(\);\s+connectorRegistry\.register\(makeFakeSdk\('github', connectFn\)\);\s+vi\.spyOn\(subscriptionStore, 'get'\)\.mockReturnValue\(\{ tier: 'go', status: 'none' \}\);\s+const result = await handlers\.get\('connectivity:connect'\)!\(fakeEvent, 'github', \{ userId: 'u1' \}\);/g, "const connectFn = vi.fn();\n    connectorRegistry.register(makeFakeSdk('jira', connectFn));\n    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'go', status: 'none' });\n\n    const result = await handlers.get('connectivity:connect')!(fakeEvent, 'jira', { userId: 'u1' });");

code = code.replace(/3\. Go \+ stored GitHub credential — restore blocked/g, '3. Go + stored Jira credential — restore blocked');
code = code.replace(/const authenticateFn = vi\.fn\(\);\s+connectorRegistry\.register\(makeFakeRestoreSdk\('github', authenticateFn\)\);\s+vi\.spyOn\(subscriptionStore, 'get'\)\.mockReturnValue\(\{ tier: 'go', status: 'none' \}\);\s+const result = await handlers\.get\('connectivity:restore'\)!\(fakeEvent, 'github', \{ userId: 'u1' \}, storedCredential\);/g, "const authenticateFn = vi.fn();\n    connectorRegistry.register(makeFakeRestoreSdk('jira', authenticateFn));\n    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'go', status: 'none' });\n\n    const result = await handlers.get('connectivity:restore')!(fakeEvent, 'jira', { userId: 'u1' }, storedCredential);");

fs.writeFileSync('src/main/ipc/connectivityIpc.entitlement.test.ts', code);
