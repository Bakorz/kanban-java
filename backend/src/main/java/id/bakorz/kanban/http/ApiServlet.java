package id.bakorz.kanban.http;

import com.fasterxml.jackson.databind.JsonNode;
import id.bakorz.kanban.lifecycle.ApplicationRuntime;
import id.bakorz.kanban.model.Inputs;
import id.bakorz.kanban.service.ServiceException;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.sql.SQLException;
import java.util.Set;
import java.util.UUID;

/** Explicit small route table. No servlet-instance request state or reflection-based binding. */
public final class ApiServlet extends HttpServlet {
    private static final Set<String> BOARD_FIELDS = Set.of("name", "description");
    private static final Set<String> CARD_FIELDS = Set.of("title", "description", "priority", "dueDate");
    private static final Set<String> MOVE_FIELDS = Set.of("targetColumnId", "newPosition");

    @Override protected void service(HttpServletRequest req, HttpServletResponse res) throws IOException {
        if (!(req.getAttribute(ApiBoundaryFilter.USER_ID) instanceof UUID owner)) {
            JsonResponses.error(res, 401);
            return;
        }
        if (!(req.getServletContext().getAttribute(ApplicationRuntime.ATTRIBUTE) instanceof ApplicationRuntime runtime)
                || runtime.boards() == null || runtime.cards() == null) {
            JsonResponses.error(res, 503);
            return;
        }
        try {
            // The raw URI check rejects aliases (matrix parameters, encodings, duplicate slashes).
            String path = req.getRequestURI().substring(req.getContextPath().length());
            if (!path.matches("/api/(boards|boards/[A-Za-z0-9-]+|columns/[A-Za-z0-9-]+/cards|cards/[A-Za-z0-9-]+|cards/[A-Za-z0-9-]+/move)")) {
                JsonResponses.error(res, 404);
                return;
            }
            String[] parts = path.substring(5).split("/");
            String method = req.getMethod();
            if (parts[0].equals("boards") && parts.length == 1) {
                if (method.equals("GET")) JsonResponses.write(res, 200, ApiJson.boards(runtime.boards().list(owner)));
                else if (method.equals("POST")) {
                    JsonNode body = RequestJson.read(req, BOARD_FIELDS, Set.of("name"));
                    var detail = runtime.boards().create(owner, boardName(body), boardDescription(body));
                    res.setHeader("Location", req.getContextPath() + "/api/boards/" + detail.board().id());
                    JsonResponses.write(res, 201, ApiJson.boardDetail(detail));
                } else methodNotAllowed(res, "GET, POST");
            } else if (parts[0].equals("boards") && parts.length == 2) {
                UUID id = Inputs.uuid(parts[1], "id");
                switch (method) {
                    case "GET" -> JsonResponses.write(res, 200, ApiJson.boardDetail(runtime.boards().detail(owner, id)));
                    case "PUT" -> {
                        JsonNode body = RequestJson.read(req, BOARD_FIELDS, Set.of("name"));
                        JsonResponses.write(res, 200, ApiJson.board(runtime.boards().update(owner, id, boardName(body), boardDescription(body))));
                    }
                    case "DELETE" -> { runtime.boards().delete(owner, id); JsonResponses.noContent(res); }
                    default -> methodNotAllowed(res, "GET, PUT, DELETE");
                }
            } else if (parts[0].equals("columns") && parts.length == 3) {
                UUID id = Inputs.uuid(parts[1], "id");
                if (!method.equals("POST")) { methodNotAllowed(res, "POST"); return; }
                JsonNode body = RequestJson.read(req, CARD_FIELDS, Set.of("title"));
                String priority = body.has("priority") ? Inputs.priority(RequestJson.text(body, "priority", false), false).name() : "MEDIUM";
                var card = runtime.cards().create(owner, id, cardTitle(body), cardDescription(body), priority,
                        Inputs.dueDate(RequestJson.text(body, "dueDate", true)));
                JsonResponses.write(res, 201, ApiJson.card(card));
            } else if (parts[0].equals("cards") && parts.length == 2) {
                UUID id = Inputs.uuid(parts[1], "id");
                switch (method) {
                    case "PUT" -> {
                        JsonNode body = RequestJson.read(req, CARD_FIELDS, Set.of("title", "priority"));
                        var card = runtime.cards().update(owner, id, cardTitle(body), cardDescription(body),
                                Inputs.priority(RequestJson.text(body, "priority", false), false).name(),
                                Inputs.dueDate(RequestJson.text(body, "dueDate", true)));
                        JsonResponses.write(res, 200, ApiJson.card(card));
                    }
                    case "DELETE" -> { runtime.cards().delete(owner, id); JsonResponses.noContent(res); }
                    default -> methodNotAllowed(res, "PUT, DELETE");
                }
            } else if (parts[0].equals("cards") && parts.length == 3) {
                UUID id = Inputs.uuid(parts[1], "id");
                if (!method.equals("POST")) { methodNotAllowed(res, "POST"); return; }
                JsonNode body = RequestJson.read(req, MOVE_FIELDS, MOVE_FIELDS);
                UUID target = Inputs.uuid(RequestJson.text(body, "targetColumnId", false), "targetColumnId");
                JsonResponses.write(res, 200, ApiJson.boardDetail(runtime.cards().move(owner, id, target, RequestJson.integer(body, "newPosition"))));
            } else JsonResponses.error(res, 404);
        } catch (RequestJson.RequestFailure exception) {
            JsonResponses.error(res, exception.status(), exception.code(), null);
        } catch (Inputs.InvalidInput exception) {
            JsonResponses.error(res, 400, "VALIDATION_ERROR", "Invalid request fields.");
        } catch (ServiceException exception) {
            JsonResponses.error(res, exception.status(), exception.code(), exception.getMessage());
        } catch (SQLException exception) {
            // No SQL, identifiers, driver causes or pool connection information reaches logs/clients.
            req.getServletContext().log("Database operation unavailable; diagnostic details suppressed.");
            JsonResponses.error(res, 503);
        }
    }

    private static String boardName(JsonNode body) { return Inputs.boardName(RequestJson.text(body, "name", false)); }
    private static String boardDescription(JsonNode body) { return Inputs.boardDescription(RequestJson.text(body, "description", true)); }
    private static String cardTitle(JsonNode body) { return Inputs.cardTitle(RequestJson.text(body, "title", false)); }
    private static String cardDescription(JsonNode body) { return Inputs.cardDescription(RequestJson.text(body, "description", true)); }
    private static void methodNotAllowed(HttpServletResponse response, String allow) throws IOException {
        response.setHeader("Allow", allow);
        JsonResponses.error(response, 405);
    }
}
