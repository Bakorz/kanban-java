package id.bakorz.kanban.model;

import org.junit.jupiter.api.Test;
import java.time.LocalDate;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

class InputsTest {
    @Test void namesAreTrimmedNonblankAndBounded() {
        assertEquals("Roadmap", Inputs.boardName(" \tRoadmap\n"));
        assertEquals("Task", Inputs.cardTitle(" Task "));
        assertEquals("x".repeat(100), Inputs.boardName("x".repeat(100)));
        for (String value : new String[]{null, "", "  ", "\u2003", "x".repeat(101), "bad\0name"}) {
            assertThrows(Inputs.InvalidInput.class, () -> Inputs.boardName(value));
        }
        assertThrows(Inputs.InvalidInput.class, () -> Inputs.cardTitle("x".repeat(201)));
    }
    @Test void unicodeLengthCountsCharactersNotUtf16Units() {
        String nonBmp = new String(Character.toChars(0x1F4DD));
        assertEquals(nonBmp.repeat(100), Inputs.boardName(nonBmp.repeat(100)));
        assertThrows(Inputs.InvalidInput.class, () -> Inputs.boardName(nonBmp.repeat(101)));
    }
    @Test void nullableDescriptionsClearWithoutChangingText() {
        assertNull(Inputs.boardDescription(null));
        assertNull(Inputs.cardDescription(null));
        assertEquals("", Inputs.cardDescription(""));
        assertEquals(" a\nb ", Inputs.boardDescription(" a\nb "));
        assertEquals("x".repeat(5000), Inputs.cardDescription("x".repeat(5000)));
        assertThrows(Inputs.InvalidInput.class, () -> Inputs.boardDescription("x".repeat(2001)));
        assertThrows(Inputs.InvalidInput.class, () -> Inputs.cardDescription("x".repeat(5001)));
        assertThrows(Inputs.InvalidInput.class, () -> Inputs.cardDescription("bad\0text"));
    }
    @Test void uuidRequiresCanonicalShape() {
        UUID id = UUID.randomUUID();
        assertEquals(id, Inputs.uuid(id.toString().toUpperCase(), "id"));
        for (String value : new String[]{null, "1-1-1-1-1", "not-a-uuid", " " + id, id + " "}) {
            assertThrows(Inputs.InvalidInput.class, () -> Inputs.uuid(value, "id"));
        }
    }
    @Test void prioritiesAreExplicitWithCreationDefaultOnly() {
        assertEquals(Inputs.Priority.MEDIUM, Inputs.priority(null, true));
        for (Inputs.Priority p : Inputs.Priority.values()) assertEquals(p, Inputs.priority(p.name(), false));
        for (String value : new String[]{null, "high", "URGENT", ""}) {
            assertThrows(Inputs.InvalidInput.class, () -> Inputs.priority(value, false));
        }
    }
    @Test void datesAreCalendarValuesNotTimestampsAndCanBeCleared() {
        assertNull(Inputs.dueDate(null));
        assertEquals(LocalDate.of(2024, 2, 29), Inputs.dueDate("2024-02-29"));
        assertEquals(LocalDate.of(2000, 1, 1), Inputs.dueDate("2000-01-01"));
        for (String value : new String[]{"", "2025-02-29", "2026-11-31", "2026-1-01", "2026-11-18T00:00:00Z", "0000-01-01"}) {
            assertThrows(Inputs.InvalidInput.class, () -> Inputs.dueDate(value));
        }
    }
}
