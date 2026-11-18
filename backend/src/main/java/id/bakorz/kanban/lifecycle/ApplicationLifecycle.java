package id.bakorz.kanban.lifecycle;

import jakarta.servlet.ServletContext;
import jakarta.servlet.ServletContextEvent;
import jakarta.servlet.ServletContextListener;
import java.time.Instant;

/** Owns application-scope state only. No database, pool, worker or auth client exists yet. */
public final class ApplicationLifecycle implements ServletContextListener {
    public static final String STARTED_AT = ApplicationLifecycle.class.getName() + ".startedAt";

    @Override
    public void contextInitialized(ServletContextEvent event) {
        ServletContext context = event.getServletContext();
        context.setAttribute(STARTED_AT, Instant.now());
        context.log("Kanban API lifecycle initialized; database and authentication are not configured.");
    }

    @Override
    public void contextDestroyed(ServletContextEvent event) {
        event.getServletContext().removeAttribute(STARTED_AT);
        event.getServletContext().log("Kanban API lifecycle stopped; application-scope state cleared.");
    }
}
