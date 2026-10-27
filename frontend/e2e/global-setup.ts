import { execFileSync } from "node:child_process";

export default function globalSetup() {
  const python = process.env.E2E_PYTHON ?? "python";
  execFileSync(python, ["manage.py", "migrate", "--noinput", "-v", "0"], { cwd: "../backend", stdio: "inherit" });
  execFileSync(python, ["manage.py", "seed", "--reset", "--issues", "12", "--users", "4"], {
    cwd: "../backend",
    stdio: "inherit",
  });
}
