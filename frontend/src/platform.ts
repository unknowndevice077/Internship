export const MOD_KEY = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";

// the seeded demo accounts only exist on dev machines and the local Docker stack
export const DEMO_LOGIN = import.meta.env.DEV || import.meta.env.VITE_DEMO_LOGIN === "1";
export const DEMO_ACCOUNT = { email: "owner@acme-corp.test", password: "demo-pass-123" };
