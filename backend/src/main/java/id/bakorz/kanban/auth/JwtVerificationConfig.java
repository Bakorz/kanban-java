package id.bakorz.kanban.auth;

import java.net.URI;
import java.time.Duration;
import java.util.Map;
import java.util.Objects;

/** Public, trusted server configuration; never inferred from a JWT header. */
public record JwtVerificationConfig(URI issuer, URI jwksUri, Duration cacheTtl,
                                    Duration refreshInterval, Duration requestTimeout,
                                    int maxJwksBytes, int maxTokenCharacters) {
    public JwtVerificationConfig {
        Objects.requireNonNull(issuer);
        Objects.requireNonNull(jwksUri);
        requireHttps(issuer);
        requireHttps(jwksUri);
        if (!issuer.getPath().equals("/auth/v1") || issuer.getRawQuery() != null || issuer.getRawFragment() != null
                || !jwksUri.equals(URI.create(issuer.toString() + "/.well-known/jwks.json"))) {
            throw new IllegalArgumentException("JWKS must match the configured /auth/v1 issuer");
        }
        bounded(cacheTtl, Duration.ofSeconds(30), Duration.ofHours(1));
        bounded(refreshInterval, Duration.ofSeconds(1), Duration.ofMinutes(5));
        bounded(requestTimeout, Duration.ofMillis(100), Duration.ofSeconds(10));
        if (refreshInterval.compareTo(cacheTtl) > 0 || maxJwksBytes < 1024 || maxJwksBytes > 262144
                || maxTokenCharacters < 1024 || maxTokenCharacters > 65536) {
            throw new IllegalArgumentException("Invalid JWT resource limits");
        }
    }

    public static JwtVerificationConfig fromEnvironment(Map<String, String> environment) {
        // This application deliberately supports Supabase's authenticated audience only.
        if (!"authenticated".equals(environment.getOrDefault("SUPABASE_JWT_AUDIENCE", "authenticated"))) {
            throw new IllegalArgumentException("SUPABASE_JWT_AUDIENCE must be authenticated");
        }
        return defaults(URI.create(required(environment, "SUPABASE_JWT_ISSUER")),
                URI.create(required(environment, "SUPABASE_JWKS_URL")));
    }

    public static JwtVerificationConfig defaults(URI issuer, URI jwksUri) {
        return new JwtVerificationConfig(issuer, jwksUri, Duration.ofMinutes(10),
                Duration.ofSeconds(30), Duration.ofSeconds(3), 65536, 16384);
    }

    private static String required(Map<String, String> environment, String key) {
        String value = environment.get(key);
        if (value == null || value.isBlank()) throw new IllegalArgumentException("Missing " + key);
        return value;
    }

    static void requireHttps(URI uri) {
        if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getRawUserInfo() != null
                || uri.getRawFragment() != null || uri.getRawQuery() != null
                || (uri.getPort() != -1 && uri.getPort() != 443)) {
            throw new IllegalArgumentException("Trusted JWT URLs must use HTTPS without credentials, query or fragment");
        }
    }

    private static void bounded(Duration value, Duration minimum, Duration maximum) {
        if (value == null || value.compareTo(minimum) < 0 || value.compareTo(maximum) > 0) {
            throw new IllegalArgumentException("JWT duration is outside allowed bounds");
        }
    }
}
