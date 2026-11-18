package id.bakorz.kanban.auth;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.ECDSASigner;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jose.jwk.Curve;
import com.nimbusds.jose.jwk.ECKey;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.gen.ECKeyGenerator;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import org.junit.jupiter.api.Test;
import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.jupiter.api.Assertions.*;
import static id.bakorz.kanban.auth.JwtVerificationException.Reason.*;

@org.junit.jupiter.api.Timeout(15)
class SupabaseJwtVerifierTest {
    private static final URI ISSUER = URI.create("https://example.supabase.co/auth/v1");
    private static final URI JWKS = URI.create(ISSUER + "/.well-known/jwks.json");
    private static final UUID USER = UUID.fromString("123e4567-e89b-42d3-a456-426614174000");
    private final MutableClock clock = new MutableClock();
    private final ECKey first = new ECKeyGenerator(Curve.P_256).keyID("first").generate();
    private final ECKey second = new ECKeyGenerator(Curve.P_256).keyID("second").generate();

    SupabaseJwtVerifierTest() throws Exception {}

    private JWTClaimsSet.Builder claims() {
        return new JWTClaimsSet.Builder().issuer(ISSUER.toString()).audience("authenticated")
                .subject(USER.toString()).expirationTime(Date.from(clock.instant().plusSeconds(3600)));
    }
    private String sign(ECKey key, JWTClaimsSet claims) throws Exception {
        return sign(key, claims, new JWSHeader.Builder(JWSAlgorithm.ES256).keyID(key.getKeyID()).build());
    }
    private String sign(ECKey key, JWTClaimsSet claims, JWSHeader header) throws Exception {
        var token = new SignedJWT(header, claims);
        token.sign(new ECDSASigner(key));
        return token.serialize();
    }
    private byte[] jwks(ECKey key) {
        return new JWKSet(key.toPublicJWK()).toString().getBytes(StandardCharsets.UTF_8);
    }
    private SupabaseJwtVerifier verifier(JwksTransport transport) {
        return new SupabaseJwtVerifier(JwtVerificationConfig.defaults(ISSUER, JWKS), clock, transport);
    }
    private void invalid(SupabaseJwtVerifier verifier, String token) {
        var error = assertThrows(JwtVerificationException.class, () -> verifier.verify(token));
        assertEquals(INVALID_TOKEN, error.reason());
        assertEquals("INVALID_TOKEN", error.getMessage());
        assertNull(error.getCause());
    }

    @Test void validatesSignatureAndMinimalIdentityWithCachedKeys() throws Exception {
        var calls = new AtomicInteger();
        var verifier = verifier((uri, timeout, limit) -> { assertEquals(JWKS, uri); calls.incrementAndGet(); return jwks(first); });
        String token = sign(first, claims().build());
        assertEquals(USER, verifier.verify(token));
        assertEquals(USER, verifier.verify(token));
        assertEquals(1, calls.get());
        invalid(verifier, sign(second, claims().build(), new JWSHeader.Builder(JWSAlgorithm.ES256).keyID("first").build()));
    }

    @Test void rejectsAlgorithmConfusionMalformedAndOversizedTokensWithoutFetch() throws Exception {
        var calls = new AtomicInteger();
        var verifier = verifier((uri, timeout, limit) -> { calls.incrementAndGet(); return jwks(first); });
        var hs = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.HS256).keyID("first").build(), claims().build());
        hs.sign(new MACSigner(new byte[32]));
        for (String bad : new String[]{hs.serialize(), "a.b.c", "", "x".repeat(20000)}) invalid(verifier, bad);
        invalid(verifier, null);
        assertEquals(0, calls.get());
    }

    @Test void requiresIssuerAudienceExpirationAndCanonicalUuidSubject() throws Exception {
        var verifier = verifier((uri, timeout, limit) -> jwks(first));
        List<JWTClaimsSet> bad = List.of(
                claims().issuer("https://attacker.invalid/auth/v1").build(), claims().issuer(null).build(),
                claims().audience("other").build(), claims().audience((String) null).build(),
                claims().expirationTime(Date.from(clock.instant())).build(), claims().expirationTime(null).build(),
                claims().subject("1-1-1-1-1").build(), claims().subject(null).build(),
                claims().notBeforeTime(Date.from(clock.instant().plusSeconds(1))).build());
        for (var claim : bad) invalid(verifier, sign(first, claim));
        assertEquals(USER, verifier.verify(sign(first, claims().audience(List.of("other", "authenticated")).build())));
        assertEquals(USER, verifier.verify(sign(first, claims().notBeforeTime(Date.from(clock.instant())).build())));
    }

    @Test void ignoresUntrustedHeaderUrlsAndEmbeddedKey() throws Exception {
        var header = new JWSHeader.Builder(JWSAlgorithm.ES256).keyID("first")
                .jwkURL(URI.create("https://attacker.invalid/keys"))
                .x509CertURL(URI.create("https://attacker.invalid/cert")).jwk(second.toPublicJWK()).build();
        var verifier = verifier((uri, timeout, limit) -> { assertEquals(JWKS, uri); return jwks(first); });
        assertEquals(USER, verifier.verify(sign(first, claims().build(), header)));
    }

    @Test void unknownKidRotationIsRateLimitedAndRefreshesAfterCooldown() throws Exception {
        var calls = new AtomicInteger();
        var verifier = verifier((uri, timeout, limit) -> calls.incrementAndGet() == 1 ? jwks(first) : jwks(second));
        assertEquals(USER, verifier.verify(sign(first, claims().build())));
        String rotated = sign(second, claims().build());
        for (int i = 0; i < 20; i++) invalid(verifier, rotated);
        assertEquals(1, calls.get());
        clock.advance(30);
        assertEquals(USER, verifier.verify(rotated));
        assertEquals(2, calls.get());
    }

    @Test void refreshFailureIsFailClosedAndRateLimitedButFreshKnownCacheRemainsUsable() throws Exception {
        var calls = new AtomicInteger();
        var verifier = verifier((uri, timeout, limit) -> {
            if (calls.incrementAndGet() > 1) throw new IOException("SECRET_NETWORK_DETAIL");
            return jwks(first);
        });
        String valid = sign(first, claims().build());
        assertEquals(USER, verifier.verify(valid));
        clock.advance(30);
        var failed = assertThrows(JwtVerificationException.class, () -> verifier.verify(sign(second, claims().build())));
        assertEquals(KEYS_UNAVAILABLE, failed.reason()); assertNull(failed.getCause());
        assertEquals(USER, verifier.verify(valid));
        clock.advance(600);
        for (int i = 0; i < 10; i++) {
            assertEquals(KEYS_UNAVAILABLE, assertThrows(JwtVerificationException.class, () -> verifier.verify(valid)).reason());
        }
        assertEquals(3, calls.get());
    }

    @Test void concurrentColdRequestsPerformOneFetch() throws Exception {
        var entered = new CountDownLatch(1); var release = new CountDownLatch(1); var calls = new AtomicInteger();
        var verifier = verifier((uri, timeout, limit) -> { calls.incrementAndGet(); entered.countDown(); release.await(); return jwks(first); });
        String token = sign(first, claims().build());
        try (var executor = Executors.newFixedThreadPool(12)) {
            var results = new ArrayList<java.util.concurrent.Future<UUID>>();
            for (int i = 0; i < 12; i++) results.add(executor.submit(() -> verifier.verify(token)));
            assertTrue(entered.await(3, java.util.concurrent.TimeUnit.SECONDS));
            release.countDown();
            for (var result : results) assertEquals(USER, result.get(3, java.util.concurrent.TimeUnit.SECONDS));
        } finally { release.countDown(); }
        assertEquals(1, calls.get());
    }

    @Test void malformedOversizedPrivateAndUnsupportedJwksFailClosed() throws Exception {
        for (byte[] data : new byte[][]{"not-json".getBytes(StandardCharsets.UTF_8), new byte[70000],
                new JWKSet(first).toString(false).getBytes(StandardCharsets.UTF_8),
                "{\"keys\":[]}".getBytes(StandardCharsets.UTF_8)}) {
            var verifier = verifier((uri, timeout, limit) -> data);
            assertEquals(KEYS_UNAVAILABLE, assertThrows(JwtVerificationException.class,
                    () -> verifier.verify(sign(first, claims().build()))).reason());
        }
    }

    @Test void publicConfigOnlyAcceptsMatchingHttpsIssuerAndJwks() {
        assertThrows(IllegalArgumentException.class, () -> JwtVerificationConfig.defaults(URI.create("http://example.supabase.co/auth/v1"), JWKS));
        assertThrows(IllegalArgumentException.class, () -> JwtVerificationConfig.defaults(ISSUER, URI.create("https://attacker.invalid/keys")));
        assertThrows(IllegalArgumentException.class, () -> JwtVerificationConfig.defaults(URI.create("https://u:p@example.supabase.co/auth/v1"), JWKS));
        assertThrows(IllegalArgumentException.class, () -> JwtVerificationConfig.fromEnvironment(java.util.Map.of()));
    }

    private static final class MutableClock extends Clock {
        private volatile Instant now = Instant.parse("2026-01-01T00:00:00Z");
        void advance(long seconds) { now = now.plusSeconds(seconds); }
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }
}
