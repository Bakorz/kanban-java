package id.bakorz.kanban;

import id.bakorz.kanban.http.RequestJson;
import org.junit.jupiter.api.Test;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import static org.junit.jupiter.api.Assertions.*;

class RequestJsonTest {
    private void rejects(byte[] body, String type, long declared, int status) {
        assertEquals(status, assertThrows(RequestJson.RequestFailure.class,
                () -> RequestJson.read(new ByteArrayInputStream(body), type, declared, Set.of("name"), Set.of("name"))).status());
    }
    @Test void boundedStreamsWithoutContentLengthAndMalformedUtf8() {
        rejects(new byte[65537], "application/json", -1, 413);
        rejects(new byte[0], "application/json", 65537, 413);
        rejects(new byte[]{(byte)0xc3, (byte)0x28}, "application/json", -1, 400);
        rejects(new byte[0], "application/json", -1, 400);
    }
    @Test void duplicateUnknownTrailingAndNonObjectsRejected() {
        for (String body : new String[]{"{\"name\":\"x\",\"name\":\"y\"}", "{\"name\":\"x\",\"ownerId\":\"x\"}", "{}", "[]", "null", "{\"name\":\"x\"} {}"}) {
            rejects(body.getBytes(StandardCharsets.UTF_8), "application/json", -1, 400);
        }
    }
    @Test void mediaPolicyOnlyUtf8Json() throws Exception {
        byte[] body = "{\"name\":\"x\"}".getBytes(StandardCharsets.UTF_8);
        for (String type : new String[]{null, "text/plain", "application/json; charset=latin1", "application/json; x=y"}) rejects(body, type, -1, 415);
        assertEquals("x", RequestJson.read(new ByteArrayInputStream(body), "application/json; charset=\"UTF-8\"", -1, Set.of("name"), Set.of("name")).get("name").asText());
    }
}
