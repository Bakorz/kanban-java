package id.bakorz.kanban.db;

import id.bakorz.kanban.model.Card;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Parameterized card SQL. Ownership is resolved through card -> column -> board. */
public final class CardDao {
    public List<Card> forBoard(Connection connection, UUID boardId) throws SQLException {
        try (var statement = connection.prepareStatement(
                "SELECT c.id, c.column_id, c.title, c.description, c.priority, c.due_date, c.position, "
                        + "c.created_at, c.updated_at FROM kanban.cards c "
                        + "JOIN kanban.board_columns bc ON bc.id = c.column_id "
                        + "WHERE bc.board_id = ? ORDER BY bc.position, c.position")) {
            statement.setObject(1, boardId);
            try (var rows = statement.executeQuery()) {
                var cards = new ArrayList<Card>();
                while (rows.next()) cards.add(card(rows));
                return cards;
            }
        }
    }

    public Card create(Connection connection, UUID columnId, String title, String description,
                       String priority, java.time.LocalDate dueDate) throws SQLException {
        try (var statement = connection.prepareStatement(
                "INSERT INTO kanban.cards (column_id, title, description, priority, due_date, position) "
                        + "SELECT ?, ?, ?, ?, ?, COALESCE(MAX(position) + 1, 0) FROM kanban.cards WHERE column_id = ? "
                        + "RETURNING id, column_id, title, description, priority, due_date, position, created_at, updated_at")) {
            statement.setObject(1, columnId);
            statement.setString(2, title);
            statement.setString(3, description);
            statement.setString(4, priority);
            statement.setObject(5, dueDate);
            statement.setObject(6, columnId);
            try (var rows = statement.executeQuery()) {
                rows.next();
                return card(rows);
            }
        }
    }

    public Optional<Card> update(Connection connection, UUID cardId, UUID owner, String title, String description,
                                 String priority, java.time.LocalDate dueDate) throws SQLException {
        try (var statement = connection.prepareStatement(
                "UPDATE kanban.cards c SET title = ?, description = ?, priority = ?, due_date = ? "
                        + "FROM kanban.board_columns bc JOIN kanban.boards b ON b.id = bc.board_id "
                        + "WHERE c.id = ? AND c.column_id = bc.id AND b.owner_id = ? "
                        + "RETURNING c.id, c.column_id, c.title, c.description, c.priority, c.due_date, c.position, c.created_at, c.updated_at")) {
            statement.setString(1, title);
            statement.setString(2, description);
            statement.setString(3, priority);
            statement.setObject(4, dueDate);
            statement.setObject(5, cardId);
            statement.setObject(6, owner);
            try (var rows = statement.executeQuery()) {
                return rows.next() ? Optional.of(card(rows)) : Optional.empty();
            }
        }
    }

    /** Lock first, then re-read: a joined card row may be stale after waiting on the board lock. */
    public Optional<CardLocation> lockLocation(Connection connection, UUID cardId, UUID owner) throws SQLException {
        Optional<CardLocation> locked = location(connection, cardId, owner, true);
        if (locked.isEmpty()) return Optional.empty();
        Optional<CardLocation> current = location(connection, cardId, owner, false);
        if (current.isPresent() && !current.get().boardId().equals(locked.get().boardId())) {
            throw new SQLException("Card board changed outside the mutation protocol");
        }
        return current;
    }

    private Optional<CardLocation> location(Connection connection, UUID cardId, UUID owner, boolean lock) throws SQLException {
        try (var statement = connection.prepareStatement(
                "SELECT b.id AS board_id, bc.id AS column_id, c.position FROM kanban.cards c "
                        + "JOIN kanban.board_columns bc ON bc.id = c.column_id "
                        + "JOIN kanban.boards b ON b.id = bc.board_id "
                        + "WHERE c.id = ? AND b.owner_id = ?" + (lock ? " FOR UPDATE OF b" : ""))) {
            statement.setObject(1, cardId);
            statement.setObject(2, owner);
            try (var rows = statement.executeQuery()) {
                return rows.next() ? Optional.of(new CardLocation(rows.getObject("board_id", UUID.class),
                        rows.getObject("column_id", UUID.class), rows.getInt("position"))) : Optional.empty();
            }
        }
    }

    /** Locks the board that owns a column; used by card creation. */
    public Optional<UUID> lockBoardForColumn(Connection connection, UUID columnId, UUID owner) throws SQLException {
        try (var statement = connection.prepareStatement(
                "SELECT b.id FROM kanban.board_columns bc JOIN kanban.boards b ON b.id = bc.board_id "
                        + "WHERE bc.id = ? AND b.owner_id = ? FOR UPDATE OF b")) {
            statement.setObject(1, columnId);
            statement.setObject(2, owner);
            try (var rows = statement.executeQuery()) {
                return rows.next() ? Optional.of(rows.getObject("id", UUID.class)) : Optional.empty();
            }
        }
    }

    public Optional<UUID> boardForColumn(Connection connection, UUID columnId, UUID owner) throws SQLException {
        try (var statement = connection.prepareStatement(
                "SELECT b.id FROM kanban.board_columns bc JOIN kanban.boards b ON b.id = bc.board_id "
                        + "WHERE bc.id = ? AND b.owner_id = ?")) {
            statement.setObject(1, columnId);
            statement.setObject(2, owner);
            try (var rows = statement.executeQuery()) {
                return rows.next() ? Optional.of(rows.getObject("id", UUID.class)) : Optional.empty();
            }
        }
    }

    public List<UUID> orderedIds(Connection connection, UUID columnId) throws SQLException {
        try (var statement = connection.prepareStatement(
                "SELECT id FROM kanban.cards WHERE column_id = ? ORDER BY position")) {
            statement.setObject(1, columnId);
            try (var rows = statement.executeQuery()) {
                var ids = new ArrayList<UUID>();
                while (rows.next()) ids.add(rows.getObject("id", UUID.class));
                return ids;
            }
        }
    }

    public boolean deleteOwned(Connection connection, UUID cardId, UUID owner) throws SQLException {
        try (var statement = connection.prepareStatement(
                "DELETE FROM kanban.cards c USING kanban.board_columns bc, kanban.boards b "
                        + "WHERE c.id = ? AND c.column_id = bc.id AND b.id = bc.board_id AND b.owner_id = ?")) {
            statement.setObject(1, cardId);
            statement.setObject(2, owner);
            return statement.executeUpdate() == 1;
        }
    }

    public void compactAfterDelete(Connection connection, UUID columnId, int deletedPosition) throws SQLException {
        try (var statement = connection.prepareStatement(
                "UPDATE kanban.cards SET position = position - 1 WHERE column_id = ? AND position > ?")) {
            statement.setObject(1, columnId);
            statement.setInt(2, deletedPosition);
            statement.executeUpdate();
        }
    }

    public void deferPositionConstraint(Connection connection) throws SQLException {
        try (var statement = connection.createStatement()) {
            statement.execute("SET CONSTRAINTS kanban.cards_column_position_key DEFERRED");
        }
    }

    public void enforcePositionConstraint(Connection connection) throws SQLException {
        try (var statement = connection.createStatement()) {
            statement.execute("SET CONSTRAINTS kanban.cards_column_position_key IMMEDIATE");
        }
    }

    public void updatePosition(Connection connection, UUID cardId, UUID columnId, int position) throws SQLException {
        try (var statement = connection.prepareStatement(
                "UPDATE kanban.cards SET column_id = ?, position = ? WHERE id = ?")) {
            statement.setObject(1, columnId);
            statement.setInt(2, position);
            statement.setObject(3, cardId);
            statement.executeUpdate();
        }
    }

    public record CardLocation(UUID boardId, UUID columnId, int position) {}

    private static Card card(ResultSet rows) throws SQLException {
        return new Card(rows.getObject("id", UUID.class), rows.getObject("column_id", UUID.class),
                rows.getString("title"), rows.getString("description"), rows.getString("priority"),
                rows.getDate("due_date") == null ? null : rows.getDate("due_date").toLocalDate(),
                rows.getInt("position"), rows.getTimestamp("created_at").toInstant(),
                rows.getTimestamp("updated_at").toInstant());
    }
}
