package id.bakorz.kanban.db;

import java.net.URI;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Map;
import java.util.Objects;

/** Validated private configuration. JDBC options cannot override credentials or TLS. */
public record DatabaseConfig(String jdbcUrl, String username, String password,
                             String sslMode, String sslRootCert,
                             int maximumPoolSize, Duration connectionTimeout, int statementTimeoutMs) {
    public DatabaseConfig {
        Objects.requireNonNull(jdbcUrl);
        Objects.requireNonNull(username);
        Objects.requireNonNull(password);
        if (username.isBlank() || password.isEmpty()) throw new IllegalArgumentException("Database credentials are missing");
        try {
            if (!jdbcUrl.startsWith("jdbc:postgresql://")) throw new IllegalArgumentException();
            URI uri = URI.create(jdbcUrl.substring(5));
            // Deliberately narrow URL grammar: all driver options are set by this application.
            // This excludes user/password, options, sslfactory, duplicate and percent-encoded injection.
            if (!"postgresql".equals(uri.getScheme()) || uri.getHost() == null || uri.getRawUserInfo() != null
                    || uri.getRawFragment() != null || uri.getPort() == 0 || uri.getPort() > 65535
                    || uri.getRawPath() == null || !uri.getRawPath().matches("/[A-Za-z0-9_-]+")
                    || !"sslmode=verify-full".equals(uri.getRawQuery())) throw new IllegalArgumentException();
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("JDBC_URL must specify a PostgreSQL host/database and only sslmode=verify-full");
        }
        if (!"verify-full".equals(sslMode)) throw new IllegalArgumentException("DB_SSL_MODE must be verify-full");
        if (sslRootCert != null && !Path.of(sslRootCert).isAbsolute()) {
            throw new IllegalArgumentException("DB_SSL_ROOT_CERT must be absolute");
        }
        if (maximumPoolSize < 1 || maximumPoolSize > 20) throw new IllegalArgumentException("DB_POOL_MAX_SIZE is out of bounds");
        Objects.requireNonNull(connectionTimeout);
        if (connectionTimeout.toMillis() < 500 || connectionTimeout.toMillis() > 30_000) {
            throw new IllegalArgumentException("DB_CONNECTION_TIMEOUT_MS is out of bounds");
        }
        if (statementTimeoutMs < 1000 || statementTimeoutMs > 60_000) {
            throw new IllegalArgumentException("DB_STATEMENT_TIMEOUT_MS is out of bounds");
        }
    }

    @Override public String toString() { return "DatabaseConfig[REDACTED]"; }

    public static DatabaseConfig fromEnvironment(Map<String, String> environment) {
        return new DatabaseConfig(required(environment, "JDBC_URL"), required(environment, "DB_USERNAME"),
                required(environment, "DB_PASSWORD"), environment.getOrDefault("DB_SSL_MODE", "verify-full"),
                blankToNull(environment.get("DB_SSL_ROOT_CERT")),
                integer(environment, "DB_POOL_MAX_SIZE", 5),
                Duration.ofMillis(integer(environment, "DB_CONNECTION_TIMEOUT_MS", 10000)),
                integer(environment, "DB_STATEMENT_TIMEOUT_MS", 10000));
    }

    private static String required(Map<String, String> environment, String key) {
        String value = environment.get(key);
        if (value == null || value.isBlank()) throw new IllegalArgumentException("Missing " + key);
        return value;
    }
    private static String blankToNull(String value) { return value == null || value.isBlank() ? null : value.strip(); }
    private static int integer(Map<String, String> environment, String key, int fallback) {
        String value = blankToNull(environment.get(key));
        if (value == null) return fallback;
        try { return Integer.parseInt(value); }
        catch (NumberFormatException exception) { throw new IllegalArgumentException(key + " must be an integer"); }
    }
}
