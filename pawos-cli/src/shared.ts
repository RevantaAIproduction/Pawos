/**
 * The code the CLI shares with the PawOS VS Code extension (../pawos-shared): the PawOS sign-in,
 * the API client, Git remote parsing and the task runner. Imported from one place so the CLI's own
 * files never reach across packages. esbuild bundles it into dist/pawos.js.
 */
export * from "../../pawos-shared/src/index";
