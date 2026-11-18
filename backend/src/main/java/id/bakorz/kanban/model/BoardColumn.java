package id.bakorz.kanban.model;

import java.util.List;
import java.util.UUID;

public record BoardColumn(UUID id, String name, int position, List<Card> cards) {
    public BoardColumn { cards = List.copyOf(cards); }
}
