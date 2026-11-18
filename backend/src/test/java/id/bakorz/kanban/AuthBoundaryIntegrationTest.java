package id.bakorz.kanban;

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
import id.bakorz.kanban.dev.EmbeddedTomcat;
import id.bakorz.kanban.http.ApiBoundaryFilter;
import id.bakorz.kanban.http.JsonResponses;
import id.bakorz.kanban.lifecycle.ApplicationRuntime;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

@Timeout(30)
class AuthBoundaryIntegrationTest {
    @Test void signedTokensValidateClaimsExposeOnlyUuidAndClassifyDependencies() throws Exception {
        var key = new ECKeyGenerator(Curve.P_256).keyID("test-only").generate();
        var issuer = URI.create("https://fixture.invalid/auth/v1");
        var config = JwtVerificationConfig.defaults(issuer, URI.create(issuer + "/.well-known/jwks.json"));
        byte[] jwks = new JWKSet(key.toPublicJWK()).toString().getBytes(StandardCharsets.UTF_8);
        UUID user = UUID.randomUUID();
        var verifier = new SupabaseJwtVerifier(config, Clock.systemUTC(), (uri, timeout, limit) -> jwks);
        try (var server = new EmbeddedTomcat(Path.of("src/main/webapp"), 0); var client = HttpClient.newHttpClient()) {
            server.context().getServletContext().setAttribute(ApplicationRuntime.ATTRIBUTE, new ApplicationRuntime(verifier, null, null, null, null));
            org.apache.catalina.startup.Tomcat.addServlet(server.context(), "identity", new HttpServlet() {
                @Override protected void service(HttpServletRequest req, HttpServletResponse res) throws IOException {
                    assertInstanceOf(UUID.class, req.getAttribute(ApiBoundaryFilter.USER_ID));
                    assertNull(req.getSession(false));
                    JsonResponses.write(res, 200, "{\"id\":\"" + req.getAttribute(ApiBoundaryFilter.USER_ID) + "\"}");
                }
            });
            server.context().addServletMappingDecoded("/api/identity", "identity");
            server.start();
            URI identity = URI.create("http://127.0.0.1:" + server.port() + "/api/identity");
            String valid = null;
            for (int variant = 0; variant < 6; variant++) {
                var claims = new JWTClaimsSet.Builder().issuer(issuer.toString()).audience("authenticated").subject(user.toString())
                        .expirationTime(Date.from(Instant.now().plusSeconds(300)));
                switch (variant) {
                    case 1 -> claims.expirationTime(Date.from(Instant.now().minusSeconds(1)));
                    case 2 -> claims.issuer("https://wrong.invalid/auth/v1");
                    case 3 -> claims.audience("wrong");
                    case 4 -> claims.subject("not-uuid");
                    case 5 -> claims.notBeforeTime(Date.from(Instant.now().plusSeconds(300)));
                    default -> { }
                }
                var signed = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.ES256).keyID(key.getKeyID()).build(), claims.build());
                signed.sign(new ECDSASigner(key));
                if (variant == 0) valid = signed.serialize();
                var response = client.send(HttpRequest.newBuilder(identity).timeout(Duration.ofSeconds(5)).header("Authorization", "Bearer " + signed.serialize()).build(), HttpResponse.BodyHandlers.ofString());
                assertEquals(variant == 0 ? 200 : 401, response.statusCode());
                if (variant == 0) assertEquals("{\"id\":\"" + user + "\"}", response.body());
                assertFalse(response.body().contains(signed.serialize()));
            }
            for (String header : new String[]{"Bearer  " + valid, "Bearer " + valid + ",junk", "Basic " + valid}) {
                assertEquals(401, client.send(HttpRequest.newBuilder(identity).timeout(Duration.ofSeconds(5)).header("Authorization", header).build(), HttpResponse.BodyHandlers.ofString()).statusCode());
            }
            assertEquals(401, client.send(HttpRequest.newBuilder(identity).timeout(Duration.ofSeconds(5)).header("Authorization", "Bearer " + valid).header("Authorization", "Bearer " + valid).build(), HttpResponse.BodyHandlers.ofString()).statusCode());
            URI boards = URI.create("http://127.0.0.1:" + server.port() + "/api/boards");
            assertEquals(503, client.send(HttpRequest.newBuilder(boards).timeout(Duration.ofSeconds(5)).header("Authorization", "Bearer " + valid).build(), HttpResponse.BodyHandlers.ofString()).statusCode());
            var unavailable = new SupabaseJwtVerifier(config, Clock.systemUTC(), (uri, timeout, limit) -> { throw new IOException("PRIVATE_DETAIL"); });
            server.context().getServletContext().setAttribute(ApplicationRuntime.ATTRIBUTE, new ApplicationRuntime(unavailable, null, null, null, null));
            var response = client.send(HttpRequest.newBuilder(identity).timeout(Duration.ofSeconds(5)).header("Authorization", "Bearer " + valid).build(), HttpResponse.BodyHandlers.ofString());
            assertEquals(503, response.statusCode()); assertFalse(response.body().contains("PRIVATE_DETAIL"));
            server.context().getServletContext().removeAttribute(ApplicationRuntime.ATTRIBUTE);
            assertEquals(401, client.send(HttpRequest.newBuilder(identity).timeout(Duration.ofSeconds(5)).header("Authorization", "Bearer " + valid).build(), HttpResponse.BodyHandlers.ofString()).statusCode());
        }
    }
}
