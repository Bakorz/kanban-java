package id.bakorz.kanban.service;

import id.bakorz.kanban.db.BoardDao;
import id.bakorz.kanban.db.CardDao;
import id.bakorz.kanban.db.Transaction;
import id.bakorz.kanban.model.Board;
import id.bakorz.kanban.model.BoardColumn;
import id.bakorz.kanban.model.BoardDetail;
import id.bakorz.kanban.model.Card;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Board ownership and atomic create (board plus exactly three default columns). */
public final class BoardService {
    private final Transaction transaction;
    private final BoardDao boards;
    private final CardDao cards;

    public BoardService(Transaction transaction, BoardDao boards, CardDao cards) {
        this.transaction = transaction;
        this.boards = boards;
        this.cards = cards;
    }

    public List<Board> list(UUID owner) throws SQLException, ServiceException {
        return transaction.read(connection -> boards.list(connection, owner));
    }

    public BoardDetail create(UUID owner, String name, String description) throws SQLException, ServiceException {
        return transaction.write(connection -> {
            Board board = boards.create(connection, owner, name, description);
            boards.createDefaultColumns(connection, board.id());
            return snapshot(connection, board);
        });
    }

    public BoardDetail detail(UUID owner, UUID boardId) throws SQLException, ServiceException {
        return transaction.read(connection -> {
            Board board = requireOwned(connection, boardId, owner);
            return snapshot(connection, board);
        });
    }

    public Board update(UUID owner, UUID boardId, String name, String description) throws SQLException, ServiceException {
        return transaction.write(connection -> {
            boards.lockOwned(connection, boardId, owner).orElseThrow(ServiceException::notFound);
            return boards.update(connection, boardId, owner, name, description).orElseThrow(ServiceException::notFound);
        });
    }

    public void delete(UUID owner, UUID boardId) throws SQLException, ServiceException {
        transaction.write(connection -> {
            boards.lockOwned(connection, boardId, owner).orElseThrow(ServiceException::notFound);
            if (!boards.delete(connection, boardId, owner)) throw ServiceException.notFound();
            return null;
        });
    }

    private Board requireOwned(Connection connection, UUID boardId, UUID owner) throws SQLException, ServiceException {
        return boards.findOwned(connection, boardId, owner).orElseThrow(ServiceException::notFound);
    }

    public BoardDetail snapshot(Connection connection, Board board) throws SQLException {
        List<BoardColumn> columns = boards.columns(connection, board.id());
        Map<UUID, List<Card>> grouped = new LinkedHashMap<>();
        for (BoardColumn column : columns) grouped.put(column.id(), new ArrayList<>());
        for (Card card : cards.forBoard(connection, board.id())) {
            List<Card> target = grouped.get(card.columnId());
            if (target == null) throw new SQLException("Card references a column outside its board");
            target.add(card);
        }
        var result = new ArrayList<BoardColumn>(columns.size());
        for (BoardColumn column : columns) {
            result.add(new BoardColumn(column.id(), column.name(), column.position(), grouped.get(column.id())));
        }
        return new BoardDetail(board, result);
    }
}
