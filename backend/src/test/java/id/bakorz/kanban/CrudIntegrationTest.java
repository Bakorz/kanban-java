package id.bakorz.kanban;

import com.fasterxml.jackson.databind.JsonNode;
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
import id.bakorz.kanban.model.BoardDetail;
import id.bakorz.kanban.model.Card;
import id.bakorz.kanban.service.BoardService;
import id.bakorz.kanban.service.CardService;
import id.bakorz.kanban.service.ServiceException;
import org.junit.jupiter.api.*;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

/** Real PostgreSQL + real Tomcat + real synthetic ES256 tokens; no remote service calls. */
@Timeout(value = 60, unit = TimeUnit.SECONDS)
class CrudIntegrationTest {
    private static final UUID A = UUID.fromString("00000000-0000-4000-8000-000000000001");
    private static final UUID B = UUID.fromString("00000000-0000-4000-8000-000000000002");
    private static final ObjectMapper JSON = new ObjectMapper();
    private static LocalPostgres postgres;
    private static Transaction tx;
    private static BoardService boards;
    private static CardService cards;
    private static EmbeddedTomcat server;
    private static HttpClient client;
    private static String tokenA;
    private static String tokenB;

    @BeforeAll static void start() throws Exception {
        postgres = new LocalPostgres();
        try {
            tx = new Transaction(postgres.database, 10000);
            var boardDao = new BoardDao(); var cardDao = new CardDao();
            boards = new BoardService(tx, boardDao, cardDao);
            cards = new CardService(tx, boardDao, cardDao, boards);
            var key = new ECKeyGenerator(Curve.P_256).keyID("offline-fixture").generate();
            var issuer = URI.create("https://fixture.invalid/auth/v1");
            byte[] jwks = new JWKSet(key.toPublicJWK()).toString().getBytes(StandardCharsets.UTF_8);
            var verifier = new SupabaseJwtVerifier(JwtVerificationConfig.defaults(issuer,
                    URI.create(issuer + "/.well-known/jwks.json")), Clock.systemUTC(), (uri, timeout, limit) -> jwks);
            for (UUID user : List.of(A, B)) {
                var jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.ES256).keyID(key.getKeyID()).build(),
                        new JWTClaimsSet.Builder().issuer(issuer.toString()).audience("authenticated").subject(user.toString())
                                .expirationTime(Date.from(Instant.now().plusSeconds(3600))).build());
                jwt.sign(new ECDSASigner(key));
                if (user.equals(A)) tokenA = jwt.serialize(); else tokenB = jwt.serialize();
            }
            server = new EmbeddedTomcat(Path.of("src/main/webapp"), 0);
            server.context().getServletContext().setAttribute(ApplicationRuntime.ATTRIBUTE,
                    new ApplicationRuntime(verifier, boards, cards, null, null));
            server.start();
            client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
        } catch (Exception exception) { stop(); throw exception; }
    }
    @AfterAll static void stop() throws Exception {
        try { if (client != null) client.close(); }
        finally { try { if (server != null) server.close(); } finally { if (postgres != null) postgres.close(); } }
    }
    @BeforeEach void clean() throws Exception {
        try (var connection = postgres.database.connection(); var statement = connection.createStatement()) {
            statement.execute("DELETE FROM kanban.boards");
        }
    }
    private static HttpResponse<String> http(String method, String path, String body, String token, String type) throws Exception {
        var req = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + server.port() + path)).timeout(Duration.ofSeconds(10));
        if (token != null) req.header("Authorization", "Bearer " + token);
        if (type != null) req.header("Content-Type", type);
        return client.send(req.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
    }
    private static JsonNode ok(String method, String path, String body, int status) throws Exception {
        var res = http(method, path, body, tokenA, body == null ? null : "application/json");
        assertEquals(status, res.statusCode(), res.body());
        assertEquals("no-store", res.headers().firstValue("Cache-Control").orElseThrow());
        if (status == 204) { assertEquals("", res.body()); return null; }
        return JSON.readTree(res.body());
    }
    private static BoardDetail board() throws Exception { return boards.create(A, "Board", "initial"); }
    private static Card card(UUID column) throws Exception { return cards.create(A, column, "Task", null, "MEDIUM", null); }
    private static void dense(BoardDetail detail) {
        var ids = new HashSet<UUID>();
        for (var column : detail.columns()) for (int i = 0; i < column.cards().size(); i++) {
            var card = column.cards().get(i);
            assertEquals(i, card.position()); assertEquals(column.id(), card.columnId()); assertTrue(ids.add(card.id()));
        }
    }

    @Test void runtimeRoleIsRestrictedAndCannotBypassRlsOrReadAuth() throws Exception {
        try (var connection = postgres.database.connection(); var statement = connection.createStatement()) {
            try (var rows = statement.executeQuery("SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user")) {
                assertTrue(rows.next()); assertEquals("kanban_runtime", rows.getString(1));
                assertFalse(rows.getBoolean(2)); assertFalse(rows.getBoolean(3));
            }
            assertThrows(java.sql.SQLException.class, () -> statement.executeQuery("SELECT * FROM auth.users"));
            assertThrows(java.sql.SQLException.class, () -> statement.executeQuery("SELECT * FROM kanban.schema_migrations"));
            assertThrows(java.sql.SQLException.class, () -> statement.execute("CREATE TABLE kanban.must_not_exist(id int)"));
            assertThrows(java.sql.SQLException.class, () -> statement.execute("DELETE FROM kanban.board_columns"));
        }
    }

    @Test void fullHttpCrudEnvelopesClearingOwnershipAndCascade() throws Exception {
        assertEquals(0, ok("GET", "/api/boards", null, 200).get("boards").size());
        JsonNode created = ok("POST", "/api/boards", "{\"name\":\"  Roadmap  \",\"description\":\"<script>not html</script>\"}", 201);
        String boardId = created.get("board").get("id").asText();
        assertEquals("Roadmap", created.get("board").get("name").asText());
        assertEquals(3, created.get("columns").size());
        assertEquals(List.of("To Do", "In Progress", "Done"), new ArrayList<String>() {{ created.get("columns").forEach(c -> add(c.get("name").asText())); }});
        String source = created.get("columns").get(0).get("id").asText();
        String target = created.get("columns").get(1).get("id").asText();
        JsonNode added = ok("POST", "/api/columns/" + source + "/cards", "{\"title\":\" Task \",\"description\":\"text\",\"dueDate\":\"2024-02-29\"}", 201).get("card");
        String cardId = added.get("id").asText();
        assertEquals("MEDIUM", added.get("priority").asText());
        assertEquals("2024-02-29", added.get("dueDate").asText());
        JsonNode edited = ok("PUT", "/api/cards/" + cardId, "{\"title\":\"Edited\",\"priority\":\"HIGH\",\"description\":null,\"dueDate\":null}", 200).get("card");
        assertTrue(edited.get("description").isNull()); assertTrue(edited.get("dueDate").isNull());
        assertEquals(cardId, ok("POST", "/api/cards/" + cardId + "/move", "{\"targetColumnId\":\"" + target + "\",\"newPosition\":0}", 200).get("columns").get(1).get("cards").get(0).get("id").asText());
        assertTrue(ok("PUT", "/api/boards/" + boardId, "{\"name\":\"Renamed\",\"description\":null}", 200).get("board").get("description").isNull());
        assertEquals("Renamed", ok("GET", "/api/boards/" + boardId, null, 200).get("board").get("name").asText());
        assertEquals(0, JSON.readTree(http("GET", "/api/boards", null, tokenB, null).body()).get("boards").size());
        for (String method : List.of("GET", "PUT", "DELETE")) assertEquals(404, http(method, "/api/boards/" + boardId, method.equals("PUT") ? "{\"name\":\"steal\"}" : null, tokenB, "application/json").statusCode());
        assertEquals(404, http("PUT", "/api/cards/" + cardId, "{\"title\":\"steal\",\"priority\":\"LOW\"}", tokenB, "application/json").statusCode());
        assertEquals(404, http("DELETE", "/api/cards/" + cardId, null, tokenB, null).statusCode());
        assertEquals(404, http("POST", "/api/columns/" + source + "/cards", "{\"title\":\"steal\"}", tokenB, "application/json").statusCode());
        ok("DELETE", "/api/cards/" + cardId, null, 204);
        ok("POST", "/api/columns/" + source + "/cards", "{\"title\":\"Cascade\"}", 201);
        ok("DELETE", "/api/boards/" + boardId, null, 204);
        try (var connection = postgres.database.connection(); var statement = connection.createStatement(); var rows = statement.executeQuery("SELECT (SELECT count(*) FROM kanban.board_columns), (SELECT count(*) FROM kanban.cards)")) {
            assertTrue(rows.next()); assertEquals(0, rows.getInt(1)); assertEquals(0, rows.getInt(2));
        }
    }

    @Test void httpStrictValidationRoutesAndAuthentication() throws Exception {
        for (String body : List.of("{}", "[]", "null", "{\"name\":\"a\",\"ownerId\":\"x\"}", "{\"name\":\"a\",\"name\":\"b\"}", "{\"name\":23}", "{\"name\":null}", "{\"name\":\" \"}", "{\"name\":\"x\"} true")) {
            assertEquals(400, http("POST", "/api/boards", body, tokenA, "application/json").statusCode(), body);
        }
        assertEquals(415, http("POST", "/api/boards", "{}", tokenA, "text/plain").statusCode());
        assertEquals(413, http("POST", "/api/boards", "x".repeat(65537), tokenA, "application/json").statusCode());
        assertEquals(401, http("GET", "/api/boards", null, "invalid", null).statusCode());
        assertEquals(401, http("GET", "/api/boards", null, null, null).statusCode());
        assertEquals(400, http("GET", "/api/boards/not-a-uuid", null, tokenA, null).statusCode());
        for (String path : List.of("/api/boards/", "/api/boards;alias", "/api/unknown", "/api/health/")) assertEquals(404, http("GET", path, null, tokenA, null).statusCode());
        assertEquals(405, http("PATCH", "/api/boards", null, tokenA, null).statusCode());
        var detail = board(); String column = detail.columns().getFirst().id().toString();
        for (String body : List.of("{\"title\":\"x\",\"priority\":null}", "{\"title\":\"x\",\"priority\":\"urgent\"}", "{\"title\":\"x\",\"dueDate\":\"2025-02-29\"}", "{\"title\":\"x\",\"position\":0}", "{\"title\":\"x\",\"description\":42}")) {
            assertEquals(400, http("POST", "/api/columns/" + column + "/cards", body, tokenA, "application/json").statusCode());
        }
    }

    @Test void serviceMovesDeletionRollbackAndRecency() throws Exception {
        var detail = board(); UUID boardId = detail.board().id(); UUID source = detail.columns().get(0).id(); UUID target = detail.columns().get(1).id();
        Card first = card(source), second = card(source), third = card(source);
        assertTrue(boards.detail(A, boardId).board().updatedAt().isAfter(detail.board().updatedAt()));
        var moved = cards.move(A, first.id(), source, 2);
        assertEquals(List.of(second.id(), third.id(), first.id()), moved.columns().get(0).cards().stream().map(Card::id).toList());
        cards.move(A, third.id(), target, 0);
        cards.delete(A, second.id());
        assertEquals(1, card(source).position());
        dense(boards.detail(A, boardId));
        BoardDetail before = boards.detail(A, boardId);
        assertEquals(400, assertThrows(ServiceException.class, () -> cards.move(A, first.id(), target, 99)).status());
        assertEquals(before, boards.detail(A, boardId));
        var other = board();
        assertEquals(400, assertThrows(ServiceException.class, () -> cards.move(A, first.id(), other.columns().getFirst().id(), 0)).status());
        assertEquals(404, assertThrows(ServiceException.class, () -> cards.move(B, first.id(), target, 0)).status());
        // Force failure after board insertion and column creation: rollback must remove every row.
        assertThrows(java.sql.SQLException.class, () -> tx.write(connection -> {
            var dao = new BoardDao(); var partial = dao.create(connection, A, "Partial", null);
            dao.createDefaultColumns(connection, partial.id());
            try (var statement = connection.createStatement()) { statement.execute("SELECT 1/0"); }
            return null;
        }));
        assertEquals(2, boards.list(A).size());
    }

    @Test void concurrentAppendsMovesDeletesAndBoardDeletionRemainDense() throws Exception {
        var detail = board(); UUID boardId = detail.board().id(); UUID source = detail.columns().getFirst().id(); UUID target = detail.columns().get(1).id();
        try (var executor = Executors.newFixedThreadPool(8)) {
            var tasks = new ArrayList<Callable<Void>>();
            for (int i = 0; i < 24; i++) tasks.add(() -> { card(source); return null; });
            for (var future : executor.invokeAll(tasks, 25, TimeUnit.SECONDS)) future.get(1, TimeUnit.SECONDS);
            var initial = boards.detail(A, boardId); dense(initial); assertEquals(24, initial.columns().getFirst().cards().size());
            tasks.clear();
            for (int i = 0; i < 12; i++) {
                UUID id = initial.columns().getFirst().cards().get(i).id();
                if (i % 2 == 0) tasks.add(() -> { cards.move(A, id, target, 0); return null; });
                else tasks.add(() -> { cards.delete(A, id); return null; });
            }
            for (var future : executor.invokeAll(tasks, 25, TimeUnit.SECONDS)) future.get(1, TimeUnit.SECONDS);
            var after = boards.detail(A, boardId); dense(after);
            assertEquals(18, after.columns().stream().mapToInt(c -> c.cards().size()).sum());
            // Same card twice, with one operation deliberately blocked on the board row.
            UUID id = after.columns().getFirst().cards().getFirst().id();
            try (var lock = postgres.database.connection()) {
                lock.setAutoCommit(false);
                new BoardDao().lockOwned(lock, boardId, A).orElseThrow();
                var moving = executor.submit(() -> cards.move(A, id, target, 0));
                var deleting = executor.submit(() -> { cards.delete(A, id); return null; });
                lock.commit();
                try { moving.get(10, TimeUnit.SECONDS); } catch (ExecutionException ex) { assertEquals(404, assertInstanceOf(ServiceException.class, ex.getCause()).status()); }
                deleting.get(10, TimeUnit.SECONDS);
            }
            dense(boards.detail(A, boardId));
            var append = executor.submit(() -> { try { card(source); } catch (ServiceException ex) { assertEquals(404, ex.status()); } return null; });
            var delete = executor.submit(() -> { boards.delete(A, boardId); return null; });
            append.get(10, TimeUnit.SECONDS); delete.get(10, TimeUnit.SECONDS);
            assertEquals(404, assertThrows(ServiceException.class, () -> boards.detail(A, boardId)).status());
        }
    }

    @Test void midMoveSqlFailureRollsBackEveryOrderingChange() throws Exception {
        var detail = board(); UUID boardId = detail.board().id();
        UUID source = detail.columns().getFirst().id(), target = detail.columns().get(1).id();
        Card moving = card(source); card(source); card(source); card(target);
        BoardDetail before = boards.detail(A, boardId);
        try (var admin = postgres.adminConnection(); var statement = admin.createStatement()) {
            // Trigger runs only for this synthetic UUID; a cross-column move updates source
            // positions before attempting to update this card in the destination.
            statement.execute("CREATE FUNCTION kanban.test_fail_move() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id = '" + moving.id() + "'::uuid THEN RAISE EXCEPTION 'TEST_ONLY_MOVE_FAILURE'; END IF; RETURN NEW; END $$");
            statement.execute("CREATE TRIGGER test_fail_move BEFORE UPDATE ON kanban.cards FOR EACH ROW EXECUTE FUNCTION kanban.test_fail_move()");
            try {
                assertThrows(java.sql.SQLException.class, () -> cards.move(A, moving.id(), target, 0));
                assertEquals(before, boards.detail(A, boardId));
                dense(boards.detail(A, boardId));
            } finally {
                statement.execute("DROP TRIGGER test_fail_move ON kanban.cards; DROP FUNCTION kanban.test_fail_move()");
            }
        }
        cards.move(A, moving.id(), target, 0);
        dense(boards.detail(A, boardId));
    }

    @Test void concurrentSameCardMovesRereadLocationAfterBoardLock() throws Exception {
        var detail = board(); UUID boardId = detail.board().id();
        UUID source = detail.columns().get(0).id(), middle = detail.columns().get(1).id(), end = detail.columns().get(2).id();
        Card moving = card(source); card(source); card(middle); card(end);
        try (var executor = Executors.newFixedThreadPool(2)) {
            for (int round = 0; round < 10; round++) {
                try (var lock = postgres.database.connection()) {
                    lock.setAutoCommit(false);
                    new BoardDao().lockOwned(lock, boardId, A).orElseThrow();
                    var entered = new CountDownLatch(2);
                    var one = executor.submit(() -> { entered.countDown(); return cards.move(A, moving.id(), middle, 0); });
                    var two = executor.submit(() -> { entered.countDown(); return cards.move(A, moving.id(), end, 0); });
                    assertTrue(entered.await(5, TimeUnit.SECONDS));
                    lock.commit();
                    one.get(10, TimeUnit.SECONDS); two.get(10, TimeUnit.SECONDS);
                }
                var current = boards.detail(A, boardId); dense(current);
                assertEquals(4, current.columns().stream().mapToInt(c -> c.cards().size()).sum());
                cards.move(A, moving.id(), source, 0);
            }
        }
    }

    @Test void repeatableReadSnapshotDoesNotMixConcurrentChanges() throws Exception {
        var detail = board(); UUID id = detail.board().id(); UUID column = detail.columns().getFirst().id();
        var firstRead = new CountDownLatch(1); var changed = new CountDownLatch(1);
        try (var executor = Executors.newSingleThreadExecutor()) {
            var snapshot = executor.submit(() -> tx.read(connection -> {
                var board = new BoardDao().findOwned(connection, id, A).orElseThrow();
                firstRead.countDown();
                try { assertTrue(changed.await(10, TimeUnit.SECONDS)); } catch (InterruptedException ex) { Thread.currentThread().interrupt(); throw new IllegalStateException(); }
                return boards.snapshot(connection, board);
            }));
            assertTrue(firstRead.await(10, TimeUnit.SECONDS));
            card(column); boards.delete(A, id); changed.countDown();
            var old = snapshot.get(10, TimeUnit.SECONDS);
            assertEquals(3, old.columns().size()); assertTrue(old.columns().stream().allMatch(c -> c.cards().isEmpty()));
        } finally { changed.countDown(); }
    }
}
