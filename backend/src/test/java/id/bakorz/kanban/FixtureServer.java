package id.bakorz.kanban;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.ECDSASigner;
import com.nimbusds.jose.jwk.Curve;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.gen.ECKeyGenerator;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import id.bakorz.kanban.auth.JwtVerificationConfig;
import id.bakorz.kanban.auth.SupabaseJwtVerifier;
import id.bakorz.kanban.db.BoardDao;
import id.bakorz.kanban.db.CardDao;
import id.bakorz.kanban.db.Transaction;
import id.bakorz.kanban.dev.EmbeddedTomcat;
import id.bakorz.kanban.lifecycle.ApplicationRuntime;
import id.bakorz.kanban.service.BoardService;
import id.bakorz.kanban.service.CardService;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.util.Date;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/** Explicit, test-classpath-only browser fixture; never packaged or enabled in production. */
public final class FixtureServer {
    private FixtureServer() {}
    public static void main(String[] args) throws Exception {
        var fixture = new LocalPostgres();
        EmbeddedTomcat server = null;
        try {
            var key = new ECKeyGenerator(Curve.P_256).keyID("browser-offline-fixture").generate();
            URI issuer = URI.create("https://fixture.invalid/auth/v1");
            String userId = "00000000-0000-4000-8000-000000000001";
            Instant now = Instant.now();
            var jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.ES256).keyID(key.getKeyID()).build(),
                    new JWTClaimsSet.Builder().issuer(issuer.toString()).audience("authenticated").subject(userId)
                            .issueTime(Date.from(now)).expirationTime(Date.from(now.plusSeconds(3600)))
                            .claim("role", "authenticated").claim("email", "fixture@example.test").build());
            jwt.sign(new ECDSASigner(key));
            byte[] jwks = new JWKSet(key.toPublicJWK()).toString().getBytes(StandardCharsets.UTF_8);
            var verifier = new SupabaseJwtVerifier(JwtVerificationConfig.defaults(issuer,
                    URI.create(issuer + "/.well-known/jwks.json")), Clock.systemUTC(), (uri, timeout, limit) -> jwks);
            var tx = new Transaction(fixture.database, 10000);
            var boardDao = new BoardDao(); var cardDao = new CardDao();
            var boards = new BoardService(tx, boardDao, cardDao);
            var cards = new CardService(tx, boardDao, cardDao, boards);
            Path application = args.length == 0 ? Path.of("src/main/webapp") : Path.of(args[0]);
            server = new EmbeddedTomcat(application, 8080);
            server.context().getServletContext().setAttribute(ApplicationRuntime.ATTRIBUTE,
                    new ApplicationRuntime(verifier, boards, cards, null, null));
            Path sessionFile = Path.of("target", "e2e-session.json").toAbsolutePath().normalize();
            if (!sessionFile.getParent().equals(Path.of("target").toAbsolutePath().normalize())) throw new IllegalStateException("Unexpected fixture artifact path");
            Files.createDirectories(sessionFile.getParent());
            var user = Map.of("id", userId, "aud", "authenticated", "role", "authenticated", "email", "fixture@example.test",
                    "email_confirmed_at", now.toString(), "created_at", now.toString(), "app_metadata", Map.of("provider", "email", "providers", new String[]{"email"}), "user_metadata", Map.of());
            var session = Map.of("access_token", jwt.serialize(), "refresh_token", "fixture-refresh-only",
                    "token_type", "bearer", "expires_in", 3600, "expires_at", now.plusSeconds(3600).getEpochSecond(), "user", user);
            Files.writeString(sessionFile, new ObjectMapper().writeValueAsString(session));
            server.start();
            var stopped = new CountDownLatch(1);
            var closed = new AtomicBoolean();
            EmbeddedTomcat active = server;
            Runnable close = () -> {
                if (!closed.compareAndSet(false, true)) return;
                try { active.close(); } catch (Exception ignored) { System.err.println("Fixture Tomcat cleanup failed"); }
                try { fixture.close(); } catch (Exception ignored) { System.err.println("Fixture database cleanup failed"); }
                try { Files.deleteIfExists(sessionFile); } catch (Exception ignored) { System.err.println("Fixture artifact cleanup failed"); }
                stopped.countDown();
            };
            var hook = new Thread(close, "kanban-browser-fixture-shutdown");
            Runtime.getRuntime().addShutdownHook(hook);
            try {
                System.out.println("KANBAN_BROWSER_FIXTURE_READY port=8080 session=target/e2e-session.json");
                // Even an orphaned runner self-cleans after a bounded acceptance-test window.
                stopped.await(15, TimeUnit.MINUTES);
            } finally {
                close.run();
                try { Runtime.getRuntime().removeShutdownHook(hook); } catch (IllegalStateException ignored) { }
            }
        } catch (Exception exception) {
            try { if (server != null) server.close(); } finally { fixture.close(); }
            throw exception;
        }
    }
}
