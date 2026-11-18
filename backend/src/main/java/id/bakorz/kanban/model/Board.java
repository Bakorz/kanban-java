package id.bakorz.kanban.model;

import java.time.Instant;
import java.util.UUID;

public record Board(UUID id, String name, String description, Instant createdAt, Instant updatedAt) {}
