package id.bakorz.kanban.http;

import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

/** Static, non-reflected messages only: never include exception or request content. */
public final class JsonResponses {
    private JsonResponses() {}

    public static void headers(HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
    }

    public static void write(HttpServletResponse response, int status, String json) throws IOException {
        response.setStatus(status);
        headers(response);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType("application/json");
        response.getWriter().write(json);
    }

    public static void error(HttpServletResponse response, int status) throws IOException {
        String code = switch (status) {
            case 400 -> "BAD_REQUEST";
            case 401 -> "UNAUTHORIZED";
            case 403 -> "FORBIDDEN";
            case 404 -> "NOT_FOUND";
            case 405 -> "METHOD_NOT_ALLOWED";
            default -> "INTERNAL_ERROR";
        };
        write(response, status, "{\"error\":{\"code\":\"" + code + "\"}}");
    }
}
