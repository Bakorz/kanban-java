package id.bakorz.kanban.http;

import id.bakorz.kanban.auth.JwtVerificationException;
import id.bakorz.kanban.lifecycle.ApplicationRuntime;
import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Collections;

/** Authenticates each protected request; never uses sessions or body-supplied ownership. */
public final class ApiBoundaryFilter implements Filter {
    public static final String USER_ID = ApiBoundaryFilter.class.getName() + ".userId";

    @Override public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        var req = (HttpServletRequest) request;
        var res = (HttpServletResponse) response;
        JsonResponses.headers(res);
        req.removeAttribute(USER_ID);
        String health = req.getContextPath() + "/api/health";
        boolean exactHealth = health.equals(req.getRequestURI());
        if (!exactHealth) {
            var headers = Collections.list(req.getHeaders("Authorization"));
            // Exactly one value, exactly one space, a nonempty compact token and no whitespace/comma.
            if (headers.size() != 1 || !headers.getFirst().matches("(?i:Bearer) [A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+")) {
                unauthorized(res);
                return;
            }
            if (!(req.getServletContext().getAttribute(ApplicationRuntime.ATTRIBUTE) instanceof ApplicationRuntime runtime)
                    || runtime.verifier() == null) {
                unauthorized(res);
                return;
            }
            try {
                req.setAttribute(USER_ID, runtime.verifier().verify(headers.getFirst().substring(7)));
            } catch (JwtVerificationException exception) {
                if (exception.reason() == JwtVerificationException.Reason.KEYS_UNAVAILABLE) JsonResponses.error(res, 503);
                else unauthorized(res);
                return;
            }
        }
        try {
            chain.doFilter(request, response);
        } catch (RuntimeException | ServletException exception) {
            req.getServletContext().log("API request failed; diagnostic details suppressed.");
            if (!res.isCommitted()) {
                res.reset();
                JsonResponses.error(res, 500);
            }
        }
    }
    private static void unauthorized(HttpServletResponse response) throws IOException {
        response.setHeader("WWW-Authenticate", "Bearer");
        JsonResponses.error(response, 401);
    }
}
