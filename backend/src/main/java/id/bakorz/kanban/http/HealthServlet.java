package id.bakorz.kanban.http;

import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;

/** Process liveness only. Does not assert database or authentication readiness. */
public final class HealthServlet extends HttpServlet {
    @Override
    protected void service(HttpServletRequest request, HttpServletResponse response) throws IOException {
        if (!"GET".equals(request.getMethod())) {
            response.setHeader("Allow", "GET");
            JsonResponses.error(response, 405);
            return;
        }
        JsonResponses.write(response, 200, "{\"status\":\"ok\",\"service\":\"kanban-api\"}");
    }
}
