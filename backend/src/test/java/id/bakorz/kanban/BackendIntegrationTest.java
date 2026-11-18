package id.bakorz.kanban;

import id.bakorz.kanban.dev.EmbeddedTomcat;
import id.bakorz.kanban.lifecycle.ApplicationLifecycle;
import jakarta.servlet.ServletContext;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Path;
import java.time.Duration;
import static org.junit.jupiter.api.Assertions.*;

class BackendIntegrationTest {
    private static EmbeddedTomcat server;
    private static HttpClient client;

    @BeforeAll
    static void startContainer() throws Exception {
        server = new EmbeddedTomcat(Path.of("src/main/webapp"), 0);
        server.start();
        client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    }

    @AfterAll
    static void stopContainer() throws Exception {
        if (client != null) client.close();
        if (server != null) server.close();
    }

    private HttpResponse<String> request(String path, String method, String authorization) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + server.port() + path))
                .timeout(Duration.ofSeconds(5)).method(method, HttpRequest.BodyPublishers.noBody());
        if (authorization != null) builder.header("Authorization", authorization);
        return client.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }

    private void assertJsonHeaders(HttpResponse<String> response) {
        assertEquals("application/json;charset=UTF-8", response.headers().firstValue("Content-Type").orElseThrow());
        assertEquals("no-store", response.headers().firstValue("Cache-Control").orElseThrow());
        assertEquals("nosniff", response.headers().firstValue("X-Content-Type-Options").orElseThrow());
        assertFalse(response.body().contains("Exception"));
        assertFalse(response.body().contains("<html"));
    }

    @Test
    void publicHealthIsLivenessOnly() throws Exception {
        var response = request("/api/health", "GET", null);
        assertEquals(200, response.statusCode());
        assertEquals("{\"status\":\"ok\",\"service\":\"kanban-api\"}", response.body());
        assertJsonHeaders(response);
        assertFalse(response.body().contains("database"));
    }

    @Test
    void healthRejectsPostAndOtherMethodsWithAllowGet() throws Exception {
        for (String method : new String[]{"POST", "PUT", "DELETE", "OPTIONS", "PATCH", "TRACE"}) {
            var response = request("/api/health", method, null);
            assertEquals(405, response.statusCode(), method);
            assertEquals("GET", response.headers().firstValue("Allow").orElseThrow());
            assertEquals("{\"error\":{\"code\":\"METHOD_NOT_ALLOWED\"}}", response.body());
            assertJsonHeaders(response);
        }
    }

    @Test
    void everyOtherApiPathFailsClosedEvenWithBearerToken() throws Exception {
        for (String path : new String[]{"/api", "/api/", "/api/boards", "/api/unknown", "/api/health/", "/api/health;ignored"}) {
            for (String authorization : new String[]{null, "Bearer not-a-verified-token"}) {
                var response = request(path, "GET", authorization);
                assertEquals(401, response.statusCode(), path);
                assertEquals("{\"error\":{\"code\":\"UNAUTHORIZED\"}}", response.body());
                assertEquals("Bearer", response.headers().firstValue("WWW-Authenticate").orElseThrow());
                assertJsonHeaders(response);
            }
        }
        assertEquals(401, request("/api/boards", "POST", null).statusCode());
        assertEquals(401, request("/api/boards", "OPTIONS", null).statusCode());
    }

    @Test
    void nonApiMissingRouteUsesSanitizedContainerErrorDispatch() throws Exception {
        var response = request("/missing", "GET", null);
        assertEquals(404, response.statusCode());
        assertEquals("{\"error\":{\"code\":\"NOT_FOUND\"}}", response.body());
        assertJsonHeaders(response);
    }

    @Test
    void unexpectedServletFailureReturnsJsonWithoutTrace() throws Exception {
        try (var separate = new EmbeddedTomcat(Path.of("src/main/webapp"), 0)) {
            org.apache.catalina.startup.Tomcat.addServlet(separate.context(), "test-failure",
                    new jakarta.servlet.http.HttpServlet() {
                        @Override
                        protected void service(jakarta.servlet.http.HttpServletRequest request,
                                             jakarta.servlet.http.HttpServletResponse response) {
                            throw new IllegalStateException("TEST_ONLY_PRIVATE_EXCEPTION_DETAIL");
                        }
                    });
            separate.context().addServletMappingDecoded("/test-failure", "test-failure");
            separate.start();
            var response = client.send(HttpRequest.newBuilder(
                    URI.create("http://127.0.0.1:" + separate.port() + "/test-failure"))
                    .timeout(Duration.ofSeconds(5)).GET().build(), HttpResponse.BodyHandlers.ofString());
            assertEquals(500, response.statusCode());
            assertEquals("{\"error\":{\"code\":\"INTERNAL_ERROR\"}}", response.body());
            assertFalse(response.body().contains("TEST_ONLY_PRIVATE"));
            assertJsonHeaders(response);
        }
    }

    @Test
    void realContainerInitializesAndDestroysLifecycle() throws Exception {
        try (var separate = new EmbeddedTomcat(Path.of("src/main/webapp"), 0)) {
            separate.start();
            ServletContext context = separate.context().getServletContext();
            assertNotNull(context.getAttribute(ApplicationLifecycle.STARTED_AT));
            separate.close();
            assertNull(context.getAttribute(ApplicationLifecycle.STARTED_AT));
        }
    }
}
