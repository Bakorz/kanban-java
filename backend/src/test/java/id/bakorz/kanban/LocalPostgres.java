package id.bakorz.kanban;

import id.bakorz.kanban.db.Database;
import org.postgresql.ds.PGSimpleDataSource;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

/** Disposable Docker PostgreSQL only. Never reads a URL or password from the environment. */
final class LocalPostgres implements AutoCloseable {
    private static final String IMAGE = "postgres:17.7-alpine";
    private final String name = "kanban-backend-test-" + UUID.randomUUID();
    final Database database;
    private final PGSimpleDataSource adminSource;

    LocalPostgres() throws Exception {
        Database opened = null;
        try {
            command("docker", "run", "--detach", "--rm", "--name", name, "--publish", "127.0.0.1::5432",
                    "--env", "POSTGRES_DB=kanban_backend_test", "--env", "POSTGRES_USER=kanban_fixture",
                    "--env", "POSTGRES_PASSWORD=isolated-test-only", IMAGE);
            String binding = command("docker", "port", name, "5432/tcp").strip();
            if (!binding.matches("127\\.0\\.0\\.1:[0-9]+")) throw new IllegalStateException("Unexpected local test port");
            int port = Integer.parseInt(binding.substring(binding.lastIndexOf(':') + 1));
            var source = new PGSimpleDataSource();
            source.setServerNames(new String[]{"127.0.0.1"});
            source.setPortNumbers(new int[]{port});
            source.setDatabaseName("kanban_backend_test");
            source.setUser("kanban_fixture");
            source.setPassword("isolated-test-only");
            source.setSslMode("disable");
            source.setConnectTimeout(1);
            source.setSocketTimeout(15);
            adminSource = source;
            // Image initialization temporarily accepts Unix-socket connections before its
            // final TCP server starts. Probe the exact published JDBC endpoint, not pg_isready.
            try (var connection = awaitPublishedConnection(adminSource); var statement = connection.createStatement()) {
                statement.execute("CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY)");
                // Exercise the authoritative migration, not a test-only approximation of the schema.
                statement.execute(Files.readString(Path.of("../database/migrations/001_initial_schema.sql")));
                statement.execute(Files.readString(Path.of("../database/migrations/002_runtime_role.sql")));
                statement.execute("ALTER ROLE kanban_runtime LOGIN PASSWORD 'isolated-runtime-test-only'");
                statement.execute("INSERT INTO auth.users VALUES ('00000000-0000-4000-8000-000000000001'), ('00000000-0000-4000-8000-000000000002')");
            }
            var runtime = new PGSimpleDataSource();
            runtime.setServerNames(new String[]{"127.0.0.1"});
            runtime.setPortNumbers(new int[]{port});
            runtime.setDatabaseName("kanban_backend_test");
            runtime.setUser("kanban_runtime");
            runtime.setPassword("isolated-runtime-test-only");
            runtime.setSslMode("disable");
            runtime.setConnectTimeout(1);
            runtime.setSocketTimeout(15);
            opened = new Database(runtime, 12, 3000);
            database = opened;
        } catch (Exception exception) {
            if (opened != null) opened.close();
            command("docker", "rm", "--force", name);
            throw exception;
        }
    }

    private static Connection awaitPublishedConnection(PGSimpleDataSource source) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(20);
        source.setSocketTimeout(1);
        try {
            while (System.nanoTime() < deadline) {
                try {
                    Connection connection = source.getConnection();
                    try {
                        if (connection.isValid(1)) return connection;
                    } catch (SQLException exception) {
                        connection.close();
                        throw exception;
                    }
                    connection.close();
                } catch (SQLException unavailable) {
                    // Retry only this newly created, fixed loopback fixture; never a live URL.
                }
                TimeUnit.MILLISECONDS.sleep(100);
            }
            throw new IllegalStateException("Disposable PostgreSQL TCP readiness deadline exceeded");
        } finally {
            source.setSocketTimeout(15);
        }
    }

    /** Test-only authority for injected failure-trigger DDL; never used by application services. */
    Connection adminConnection() throws SQLException { return adminSource.getConnection(); }

    private static String command(String... arguments) throws Exception {
        var process = new ProcessBuilder(arguments).redirectErrorStream(true).start();
        try {
            if (!process.waitFor(40, TimeUnit.SECONDS)) throw new IllegalStateException("Disposable database command timed out");
            String output = new String(process.getInputStream().readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
            if (process.exitValue() != 0) throw new IllegalStateException("Disposable database command failed: " + output);
            return output;
        } finally {
            if (process.isAlive()) process.destroyForcibly().waitFor(5, TimeUnit.SECONDS);
        }
    }

    @Override public void close() throws Exception {
        database.close();
        command("docker", "rm", "--force", name);
    }
}
