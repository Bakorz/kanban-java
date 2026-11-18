package id.bakorz.kanban.db;

import id.bakorz.kanban.model.Board;
import id.bakorz.kanban.model.BoardColumn;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Parameterized board/column SQL. Ownership predicates are always included. */
public final class BoardDao {
    public List<Board> list(Connection connection, UUID owner) throws SQLException {
        try (var statement = connection.prepareStatement(
                "SELECT id, name, description, created_at, updated_at FROM kanban.boards WHERE owner_id = ? ORDER BY updated_at DESC, id")) {
            statement.setObject(1, owner);
            try (var rows = statement.executeQuery()) {
                var boards = new ArrayList<Board>();
                while (rows.next()) boards.add(board(rows));
                return boards;
            }
        }
    }

    public Board create(Connection connection, UUID owner, String name, String description) throws SQLException {
        try (var statement = connection.prepareStatement(
                "INSERT INTO kanban.boards (owner_id, name, description) VALUES (?, ?, ?) RETURNING id, name, description, created_at, updated_at")) {
            statement.setObject(1, owner);
            statement.setString(2, name);
            statement.setString(3, description);
            try (var rows = statement.executeQuery()) {
                rows.next();
                return board(rows);
            }
        }
    }

    public Optional<Board> findOwned(Connection connection, UUID boardId, UUID owner) throws SQLException {
        try (var statement = connection.prepareStatement(
                "SELECT id, name, description, created_at, updated_at FROM kanban.boards WHERE id = ? AND owner_id = ?")) {
            statement.setObject(1, boardId);
            statement.setObject(2, owner);
            try (var rows = statement.executeQuery()) {
                return rows.next() ? Optional.of(board(rows)) : Optional.empty();
            }
        }
    }

    /** Row lock serializes every mutation touching this board, including card moves. */
    public Optional<Board> lockOwned(Connection connection, UUID boardId, UUID owner) throws SQLException {
        try (var statement = connection.prepareStatement(
                "SELECT id, name, description, created_at, updated_at FROM kanban.boards WHERE id = ? AND owner_id = ? FOR UPDATE")) {
            statement.setObject(1, boardId);
            statement.setObject(2, owner);
            try (var rows = statement.executeQuery()) {
                return rows.next() ? Optional.of(board(rows)) : Optional.empty();
            }
        }
    }

    public Optional<Board> update(Connection connection, UUID boardId, UUID owner, String name, String description)
            throws SQLException {
        try (var statement = connection.prepareStatement(
                "UPDATE kanban.boards SET name = ?, description = ? WHERE id = ? AND owner_id = ? "
                        + "RETURNING id, name, description, created_at, updated_at")) {
            statement.setString(1, name);
            statement.setString(2, description);
            statement.setObject(3, boardId);
            statement.setObject(4, owner);
            try (var rows = statement.executeQuery()) {
                return rows.next() ? Optional.of(board(rows)) : Optional.empty();
            }
        }
    }

    public void touch(Connection connection, UUID boardId) throws SQLException {
        try (var statement = connection.prepareStatement("UPDATE kanban.boards SET updated_at = statement_timestamp() WHERE id = ?")) {
            statement.setObject(1, boardId);
            statement.executeUpdate();
        }
    }

    public boolean delete(Connection connection, UUID boardId, UUID owner) throws SQLException {
        try (var statement = connection.prepareStatement("DELETE FROM kanban.boards WHERE id = ? AND owner_id = ?")) {
            statement.setObject(1, boardId);
            statement.setObject(2, owner);
            return statement.executeUpdate() == 1;
        }
    }

    public void createDefaultColumns(Connection connection, UUID boardId) throws SQLException {
        try (var statement = connection.prepareStatement(
                "INSERT INTO kanban.board_columns (board_id, name, position) VALUES (?, ?, ?)")) {
            String[] names = {"To Do", "In Progress", "Done"};
            for (int position = 0; position < names.length; position++) {
                statement.setObject(1, boardId);
                statement.setString(2, names[position]);
                statement.setInt(3, position);
                statement.addBatch();
            }
            if (statement.executeBatch().length != 3) throw new SQLException("Default column creation failed");
        }
    }

    public List<BoardColumn> columns(Connection connection, UUID boardId) throws SQLException {
        try (var statement = connection.prepareStatement(
                "SELECT id, name, position FROM kanban.board_columns WHERE board_id = ? ORDER BY position")) {
            statement.setObject(1, boardId);
            try (var rows = statement.executeQuery()) {
                var columns = new ArrayList<BoardColumn>();
                while (rows.next()) {
                    columns.add(new BoardColumn(rows.getObject("id", UUID.class), rows.getString("name"),
                            rows.getInt("position"), List.of()));
                }
                return columns;
            }
        }
    }

    private static Board board(ResultSet rows) throws SQLException {
        return new Board(rows.getObject("id", UUID.class), rows.getString("name"), rows.getString("description"),
                rows.getTimestamp("created_at").toInstant(), rows.getTimestamp("updated_at").toInstant());
    }
}
