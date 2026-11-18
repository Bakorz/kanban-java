package id.bakorz.kanban.service;

import id.bakorz.kanban.db.BoardDao;
import id.bakorz.kanban.db.CardDao;
import id.bakorz.kanban.db.Transaction;
import id.bakorz.kanban.model.Board;
import id.bakorz.kanban.model.BoardDetail;
import id.bakorz.kanban.model.Card;
import id.bakorz.kanban.model.CardOrder;
import java.sql.Connection;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Card mutations serialize on the owning board row and keep positions dense. */
public final class CardService {
    private final Transaction transaction;
    private final BoardDao boards;
    private final CardDao cards;
    private final BoardService boardService;

    public CardService(Transaction transaction, BoardDao boards, CardDao cards, BoardService boardService) {
        this.transaction = transaction;
        this.boards = boards;
        this.cards = cards;
        this.boardService = boardService;
    }

    public Card create(UUID owner, UUID columnId, String title, String description, String priority, LocalDate dueDate)
            throws SQLException, ServiceException {
        return transaction.write(connection -> {
            UUID boardId = cards.lockBoardForColumn(connection, columnId, owner).orElseThrow(ServiceException::notFound);
            cards.boardForColumn(connection, columnId, owner).orElseThrow(ServiceException::notFound);
            Card created = cards.create(connection, columnId, title, description, priority, dueDate);
            boards.touch(connection, boardId);
            return created;
        });
    }

    public Card update(UUID owner, UUID cardId, String title, String description, String priority, LocalDate dueDate)
            throws SQLException, ServiceException {
        return transaction.write(connection -> {
            var location = cards.lockLocation(connection, cardId, owner).orElseThrow(ServiceException::notFound);
            Card updated = cards.update(connection, cardId, owner, title, description, priority, dueDate)
                    .orElseThrow(ServiceException::notFound);
            boards.touch(connection, location.boardId());
            return updated;
        });
    }

    public void delete(UUID owner, UUID cardId) throws SQLException, ServiceException {
        transaction.write(connection -> {
            var location = cards.lockLocation(connection, cardId, owner).orElseThrow(ServiceException::notFound);
            cards.deferPositionConstraint(connection);
            if (!cards.deleteOwned(connection, cardId, owner)) throw ServiceException.notFound();
            cards.compactAfterDelete(connection, location.columnId(), location.position());
            cards.enforcePositionConstraint(connection);
            boards.touch(connection, location.boardId());
            return null;
        });
    }

    public BoardDetail move(UUID owner, UUID cardId, UUID targetColumnId, int newPosition)
            throws SQLException, ServiceException {
        return transaction.write(connection -> {
            var location = cards.lockLocation(connection, cardId, owner).orElseThrow(ServiceException::notFound);
            UUID targetBoard = cards.boardForColumn(connection, targetColumnId, owner).orElseThrow(ServiceException::notFound);
            if (!targetBoard.equals(location.boardId())) throw ServiceException.invalid("Cards can only move within their board.");
            boolean sameColumn = location.columnId().equals(targetColumnId);
            List<UUID> source = cards.orderedIds(connection, location.columnId());
            List<UUID> destination = sameColumn ? source : cards.orderedIds(connection, targetColumnId);
            CardOrder.MovePlan plan;
            try {
                plan = CardOrder.move(source, destination, cardId, newPosition, sameColumn);
            } catch (IllegalArgumentException exception) {
                throw ServiceException.invalid("The destination position is out of range.");
            }
            cards.deferPositionConstraint(connection);
            for (int position = 0; position < plan.source().size(); position++) {
                cards.updatePosition(connection, plan.source().get(position), location.columnId(), position);
            }
            if (!sameColumn) {
                for (int position = 0; position < plan.destination().size(); position++) {
                    cards.updatePosition(connection, plan.destination().get(position), targetColumnId, position);
                }
            }
            cards.enforcePositionConstraint(connection);
            boards.touch(connection, location.boardId());
            Board board = boards.findOwned(connection, location.boardId(), owner).orElseThrow(ServiceException::notFound);
            return boardService.snapshot(connection, board);
        });
    }
}
