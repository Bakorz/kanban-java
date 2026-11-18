package id.bakorz.kanban.model;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.UUID;

/** Pure validation shared by DTO parsing and services. Never trusts caller ownership. */
public final class Inputs {
    private Inputs() {}

    public static String boardName(String value) { return requiredText(value, 100, "name"); }
    public static String cardTitle(String value) { return requiredText(value, 200, "title"); }
    public static String boardDescription(String value) { return optionalText(value, 2000, "description"); }
    public static String cardDescription(String value) { return optionalText(value, 5000, "description"); }

    private static String requiredText(String value, int limit, String field) {
        if (value == null) throw new InvalidInput(field);
        String normalized = value.strip();
        if (normalized.isBlank() || normalized.codePointCount(0, normalized.length()) > limit || normalized.indexOf('\0') >= 0) {
            throw new InvalidInput(field);
        }
        return normalized;
    }

    private static String optionalText(String value, int limit, String field) {
        if (value == null) return null;
        if (value.codePointCount(0, value.length()) > limit || value.indexOf('\0') >= 0) throw new InvalidInput(field);
        return value;
    }

    public static UUID uuid(String value, String field) {
        if (value == null || !value.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")) {
            throw new InvalidInput(field);
        }
        return UUID.fromString(value);
    }

    public static Priority priority(String value, boolean creating) {
        if (value == null && creating) return Priority.MEDIUM;
        if (value == null) throw new InvalidInput("priority");
        try { return Priority.valueOf(value); }
        catch (IllegalArgumentException exception) { throw new InvalidInput("priority"); }
    }

    public static LocalDate dueDate(String value) {
        if (value == null) return null;
        if (!value.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")) throw new InvalidInput("dueDate");
        try {
            LocalDate date = LocalDate.parse(value);
            if (date.getYear() < 1) throw new InvalidInput("dueDate");
            return date;
        } catch (DateTimeParseException exception) { throw new InvalidInput("dueDate"); }
    }

    public enum Priority { LOW, MEDIUM, HIGH }

    /** Error stores only a trusted field name, never the rejected input. */
    public static final class InvalidInput extends IllegalArgumentException {
        private final String field;
        public InvalidInput(String field) { super("Invalid " + field); this.field = field; }
        public String field() { return field; }
    }
}
