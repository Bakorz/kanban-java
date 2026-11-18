package id.bakorz.kanban.http;

import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;

/** Temporary deny-by-default boundary. A supplied Bearer token is NOT yet verified. */
public final class ApiBoundaryFilter implements Filter {
    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        var httpRequest = (HttpServletRequest) request;
        var httpResponse = (HttpServletResponse) response;
        JsonResponses.headers(httpResponse);
        // Compare the exact URI too: path parameters/encoded alternate paths must not bypass this gate.
        String publicHealth = httpRequest.getContextPath() + "/api/health";
        if (!publicHealth.equals(httpRequest.getRequestURI())) {
            httpResponse.setHeader("WWW-Authenticate", "Bearer");
            JsonResponses.error(httpResponse, 401);
            return;
        }
        try {
            chain.doFilter(request, response);
        } catch (RuntimeException | ServletException exception) {
            httpRequest.getServletContext().log("API request failed", exception);
            if (httpResponse.isCommitted()) {
                throw exception;
            }
            httpResponse.reset();
            JsonResponses.error(httpResponse, 500);
        }
    }
}
