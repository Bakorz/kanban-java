package id.bakorz.kanban.lifecycle;

import id.bakorz.kanban.auth.SupabaseJwtVerifier;
import id.bakorz.kanban.db.Database;
import id.bakorz.kanban.service.BoardService;
import id.bakorz.kanban.service.CardService;

/** Immutable application dependencies; never contains request identity or a shared Connection. */
public record ApplicationRuntime(SupabaseJwtVerifier verifier, BoardService boards, CardService cards,
                                 Database database, AutoCloseable keyTransport) implements AutoCloseable {
    public static final String ATTRIBUTE = ApplicationRuntime.class.getName();
    @Override public void close() {
        try { if (database != null) database.close(); }
        finally {
            if (keyTransport != null) {
                try { keyTransport.close(); }
                catch (Exception ignored) { /* No raw transport failures in application logs. */ }
            }
        }
    }
}
