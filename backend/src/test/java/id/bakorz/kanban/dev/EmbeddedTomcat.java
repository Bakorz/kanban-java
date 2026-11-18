package id.bakorz.kanban.dev;

import org.apache.catalina.Context;
import org.apache.catalina.connector.Connector;
import org.apache.catalina.startup.Tomcat;
import org.apache.catalina.valves.ErrorReportValve;
import java.nio.file.Files;
import java.nio.file.Path;

/** Shared real-container bootstrap for tests and dev only; never packaged inside the WAR. */
public final class EmbeddedTomcat implements AutoCloseable {
    private final Tomcat tomcat;
    private final Path baseDirectory;
    private final Context context;
    private boolean closed;

    public EmbeddedTomcat(Path application, int port) throws Exception {
        baseDirectory = Files.createTempDirectory("kanban-tomcat-");
        tomcat = new Tomcat();
        tomcat.setBaseDir(baseDirectory.toString());
        tomcat.setHostname("localhost");
        tomcat.setPort(port);
        Connector connector = tomcat.getConnector();
        connector.setProperty("address", "127.0.0.1");
        connector.setProperty("connectionTimeout", "10000");
        connector.setProperty("maxThreads", "20");
        // Let the servlet reject TRACE with the same JSON/Allow policy; it never echoes requests.
        connector.setAllowTrace(true);
        Files.createDirectories(baseDirectory.resolve("webapps"));
        tomcat.getHost().setAppBase(baseDirectory.resolve("webapps").toString());
        // Do not expose default server reports even for failures outside the app's error dispatch.
        var errorValve = new ErrorReportValve();
        errorValve.setShowReport(false);
        errorValve.setShowServerInfo(false);
        tomcat.getHost().getPipeline().addValve(errorValve);
        // Configure this before addWebapp; otherwise Tomcat registers an absent Jasper JSP servlet.
        tomcat.setAddDefaultWebXmlToWebapp(false);
        context = tomcat.addWebapp("", application.toAbsolutePath().toString());
        context.setParentClassLoader(EmbeddedTomcat.class.getClassLoader());
        context.setSessionTimeout(0);
        ((org.apache.catalina.core.StandardContext) context).setUnloadDelay(5000);
    }

    public void start() throws Exception {
        tomcat.start();
        if (!context.getState().isAvailable()) {
            throw new IllegalStateException("Kanban web application failed to start");
        }
    }

    public int port() { return tomcat.getConnector().getLocalPort(); }
    public Context context() { return context; }

    @Override
    public synchronized void close() throws Exception {
        if (closed) return;
        closed = true;
        try {
            // Stop accepting new connections; Tomcat waits for in-flight servlet work on stop.
            tomcat.getConnector().pause();
            tomcat.stop();
        } finally {
            try {
                tomcat.destroy();
            } finally {
                deleteTemporaryBase();
            }
        }
    }

    private void deleteTemporaryBase() throws Exception {
        // Only our canonical, generated temporary base may be deleted.
        Path target = baseDirectory.toRealPath();
        Path tempRoot = Path.of(System.getProperty("java.io.tmpdir")).toRealPath();
        if (!target.getParent().equals(tempRoot) || !target.getFileName().toString().startsWith("kanban-tomcat-")) {
            throw new IllegalStateException("Unexpected Tomcat temporary directory");
        }
        try (var paths = Files.walk(target)) {
            for (Path path : paths.sorted(java.util.Comparator.reverseOrder()).toList()) {
                Files.delete(path);
            }
        }
    }
}
