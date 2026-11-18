package id.bakorz.kanban.db;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.postgresql.ds.PGSimpleDataSource;
import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.Objects;

/** Bounded, lazy pool; application startup never opens a database connection. */
public final class Database implements AutoCloseable {
    private final HikariDataSource pool;

    public Database(DatabaseConfig config) {
        this(source(config), config.maximumPoolSize(), config.connectionTimeout().toMillis());
    }

    /** Explicit dependency-injection seam used with an isolated local test DataSource. */
    public Database(DataSource source, int maximumPoolSize, long connectionTimeoutMs) {
        var hikari = new HikariConfig();
        hikari.setDataSource(Objects.requireNonNull(source));
        hikari.setMaximumPoolSize(maximumPoolSize);
        hikari.setMinimumIdle(0);
        hikari.setConnectionTimeout(connectionTimeoutMs);
        hikari.setValidationTimeout(Math.min(5000, connectionTimeoutMs));
        hikari.setInitializationFailTimeout(-1);
        hikari.setIdleTimeout(60_000);
        hikari.setMaxLifetime(600_000);
        hikari.setPoolName("kanban-runtime");
        hikari.setAutoCommit(true);
        pool = new HikariDataSource(hikari);
    }

    private static DataSource source(DatabaseConfig config) {
        var source = new PGSimpleDataSource();
        source.setURL(config.jdbcUrl());
        source.setUser(config.username());
        source.setPassword(config.password());
        source.setSslMode("verify-full");
        if (config.sslRootCert() != null) source.setSslRootCert(config.sslRootCert());
        source.setApplicationName("kanban-api");
        source.setConnectTimeout(Math.max(1, (int) config.connectionTimeout().toSeconds()));
        source.setSocketTimeout(30);
        // No URL is supplied to Hikari. The SLF4J NOP provider intentionally suppresses
        // third-party configuration dumps and SQLException messages, even with DEBUG enabled.
        return source;
    }

    public Connection connection() throws SQLException { return pool.getConnection(); }
    public Connection timedConnection(int statementTimeoutMs) throws SQLException {
        Connection connection = pool.getConnection();
        try (var statement = connection.createStatement()) {
            statement.execute("SET statement_timeout = " + Math.max(1000, statementTimeoutMs));
            statement.execute("SET lock_timeout = 5000");
            statement.execute("SET idle_in_transaction_session_timeout = 15000");
        } catch (SQLException exception) {
            connection.close();
            throw exception;
        }
        return connection;
    }
    @Override public void close() { pool.close(); }
}
