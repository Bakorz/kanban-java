package id.bakorz.kanban.db;

import id.bakorz.kanban.service.ServiceException;
import java.sql.Connection;
import java.sql.SQLException;

/** One connection, one transaction. Services decide commit boundaries, DAOs never commit. */
public final class Transaction {
    private final Database database;
    private final int statementTimeoutMs;

    public Transaction(Database database, int statementTimeoutMs) {
        this.database = database;
        this.statementTimeoutMs = statementTimeoutMs;
    }

    public <T> T read(Work<T> work) throws SQLException, ServiceException {
        return run(work, false);
    }

    public <T> T write(Work<T> work) throws SQLException, ServiceException {
        return run(work, true);
    }

    private <T> T run(Work<T> work, boolean write) throws SQLException, ServiceException {
        try (Connection connection = database.timedConnection(statementTimeoutMs)) {
            // Multi-query board snapshots must all see one committed database state.
            connection.setTransactionIsolation(write ? Connection.TRANSACTION_READ_COMMITTED : Connection.TRANSACTION_REPEATABLE_READ);
            connection.setReadOnly(!write);
            connection.setAutoCommit(false);
            try {
                T result = work.run(connection);
                if (write) connection.commit(); else connection.rollback();
                return result;
            } catch (SQLException | ServiceException | RuntimeException exception) {
                try { connection.rollback(); } catch (SQLException rollbackFailure) { exception.addSuppressed(rollbackFailure); }
                throw exception;
            }
        }
    }

    @FunctionalInterface
    public interface Work<T> {
        T run(Connection connection) throws SQLException, ServiceException;
    }
}
