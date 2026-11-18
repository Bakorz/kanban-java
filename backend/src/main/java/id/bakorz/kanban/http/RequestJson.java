package id.bakorz.kanban.http;

import com.fasterxml.jackson.core.JsonFactory;
import com.fasterxml.jackson.core.StreamReadConstraints;
import com.fasterxml.jackson.core.StreamReadFeature;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import id.bakorz.kanban.model.Inputs;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/** Strict, bounded object-only JSON input. Reject identity fields by allowlist. */
public final class RequestJson {
    public static final int MAX_BYTES = 65536;
    private static final ObjectMapper MAPPER = new ObjectMapper(JsonFactory.builder()
            .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
            .streamReadConstraints(StreamReadConstraints.builder().maxNestingDepth(20).maxStringLength(MAX_BYTES).build())
            .build()).enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
    private RequestJson() {}

    public static JsonNode read(HttpServletRequest request, Set<String> allowed, Set<String> required) throws IOException {
        return read(request.getInputStream(), request.getContentType(), request.getContentLengthLong(), allowed, required);
    }

    public static JsonNode read(InputStream input, String contentType, long contentLength,
                                Set<String> allowed, Set<String> required) throws IOException {
        if (contentType == null) throw new RequestFailure(415, "UNSUPPORTED_MEDIA_TYPE");
        String[] parts = contentType.split(";");
        if (!parts[0].strip().equalsIgnoreCase("application/json")) throw new RequestFailure(415, "UNSUPPORTED_MEDIA_TYPE");
        for (int i = 1; i < parts.length; i++) {
            String parameter = parts[i].strip().toLowerCase(Locale.ROOT);
            if (!parameter.equals("charset=utf-8") && !parameter.equals("charset=\"utf-8\"")) {
                throw new RequestFailure(415, "UNSUPPORTED_MEDIA_TYPE");
            }
        }
        if (contentLength > MAX_BYTES) throw new RequestFailure(413, "PAYLOAD_TOO_LARGE");
        byte[] bytes = input.readNBytes(MAX_BYTES + 1);
        if (bytes.length > MAX_BYTES) throw new RequestFailure(413, "PAYLOAD_TOO_LARGE");
        final String text;
        try {
            text = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();
        } catch (CharacterCodingException exception) { throw new RequestFailure(400, "INVALID_JSON"); }
        JsonNode root;
        try { root = MAPPER.readTree(text); }
        catch (IOException exception) { throw new RequestFailure(400, "INVALID_JSON"); }
        if (root == null || !root.isObject()) throw new RequestFailure(400, "INVALID_JSON");
        var fields = new HashSet<String>();
        root.fieldNames().forEachRemaining(fields::add);
        if (!allowed.containsAll(fields) || !fields.containsAll(required)) throw new RequestFailure(400, "VALIDATION_ERROR");
        return root;
    }

    public static String text(JsonNode object, String field, boolean nullable) {
        JsonNode value = object.get(field);
        if (value == null || value.isNull()) {
            if (nullable) return null;
            throw new Inputs.InvalidInput(field);
        }
        if (!value.isTextual()) throw new Inputs.InvalidInput(field);
        return value.textValue();
    }

    public static int integer(JsonNode object, String field) {
        JsonNode value = object.get(field);
        if (value == null || !value.isIntegralNumber() || !value.canConvertToInt()) throw new Inputs.InvalidInput(field);
        return value.intValue();
    }

    public static final class RequestFailure extends IllegalArgumentException {
        private final int status;
        private final String code;
        public RequestFailure(int status, String code) { super(code); this.status = status; this.code = code; }
        public int status() { return status; }
        public String code() { return code; }
    }
}
