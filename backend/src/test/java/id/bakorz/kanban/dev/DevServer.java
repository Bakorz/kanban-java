package id.bakorz.kanban.dev;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.CountDownLatch;

/** Launched in a dedicated JVM by mvn -Pdev package exec:exec. Ctrl+C stops Tomcat. */
public final class DevServer {
    private DevServer() {}

    public static void main(String[] args) throws Exception {
        if (args.length != 1 || !Files.isRegularFile(Path.of(args[0]))) {
            throw new IllegalArgumentException("Build the WAR first: mvn -Pdev package exec:exec");
        }
        var stopped = new CountDownLatch(1);
        try (var server = new EmbeddedTomcat(Path.of(args[0]), 8080)) {
            Thread shutdown = new Thread(() -> {
                try {
                    server.close();
                } catch (Exception exception) {
                    System.err.println("Tomcat shutdown failed: " + exception.getClass().getSimpleName());
                } finally {
                    stopped.countDown();
                }
            }, "kanban-shutdown");
            Runtime.getRuntime().addShutdownHook(shutdown);
            server.start();
            System.out.println("Kanban API: http://127.0.0.1:8080/api/health (liveness only; Ctrl+C to stop)");
            stopped.await();
        }
    }
}
