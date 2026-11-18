package id.bakorz.kanban;

import id.bakorz.kanban.db.DatabaseConfig;
import org.junit.jupiter.api.Test;
import java.time.Duration;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;

class DatabaseConfigTest {
    private DatabaseConfig config(String url, String mode) {
        return new DatabaseConfig(url, "runtime", "fixture-private-password", mode, "/fixture/root.crt", 5, Duration.ofSeconds(3), 10000);
    }
    @Test void onlyAuthoritativeVerifyFullTlsAndNoInjectedOptions() {
        assertEquals("verify-full", config("jdbc:postgresql://db.example:5432/postgres?sslmode=verify-full", "verify-full").sslMode());
        for (String query : new String[]{"sslmode=disable", "sslmode=verify-ca", "sslmode=require", "sslmode=verify-full&password=attack", "sslmode=verify-full&user=attack", "sslmode=verify-full&sslmode=disable", "%73slmode=verify-full", "sslmode=verify-full&options=-c%20search_path=public", "sslmode=verify-full&sslfactory=attack"}) {
            var error = assertThrows(IllegalArgumentException.class, () -> config("jdbc:postgresql://db.example/postgres?" + query, "verify-full"));
            assertFalse(error.getMessage().contains("attack"));
        }
        for (String mode : new String[]{"disable", "verify-ca", "require", "prefer"}) assertThrows(IllegalArgumentException.class,
                () -> config("jdbc:postgresql://db.example/postgres?sslmode=verify-full", mode));
    }
    @Test void invalidUrlsAreCategoricalAndToStringNeverContainsPrivateValues() {
        for (String url : new String[]{"jdbc:postgresql://runtime:fixture-private-password@db.example/postgres?sslmode=verify-full", "jdbc:postgresql://db.example/postgres?sslmode=verify-full#secret", "jdbc:postgresql://db.example/postgres", "jdbc:postgresql://db.example/a/b?sslmode=verify-full", "wrong", "jdbc:postgresql://db.example:0/postgres?sslmode=verify-full"}) {
            var error = assertThrows(IllegalArgumentException.class, () -> config(url, "verify-full"));
            assertNull(error.getCause()); assertFalse(error.getMessage().contains("fixture-private-password"));
        }
        String safe = config("jdbc:postgresql://db.example/postgres?sslmode=verify-full", "verify-full").toString();
        assertEquals("DatabaseConfig[REDACTED]", safe);
    }
    @Test void missingAndOutOfBoundsConfigurationRejected() {
        assertThrows(IllegalArgumentException.class, () -> DatabaseConfig.fromEnvironment(Map.of()));
        var env = new java.util.HashMap<>(Map.of("JDBC_URL", "jdbc:postgresql://db.example/postgres?sslmode=verify-full", "DB_USERNAME", "runtime", "DB_PASSWORD", "fixture"));
        for (String key : new String[]{"DB_POOL_MAX_SIZE", "DB_CONNECTION_TIMEOUT_MS", "DB_STATEMENT_TIMEOUT_MS"}) {
            env.put(key, "-1"); assertThrows(IllegalArgumentException.class, () -> DatabaseConfig.fromEnvironment(env)); env.remove(key);
            env.put(key, "secret-not-a-number");
            assertFalse(assertThrows(IllegalArgumentException.class, () -> DatabaseConfig.fromEnvironment(env)).getMessage().contains("secret-not-a-number")); env.remove(key);
        }
    }
}
