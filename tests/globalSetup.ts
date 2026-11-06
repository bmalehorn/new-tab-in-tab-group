import { execSync } from "node:child_process";

// Tests load dist/ as the extension, so build it first.
export default () => {
  execSync("npm run build", { stdio: "inherit" });
};
