package id.bakorz.kanban.http;

import com.fasterxml.jackson.core.JsonFactory;
import com.fasterxml.jackson.core.JsonGenerator;
import id.bakorz.kanban.model.Board;
import id.bakorz.kanban.model.BoardColumn;
import id.bakorz.kanban.model.BoardDetail;
import id.bakorz.kanban.model.Card;
import java.io.IOException;
import java.io.StringWriter;
import java.util.List;

/** Jackson-generated JSON only, so user text is always escaped. No raw HTML or JSON concatenation. */
public final class ApiJson {
    private static final JsonFactory FACTORY = new JsonFactory();
    private ApiJson() {}

    public static String boards(List<Board> boards) throws IOException {
        return object(generator -> {
            generator.writeArrayFieldStart("boards");
            for (Board board : boards) board(generator, board);
            generator.writeEndArray();
        });
    }

    public static String board(Board board) throws IOException {
        return object(generator -> {
            generator.writeFieldName("board");
            board(generator, board);
        });
    }

    public static String boardDetail(BoardDetail detail) throws IOException {
        return object(generator -> {
            generator.writeFieldName("board");
            board(generator, detail.board());
            generator.writeArrayFieldStart("columns");
            for (BoardColumn column : detail.columns()) {
                generator.writeStartObject();
                generator.writeStringField("id", column.id().toString());
                generator.writeStringField("name", column.name());
                generator.writeNumberField("position", column.position());
                generator.writeArrayFieldStart("cards");
                for (Card card : column.cards()) card(generator, card);
                generator.writeEndArray();
                generator.writeEndObject();
            }
            generator.writeEndArray();
        });
    }

    public static String card(Card card) throws IOException {
        return object(generator -> {
            generator.writeFieldName("card");
            card(generator, card);
        });
    }

    public static String error(int status, String code, String message) throws IOException {
        return object(generator -> {
            generator.writeObjectFieldStart("error");
            generator.writeStringField("code", code);
            if (message != null) generator.writeStringField("message", message);
            generator.writeEndObject();
        });
    }

    private static void board(JsonGenerator generator, Board board) throws IOException {
        generator.writeStartObject();
        generator.writeStringField("id", board.id().toString());
        generator.writeStringField("name", board.name());
        generator.writeStringField("description", board.description());
        generator.writeStringField("createdAt", board.createdAt().toString());
        generator.writeStringField("updatedAt", board.updatedAt().toString());
        generator.writeEndObject();
    }

    private static void card(JsonGenerator generator, Card card) throws IOException {
        generator.writeStartObject();
        generator.writeStringField("id", card.id().toString());
        generator.writeStringField("columnId", card.columnId().toString());
        generator.writeStringField("title", card.title());
        generator.writeStringField("description", card.description());
        generator.writeStringField("priority", card.priority());
        generator.writeStringField("dueDate", card.dueDate() == null ? null : card.dueDate().toString());
        generator.writeNumberField("position", card.position());
        generator.writeStringField("createdAt", card.createdAt().toString());
        generator.writeStringField("updatedAt", card.updatedAt().toString());
        generator.writeEndObject();
    }

    private static String object(Writer body) throws IOException {
        var output = new StringWriter();
        try (JsonGenerator generator = FACTORY.createGenerator(output)) {
            generator.writeStartObject();
            body.write(generator);
            generator.writeEndObject();
        }
        return output.toString();
    }

    @FunctionalInterface private interface Writer { void write(JsonGenerator generator) throws IOException; }
}
