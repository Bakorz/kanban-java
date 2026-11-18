package id.bakorz.kanban.lifecycle;

import id.bakorz.kanban.auth.HttpJwksTransport;
import id.bakorz.kanban.auth.JwtVerificationConfig;
import id.bakorz.kanban.auth.SupabaseJwtVerifier;
import id.bakorz.kanban.db.BoardDao;
import id.bakorz.kanban.db.CardDao;
import id.bakorz.kanban.db.Database;
import id.bakorz.kanban.db.DatabaseConfig;
import id.bakorz.kanban.db.Transaction;
import id.bakorz.kanban.service.BoardService;
import id.bakorz.kanban.service.CardService;
import jakarta.servlet.ServletContextEvent;
import jakarta.servlet.ServletContextListener;
import java.time.Clock;
import java.time.Instant;

/** Owns and closes application dependencies. Missing/invalid configuration is fail-closed. */
public final class ApplicationLifecycle implements ServletContextListener {
    public static final String STARTED_AT = ApplicationLifecycle.class.getName() + ".startedAt";

    @Override public void contextInitialized(ServletContextEvent event) {
        var context = event.getServletContext();
        context.setAttribute(STARTED_AT, Instant.now());
        // A real-container test may inject a synthetic-key/local-database runtime before startup.
        if (context.getAttribute(ApplicationRuntime.ATTRIBUTE) instanceof ApplicationRuntime) return;
        HttpJwksTransport transport = null;
        Database database = null;
        try {
            var environment = System.getenv();
            var jwt = JwtVerificationConfig.fromEnvironment(environment);
            var db = DatabaseConfig.fromEnvironment(environment);
            // Validate every required setting before constructing resources; construction does no network I/O.
            transport = new HttpJwksTransport();
            var verifier = new SupabaseJwtVerifier(jwt, Clock.systemUTC(), transport);
            database = new Database(db);
            var transaction = new Transaction(database, db.statementTimeoutMs());
            var boardDao = new BoardDao();
            var cardDao = new CardDao();
            var boards = new BoardService(transaction, boardDao, cardDao);
            var cards = new CardService(transaction, boardDao, cardDao, boards);
            context.setAttribute(ApplicationRuntime.ATTRIBUTE, new ApplicationRuntime(verifier, boards, cards, database, transport));
            context.log("Kanban API runtime configured; external dependencies are checked on demand.");
        } catch (RuntimeException exception) {
            if (database != null) database.close();
            if (transport != null) transport.close();
            // Do not log exception/cause: driver and URI parser messages may contain credentials.
            context.log("Kanban API configuration unavailable; protected routes remain closed.");
        }
    }

    @Override public void contextDestroyed(ServletContextEvent event) {
        var context = event.getServletContext();
        if (context.getAttribute(ApplicationRuntime.ATTRIBUTE) instanceof ApplicationRuntime runtime) runtime.close();
        context.removeAttribute(ApplicationRuntime.ATTRIBUTE);
        context.removeAttribute(STARTED_AT);
        context.log("Kanban API lifecycle stopped.");
    }
}
