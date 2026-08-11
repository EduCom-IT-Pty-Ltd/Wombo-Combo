import { redirect } from "next/navigation";

/** Existing saved production-template data is intentionally retained, but this legacy route is no longer a module. */
export default function ProductionTemplatesPage() { redirect("/materials"); }
