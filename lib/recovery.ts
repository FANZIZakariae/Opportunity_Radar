import "server-only";
import { getDb } from "@/lib/db";

export function recoverInterruptedQueue(runId: string): void {
  getDb().prepare(`UPDATE queue_items SET status='queued',progress=0,
    error=CASE WHEN error IS NULL THEN 'Recovered after worker restart' ELSE error END,updated_at=?
    WHERE run_id=? AND status='running'`).run(new Date().toISOString(), runId);
}
