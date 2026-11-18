package id.bakorz.kanban.model;

import java.time.LocalDate;
import java.time.Instant;
import java.util.UUID;

public record Card(UUID id, UUID columnId, String title, String description, String priority,
                   LocalDate dueDate, int position, Instant createdAt, Instant updatedAt) {}
