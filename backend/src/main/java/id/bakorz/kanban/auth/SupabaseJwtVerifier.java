package id.bakorz.kanban.auth;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.crypto.ECDSAVerifier;
import com.nimbusds.jose.jwk.Curve;
import com.nimbusds.jose.jwk.ECKey;
import com.nimbusds.jose.jwk.JWK;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.KeyOperation;
import com.nimbusds.jose.jwk.KeyUse;
import com.nimbusds.jwt.SignedJWT;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import static id.bakorz.kanban.auth.JwtVerificationException.Reason.*;

/** ES256/P-256 verification only. No token issuing, passwords, sessions, or token logging. */
public final class SupabaseJwtVerifier {
    private final JwtVerificationConfig config;
    private final Clock clock;
    private final JwksTransport transport;
    private Map<String, ECKey> keys = Map.of();
    private Instant expiresAt = Instant.MIN;
    private Instant nextRefreshAt = Instant.MIN;
    private boolean lastRefreshFailed;

    /** The caller owns the transport's lifecycle (including closing HttpJwksTransport). */
    public SupabaseJwtVerifier(JwtVerificationConfig config, Clock clock, JwksTransport transport) {
        this.config = Objects.requireNonNull(config);
        this.clock = Objects.requireNonNull(clock);
        this.transport = Objects.requireNonNull(transport);
    }

    /** Returns only the verified UUID. All error messages are categorical and safe to expose. */
    public UUID verify(String compactToken) throws JwtVerificationException {
        try {
            if (compactToken == null || compactToken.length() > config.maxTokenCharacters() || compactToken.isBlank()) {
                throw invalid();
            }
            SignedJWT token = SignedJWT.parse(compactToken);
            var header = token.getHeader();
            if (!JWSAlgorithm.ES256.equals(header.getAlgorithm()) || header.getKeyID() == null
                    || header.getKeyID().isBlank() || header.getKeyID().length() > 256
                    || header.getCriticalParams() != null || !header.isBase64URLEncodePayload()) {
                throw invalid();
            }
            // jku, x5u, embedded jwk/x5c and all other header key hints are deliberately ignored.
            // Only trusted server configuration supplies the lookup endpoint and public keys.
            var claims = token.getJWTClaimsSet();
            Instant now = clock.instant();
            if (!config.issuer().toString().equals(claims.getIssuer())
                    || claims.getAudience() == null || !claims.getAudience().contains("authenticated")
                    || claims.getExpirationTime() == null || !now.isBefore(claims.getExpirationTime().toInstant())
                    || (claims.getNotBeforeTime() != null && now.isBefore(claims.getNotBeforeTime().toInstant()))) {
                throw invalid();
            }
            String subject = claims.getSubject();
            if (subject == null || !subject.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")) {
                throw invalid();
            }
            UUID user = UUID.fromString(subject);
            ECKey key = key(header.getKeyID());
            if (!token.verify(new ECDSAVerifier(key))) throw invalid();
            return user;
        } catch (JwtVerificationException exception) {
            throw exception;
        } catch (Exception exception) {
            // Library exceptions may include raw JWT/claim values. Do not retain them as causes.
            throw invalid();
        }
    }

    /** Single-flight fetch and a shared refresh cooldown also bound unknown-kid attacks. */
    private synchronized ECKey key(String keyId) throws JwtVerificationException {
        Instant now = clock.instant();
        ECKey cached = keys.get(keyId);
        if (cached != null && now.isBefore(expiresAt)) return cached;
        if (now.isBefore(nextRefreshAt)) {
            throw new JwtVerificationException(lastRefreshFailed || !now.isBefore(expiresAt) ? KEYS_UNAVAILABLE : INVALID_TOKEN);
        }
        // Set before I/O so both successful misses and failures are rate limited.
        nextRefreshAt = now.plus(config.refreshInterval());
        try {
            byte[] body = transport.fetch(config.jwksUri(), config.requestTimeout(), config.maxJwksBytes());
            if (body == null || body.length > config.maxJwksBytes()) throw new IllegalArgumentException("JWKS limit");
            var parsed = JWKSet.parse(new String(body, StandardCharsets.UTF_8));
            if (parsed.getKeys().size() > 50) throw new IllegalArgumentException("JWKS key count");
            Map<String, ECKey> usable = new HashMap<>();
            for (JWK candidate : parsed.getKeys()) {
                if (candidate instanceof ECKey ec && Curve.P_256.equals(ec.getCurve()) && !ec.isPrivate()
                        && (ec.getAlgorithm() == null || JWSAlgorithm.ES256.equals(ec.getAlgorithm()))
                        && (ec.getKeyUse() == null || KeyUse.SIGNATURE.equals(ec.getKeyUse()))
                        && (ec.getKeyOperations() == null || ec.getKeyOperations().contains(KeyOperation.VERIFY))
                        && ec.getKeyID() != null && !ec.getKeyID().isBlank() && ec.getKeyID().length() <= 256) {
                    if (usable.putIfAbsent(ec.getKeyID(), ec) != null) throw new IllegalArgumentException("Duplicate key ID");
                }
            }
            if (usable.isEmpty()) throw new IllegalArgumentException("No supported public keys");
            keys = Map.copyOf(usable);
            expiresAt = clock.instant().plus(config.cacheTtl());
            lastRefreshFailed = false;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            lastRefreshFailed = true;
            throw new JwtVerificationException(KEYS_UNAVAILABLE);
        } catch (Exception exception) {
            lastRefreshFailed = true;
            throw new JwtVerificationException(KEYS_UNAVAILABLE);
        }
        ECKey selected = keys.get(keyId);
        if (selected == null) throw invalid();
        return selected;
    }

    private static JwtVerificationException invalid() { return new JwtVerificationException(INVALID_TOKEN); }
}
