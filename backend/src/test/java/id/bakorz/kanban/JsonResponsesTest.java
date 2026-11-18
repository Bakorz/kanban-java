package id.bakorz.kanban;

import id.bakorz.kanban.http.JsonResponses;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.Test;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.lang.reflect.Proxy;
import java.util.HashMap;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;

class JsonResponsesTest {
    @Test
    void commonErrorsUseFixedJsonCodesAndSafeHeaders() throws Exception {
        Map<Integer, String> codes = Map.of(400, "BAD_REQUEST", 401, "UNAUTHORIZED", 403, "FORBIDDEN",
                404, "NOT_FOUND", 405, "METHOD_NOT_ALLOWED", 500, "INTERNAL_ERROR");
        for (var expected : codes.entrySet()) {
            var body = new StringWriter();
            var calls = new HashMap<String, Object>();
            var response = (HttpServletResponse) Proxy.newProxyInstance(getClass().getClassLoader(),
                    new Class<?>[]{HttpServletResponse.class}, (proxy, method, args) -> {
                        if (method.getName().equals("getWriter")) return new PrintWriter(body);
                        if (method.getName().equals("setHeader")) calls.put((String) args[0], args[1]);
                        else if (args != null && args.length == 1) calls.put(method.getName(), args[0]);
                        return null;
                    });
            JsonResponses.error(response, expected.getKey());
            assertEquals(expected.getKey(), calls.get("setStatus"));
            assertEquals("application/json", calls.get("setContentType"));
            assertEquals("UTF-8", calls.get("setCharacterEncoding"));
            assertEquals("no-store", calls.get("Cache-Control"));
            assertEquals("nosniff", calls.get("X-Content-Type-Options"));
            assertEquals("{\"error\":{\"code\":\"" + expected.getValue() + "\"}}", body.toString());
        }
    }
}
