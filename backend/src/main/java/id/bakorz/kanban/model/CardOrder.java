package id.bakorz.kanban.model;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;

/**
 * Pure order planner; callers must load canonical rows while holding the owning
 * board row lock, validate ownership/same-board columns, and persist this plan in
 * one JDBC transaction with deferred position uniqueness. This is not a lock.
 */
public final class CardOrder {
    private CardOrder() {}

    public record MovePlan(List<UUID> source, List<UUID> destination) {
        public MovePlan { source = List.copyOf(source); destination = List.copyOf(destination); }
    }

    public static MovePlan move(List<UUID> source, List<UUID> destination, UUID cardId,
                                int finalPosition, boolean sameColumn) {
        requireUnique(source);
        requireUnique(destination);
        if (cardId == null || !source.contains(cardId)) throw new Inputs.InvalidInput("cardId");
        if (sameColumn && !source.equals(destination)) throw new IllegalArgumentException("Same-column snapshots differ");
        if (!sameColumn) {
            var all = new HashSet<>(source);
            if (destination.stream().anyMatch(all::contains)) throw new IllegalArgumentException("Columns share card IDs");
        }
        int maximum = sameColumn ? source.size() - 1 : destination.size();
        if (finalPosition < 0 || finalPosition > maximum) throw new Inputs.InvalidInput("newPosition");
        var nextSource = new ArrayList<>(source);
        nextSource.remove(cardId);
        if (sameColumn) {
            nextSource.add(finalPosition, cardId);
            return new MovePlan(nextSource, nextSource);
        }
        var nextDestination = new ArrayList<>(destination);
        nextDestination.add(finalPosition, cardId);
        return new MovePlan(nextSource, nextDestination);
    }

    public static List<UUID> delete(List<UUID> source, UUID cardId) {
        requireUnique(source);
        if (cardId == null || !source.contains(cardId)) throw new Inputs.InvalidInput("cardId");
        var result = new ArrayList<>(source);
        result.remove(cardId);
        return List.copyOf(result);
    }

    private static void requireUnique(List<UUID> values) {
        if (values == null || values.stream().anyMatch(java.util.Objects::isNull)
                || new HashSet<>(values).size() != values.size()) {
            throw new IllegalArgumentException("Invalid ordered snapshot");
        }
    }
}
