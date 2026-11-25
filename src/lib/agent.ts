// Pages a sub-agent login may open. Everything else in the CRM is staff-only.
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const ALLOWED = new RegExp(`^/(contacts(/new|/${UUID}(/edit)?)?|applications(/new|/${UUID})?)?/?$`, "i");
export const agentMayOpen = (path: string) => ALLOWED.test(path);
